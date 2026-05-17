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
