import { NextResponse } from "next/server";
import { resolveLedgerUser, LedgerAuthError } from "@/lib/ledger/resolve-user";
import type { LedgerAuthInput } from "@/lib/ledger/types";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import { resolvePerformanceSummary } from "@/lib/i18n/performance";
import { resolveLedgerDate } from "@/lib/cron/ledger-date";
import { generateArabicInsight } from "@/lib/finance/ai-insights";
import { loadVaultSummary } from "@/lib/finance/cumulative-vault";
import {
  buildHierarchyPayload,
  fetchSubAgentsWithLedgers,
} from "@/lib/hierarchy/sub-agents";
import { mapLedgerRow } from "@/lib/supabase/client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as LedgerAuthInput;
    const { user, subscriptionActive } = await resolveLedgerUser(body);
    const supabase = getSupabaseServiceClient();
    const ledgerDate = resolveLedgerDate();

    const since = new Date();
    since.setDate(since.getDate() - 7);
    const sinceDate = since.toISOString().slice(0, 10);

    const { data: ledgerRows } = await supabase
      .from("daily_ledgers")
      .select(
        "id, user_id, ledger_date, status, tebat, suhoubat, al_farq, al_harq, wasel_menho, wasel_eleih, baqi_qadim, al_nihai, discrepancy_flag, updated_at"
      )
      .eq("user_id", user.id)
      .gte("ledger_date", sinceDate)
      .lte("ledger_date", ledgerDate)
      .order("ledger_date", { ascending: false });

    const ledgerRow =
      ledgerRows?.find((r) => r.ledger_date === ledgerDate) ?? null;
    const ledger = ledgerRow;
    const weekRows = (ledgerRows ?? []).filter(
      (r) => r.ledger_date !== ledgerDate
    );

    const avgHarq7 =
      weekRows && weekRows.length
        ? weekRows.reduce((s, r) => s + Number(r.al_harq), 0) / weekRows.length
        : null;
    const avgSuhoubat7 =
      weekRows && weekRows.length
        ? weekRows.reduce((s, r) => s + Number(r.suhoubat), 0) / weekRows.length
        : null;

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

    const aiInsight = ledger
      ? generateArabicInsight({
          tebat: Number(ledger.tebat),
          suhoubat: Number(ledger.suhoubat),
          al_harq: Number(ledger.al_harq),
          al_nihai: Number(ledger.al_nihai),
          avgHarq7,
          avgSuhoubat7,
        })
      : "بانتظار أول مزامنة يومية لعرض التحليل الذكي.";

    let vault = { days7: 0, days30: 0, series: [] as { date: string; cumulative_net: number }[] };
    try {
      const v = await loadVaultSummary(supabase, user.id, 30);
      vault = {
        days7: v.days7,
        days30: v.days30,
        series: v.series.map((p) => ({
          date: p.date,
          cumulative_net: p.cumulative_net,
        })),
      };
    } catch {
      /* table may not exist yet */
    }

    const syncedToday = Boolean(ledger?.updated_at);
    const lastSyncAt = ledger?.updated_at ?? null;

    let network_total_burn: number | null = null;
    let network_agent_count = 0;
    const subAgents = await fetchSubAgentsWithLedgers(
      supabase,
      user.id,
      ledgerDate
    );
    if (subAgents.length > 0) {
      const ownLedger = ledgerRow ? mapLedgerRow(ledgerRow) : null;
      const hierarchy = buildHierarchyPayload(subAgents, ownLedger);
      network_total_burn = hierarchy.consolidated.total_burn;
      network_agent_count = hierarchy.consolidated.agent_count;
    }

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
      ai_insight: aiInsight,
      ledger_status: ledger?.status ?? null,
      al_nihai: ledger ? Number(ledger.al_nihai) : null,
      announcement: announcement?.value ?? "",
      synced_today: syncedToday,
      last_sync_at: lastSyncAt,
      vault,
      network_total_burn,
      network_agent_count,
    });
  } catch (e) {
    if (e instanceof LedgerAuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    const msg = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
