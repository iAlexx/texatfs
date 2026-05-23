import type { SupabaseClient } from "@supabase/supabase-js";
import type { AccountingRepository, DailyLedgerRow, PersistLedgerPayload } from "@/lib/accounting/types";
import type { NormalizedTexasSnapshot } from "@/lib/texas/types";

function rowToSnapshot(row: {
  balance: string | number;
  total_deposit: string | number;
  total_withdraw: string | number;
  ngr: string | number;
  currency_code: string;
  raw_wallets: Record<string, unknown>;
  raw_statistics: Record<string, unknown>;
}): NormalizedTexasSnapshot {
  return {
    balance: Number(row.balance),
    totalDeposit: Number(row.total_deposit),
    totalWithdraw: Number(row.total_withdraw),
    ngr: Number(row.ngr),
    currencyCode: row.currency_code,
    rawWallets: row.raw_wallets ?? {},
    rawStatistics: row.raw_statistics ?? {},
  };
}

const LEDGER_ROW_SELECT =
  "id, user_id, ledger_date, status, tebat, suhoubat, al_farq, al_harq, wasel_menho, wasel_eleih, baqi_qadim, al_nihai, opening_snapshot_id, closing_snapshot_id, previous_ledger_id";

function rowToLedger(row: Record<string, unknown>): DailyLedgerRow {
  return {
    id: String(row.id),
    user_id: String(row.user_id),
    ledger_date: String(row.ledger_date),
    status: row.status as DailyLedgerRow["status"],
    tebat: Number(row.tebat),
    suhoubat: Number(row.suhoubat),
    al_farq: Number(row.al_farq),
    al_harq: Number(row.al_harq),
    wasel_menho: Number(row.wasel_menho),
    wasel_eleih: Number(row.wasel_eleih),
    baqi_qadim: Number(row.baqi_qadim),
    al_nihai: Number(row.al_nihai),
    opening_snapshot_id: row.opening_snapshot_id as string | null,
    closing_snapshot_id: row.closing_snapshot_id as string | null,
    previous_ledger_id: row.previous_ledger_id as string | null,
  };
}

export class SupabaseAccountingRepository implements AccountingRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async getOpenLedger(
    userId: string,
    ledgerDate: string
  ): Promise<DailyLedgerRow | null> {
    return this.getLedgerByDate(userId, ledgerDate, "open");
  }

  async getLedgerByDate(
    userId: string,
    ledgerDate: string,
    status?: "open" | "closed"
  ): Promise<DailyLedgerRow | null> {
    let query = this.supabase
      .from("daily_ledgers")
      .select(LEDGER_ROW_SELECT)
      .eq("user_id", userId)
      .eq("ledger_date", ledgerDate);

    if (status) query = query.eq("status", status);

    const { data, error } = await query.maybeSingle();
    if (error) throw error;
    return data ? rowToLedger(data) : null;
  }

  async getPreviousClosedLedger(
    userId: string,
    beforeDate: string
  ): Promise<DailyLedgerRow | null> {
    const { data, error } = await this.supabase
      .from("daily_ledgers")
      .select(LEDGER_ROW_SELECT)
      .eq("user_id", userId)
      .eq("status", "closed")
      .lt("ledger_date", beforeDate)
      .order("ledger_date", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    return data ? rowToLedger(data) : null;
  }

  async getSnapshotForDate(
    userId: string,
    ledgerDate: string
  ): Promise<NormalizedTexasSnapshot | null> {
    const { data, error } = await this.supabase
      .from("api_snapshots")
      .select(
        "balance, total_deposit, total_withdraw, ngr, currency_code, raw_wallets, raw_statistics"
      )
      .eq("user_id", userId)
      .eq("ledger_date", ledgerDate)
      .order("captured_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    return data ? rowToSnapshot(data) : null;
  }

  async getPreviousSnapshot(
    userId: string,
    beforeDate: string
  ): Promise<NormalizedTexasSnapshot | null> {
    const { data, error } = await this.supabase
      .from("api_snapshots")
      .select(
        "balance, total_deposit, total_withdraw, ngr, currency_code, raw_wallets, raw_statistics"
      )
      .eq("user_id", userId)
      .lt("ledger_date", beforeDate)
      .order("ledger_date", { ascending: false })
      .order("captured_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    return data ? rowToSnapshot(data) : null;
  }

  async upsertOpenLedger(payload: PersistLedgerPayload): Promise<DailyLedgerRow> {
    const { data, error } = await this.supabase
      .from("daily_ledgers")
      .upsert(
        {
          user_id: payload.userId,
          ledger_date: payload.ledgerDate,
          status: "open",
          tebat: payload.tebat,
          suhoubat: payload.suhoubat,
          al_farq: payload.al_farq,
          al_harq: payload.al_harq,
          wasel_menho: payload.wasel_menho,
          wasel_eleih: payload.wasel_eleih,
          baqi_qadim: payload.baqi_qadim,
          al_nihai: payload.al_nihai,
          discrepancy_flag: payload.discrepancyFlag ?? false,
          discrepancy_detail: payload.discrepancyDetail ?? {},
          opening_snapshot_id: payload.openingSnapshotId ?? null,
          closing_snapshot_id: payload.closingSnapshotId ?? null,
          previous_ledger_id: payload.previousLedgerId ?? null,
        },
        { onConflict: "user_id,ledger_date" }
      )
      .select(LEDGER_ROW_SELECT)
      .single();

    if (error) throw error;
    return rowToLedger(data);
  }

  async insertSnapshot(
    userId: string,
    ledgerDate: string,
    snapshot: NormalizedTexasSnapshot,
    fetchSource = "cron"
  ): Promise<{ id: string }> {
    const { data: previous } = await this.supabase
      .from("api_snapshots")
      .select("id")
      .eq("user_id", userId)
      .lt("ledger_date", ledgerDate)
      .order("ledger_date", { ascending: false })
      .order("captured_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data, error } = await this.supabase
      .from("api_snapshots")
      .insert({
        user_id: userId,
        ledger_date: ledgerDate,
        currency_code: snapshot.currencyCode,
        balance: snapshot.balance,
        total_deposit: snapshot.totalDeposit,
        total_withdraw: snapshot.totalWithdraw,
        ngr: snapshot.ngr,
        raw_wallets: snapshot.rawWallets,
        raw_statistics: snapshot.rawStatistics,
        previous_snapshot_id: previous?.id ?? null,
        fetch_source: fetchSource,
      })
      .select("id")
      .single();

    if (error) throw error;
    return { id: data.id as string };
  }
}
