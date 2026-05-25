import { assertAlNihaiFormula } from "@/lib/accounting/formulas";
import {
  LedgerLockError,
  mapRpcErrorToLedgerLockError,
} from "@/lib/accounting/ledger-lock";
import { createLogger } from "@/lib/observability/logger";
import type { SupabaseClient } from "@supabase/supabase-js";

const log = createLogger("accounting/ledger-closer");

export interface LedgerCloseInput {
  tebat: number;
  suhoubat: number;
  al_farq: number;
  al_harq: number;
  wasel_menho: number;
  wasel_eleih: number;
  baqi_qadim: number;
  al_nihai: number;
}

export interface CalculationTrace extends LedgerCloseInput {
  formula: string;
  closed_at: string;
}

export interface CloseDailyLedgerResult {
  ledgerId: string;
  userId: string;
  closedAt: string;
  closedBy: string;
  calculationTrace: CalculationTrace;
}

/**
 * Builds the immutable calculation trace stored at close time.
 * Invariant: al_nihai = al_farq + wasel_eleih - wasel_menho + baqi_qadim
 */
export function buildCalculationTrace(
  row: LedgerCloseInput,
  closedAt = new Date()
): CalculationTrace {
  return {
    tebat: row.tebat,
    suhoubat: row.suhoubat,
    al_farq: row.al_farq,
    al_harq: row.al_harq,
    wasel_menho: row.wasel_menho,
    wasel_eleih: row.wasel_eleih,
    baqi_qadim: row.baqi_qadim,
    al_nihai: row.al_nihai,
    formula: "al_farq + wasel_eleih - wasel_menho + baqi_qadim",
    closed_at: closedAt.toISOString(),
  };
}

/**
 * Pre-close validation in application layer (mirrors DB check before RPC).
 */
export function validateClosePreconditions(row: {
  status: string;
  is_locked?: boolean;
  closed_at?: string | null;
} & LedgerCloseInput): void {
  if (row.is_locked || row.status === "closed" || row.closed_at) {
    throw new LedgerLockError(
      "لا يمكن إغلاق يومية مغلقة مسبقاً",
      "LEDGER_ALREADY_CLOSED",
      409
    );
  }

  assertAlNihaiFormula({
    tebat: row.tebat,
    suhoubat: row.suhoubat,
    al_farq: row.al_farq,
    al_harq: row.al_harq,
    wasel_menho: row.wasel_menho,
    wasel_eleih: row.wasel_eleih,
    baqi_qadim: row.baqi_qadim,
    al_nihai: row.al_nihai,
  });
}

/**
 * Closes and locks a daily ledger atomically via Postgres RPC.
 *
 * - Verifies hierarchy access (can_view_user_for inside RPC)
 * - Validates Al_Nihai formula
 * - Sets is_locked = true (immutable thereafter)
 * - Writes ledger_close_audit row
 */
export async function closeDailyLedger(
  supabase: SupabaseClient,
  ledgerId: string,
  closedByUserId: string,
  reason?: string
): Promise<CloseDailyLedgerResult> {
  log.info("close requested", {
    ledgerId,
    closedByUserId,
    hasReason: Boolean(reason?.trim()),
  });

  const { data: preview, error: previewErr } = await supabase
    .from("daily_ledgers")
    .select(
      "id, user_id, status, is_locked, closed_at, tebat, suhoubat, al_farq, al_harq, wasel_menho, wasel_eleih, baqi_qadim, al_nihai"
    )
    .eq("id", ledgerId)
    .maybeSingle();

  if (previewErr) throw previewErr;
  if (!preview) {
    throw new LedgerLockError("اليومية غير موجودة", "LEDGER_NOT_FOUND", 404);
  }

  validateClosePreconditions({
    status: preview.status as string,
    is_locked: Boolean(preview.is_locked),
    closed_at: preview.closed_at as string | null,
    tebat: Number(preview.tebat),
    suhoubat: Number(preview.suhoubat),
    al_farq: Number(preview.al_farq),
    al_harq: Number(preview.al_harq),
    wasel_menho: Number(preview.wasel_menho),
    wasel_eleih: Number(preview.wasel_eleih),
    baqi_qadim: Number(preview.baqi_qadim),
    al_nihai: Number(preview.al_nihai),
  });

  const { data, error } = await supabase.rpc("close_daily_ledger", {
    p_ledger_id: ledgerId,
    p_closed_by: closedByUserId,
    p_close_reason: reason?.trim() || null,
  });

  if (error) {
    const mapped = mapRpcErrorToLedgerLockError(error);
    if (mapped) throw mapped;
    throw error;
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== "object") {
    throw new Error("close_daily_ledger returned no row");
  }

  const r = row as Record<string, unknown>;
  const closedAt = String(r.closed_at ?? new Date().toISOString());

  log.info("close succeeded", {
    ledgerId,
    userId: r.user_id,
    closedByUserId,
    closedAt,
  });

  const metrics: LedgerCloseInput = {
    tebat: Number(r.tebat),
    suhoubat: Number(r.suhoubat),
    al_farq: Number(r.al_farq),
    al_harq: Number(r.al_harq),
    wasel_menho: Number(r.wasel_menho),
    wasel_eleih: Number(r.wasel_eleih),
    baqi_qadim: Number(r.baqi_qadim),
    al_nihai: Number(r.al_nihai),
  };

  const traceFromDb = r.calculation_trace as CalculationTrace | undefined;

  return {
    ledgerId,
    userId: String(r.user_id),
    closedAt,
    closedBy: closedByUserId,
    calculationTrace: traceFromDb ?? buildCalculationTrace(metrics, new Date(closedAt)),
  };
}
