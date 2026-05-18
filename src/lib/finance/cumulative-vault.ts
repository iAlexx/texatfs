import type { SupabaseClient } from "@supabase/supabase-js";
import { roundMoney } from "@/lib/accounting/formulas";

export interface VaultPoint {
  date: string;
  net_profit: number;
  cumulative_net: number;
}

export interface VaultSummary {
  days7: number;
  days30: number;
  series: VaultPoint[];
}

export async function upsertDailyMetric(
  supabase: SupabaseClient,
  userId: string,
  metricDate: string,
  alNihai: number,
  previousAlNihai: number | null
): Promise<void> {
  const netProfit = roundMoney(
    previousAlNihai != null ? alNihai - previousAlNihai : alNihai
  );

  const { data: prev } = await supabase
    .from("cumulative_metrics")
    .select("cumulative_net")
    .eq("user_id", userId)
    .lt("metric_date", metricDate)
    .order("metric_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  const cumulativeNet = roundMoney((prev?.cumulative_net ?? 0) + netProfit);

  await supabase.from("cumulative_metrics").upsert(
    {
      user_id: userId,
      metric_date: metricDate,
      net_profit: netProfit,
      cumulative_net: cumulativeNet,
      al_nihai: alNihai,
    },
    { onConflict: "user_id,metric_date" }
  );
}

export async function loadVaultSummary(
  supabase: SupabaseClient,
  userId: string,
  days: 7 | 30 = 30
): Promise<VaultSummary> {
  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceIso = since.toISOString().slice(0, 10);

  const { data: rows, error } = await supabase
    .from("cumulative_metrics")
    .select("metric_date, net_profit, cumulative_net")
    .eq("user_id", userId)
    .gte("metric_date", sinceIso)
    .order("metric_date", { ascending: true });

  if (error) throw error;

  const series: VaultPoint[] = (rows ?? []).map((r) => ({
    date: r.metric_date as string,
    net_profit: Number(r.net_profit),
    cumulative_net: Number(r.cumulative_net),
  }));

  const sumRange = (n: number) =>
    series.slice(-n).reduce((acc, p) => acc + p.net_profit, 0);

  return {
    days7: roundMoney(sumRange(7)),
    days30: roundMoney(sumRange(30)),
    series,
  };
}
