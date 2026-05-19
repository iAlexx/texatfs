import { NextResponse } from "next/server";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import type { LedgerAuthInput } from "@/lib/ledger/types";
import { LedgerAuthError, resolveLedgerUser } from "@/lib/ledger/resolve-user";
import { buildLedgerSession } from "@/lib/ledger/load-ledger-session";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const runtime = "nodejs";

interface Body extends LedgerAuthInput {
  ledgerDate?: string;
  agent_id?: string;
  /** @deprecated use agent_id */
  viewUserId?: string;
}

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Body;
    const { user, subscriptionActive } = await resolveLedgerUser(body);
    const ledgerDate = body.ledgerDate ?? todayIsoDate();
    const agentId = body.agent_id ?? body.viewUserId;
    const supabase = getSupabaseServiceClient();

    if (!subscriptionActive) {
      const payload = await buildLedgerSession(
        supabase,
        user,
        false,
        ledgerDate,
        agentId
      );
      return NextResponse.json(payload, { status: 402 });
    }

    const payload = await buildLedgerSession(
      supabase,
      user,
      true,
      ledgerDate,
      agentId
    );

    return NextResponse.json(payload);
  } catch (e) {
    if (e instanceof LedgerAuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    const message = e instanceof Error ? e.message : "Server error";
    const status = message.includes("غير مصرح") ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
