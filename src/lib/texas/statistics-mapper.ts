import {
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

function extractNgrFromRow(row: SubAgentStatisticsRecord): number {
  return pickStatsRecordMetrics(row as Record<string, unknown>).ngr;
}

function sumNgrFromRecords(records: SubAgentStatisticsRecord[]): number {
  return records.reduce((acc, row) => acc + extractNgrFromRow(row), 0);
}

function ngrFromFooter(totals: SubAgentStatisticsTotals | null): number | null {
  if (!totals) return null;
  const bag = totals as Record<string, unknown>;
  const ngr = pickNumeric(bag, statsTotalsMapping.ngr);
  return ngr !== 0 ? ngr : null;
}

export interface MapStatisticsInput {
  response: SubAgentStatisticsResponse;
  texasAffiliateId: string | null;
  texasUsername?: string | null;
  userId?: string;
  role: "super_master" | "master" | "player";
}

/**
 * Extracts NGR from getSubAgentStatistics.
 *
 * totalDeposit and totalWithdraw are NOT extracted here — they come
 * exclusively from getAgentsTransfers (set to 0 as placeholder).
 * The caller (TexasSyncService) overrides them with transfer-based values.
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

  if (records.length > 0) {
    logFieldMappingDiagnosticsOnce(records[0] as Record<string, unknown>);
  }

  const footerNgr = ngrFromFooter(response.result?.total ?? null);
  let ngr = 0;

  if (role === "super_master") {
    ngr = footerNgr ?? sumNgrFromRecords(records);
    log.info("super_master: NGR extracted", { ngr, source: footerNgr !== null ? "footer" : "sum" });
  } else {
    const affiliateId = texasAffiliateId?.trim() ?? "";

    if (affiliateId) {
      const match = records.find((r) => {
        const bag = r as Record<string, unknown>;
        const id = pickString(bag, statsRecordMapping.affiliateId);
        return id !== null && id === affiliateId;
      });
      if (match) {
        ngr = extractNgrFromRow(match);
        log.info("NGR extracted from matched row", { affiliateId, ngr });
      } else {
        ngr = footerNgr ?? sumNgrFromRecords(records);
        log.warn("affiliateId not found — NGR from footer/sum", { affiliateId, ngr });
      }
    } else {
      ngr = footerNgr ?? sumNgrFromRecords(records);
      log.warn("texasAffiliateId missing — NGR from footer/sum", {
        userId: userId ?? null,
        ngr,
      });
    }
  }

  log.info("statistics mapper result (totalDeposit/totalWithdraw deferred to getAgentsTransfers)", {
    userId: userId ?? null,
    role,
    ngr,
    totalDeposit: 0,
    totalWithdraw: 0,
  });

  return { totalDeposit: 0, totalWithdraw: 0, ngr };
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
