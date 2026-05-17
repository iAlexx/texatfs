import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { DailyLedger } from "@/lib/supabase/database.types";

let browserClient: SupabaseClient | null = null;

export function getSupabaseBrowserClient(): SupabaseClient {
  if (browserClient) return browserClient;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY"
    );
  }

  browserClient = createClient(url, key, {
    auth: { persistSession: true, autoRefreshToken: true },
  });

  return browserClient;
}

export function mapLedgerRow(row: Record<string, unknown>): DailyLedger {
  return {
    id: String(row.id),
    user_id: String(row.user_id),
    ledger_date: String(row.ledger_date),
    status: row.status as DailyLedger["status"],
    tebat: Number(row.tebat),
    suhoubat: Number(row.suhoubat),
    al_farq: Number(row.al_farq),
    al_harq: Number(row.al_harq),
    wasel_menho: Number(row.wasel_menho),
    wasel_eleih: Number(row.wasel_eleih),
    baqi_qadim: Number(row.baqi_qadim),
    al_nihai: Number(row.al_nihai),
    discrepancy_flag: Boolean(row.discrepancy_flag),
    updated_at: String(row.updated_at),
  };
}
