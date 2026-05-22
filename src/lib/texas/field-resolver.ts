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
export const statsTotalsMapping = TEXAS_FIELD_MAPPING.statistics.totalsFooter;

/** Run once per process — don't spam logs with per-row diagnostics. */
let _statsFieldsLogged = false;

/**
 * Validate that all configured field-name candidates exist in the first real
 * stats record and log which key each field resolved to (or warn if none found).
 * Runs exactly once per process lifecycle.
 */
export function logFieldMappingDiagnosticsOnce(
  statsRow: Record<string, unknown>
): void {
  if (_statsFieldsLogged) return;
  _statsFieldsLogged = true;

  const checks: { name: string; keys: readonly string[] }[] = [
    { name: "tebat (totalDeposit)",       keys: statsRecordMapping.totalDeposit  },
    { name: "suhoubat (totalWithdraw)",   keys: statsRecordMapping.totalWithdraw },
    { name: "al_harq (ngr)",             keys: statsRecordMapping.ngr           },
    { name: "affiliateId",               keys: statsRecordMapping.affiliateId   },
  ];

  for (const { name, keys } of checks) {
    const found = keys.find((k) => statsRow[k] !== undefined);
    if (found) {
      console.info(`[field-resolver] "${name}" → key="${found}" value=${JSON.stringify(statsRow[found])}`);
    } else {
      const available = Object.keys(statsRow).slice(0, 20);
      console.warn(
        `[field-resolver] "${name}" NOT FOUND — tried [${keys.join(", ")}]. ` +
          `Row keys: [${available.join(", ")}]`
      );
    }
  }
}
