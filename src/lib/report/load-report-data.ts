import type { SupabaseClient } from "@supabase/supabase-js";
import type { ReportRenderData } from "@/lib/report/types";
import { computeMonthlyCumulativeLedgerView } from "@/lib/accounting/monthly-ledger-view";

export async function loadReportRenderData(
  supabase: SupabaseClient,
  ledgerId: string,
  options?: { mode?: "daily" | "monthly" }
): Promise<ReportRenderData | null> {
  const { data: ledger, error } = await supabase
    .from("daily_ledgers")
    .select(
      "id, user_id, ledger_date, status, tebat, suhoubat, al_farq, al_harq, wasel_menho, wasel_eleih, baqi_qadim, al_nihai, discrepancy_flag"
    )
    .eq("id", ledgerId)
    .maybeSingle();

  if (error) throw error;
  if (!ledger) return null;

  const { data: user, error: userError } = await supabase
    .from("users")
    .select("display_name, texas_username, role")
    .eq("id", ledger.user_id)
    .maybeSingle();

  if (userError) throw userError;
  if (!user) return null;

  const mode = options?.mode ?? "daily";
  if (mode !== "monthly") {
    return {
      ledger: {
        id: ledger.id,
        ledger_date: ledger.ledger_date,
        status: ledger.status,
        tebat: Number(ledger.tebat),
        suhoubat: Number(ledger.suhoubat),
        al_farq: Number(ledger.al_farq),
        al_harq: Number(ledger.al_harq),
        wasel_menho: Number(ledger.wasel_menho),
        wasel_eleih: Number(ledger.wasel_eleih),
        baqi_qadim: Number(ledger.baqi_qadim),
        al_nihai: Number(ledger.al_nihai),
        discrepancy_flag: ledger.discrepancy_flag,
      },
      user: {
        display_name: user.display_name,
        texas_username: user.texas_username,
        role: user.role,
      },
    };
  }

  // Monthly cumulative view (MTD): sums from month start + fixed carry
  // from previous month end (baqi_qadim).
  const ledgerDate = String(ledger.ledger_date);
  const monthStart = `${ledgerDate.slice(0, 7)}-01`;
  const userId = String(ledger.user_id);

  const { data: mtdRows } = await supabase
    .from("daily_ledgers")
    .select("tebat,suhoubat,wasel_menho,wasel_eleih")
    .eq("user_id", userId)
    .gte("ledger_date", monthStart)
    .lte("ledger_date", ledgerDate);

  const { data: prevClosed } = await supabase
    .from("daily_ledgers")
    .select("al_nihai")
    .eq("user_id", userId)
    .eq("status", "closed")
    .lt("ledger_date", monthStart)
    .order("ledger_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  const prevCarry = Number(prevClosed?.al_nihai ?? 0);

  const mtdView = computeMonthlyCumulativeLedgerView({
    ledgerDate,
    rowsFromMonthStartInclusive: (mtdRows ?? []) as Array<{
      tebat: number | string | null;
      suhoubat: number | string | null;
      wasel_menho: number | string | null;
      wasel_eleih: number | string | null;
    }>,
    baqiQadimFixedCarry: prevCarry,
  });

  return {
    ledger: {
      id: ledger.id,
      ledger_date: ledger.ledger_date,
      status: ledger.status,
      tebat: mtdView.tebatMtd,
      suhoubat: mtdView.suhoubatMtd,
      al_farq: mtdView.alFarqMtd,
      al_harq: mtdView.alHarqMtd,
      wasel_menho: mtdView.waselMenhoMtd,
      wasel_eleih: mtdView.waselEleihMtd,
      baqi_qadim: mtdView.baqiQadimMtd,
      al_nihai: mtdView.alNihaiMtd,
      discrepancy_flag: mtdView.discrepancyFlag,
    },
    user: {
      display_name: user.display_name,
      texas_username: user.texas_username,
      role: user.role,
    },
  };
}
