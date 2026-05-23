import { TEXAS_FIELD_MAPPING } from "@/lib/texas/texas-mapping.config";

export function pickNumeric(
  source: Record<string, unknown>,
  keys: readonly string[]
): number {
  for (const key of keys) {
    const raw = source[key];
    if (raw === undefined || raw === null || raw === "") continue;
    const n = Number(String(raw).replace(/,/g, ""));
    if (!Number.isNaN(n)) return n;
  }
  return 0;
}

export function pickString(
  source: Record<string, unknown>,
  keys: readonly string[]
): string | null {
  for (const key of keys) {
    const raw = source[key];
    if (raw !== undefined && raw !== null && String(raw) !== "") {
      return String(raw);
    }
  }
  return null;
}

export const walletMapping = TEXAS_FIELD_MAPPING.wallet;
export const statsRecordMapping = TEXAS_FIELD_MAPPING.statistics.record;
export const subAgentStatsRecordMapping =
  TEXAS_FIELD_MAPPING.statistics.subAgentRecord;
export const statsTotalsMapping = TEXAS_FIELD_MAPPING.statistics.totalsFooter;

/** Run once per process — don't spam logs with per-row diagnostics. */
let _statsFieldsLogged = false;

/**
 * Sub-agent rows from getSubAgentStatistics use tree-grid keys (left/right)
 * instead of master-level totalDeposit/totalWithdraw/ngr.
 */
export function isSubAgentStatisticsRow(row: Record<string, unknown>): boolean {
  const hasTreeColumns =
    row.left !== undefined ||
    row.right !== undefined ||
    row.creditLine !== undefined;
  const hasMasterTotals =
    row.totalDeposit !== undefined ||
    row.depositsTotal !== undefined ||
    row.totalWithdraw !== undefined ||
    row.ngr !== undefined ||
    row.NGR !== undefined;
  return hasTreeColumns && !hasMasterTotals;
}

export function pickStatsRecordMetrics(row: Record<string, unknown>): {
  totalDeposit: number;
  totalWithdraw: number;
  ngr: number;
} {
  const mapping = isSubAgentStatisticsRow(row)
    ? subAgentStatsRecordMapping
    : statsRecordMapping;

  return {
    totalDeposit: pickNumeric(row, mapping.totalDeposit),
    totalWithdraw: pickNumeric(row, mapping.totalWithdraw),
    ngr: pickNumeric(row, mapping.ngr),
  };
}

/**
 * Validate that configured field-name candidates resolve on the first real row.
 * Runs exactly once per process lifecycle.
 */
export function logFieldMappingDiagnosticsOnce(
  statsRow: Record<string, unknown>
): void {
  if (_statsFieldsLogged) return;
  _statsFieldsLogged = true;

  const subAgent = isSubAgentStatisticsRow(statsRow);
  const mapping = subAgent ? subAgentStatsRecordMapping : statsRecordMapping;

  const allKeys = Object.keys(statsRow);
  console.info(
    `[field-resolver] stats row (${subAgent ? "sub-agent" : "master"}) — all keys:`,
    JSON.stringify(allKeys)
  );

  const checks: { name: string; keys: readonly string[] }[] = [
    { name: "affiliateId", keys: mapping.affiliateId },
    { name: "balance / currentWallet", keys: walletMapping.balance },
    { name: "tebat (totalDeposit)", keys: mapping.totalDeposit },
    { name: "suhoubat (totalWithdraw)", keys: mapping.totalWithdraw },
    { name: "al_harq (= al_farq)", keys: mapping.totalDeposit },
  ];

  for (const { name, keys } of checks) {
    const found = keys.find((k) => statsRow[k] !== undefined);
    if (found) {
      console.info(
        `[field-resolver] "${name}" ✓ key="${found}" value=${JSON.stringify(statsRow[found])}`
      );
    } else {
      console.warn(
        `[field-resolver] "${name}" ✗ NOT FOUND — tried [${keys.join(", ")}]`
      );
    }
  }
}
