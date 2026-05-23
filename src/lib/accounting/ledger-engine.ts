import {
  assertAlNihaiFormula,
  buildLedgerMetrics,
  computeAlFarq,
  computeAlHarqFromAlFarq,
  resolveBaqiQadim,
  roundMoney,
  snapshotToTotals,
} from "@/lib/accounting/formulas";
import {
  discrepancyDetailFromIntegrity,
  validateLedgerIntegrity,
  type LedgerIntegrityResult,
} from "@/lib/accounting/ledger-integrity";
import type {
  DailyLedgerMetrics,
  DailyLedgerReport,
  GenerateDailyReportInput,
} from "@/lib/accounting/types";
import type { NormalizedTexasSnapshot } from "@/lib/texas/types";

/** Confirmed WhatsApp cash totals for one business day. */
export interface ConfirmedWaselTotals {
  wasel_menho: number;
  wasel_eleih: number;
}

export interface DeterministicLedgerSources {
  userId: string;
  ledgerDate: string;
  /** Step 1 — Texas API snapshot (current). */
  currentSnapshot: NormalizedTexasSnapshot;
  /** Step 1 — Texas baseline snapshot (previous business day or earlier). */
  previousSnapshot: NormalizedTexasSnapshot | null;
  /** Step 2 — Sum of confirmed WhatsApp transactions only. */
  wasel: ConfirmedWaselTotals;
  /** Step 3 — Previous closed day al_nihai (null → 0). */
  previousDayAlNihai: number | null;
}

export interface DeterministicLedgerResult {
  report: DailyLedgerReport;
  integrity: LedgerIntegrityResult;
  discrepancyDetail: Record<string, unknown>;
}

/**
 * Single-source-of-truth ledger computation.
 *
 * Order (fixed):
 *  1. Texas snapshot deltas → tebat, suhoubat, al_farq, al_harq
 *  2. WhatsApp confirmed wasel totals
 *  3. Previous day al_nihai → baqi_qadim
 *  4. al_nihai = al_farq + wasel_eleih − wasel_menho + baqi_qadim
 */
export function computeDeterministicLedger(
  sources: DeterministicLedgerSources
): DeterministicLedgerResult {
  const current = snapshotToTotals(sources.currentSnapshot);
  const previous = sources.previousSnapshot
    ? snapshotToTotals(sources.previousSnapshot)
    : null;

  const wasel_menho = roundMoney(sources.wasel.wasel_menho);
  const wasel_eleih = roundMoney(sources.wasel.wasel_eleih);
  const baqi_qadim = resolveBaqiQadim({
    previousDayAlNihai: sources.previousDayAlNihai,
  });

  const metrics = buildLedgerMetrics({
    current,
    previous,
    wasel_menho,
    wasel_eleih,
    baqi_qadim,
  });

  assertAlHarqEqualsAlFarq(metrics);
  assertAlNihaiFormula(metrics);

  const report: DailyLedgerReport = {
    ...metrics,
    userId: sources.userId,
    ledgerDate: sources.ledgerDate,
    currencyCode: sources.currentSnapshot.currencyCode,
    currentSnapshot: current,
    previousSnapshot: previous,
    balanceFromApi: sources.currentSnapshot.balance,
    computedAt: new Date().toISOString(),
  };

  const integrity = validateLedgerIntegrity(report);
  const discrepancyDetail = discrepancyDetailFromIntegrity(integrity);

  return { report, integrity, discrepancyDetail };
}

/** Maps legacy generateDailyReport input when wasel is already on the open ledger row. */
export function computeDeterministicLedgerFromInput(
  input: GenerateDailyReportInput
): DeterministicLedgerResult {
  return computeDeterministicLedger({
    userId: input.userId,
    ledgerDate: input.ledgerDate,
    currentSnapshot: input.currentSnapshot,
    previousSnapshot: input.previousSnapshot,
    wasel: {
      wasel_menho: input.existingLedger?.wasel_menho ?? 0,
      wasel_eleih: input.existingLedger?.wasel_eleih ?? 0,
    },
    previousDayAlNihai: input.previousDayLedger?.al_nihai ?? null,
  });
}

export function snapshotFingerprint(snapshot: NormalizedTexasSnapshot): string {
  return [
    roundMoney(snapshot.totalDeposit),
    roundMoney(snapshot.totalWithdraw),
    roundMoney(snapshot.ngr),
    snapshot.balance !== undefined ? roundMoney(snapshot.balance) : "na",
  ].join("|");
}

function assertAlHarqEqualsAlFarq(metrics: DailyLedgerMetrics): void {
  const expected = computeAlHarqFromAlFarq(metrics.al_farq);
  if (expected !== metrics.al_harq) {
    throw new Error(
      `Al_Harq must equal Al_Farq: expected ${expected}, got ${metrics.al_harq}`
    );
  }
  const farq = computeAlFarq(metrics.tebat, metrics.suhoubat);
  if (farq !== metrics.al_farq) {
    throw new Error(
      `Al_Farq must equal Tebat − Suhoubat: expected ${farq}, got ${metrics.al_farq}`
    );
  }
}
