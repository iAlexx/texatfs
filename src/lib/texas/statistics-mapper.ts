import { logUserScope } from "@/lib/security/user-context";
import { logFieldMappingDiagnosticsOnce } from "@/lib/texas/field-resolver";
import { createLogger } from "@/lib/observability/logger";
import type {
  NormalizedTexasSnapshot,
  SubAgentStatisticsResponse,
  TexasWalletRecord,
} from "@/lib/texas/types";
import { pickNumeric, pickString, walletMapping } from "@/lib/texas/field-resolver";

const log = createLogger("texas/statistics-mapper");

export interface MapStatisticsInput {
  response: SubAgentStatisticsResponse;
  texasAffiliateId: string | null;
  texasUsername?: string | null;
  userId?: string;
  role: "super_master" | "master" | "player";
}

/**
 * getSubAgentStatistics — identity / wallet metadata only.
 *
 * Financial totals MUST NOT come from this endpoint (tree-grid columns).
 *   - Deposits / Withdrawals → getAgentsTransfers (Transaction tab)
 *   - NGR → getSubAgentReport (General tab)
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

  log.info("statistics mapper: placeholders only (Transaction + General APIs own totals)", {
    userId: userId ?? null,
    role,
    recordCount: records.length,
  });

  return { totalDeposit: 0, totalWithdraw: 0, ngr: 0 };
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
