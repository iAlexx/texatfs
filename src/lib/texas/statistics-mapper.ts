import {
  abortOnUserContextViolation,
  logUserScope,
} from "@/lib/security/user-context";
import {
  logFieldMappingDiagnosticsOnce,
  pickNumeric,
  pickStatsRecordMetrics,
  pickString,
  statsRecordMapping,
  statsTotalsMapping,
  walletMapping,
} from "@/lib/texas/field-resolver";
import { createLogger } from "@/lib/observability/logger";
import type {
  NormalizedTexasSnapshot,
  SubAgentStatisticsRecord,
  SubAgentStatisticsResponse,
  SubAgentStatisticsTotals,
  TexasWalletRecord,
} from "@/lib/texas/types";

const log = createLogger("texas/statistics-mapper");

function rowToMetrics(row: SubAgentStatisticsRecord) {
  return pickStatsRecordMetrics(row as Record<string, unknown>);
}

function sumRecords(records: SubAgentStatisticsRecord[]) {
  return records.reduce(
    (acc, row) => {
      const m = rowToMetrics(row);
      acc.totalDeposit += m.totalDeposit;
      acc.totalWithdraw += m.totalWithdraw;
      acc.ngr += m.ngr;
      return acc;
    },
    { totalDeposit: 0, totalWithdraw: 0, ngr: 0 }
  );
}

function totalsFooter(totals: SubAgentStatisticsTotals | null) {
  if (!totals) return null;
  const bag = totals as Record<string, unknown>;
  const result = {
    totalDeposit: pickNumeric(bag, statsTotalsMapping.totalDeposit),
    totalWithdraw: pickNumeric(bag, statsTotalsMapping.totalWithdraw),
    ngr: pickNumeric(bag, statsTotalsMapping.ngr),
  };
  if (result.totalDeposit === 0 && result.totalWithdraw === 0 && result.ngr === 0) {
    return null;
  }
  return result;
}

export interface MapStatisticsInput {
  response: SubAgentStatisticsResponse;
  texasAffiliateId: string | null;
  texasUsername?: string | null;
  userId?: string;
  role: "super_master" | "master" | "player";
}

/**
 * Maps Texas statistics to a single tenant scope.
 *
 * Data flow:
 *   1. For super_master: use result.total footer if available, else sum all rows
 *   2. For master/player: find the row matching texasAffiliateId and extract
 *      totalDeposit/totalWithdraw/ngr from that single row only
 *
 * Financial field resolution:
 *   - Standard keys (totalDeposit, totalWithdraw, ngr) are always tried first
 *   - Tree-grid keys (left, right, bonus) are only used when standard keys
 *     are completely absent from the row (see isSubAgentStatisticsRow)
 */
export function mapSubAgentStatistics({
  response,
  texasAffiliateId,
  texasUsername,
  userId,
  role,
}: MapStatisticsInput): Pick<
  NormalizedTexasSnapshot,
  "totalDeposit" | "totalWithdraw" | "ngr"
> {
  const records = response.result?.records ?? [];

  logUserScope(
    {
      resolvedUserId: userId ?? "unknown",
      texasUsername: texasUsername ?? null,
      texasAffiliateId: texasAffiliateId ?? null,
    },
    "mapSubAgentStatistics"
  );

  // Log field mapping diagnostics for the first real row (once per process)
  if (records.length > 0) {
    logFieldMappingDiagnosticsOnce(records[0] as Record<string, unknown>);
  }

  if (role === "super_master") {
    const footer = totalsFooter(response.result?.total ?? null);
    if (footer) {
      log.info("super_master: using result.total footer", {
        totalDeposit: footer.totalDeposit,
        totalWithdraw: footer.totalWithdraw,
        ngr: footer.ngr,
      });
      return footer;
    }
    log.info("super_master: no footer, summing records", {
      recordCount: records.length,
    });
    return sumRecords(records);
  }

  // master / player — strict affiliate scoping
  const affiliateId = texasAffiliateId?.trim() ?? "";
  abortOnUserContextViolation(
    !affiliateId,
    "Texas statistics mapping rejected: missing texasAffiliateId",
    { userId: userId ?? null, role, recordCount: records.length }
  );

  const match = records.find((r) => {
    const bag = r as Record<string, unknown>;
    const id = pickString(bag, statsRecordMapping.affiliateId);
    return id !== null && id === affiliateId;
  });

  abortOnUserContextViolation(
    !match,
    "Texas statistics mapping rejected: affiliateId not in response",
    { userId: userId ?? null, texasAffiliateId: affiliateId, recordCount: records.length }
  );

  const metrics = rowToMetrics(match!);
  log.info("master/player: matched affiliate row", {
    affiliateId,
    totalDeposit: metrics.totalDeposit,
    totalWithdraw: metrics.totalWithdraw,
    ngr: metrics.ngr,
  });

  return metrics;
}

export function mapWalletBalance(wallet: TexasWalletRecord): Pick<
  NormalizedTexasSnapshot,
  "balance" | "currencyCode" | "rawWallets"
> {
  const safeWallet =
    wallet && typeof wallet === "object" && !Array.isArray(wallet)
      ? wallet
      : ({} as TexasWalletRecord);
  const bag = { ...safeWallet } as Record<string, unknown>;
  const balance = pickNumeric(bag, walletMapping.balance);
  const currency =
    pickString(bag, walletMapping.currencyCode) ?? "NSP";

  return {
    balance,
    currencyCode: currency,
    rawWallets: bag,
  };
}

export function mergeSnapshotParts(
  wallet: ReturnType<typeof mapWalletBalance>,
  stats: Pick<NormalizedTexasSnapshot, "totalDeposit" | "totalWithdraw" | "ngr">,
  rawStatistics: Record<string, unknown>
): NormalizedTexasSnapshot {
  return {
    ...wallet,
    ...stats,
    rawStatistics,
  };
}
