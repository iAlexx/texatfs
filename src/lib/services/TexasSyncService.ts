import type { TexasHttpClient } from "@/lib/texas/texas-http-client";
import type {
  AgentAllWalletsResponse,
  SubAgentStatisticsResponse,
  TexasFilterMap,
  TexasSyncUserContext,
  NormalizedTexasSnapshot,
} from "@/lib/texas/types";
import { fetchAllSubAgentStatistics } from "@/lib/texas/fetch-sub-agent-statistics";
import {
  mapSubAgentStatistics,
  mapWalletBalance,
  mergeSnapshotParts,
} from "@/lib/texas/statistics-mapper";
import type { TexasSessionService } from "@/lib/services/TexasSessionService";

const DEFAULT_PAGE_SIZE = 1000;

export interface TexasSyncOptions {
  pageSize?: number;
  extraFilter?: TexasFilterMap;
  /** Stop early when all records are fetched (default true) */
  paginate?: boolean;
}

export interface TexasSyncResult {
  userId: string;
  snapshot: NormalizedTexasSnapshot;
  pagesFetched: number;
  recordCount: number;
}

/**
 * Polls Texas dashboard APIs and normalizes data for api_snapshots inserts.
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

    const [wallet, statistics] = await Promise.all([
      this.fetchAgentWallet(client),
      fetchAllSubAgentStatistics(client, {
        pageSize,
        extraFilter: options.extraFilter,
        paginate: options.paginate ?? true,
      }),
    ]);

    const walletPart = mapWalletBalance(wallet);
    const statsPart = mapSubAgentStatistics({
      response: statistics.response,
      texasAffiliateId: context.texasAffiliateId,
      role: context.role,
    });

    const snapshot = mergeSnapshotParts(
      walletPart,
      statsPart,
      statistics.response.result as unknown as Record<string, unknown>
    );

    return {
      userId: context.userId,
      snapshot,
      pagesFetched: statistics.pagesFetched,
      recordCount: statistics.recordCount,
    };
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
