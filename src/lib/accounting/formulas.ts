import type { DailyLedgerMetrics, SnapshotTotals } from "@/lib/accounting/types";

const MONEY_SCALE = 4;

export function roundMoney(value: number): number {
  const factor = 10 ** MONEY_SCALE;
  return Math.round(value * factor) / factor;
}

/** Tebat — delta deposits since previous Texas API snapshot */
export function computeTebat(
  current: SnapshotTotals,
  previous: SnapshotTotals | null
): number {
  const prev = previous?.totalDeposit ?? 0;
  return roundMoney(current.totalDeposit - prev);
}

/** Suhoubat — delta withdrawals since previous snapshot */
export function computeSuhoubat(
  current: SnapshotTotals,
  previous: SnapshotTotals | null
): number {
  const prev = previous?.totalWithdraw ?? 0;
  return roundMoney(current.totalWithdraw - prev);
}

/** Al_Farq — the difference (Tebat − Suhoubat) */
export function computeAlFarq(tebat: number, suhoubat: number): number {
  return roundMoney(tebat - suhoubat);
}

/**
 * Al_Harq — NGR / burn for the period.
 * Uses delta of cumulative NGR when a previous snapshot exists; otherwise current NGR.
 */
export function computeAlHarq(
  current: SnapshotTotals,
  previous: SnapshotTotals | null
): number {
  const prev = previous?.ngr ?? 0;
  return roundMoney(current.ngr - prev);
}

/**
 * Baqi_Qadim — rolling balance carried from yesterday's Al_Nihai.
 * Priority: explicit previousDayLedger → existing ledger row → 0.
 */
export function resolveBaqiQadim(options: {
  previousDayAlNihai: number | null | undefined;
  existingBaqiQadim?: number | null;
}): number {
  if (options.previousDayAlNihai !== null && options.previousDayAlNihai !== undefined) {
    return roundMoney(options.previousDayAlNihai);
  }
  if (options.existingBaqiQadim !== null && options.existingBaqiQadim !== undefined) {
    return roundMoney(options.existingBaqiQadim);
  }
  return 0;
}

/**
 * Al_Nihai — final balance for the business day.
 * Formula: Al_Farq + Wasel_Eleih − Wasel_Menho + Baqi_Qadim
 */
export function computeAlNihai(parts: {
  al_farq: number;
  wasel_menho: number;
  wasel_eleih: number;
  baqi_qadim: number;
}): number {
  return roundMoney(
    parts.al_farq + parts.wasel_eleih - parts.wasel_menho + parts.baqi_qadim
  );
}

export function snapshotToTotals(snapshot: {
  totalDeposit: number;
  totalWithdraw: number;
  ngr: number;
  balance?: number;
}): SnapshotTotals {
  return {
    totalDeposit: roundMoney(snapshot.totalDeposit),
    totalWithdraw: roundMoney(snapshot.totalWithdraw),
    ngr: roundMoney(snapshot.ngr),
    balance: snapshot.balance !== undefined ? roundMoney(snapshot.balance) : undefined,
  };
}

export function buildLedgerMetrics(input: {
  current: SnapshotTotals;
  previous: SnapshotTotals | null;
  wasel_menho: number;
  wasel_eleih: number;
  baqi_qadim: number;
}): DailyLedgerMetrics {
  const tebat = computeTebat(input.current, input.previous);
  const suhoubat = computeSuhoubat(input.current, input.previous);
  const al_farq = computeAlFarq(tebat, suhoubat);
  const al_harq = computeAlHarq(input.current, input.previous);
  const al_nihai = computeAlNihai({
    al_farq,
    wasel_menho: input.wasel_menho,
    wasel_eleih: input.wasel_eleih,
    baqi_qadim: input.baqi_qadim,
  });

  return {
    tebat,
    suhoubat,
    al_farq,
    al_harq,
    wasel_menho: roundMoney(input.wasel_menho),
    wasel_eleih: roundMoney(input.wasel_eleih),
    baqi_qadim: roundMoney(input.baqi_qadim),
    al_nihai,
  };
}

/** Validates DB check constraint: al_nihai = al_farq + wasel_eleih - wasel_menho + baqi_qadim */
export function assertAlNihaiFormula(metrics: DailyLedgerMetrics): void {
  const expected = computeAlNihai({
    al_farq: metrics.al_farq,
    wasel_menho: metrics.wasel_menho,
    wasel_eleih: metrics.wasel_eleih,
    baqi_qadim: metrics.baqi_qadim,
  });
  if (expected !== metrics.al_nihai) {
    throw new Error(
      `Al_Nihai formula mismatch: expected ${expected}, got ${metrics.al_nihai}`
    );
  }
}
