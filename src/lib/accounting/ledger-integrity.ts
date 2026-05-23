import {
  assertAlNihaiFormula,
  computeAlFarq,
  computeAlHarqFromAlFarq,
  computeAlNihai,
  roundMoney,
} from "@/lib/accounting/formulas";
import { reconcileLedger } from "@/lib/finance/reconciliation";
import { createLogger } from "@/lib/observability/logger";

const log = createLogger("accounting/integrity");

export interface LedgerIntegrityIssue {
  code: string;
  message: string;
  expected?: number;
  actual?: number;
}

export interface LedgerIntegrityResult {
  ok: boolean;
  issues: LedgerIntegrityIssue[];
  /** Texas vs WhatsApp wasel mismatch (detection only). */
  waselReconcile: ReturnType<typeof reconcileLedger>;
}

export interface LedgerIntegrityInput {
  tebat: number;
  suhoubat: number;
  al_farq: number;
  al_harq: number;
  wasel_menho: number;
  wasel_eleih: number;
  baqi_qadim: number;
  al_nihai: number;
}

const TOLERANCE = 0.01;

function near(a: number, b: number): boolean {
  return Math.abs(roundMoney(a) - roundMoney(b)) < TOLERANCE;
}

/**
 * Read-only validation — never mutates ledger amounts.
 * Used to set discrepancy_flag / discrepancy_detail for admin visibility.
 */
export function validateLedgerIntegrity(
  ledger: LedgerIntegrityInput
): LedgerIntegrityResult {
  const issues: LedgerIntegrityIssue[] = [];

  const expectedFarq = computeAlFarq(ledger.tebat, ledger.suhoubat);
  if (!near(ledger.al_farq, expectedFarq)) {
    issues.push({
      code: "al_farq_mismatch",
      message: "Al_Farq ≠ Tebat − Suhoubat",
      expected: expectedFarq,
      actual: ledger.al_farq,
    });
  }

  const expectedHarq = computeAlHarqFromAlFarq(ledger.al_farq);
  if (!near(ledger.al_harq, expectedHarq)) {
    issues.push({
      code: "al_harq_mismatch",
      message: "Al_Harq ≠ Al_Farq",
      expected: expectedHarq,
      actual: ledger.al_harq,
    });
  }

  const expectedNihai = computeAlNihai({
    al_farq: ledger.al_farq,
    wasel_menho: ledger.wasel_menho,
    wasel_eleih: ledger.wasel_eleih,
    baqi_qadim: ledger.baqi_qadim,
  });
  if (!near(ledger.al_nihai, expectedNihai)) {
    issues.push({
      code: "al_nihai_mismatch",
      message: "Al_Nihai formula mismatch",
      expected: expectedNihai,
      actual: ledger.al_nihai,
    });
  }

  try {
    assertAlNihaiFormula(ledger);
  } catch {
    /* already captured via explicit al_nihai check above */
  }

  const waselReconcile = reconcileLedger({
    tebat: ledger.tebat,
    suhoubat: ledger.suhoubat,
    wasel_menho: ledger.wasel_menho,
    wasel_eleih: ledger.wasel_eleih,
  });

  if (!waselReconcile.balanced) {
    issues.push({
      code: "wasel_texas_mismatch",
      message: waselReconcile.leakHint ?? "Texas movement vs Wasel mismatch",
      expected: waselReconcile.texasSide,
      actual: waselReconcile.waselSide,
    });
  }

  return {
    ok: issues.length === 0,
    issues,
    waselReconcile,
  };
}

export function discrepancyDetailFromIntegrity(
  result: LedgerIntegrityResult
): Record<string, unknown> {
  return {
    checkedAt: new Date().toISOString(),
    ok: result.ok,
    issues: result.issues,
    waselDifference: result.waselReconcile.difference,
    leakHint: result.waselReconcile.leakHint,
  };
}

/** Persist discrepancy_flag only — never changes monetary columns. */
export async function flagLedgerDiscrepancyIfNeeded(
  supabase: import("@supabase/supabase-js").SupabaseClient,
  ledgerId: string
): Promise<void> {
  const { data, error } = await supabase
    .from("daily_ledgers")
    .select(
      "tebat, suhoubat, al_farq, al_harq, wasel_menho, wasel_eleih, baqi_qadim, al_nihai, discrepancy_flag"
    )
    .eq("id", ledgerId)
    .maybeSingle();

  if (error || !data) return;

  const integrity = validateLedgerIntegrity({
    tebat: Number(data.tebat),
    suhoubat: Number(data.suhoubat),
    al_farq: Number(data.al_farq),
    al_harq: Number(data.al_harq),
    wasel_menho: Number(data.wasel_menho),
    wasel_eleih: Number(data.wasel_eleih),
    baqi_qadim: Number(data.baqi_qadim),
    al_nihai: Number(data.al_nihai),
  });

  const flag = !integrity.ok;
  const detail = discrepancyDetailFromIntegrity(integrity);

  if (flag === Boolean(data.discrepancy_flag) && integrity.ok) return;

  const { error: updateErr } = await supabase
    .from("daily_ledgers")
    .update({
      discrepancy_flag: flag,
      discrepancy_detail: detail,
    })
    .eq("id", ledgerId);

  if (updateErr) {
    log.warn("failed to update discrepancy flag", {
      ledgerId,
      error: updateErr.message,
    });
  } else if (flag) {
    log.warn("ledger discrepancy detected", {
      ledgerId,
      issueCount: integrity.issues.length,
      codes: integrity.issues.map((i) => i.code),
    });
  }
}
