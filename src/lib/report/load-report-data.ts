import type { SupabaseClient } from "@supabase/supabase-js";
import type { ReportRenderData } from "@/lib/report/types";

export async function loadReportRenderData(
  supabase: SupabaseClient,
  ledgerId: string
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
