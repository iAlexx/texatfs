import { roundMoney } from "@/lib/accounting/formulas";

export type ReconciliationStatus = "OK" | "WARNING" | "ERROR";

export function getReconciliationWarnThreshold(): number {
  const n = Number(process.env.DATA_RECONCILIATION_WARN_THRESHOLD ?? 1);
  return Number.isFinite(n) && n >= 0 ? n : 1;
}

export interface ReconcileFinancialInput {
  texasTxDeposit: number;
  texasTxWithdraw: number;
  snapshotDeposit: number | null;
  snapshotWithdraw: number | null;
  ledgerTebat: number | null;
  ledgerSuhoubat: number | null;
  displayedTebat: number | null;
  displayedSuhoubat: number | null;
  generalReportDeposit?: number | null;
  generalReportWithdrawal?: number | null;
}

export interface ReconcileFinancialResult {
  status: ReconciliationStatus;
  maxDifference: number;
  differences: Array<{
    field: string;
    expected: number;
    actual: number;
    diff: number;
  }>;
}

function diff(a: number, b: number): number {
  return roundMoney(Math.abs(a - b));
}

/**
 * Compare Texas Transaction totals vs snapshot vs ledger vs UI display.
 */
export function reconcileFinancialTotals(
  input: ReconcileFinancialInput
): ReconcileFinancialResult {
  const threshold = getReconciliationWarnThreshold();
  const differences: ReconcileFinancialResult["differences"] = [];

  const pairs: Array<[string, number | null, number | null]> = [
    ["snapshot_deposit_vs_texas_tx", input.snapshotDeposit, input.texasTxDeposit],
    ["snapshot_withdraw_vs_texas_tx", input.snapshotWithdraw, input.texasTxWithdraw],
    ["ledger_tebat_vs_texas_tx", input.ledgerTebat, input.texasTxDeposit],
    ["ledger_suhoubat_vs_texas_tx", input.ledgerSuhoubat, input.texasTxWithdraw],
    ["ui_tebat_vs_texas_tx", input.displayedTebat, input.texasTxDeposit],
    ["ui_suhoubat_vs_texas_tx", input.displayedSuhoubat, input.texasTxWithdraw],
  ];

  if (input.generalReportDeposit != null) {
    pairs.push([
      "general_deposit_vs_texas_tx",
      input.generalReportDeposit,
      input.texasTxDeposit,
    ]);
  }
  if (input.generalReportWithdrawal != null) {
    pairs.push([
      "general_withdraw_vs_texas_tx",
      input.generalReportWithdrawal,
      input.texasTxWithdraw,
    ]);
  }

  let maxDifference = 0;
  for (const [field, a, b] of pairs) {
    if (a == null || b == null) continue;
    const d = diff(a, b);
    if (d > 0) {
      differences.push({ field, expected: b, actual: a, diff: d });
      maxDifference = Math.max(maxDifference, d);
    }
  }

  // Zero UI when Texas has money is always ERROR
  const texasHasMoney =
    input.texasTxDeposit > threshold || input.texasTxWithdraw > threshold;
  const uiZero =
    (input.displayedTebat ?? 0) <= threshold &&
    (input.displayedSuhoubat ?? 0) <= threshold;

  if (texasHasMoney && uiZero) {
    return {
      status: "ERROR",
      maxDifference: Math.max(maxDifference, input.texasTxDeposit, input.texasTxWithdraw),
      differences: [
        ...differences,
        {
          field: "ui_zero_while_texas_has_data",
          expected: input.texasTxDeposit,
          actual: input.displayedTebat ?? 0,
          diff: input.texasTxDeposit,
        },
      ],
    };
  }

  if (maxDifference <= threshold) {
    return { status: "OK", maxDifference, differences };
  }

  if (maxDifference <= threshold * 100) {
    return { status: "WARNING", maxDifference, differences };
  }

  return { status: "ERROR", maxDifference, differences };
}
