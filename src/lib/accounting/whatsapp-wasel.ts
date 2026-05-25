/**
 * Query confirmed WhatsApp wasel totals for a single ledger.
 *
 * Only rows with source='whatsapp', is_confirmed=TRUE, and
 * whatsapp_confirmed_at IS NOT NULL are counted — matching the
 * DB function refresh_ledger_wasel exactly.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export interface WaselTotals {
  wasel_menho: number;
  wasel_eleih: number;
  count: number;
}

export async function getWaselFromWhatsApp(
  supabase: SupabaseClient,
  ledgerId: string
): Promise<WaselTotals> {
  const { data, error } = await supabase
    .from("transactions")
    .select("type, amount")
    .eq("daily_ledger_id", ledgerId)
    .eq("is_confirmed", true)
    .eq("source", "whatsapp")
    .not("whatsapp_confirmed_at", "is", null);

  if (error) throw error;

  let wasel_menho = 0;
  let wasel_eleih = 0;
  let count = 0;
  for (const row of data ?? []) {
    const amount = Number(row.amount);
    if (row.type === "wasel_menho") wasel_menho += amount;
    else if (row.type === "wasel_eleih") wasel_eleih += amount;
    count++;
  }

  return { wasel_menho, wasel_eleih, count };
}
