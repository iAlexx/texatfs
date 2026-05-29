import type { TexasHttpClient } from "@/lib/texas/texas-http-client";
import type {
  AgentAllWalletsResponse,
  AgentTransfersTotals,
  SubAgentStatisticsRecord,
  SubAgentStatisticsResponse,
  TexasFilterMap,
  TexasSyncUserContext,
  NormalizedTexasSnapshot,
} from "@/lib/texas/types";
import { fetchAllSubAgentStatistics } from "@/lib/texas/fetch-sub-agent-statistics";
import {
  fetchAgentTransfers,
  probeTransferServerFilters,
} from "@/lib/texas/fetch-agent-transfers";
import { fetchSubAgentGeneralReport } from "@/lib/texas/fetch-sub-agent-report";
import {
  mapSubAgentStatistics,
  mapWalletBalance,
  mergeSnapshotParts,
} from "@/lib/texas/statistics-mapper";
import { pickNumeric, pickString, statsRecordMapping } from "@/lib/texas/field-resolver";
import { validateTexasSnapshotScope } from "@/lib/texas/texas-data-scope";
import { createLogger } from "@/lib/observability/logger";
import type { TexasSessionService } from "@/lib/services/TexasSessionService";

const log = createLogger("texas/sync-service");

const DEFAULT_PAGE_SIZE = 1000;

export interface TexasSyncOptions {
  pageSize?: number;
  extraFilter?: TexasFilterMap;
  /** Stop early when all records are fetched (default true) */
  paginate?: boolean;
}

/** Per-child snapshot extracted from the Master's getSubAgentStatistics response. */
export interface ChildSnapshot {
  affiliateId: string;
  username: string | null;
  snapshot: NormalizedTexasSnapshot;
}

export interface TexasSyncResult {
  userId: string;
  snapshot: NormalizedTexasSnapshot;
  pagesFetched: number;
  recordCount: number;
  /** Transfer-level totals from getAgentsTransfers (authoritative source) */
  transferTotals: AgentTransfersTotals | null;
  /** Per-child snapshots extracted from getSubAgentStatistics (master only) */
  childSnapshots: ChildSnapshot[];
}

/**
 * Polls Texas dashboard APIs and normalizes data for api_snapshots inserts.
 *
 * Data sources (fetched in parallel):
 *   1. getAgentAllWallets       → balance, currencyCode
 *   2. getSubAgentStatistics    → wallet row metadata only (NOT deposits/withdrawals)
 *   3. getAgentsTransfers       → totalDeposit, totalWithdraw (Transaction tab)
 *   4. getSubAgentReport        → dashboard NGR / General panel (reference)
 *
 * The transfers endpoint returns actual transaction records with type "2" (deposit)
 * and "3" (withdraw). Summing these gives real totalDeposit/totalWithdraw that
 * getSubAgentStatistics does NOT include in per-row records for sub-agent accounts.
 */
export class TexasSyncService {
  private sessionPromise: Promise<TexasSessionService> | null = null;

  constructor(private readonly pageSize = DEFAULT_PAGE_SIZE) {}

  private async getSession(): Promise<TexasSessionService> {
    if (!this.sessionPromise) {
      this.sessionPromise = import("@/lib/services/TexasSessionService").then(
        ({ TexasSessionService }) => new TexasSessionService()
      );
    }
    return this.sessionPromise;
  }

