import type { NormalizedTexasSnapshot } from "@/lib/texas/types";

/** Arabic ledger labels mapped to DB columns */
export interface DailyLedgerMetrics {
  tebat: number;
  suhoubat: number;
  al_farq: number;
  al_harq: number;
  wasel_menho: number;
  wasel_eleih: number;
  baqi_qadim: number;
  al_nihai: number;
}

export interface SnapshotTotals {
  totalDeposit: number;
  totalWithdraw: number;
  ngr: number;
  balance?: number;
}

export interface DailyLedgerReport extends DailyLedgerMetrics {
  userId: string;
  ledgerDate: string;
  currencyCode: string;
  currentSnapshot: SnapshotTotals;
  previousSnapshot: SnapshotTotals | null;
  balanceFromApi: number;
  computedAt: string;
}

export interface DailyLedgerRow {
  id: string;
  user_id: string;
  ledger_date: string;
  status: "open" | "closed";
  tebat: number;
  suhoubat: number;
  al_farq: number;
  al_harq: number;
  wasel_menho: number;
  wasel_eleih: number;
  baqi_qadim: number;
  al_nihai: number;
  opening_snapshot_id?: string | null;
  closing_snapshot_id?: string | null;
  previous_ledger_id?: string | null;
}

export interface GenerateDailyReportInput {
  userId: string;
  ledgerDate: string;
  currentSnapshot: NormalizedTexasSnapshot;
  previousSnapshot: NormalizedTexasSnapshot | null;
  /** Existing open ledger row — Wasel fields read from DB (transaction rollup) */
  existingLedger?: Pick<
    DailyLedgerRow,
    "id" | "wasel_menho" | "wasel_eleih" | "baqi_qadim"
  > | null;
  /** Previous business day's closed ledger — source of Baqi_Qadim */
  previousDayLedger?: Pick<
    DailyLedgerRow,
    "id" | "al_nihai" | "ledger_date"
  > | null;
}

export interface PersistLedgerPayload extends DailyLedgerMetrics {
  userId: string;
  ledgerDate: string;
  openingSnapshotId?: string;
  closingSnapshotId?: string;
  previousLedgerId?: string;
}

export interface AccountingRepository {
  getOpenLedger(
    userId: string,
    ledgerDate: string
  ): Promise<DailyLedgerRow | null>;

  getLedgerByDate(
    userId: string,
    ledgerDate: string,
    status?: "open" | "closed"
  ): Promise<DailyLedgerRow | null>;

  /** Latest closed ledger strictly before `beforeDate` (fallback) */
  getPreviousClosedLedger(
    userId: string,
    beforeDate: string
  ): Promise<DailyLedgerRow | null>;

  getSnapshotForDate(
    userId: string,
    ledgerDate: string
  ): Promise<NormalizedTexasSnapshot | null>;

  getPreviousSnapshot(
    userId: string,
    beforeDate: string
  ): Promise<NormalizedTexasSnapshot | null>;

  upsertOpenLedger(payload: PersistLedgerPayload): Promise<DailyLedgerRow>;

  insertSnapshot(
    userId: string,
    ledgerDate: string,
    snapshot: import("@/lib/texas/types").NormalizedTexasSnapshot,
    fetchSource?: string
  ): Promise<{ id: string }>;
}
