import { NextResponse } from "next/server";
import {
  AdminAuthError,
  requireAdmin,
  type AdminAuthInput,
} from "@/lib/admin/auth";
import { SupabaseAccountingRepository } from "@/lib/accounting/SupabaseAccountingRepository";
import { DailyReportOrchestrator } from "@/lib/services/DailyReportOrchestrator";
import { TexasSyncService } from "@/lib/services/TexasSyncService";
import { resolveLedgerDate } from "@/lib/cron/ledger-date";
import { requireUserCredentials, toTexasSyncRole } from "@/lib/scraper/resolve-user-credentials";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import { createLogger } from "@/lib/observability/logger";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const runtime = "nodejs";
export const maxDuration = 120;

const log = createLogger("admin/sync-hierarchy");

interface SyncHierarchyBody extends AdminAuthInput {
  masterUserId: string;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as SyncHierarchyBody;
    requireAdmin(body);

    const { masterUserId } = body;
    if (!masterUserId || typeof masterUserId !== "string") {
      return NextResponse.json(
        { error: "masterUserId is required" },
        { status: 400 }
      );
    }

    const supabase = getSupabaseServiceClient();

    const { data: master, error: userErr } = await supabase
      .from("users")
      .select("id, role, texas_affiliate_id, is_active, is_frozen")
      .eq("id", masterUserId)
      .maybeSingle();

    if (userErr || !master) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    if (!master.is_active || master.is_frozen) {
      return NextResponse.json(
        { error: "User is frozen or inactive" },
        { status: 400 }
      );
    }
    if (master.role !== "master" && master.role !== "super_master") {
      return NextResponse.json(
        { error: "User must be a master or super_master" },
        { status: 400 }
      );
    }

    const ledgerDate = resolveLedgerDate();
    const creds = await requireUserCredentials(supabase, masterUserId);
    const syncRole = toTexasSyncRole(creds.role);

    log.info("manual hierarchy sync triggered", { masterUserId, ledgerDate });

    const texasSync = new TexasSyncService();
    const syncResult = await texasSync.syncUser({
      userId: masterUserId,
      texasAffiliateId: master.texas_affiliate_id ?? creds.texas_affiliate_id,
      texasUsername: creds.texas_username ?? creds.username,
      role: syncRole,
      credentials: {
        username: creds.username,
        password: creds.password,
      },
    });

    if (!syncResult.childSnapshots.length) {
      return NextResponse.json({
        ok: true,
        masterUserId,
        ledgerDate,
        childrenFound: 0,
        message: "No child snapshots found in getSubAgentStatistics response.",
      });
    }

    const repo = new SupabaseAccountingRepository(supabase);
    const orchestrator = new DailyReportOrchestrator(repo, supabase);

    const childResult = await orchestrator.syncChildrenFromMasterData(
      masterUserId,
      ledgerDate,
      syncResult.childSnapshots
    );

    log.info("manual hierarchy sync complete", {
      masterUserId,
      ledgerDate,
      ...childResult,
    });

    return NextResponse.json({
      ok: true,
      masterUserId,
      ledgerDate,
      childrenFound: syncResult.childSnapshots.length,
      ...childResult,
    });
  } catch (e) {
    if (e instanceof AdminAuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    const msg = e instanceof Error ? e.message : "Server error";
    log.error("manual hierarchy sync failed", { error: msg });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
