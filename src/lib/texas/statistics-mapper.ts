import {
  abortOnUserContextViolation,
  logUserScope,
} from "@/lib/security/user-context";
import {
  pickNumeric,
  pickStatsRecordMetrics,
  pickString,
  statsRecordMapping,
  statsTotalsMapping,
  walletMapping,
} from "@/lib/texas/field-resolver";
import type {
  NormalizedTexasSnapshot,
  SubAgentStatisticsRecord,
  SubAgentStatisticsResponse,
  SubAgentStatisticsTotals,
  TexasWalletRecord,
} from "@/lib/texas/types";

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
  return {
    totalDeposit: pickNumeric(bag, statsTotalsMapping.totalDeposit),
    totalWithdraw: pickNumeric(bag, statsTotalsMapping.totalWithdraw),
    ngr: pickNumeric(bag, statsTotalsMapping.ngr),
  };
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
 * Master/player rows MUST match texasAffiliateId — never sum the full network.
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

  if (role === "super_master") {
    const footer = totalsFooter(response.result?.total ?? null);
    if (footer && (footer.totalDeposit || footer.totalWithdraw || footer.ngr)) {
      return footer;
    }
    return sumRecords(records);
  }

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

  return rowToMetrics(match!);
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
