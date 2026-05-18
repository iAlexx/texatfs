import { NextResponse } from "next/server";
import { resolveLedgerUser, LedgerAuthError } from "@/lib/ledger/resolve-user";
import type { LedgerAuthInput } from "@/lib/ledger/types";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import { resolvePerformanceSummary } from "@/lib/i18n/performance";
import { resolveLedgerDate } from "@/lib/cron/ledger-date";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as LedgerAuthInput;
    const { user, subscriptionActive } = await resolveLedgerUser(body);
    const supabase = getSupabaseServiceClient();
    const ledgerDate = resolveLedgerDate();

    const { data: ledger } = await supabase
      .from("daily_ledgers")
      .select("al_harq, al_nihai, discrepancy_flag, tebat, status")
      .eq("user_id", user.id)
      .eq("ledger_date", ledgerDate)
      .maybeSingle();

    const { data: announcement } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", "hero_announcement")
      .maybeSingle();

    const performance = ledger
      ? resolvePerformanceSummary({
          al_harq: Number(ledger.al_harq),
          al_nihai: Number(ledger.al_nihai),
          discrepancy_flag: ledger.discrepancy_flag,
          tebat: Number(ledger.tebat),
        })
      : null;

    return NextResponse.json({
      user: {
        display_name: user.display_name,
        texas_username: user.texas_username,
        role: user.role,
        subscription_end_date: user.subscription_end_date,
        subscription_active: subscriptionActive,
      },
      ledger_date: ledgerDate,
      performance_rating: performance,
      ledger_status: ledger?.status ?? null,
      al_nihai: ledger ? Number(ledger.al_nihai) : null,
      announcement: announcement?.value ?? "",
    });
  } catch (e) {
    if (e instanceof LedgerAuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    const msg = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
