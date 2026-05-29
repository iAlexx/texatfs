import type { SupabaseClient } from "@supabase/supabase-js";
import type { ReportRenderData } from "@/lib/report/types";
import {
  applyMtdMetricsToLedger,
  computeMtdLedgerMetricsForUser,
} from "@/lib/accounting/mtd-ledger-metrics";
import { mapLedgerRow } from "@/lib/supabase/client";
import type { DailyLedger } from "@/lib/supabase/database.types";

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

  const mode = options?.mode ?? "monthly";
  const baseLedger = mapLedgerRow(ledger) as DailyLedger;

  let displayLedger: DailyLedger = baseLedger;

  if (mode !== "daily") {
    const mtd = await computeMtdLedgerMetricsForUser(
      supabase,
      String(ledger.user_id),
      String(ledger.ledger_date)
    );
    displayLedger = applyMtdMetricsToLedger(baseLedger, mtd);
  }

  const monthKey = String(ledger.ledger_date).slice(0, 7);
  const { data: commissionRow } = await supabase
    .from("monthly_agent_commissions")
    .select(
      "month_key, burn_amount, percent, commission_amount, final_before_commission, final_after_commission, status"
    )
    .eq("agent_user_id", ledger.user_id)
    .eq("month_key", monthKey)
    .maybeSingle();

  const displayAlNihai =
    commissionRow?.status === "completed" &&
    commissionRow.final_after_commission != null
      ? Number(commissionRow.final_after_commission)
      : displayLedger.al_nihai;

  return {
    ledger: {
      id: displayLedger.id,
      ledger_date: displayLedger.ledger_date,
      status: displayLedger.status,
      tebat: displayLedger.tebat,
      suhoubat: displayLedger.suhoubat,
      al_farq: displayLedger.al_farq,
      al_harq: displayLedger.al_harq,
      wasel_menho: displayLedger.wasel_menho,
      wasel_eleih: displayLedger.wasel_eleih,
      baqi_qadim: displayLedger.baqi_qadim,
      al_nihai: displayAlNihai,
      discrepancy_flag: displayLedger.discrepancy_flag,
    },
    user: {
      display_name: user.display_name,
      texas_username: user.texas_username,
      role: user.role,
    },
    monthly_commission: commissionRow
      ? {
          month_key: String(commissionRow.month_key),
          burn_amount: Number(commissionRow.burn_amount),
          percent:
            commissionRow.percent != null
              ? Number(commissionRow.percent)
              : null,
          commission_amount:
            commissionRow.commission_amount != null
              ? Number(commissionRow.commission_amount)
              : null,
          final_before_commission: Number(
            commissionRow.final_before_commission
          ),
          final_after_commission:
            commissionRow.final_after_commission != null
              ? Number(commissionRow.final_after_commission)
              : null,
          status: String(commissionRow.status),
        }
      : undefined,
  };
}
