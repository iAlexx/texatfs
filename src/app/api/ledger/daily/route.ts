import { NextResponse } from "next/server";
import { mapLedgerRow } from "@/lib/supabase/client";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import type { DailyLedger, LedgerSessionResponse } from "@/lib/supabase/database.types";
import type { LedgerAuthInput } from "@/lib/ledger/types";
import { LedgerAuthError, resolveLedgerUser } from "@/lib/ledger/resolve-user";
import {
  assertCanViewUser,
  buildHierarchyPayload,
  fetchSubAgentsWithLedgers,
} from "@/lib/hierarchy/sub-agents";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const runtime = "nodejs";

interface RequestBody extends LedgerAuthInput {
  ledgerDate?: string;
  viewUserId?: string;
}

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

async function loadLedgerForUser(
  supabase: ReturnType<typeof getSupabaseServiceClient>,
  userId: string,
  ledgerDate: string
): Promise<DailyLedger | null> {
  const { data: ledgerRow, error } = await supabase
    .from("daily_ledgers")
    .select(
      "id, user_id, ledger_date, status, tebat, suhoubat, al_farq, al_harq, wasel_menho, wasel_eleih, baqi_qadim, al_nihai, discrepancy_flag, updated_at"
    )
    .eq("user_id", userId)
    .eq("ledger_date", ledgerDate)
    .maybeSingle();

  if (error) throw error;
  return ledgerRow ? mapLedgerRow(ledgerRow) : null;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as RequestBody;
    const { user, subscriptionActive } = await resolveLedgerUser(body);
    const ledgerDate = body.ledgerDate ?? todayIsoDate();
    const supabase = getSupabaseServiceClient();

    if (!subscriptionActive) {
      const payload: LedgerSessionResponse = {
        user,
        ledger: null,
        subscription_active: false,
      };
      return NextResponse.json(payload, { status: 402 });
    }

    const viewUserId = body.viewUserId?.trim() || user.id;
    if (viewUserId !== user.id) {
      await assertCanViewUser(supabase, user.id, viewUserId);
    }

    const ledger = await loadLedgerForUser(supabase, viewUserId, ledgerDate);

    const { data: profile } = await supabase
      .from("users")
      .select("parent_id")
      .eq("id", user.id)
      .maybeSingle();

    const subAgents =
      viewUserId === user.id
        ? await fetchSubAgentsWithLedgers(supabase, user.id, ledgerDate)
        : [];

    const isTenantMaster =
      user.role === "master" &&
      (profile?.parent_id == null || subAgents.length > 0);

    const ownLedger =
      viewUserId === user.id
        ? ledger
        : await loadLedgerForUser(supabase, user.id, ledgerDate);

    const hierarchy =
      viewUserId === user.id && subAgents.length > 0
        ? buildHierarchyPayload(subAgents, ownLedger)
        : undefined;

    const payload: LedgerSessionResponse = {
      user: {
        ...user,
        parent_id: profile?.parent_id ?? null,
        is_tenant_master: isTenantMaster,
      },
      ledger,
      subscription_active: true,
      hierarchy,
      viewing_user_id: viewUserId,
    };

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
