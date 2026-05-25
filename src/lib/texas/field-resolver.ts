import { TEXAS_FIELD_MAPPING } from "@/lib/texas/texas-mapping.config";
import { createLogger } from "@/lib/observability/logger";

const log = createLogger("texas/field-resolver");

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

/**
 * Detect whether a row only has tree-grid columns (left/right) and lacks
 * standard financial columns (totalDeposit/totalWithdraw/ngr).
 *
 * The subAgentRecord mapping is ONLY used when this returns true — meaning
 * the row has tree-grid layout keys but none of the standard financial keys.
 * When both exist, standard financial keys always take priority via the
 * `record` mapping.
 */
export function isSubAgentStatisticsRow(row: Record<string, unknown>): boolean {
  const hasStandardFinancials =
    row.totalDeposit !== undefined ||
    row.depositsTotal !== undefined ||
    row.depositTotal !== undefined ||
    row.totalWithdraw !== undefined ||
    row.withdrawTotal !== undefined ||
    row.withdrawalsTotal !== undefined ||
    row.ngr !== undefined ||
    row.NGR !== undefined ||
    row.netGamingRevenue !== undefined;

  if (hasStandardFinancials) return false;

  const hasTreeColumns =
    row.left !== undefined ||
    row.right !== undefined ||
    row.creditLine !== undefined;

  return hasTreeColumns;
}

export function pickStatsRecordMetrics(row: Record<string, unknown>): {
  totalDeposit: number;
  totalWithdraw: number;
  ngr: number;
} {
  const isTreeGrid = isSubAgentStatisticsRow(row);
  const mapping = isTreeGrid ? subAgentStatsRecordMapping : statsRecordMapping;

  const result = {
    totalDeposit: pickNumeric(row, mapping.totalDeposit),
    totalWithdraw: pickNumeric(row, mapping.totalWithdraw),
    ngr: pickNumeric(row, mapping.ngr),
  };

  if (isTreeGrid && (result.totalDeposit !== 0 || result.totalWithdraw !== 0)) {
    log.warn("using tree-grid fallback fields (left/right) for financial data", {
      totalDeposit: result.totalDeposit,
      totalWithdraw: result.totalWithdraw,
      ngr: result.ngr,
      rowKeys: Object.keys(row).sort().join(","),
    });
  }

  return result;
}

/** Run once per process — don't spam logs with per-row diagnostics. */
let _statsFieldsLogged = false;

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
  log.info("stats row diagnostics", {
    type: subAgent ? "sub-agent-tree-grid" : "standard",
    keys: allKeys.join(","),
  });

  const checks: { name: string; keys: readonly string[] }[] = [
    { name: "affiliateId", keys: mapping.affiliateId },
    { name: "tebat (totalDeposit)", keys: mapping.totalDeposit },
    { name: "suhoubat (totalWithdraw)", keys: mapping.totalWithdraw },
    { name: "ngr", keys: mapping.ngr },
    { name: "balance / currentWallet", keys: walletMapping.balance },
  ];

  for (const { name, keys } of checks) {
    const found = keys.find((k) => statsRow[k] !== undefined);
    if (found) {
      log.info(`field resolved: ${name}`, {
        key: found,
        value: String(statsRow[found]),
      });
    } else {
      log.warn(`field NOT resolved: ${name}`, {
        tried: keys.join(", "),
      });
    }
  }
}
