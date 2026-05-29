import { NextResponse } from "next/server";
import {
  AdminAuthError,
  requireAdmin,
  type AdminAuthInput,
} from "@/lib/admin/auth";
import { resolveLedgerDate } from "@/lib/cron/ledger-date";
import { runAgentDataAudit } from "@/lib/diagnostics/agent-data-audit";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import { requireUserCredentials } from "@/lib/scraper/resolve-user-credentials";
import { withAuthenticatedTexasClient } from "@/lib/texas/with-authenticated-texas-client";
import type { LedgerAuthInput } from "@/lib/ledger/types";
import { resolveLedgerUser } from "@/lib/ledger/resolve-user";
import { createLogger } from "@/lib/observability/logger";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const runtime = "nodejs";
export const maxDuration = 120;

const log = createLogger("admin/agent-data-audit");

interface AuditBody extends AdminAuthInput, LedgerAuthInput {
  viewerUserId?: string;
  telegramUserId?: number;
  ledgerDate?: string;
  repair?: boolean;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as AuditBody;
    requireAdmin(body);

    const ledgerDate = body.ledgerDate ?? resolveLedgerDate();
    const supabase = getSupabaseServiceClient();
    const repair = Boolean(body.repair);

    let viewerUserId = body.viewerUserId;
    let telegramUserId = body.telegramUserId;

    if (!viewerUserId && !telegramUserId && body.initData) {
      try {
        const { user } = await resolveLedgerUser(body);
        viewerUserId = user.id;
        telegramUserId = user.telegram_id ?? undefined;
      } catch {
        // optional — admin may pass explicit ids
      }
    }

    if (!viewerUserId && !telegramUserId) {
      return NextResponse.json(
        { error: "viewerUserId or telegramUserId required" },
        { status: 400 }
      );
    }

    if (viewerUserId && !body.initData) {
      let texasClient: import("@/lib/texas/texas-http-client").TexasHttpClient | undefined;
      try {
        const creds = await requireUserCredentials(supabase, viewerUserId);
        const { TexasSessionService } = await import("@/lib/services/TexasSessionService");
        const session = new TexasSessionService();
        texasClient = await session.getClient({
          username: creds.username,
          password: creds.password,
        });
      } catch {
        // DB-only audit when credentials unavailable
      }

      const report = await runAgentDataAudit({
        supabase,
        viewerUserId,
        ledgerDate,
        texasClient,
        repair,
      });
      log.info("agent data audit complete", {
        viewerUserId,
        ledgerDate,
        summary: report.summary,
        texasAuth: report.texas.auth_error,
      });
      return NextResponse.json(report);
    }

    return withAuthenticatedTexasClient(
      supabase,
      {
        initData: body.initData,
        telegramUserId: telegramUserId ?? undefined,
      },
      async ({ user, client }) => {
        const report = await runAgentDataAudit({
          supabase,
          viewerUserId: viewerUserId ?? user.id,
          telegramUserId: telegramUserId ?? user.telegram_id ?? undefined,
          ledgerDate,
          texasClient: client,
          repair,
        });

        log.info("agent data audit complete", {
          viewerUserId: report.viewer.user_id,
          ledgerDate,
          summary: report.summary,
          repair: report.repair,
        });

        return NextResponse.json(report);
      }
    );
  } catch (e) {
    if (e instanceof AdminAuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    const msg = e instanceof Error ? e.message : "Server error";
    log.error("agent data audit failed", { error: msg });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