  async syncUser(
    context: TexasSyncUserContext,
    options: TexasSyncOptions = {}
  ): Promise<TexasSyncResult> {
    const session = await this.getSession();
    const client = await session.getClient(context.credentials);
    const pageSize = options.pageSize ?? this.pageSize;

    const affiliateId = context.texasAffiliateId?.trim() ?? "";

    const [wallet, statistics, transferFetch, generalReport] = await Promise.all([
      this.fetchAgentWallet(client),
      fetchAllSubAgentStatistics(client, {
        pageSize,
        extraFilter: options.extraFilter,
        paginate: options.paginate ?? true,
      }),
      this.fetchTransfersSafe(client, {
        pageSize,
        affiliateId: context.texasAffiliateId ?? null,
        role: context.role,
      }),
      affiliateId || context.texasUsername
        ? fetchSubAgentGeneralReport(client, {
            affiliateId: affiliateId || undefined,
            username: context.texasUsername ?? undefined,
          })
        : Promise.resolve(null),
    ]);

    const walletPart = mapWalletBalance(wallet);
    const statsPart = mapSubAgentStatistics({
      response: statistics.response,
      texasAffiliateId: context.texasAffiliateId,
      texasUsername: context.texasUsername ?? context.credentials.username,
      userId: context.userId,
      role: context.role,
    });

    const snapshot = mergeSnapshotParts(
      walletPart,
      statsPart,
      statistics.response.result as unknown as Record<string, unknown>
    );

    const transfers = transferFetch?.totals ?? null;

    if (generalReport) {
      snapshot.dashboardGeneral = generalReport;
      snapshot.ngr = generalReport.ngr;
    }

    if (transfers) {
      snapshot.totalDeposit = transfers.totalDeposit;
      snapshot.totalWithdraw = transfers.totalWithdraw;
      snapshot.transactionTotals = transfers;
      log.info("totalDeposit/totalWithdraw from getAgentsTransfers (Transaction)", {
        userId: context.userId,
        totalDeposit: transfers.totalDeposit,
        totalWithdraw: transfers.totalWithdraw,
        transactionCount: transfers.transactionCount,
      });
    } else {
      log.warn("deposit/withdraw unavailable from Transaction tab", {
        userId: context.userId,
        generalDeposits: generalReport?.deposits,
        generalWithdrawal: generalReport?.withdrawal,
      });
    }

    snapshot.rawStatistics = {
      ...snapshot.rawStatistics,
      dashboardGeneral: generalReport ?? undefined,
      transactionTotals: transfers ?? undefined,
      transferFilterProbe: transferFetch?.filterProbe ?? undefined,
      transferAttribution: transferFetch?.attribution ?? undefined,
    };

    if (generalReport) {
      log.info("dashboard NGR from getSubAgentReport (General)", {
        userId: context.userId,
        ngr: generalReport.ngr,
        deposits: generalReport.deposits,
        withdrawal: generalReport.withdrawal,
        agentId: generalReport.agentId,
      });
    }

    log.info("final snapshot", {
      userId: context.userId,
      totalDeposit: snapshot.totalDeposit,
      totalWithdraw: snapshot.totalWithdraw,
      ngr: snapshot.ngr,
      balance: snapshot.balance,
      source: transfers
        ? "getAgentsTransfers"
        : generalReport
          ? "getSubAgentReport-only"
          : "unavailable",
    });

    validateTexasSnapshotScope(snapshot, {
      userId: context.userId,
      texasUsername: context.texasUsername ?? context.credentials.username,
      texasAffiliateId: context.texasAffiliateId,
      role: context.role,
    });

    const rawChildSnapshots = this.extractChildSnapshots(
      statistics.response,
      context,
      client
    );
    const childSnapshots = await this.enrichChildSnapshotsWithTransfers(
      client,
      rawChildSnapshots
    );

    if (childSnapshots.length > 0) {
      log.info("extracted child snapshots from statistics", {
        masterUserId: context.userId,
        childCount: childSnapshots.length,
        affiliateIds: childSnapshots.map((c) => c.affiliateId),
      });
    }

    return {
      userId: context.userId,
      snapshot,
      pagesFetched: statistics.pagesFetched,
      recordCount: statistics.recordCount,
      transferTotals: transfers,
      childSnapshots,
    };
  }

