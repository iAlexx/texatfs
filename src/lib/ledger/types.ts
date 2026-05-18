import type { DailyLedger, LedgerSessionResponse } from "@/lib/supabase/database.types";

export interface LedgerAuthInput {
  initData?: string;
  telegramUserId?: number;
}

export interface LedgerHistoryEntry {
  ledger_date: string;
  status: "open" | "closed";
  al_nihai: number;
  discrepancy_flag: boolean;
}

export interface LedgerHistoryResponse {
  dates: LedgerHistoryEntry[];
}

export type { DailyLedger, LedgerSessionResponse };
