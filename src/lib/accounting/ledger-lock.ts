import type { SupabaseClient } from "@supabase/supabase-js";

/** Postgres / RPC error codes surfaced to API layer. */
export type LedgerLockErrorCode =
  | "LEDGER_NOT_FOUND"
  | "LEDGER_LOCKED"
  | "LEDGER_ALREADY_CLOSED"
  | "LEDGER_FORMULA_MISMATCH"
  | "LEDGER_ACCESS_DENIED";

export class LedgerLockError extends Error {
  constructor(
    message: string,
    readonly code: LedgerLockErrorCode,
    readonly status: 400 | 403 | 404 | 409 = 400
  ) {
    super(message);
    this.name = "LedgerLockError";
  }
}

const LOCKED_MESSAGE =
  "هذه اليومية مقفلة — لا يمكن تعديل القيم المالية";

export function mapRpcErrorToLedgerLockError(err: {
  message?: string;
  code?: string;
}): LedgerLockError | null {
  const msg = err.message ?? "";
  if (msg.includes("LEDGER_NOT_FOUND")) {
    return new LedgerLockError("اليومية غير موجودة", "LEDGER_NOT_FOUND", 404);
  }
  if (msg.includes("LEDGER_ALREADY_CLOSED")) {
    return new LedgerLockError(
      "لا يمكن إغلاق يومية مغلقة مسبقاً",
      "LEDGER_ALREADY_CLOSED",
      409
    );
  }
  if (msg.includes("LEDGER_LOCKED")) {
    return new LedgerLockError(LOCKED_MESSAGE, "LEDGER_LOCKED", 409);
  }
  if (msg.includes("LEDGER_FORMULA_MISMATCH")) {
    return new LedgerLockError(
      "صيغة الرصيد النهائي غير متطابقة — أعد المزامنة قبل الإغلاق",
      "LEDGER_FORMULA_MISMATCH",
      400
    );
  }
  if (msg.includes("LEDGER_ACCESS_DENIED")) {
    return new LedgerLockError("غير مصرح بإغلاق هذه اليومية", "LEDGER_ACCESS_DENIED", 403);
  }
  return null;
}

/**
 * Application-level guard before writes (DB triggers enforce as well).
 */
export async function assertLedgerWritable(
  supabase: SupabaseClient,
  ledgerId: string
): Promise<void> {
  const { data, error } = await supabase
    .from("daily_ledgers")
    .select("id, is_locked, status")
    .eq("id", ledgerId)
    .maybeSingle();

  if (error) throw error;
  if (!data) {
    throw new LedgerLockError("اليومية غير موجودة", "LEDGER_NOT_FOUND", 404);
  }
  if (data.is_locked || data.status === "closed") {
    throw new LedgerLockError(LOCKED_MESSAGE, "LEDGER_LOCKED", 409);
  }
}