  /**
   * Fetches transfer totals for this user's own affiliate (matches Texas General report).
   * Does NOT aggregate the master's entire subtree — children have their own user rows.
   */
  private async fetchTransfersSafe(
    client: TexasHttpClient,
    options: {
      pageSize: number;
      affiliateId: string | null;
      role: TexasSyncUserContext["role"];
    }
  ): Promise<{
    totals: AgentTransfersTotals;
    filterProbe?: Awaited<ReturnType<typeof probeTransferServerFilters>>;
    attribution?: Awaited<
      ReturnType<typeof import("@/lib/texas/fetch-agent-transfers").fetchAgentTransfers>
    >["attribution"];
  } | null> {
    try {
      if (options.role === "super_master") {
        const result = await fetchAgentTransfers(client, {
          pageSize: options.pageSize,
          paginate: true,
        });
        return { totals: result.totals, attribution: result.attribution };
      }

      if (!options.affiliateId?.trim()) {
        log.warn("getAgentsTransfers skipped — texas_affiliate_id missing", {
          role: options.role,
        });
        return null;
      }

      const affiliateId = options.affiliateId.trim();
      const filterProbe = await probeTransferServerFilters(
        client,
        affiliateId,
        Math.min(options.pageSize, 50)
      );

      const result = await fetchAgentTransfers(client, {
        pageSize: options.pageSize,
        affiliateId,
        paginate: true,
      });

      log.info("getAgentsTransfers scoped via client attribution", {
        affiliateId,
        role: options.role,
        totalDeposit: result.totals.totalDeposit,
        totalWithdraw: result.totals.totalWithdraw,
        transactionCount: result.totals.transactionCount,
        matchedDeposits: result.attribution?.matchedDeposits,
        matchedWithdraws: result.attribution?.matchedWithdraws,
      });

      return {
        totals: result.totals,
        filterProbe,
        attribution: result.attribution,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.warn("getAgentsTransfers failed, using statistics fallback totals", {
        error: message,
        affiliateId: options.affiliateId,
        role: options.role,
      });
      return null;
    }
  }

  /**
   * Extracts per-child snapshots from the Master's getSubAgentStatistics response.
   * Each child row becomes a minimal NormalizedTexasSnapshot with whatever
   * financial data the API provides (currentWallet, ngr, etc.).
   */
  private extractChildSnapshots(
    response: SubAgentStatisticsResponse,
    context: TexasSyncUserContext,
    _client: TexasHttpClient
  ): ChildSnapshot[] {
    if (context.role !== "master" && context.role !== "super_master") return [];

    const records = response.result?.records ?? [];
    const masterAffiliateId = context.texasAffiliateId?.trim() ?? "";

    if (!masterAffiliateId) {
      log.warn("extractChildSnapshots: masterAffiliateId missing — extracting all rows as children", {
        userId: context.userId,
        recordCount: records.length,
      });
    }

    const children: ChildSnapshot[] = [];

    for (const record of records) {
      const bag = record as Record<string, unknown>;
      const childAffiliateId = pickString(bag, statsRecordMapping.affiliateId);
      if (!childAffiliateId) continue;
      if (masterAffiliateId && childAffiliateId === masterAffiliateId) continue;

      const childUsername =
        pickString(bag, ["userName", "username", "affiliateUsername", "email"]) ?? null;
      const currentWallet = pickNumeric(bag, ["currentWallet", "balance", "availableWallet"]);
      const ngr = 0;

      children.push({
        affiliateId: childAffiliateId,
        username: childUsername,
        snapshot: {
          balance: currentWallet,
          currencyCode: "NSP",
          totalDeposit: 0,
          totalWithdraw: 0,
          ngr,
          rawWallets: {},
          rawStatistics: bag,
        },
      });
    }

    return children;
  }

  /** Overlays per-child transfer totals from getAgentsTransfers (Transaction tab). */
  private async enrichChildSnapshotsWithTransfers(
    client: TexasHttpClient,
    children: ChildSnapshot[]
  ): Promise<ChildSnapshot[]> {
    if (!children.length) return children;

    return Promise.all(
      children.map(async (child) => {
        const [transfers, generalReport] = await Promise.all([
          this.fetchChildTransfersSafe(client, child.affiliateId),
          fetchSubAgentGeneralReport(client, {
            affiliateId: child.affiliateId,
            username: child.username ?? undefined,
          }),
        ]);

        let snapshot = { ...child.snapshot };
        if (transfers) {
          snapshot = {
            ...snapshot,
            totalDeposit: transfers.totalDeposit,
            totalWithdraw: transfers.totalWithdraw,
            transactionTotals: transfers,
          };
        }
        if (generalReport) {
          snapshot = {
            ...snapshot,
            ngr: generalReport.ngr,
            dashboardGeneral: generalReport,
            rawStatistics: {
              ...snapshot.rawStatistics,
              dashboardGeneral: generalReport,
            },
          };
        }

        return { ...child, snapshot };
      })
    );
  }

  /**
   * Fetches per-child transfer totals for a single affiliate using the Master's session.
   * Returns null on failure so the sync can continue with statistics-based values.
   */
  async fetchChildTransfersSafe(
    client: TexasHttpClient,
    affiliateId: string,
    pageSize = DEFAULT_PAGE_SIZE
  ): Promise<AgentTransfersTotals | null> {
    try {
      const result = await fetchAgentTransfers(client, {
        affiliateId,
        pageSize,
        paginate: true,
      });
      console.info("[texas:transfers:child]", {
        affiliateId,
        depositTotal: result.totals.totalDeposit,
        withdrawTotal: result.totals.totalWithdraw,
        recordsFetched: result.records.length,
        transactionCount: result.totals.transactionCount,
      });
      return result.totals;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.warn("child transfer fetch failed", {
        affiliateId,
        error: message,
      });
      return null;
    }
  }

  async fetchAgentWallet(client: TexasHttpClient) {
    const response = await client.post<AgentAllWalletsResponse>(
      "/Agent/getAgentAllWallets"
    );

    if (!response.data?.status || !response.data.result?.[0]) {
      throw new Error("getAgentAllWallets returned no wallet data");
    }

    return response.data.result[0];
  }

  async fetchAllSubAgentStatistics(
    client: TexasHttpClient,
    options: {
      pageSize?: number;
      extraFilter?: TexasFilterMap;
      paginate?: boolean;
    } = {}
  ): Promise<{
    response: SubAgentStatisticsResponse;
    pagesFetched: number;
    recordCount: number;
  }> {
    return fetchAllSubAgentStatistics(client, {
      pageSize: options.pageSize ?? this.pageSize,
      extraFilter: options.extraFilter,
      paginate: options.paginate,
    });
  }

  buildAffiliateFilter(
    affiliateId: string,
    field = "affiliateId"
  ): TexasFilterMap {
    return {
      [field]: {
        action: "=",
        value: affiliateId,
        valueLabel: affiliateId,
      },
    };
  }
}
