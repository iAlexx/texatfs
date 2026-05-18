import { NextResponse } from "next/server";
import type { LedgerAuthInput, LedgerHistoryResponse } from "@/lib/ledger/types";
import { LedgerAuthError, resolveLedgerUser } from "@/lib/ledger/resolve-user";
import { getSupabaseServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const runtime = "nodejs";

const HISTORY_LIMIT = 120;

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as LedgerAuthInput;
    const { user, subscriptionActive } = await resolveLedgerUser(body);

    if (!subscriptionActive) {
      return NextResponse.json(
        { error: "Subscription expired", subscription_active: false },
        { status: 402 }
      );
    }

    const supabase = getSupabaseServiceClient();
    const { data: rows, error } = await supabase
      .from("daily_ledgers")
      .select("ledger_date, status, al_nihai, discrepancy_flag")
      .eq("user_id", user.id)
      .order("ledger_date", { ascending: false })
      .limit(HISTORY_LIMIT);

    if (error) throw error;

    const payload: LedgerHistoryResponse = {
      dates: (rows ?? []).map((row) => ({
        ledger_date: row.ledger_date,
        status: row.status as "open" | "closed",
        al_nihai: Number(row.al_nihai),
        discrepancy_flag: row.discrepancy_flag,
      })),
    };

    return NextResponse.json(payload);
  } catch (e) {
    if (e instanceof LedgerAuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    const message = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
