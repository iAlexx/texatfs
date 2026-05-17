import type { AxiosInstance } from "axios";
import type {
  AgentAllWalletsResponse,
  SubAgentStatisticsResponse,
  TexasFilterMap,
  TexasPagedRequest,
  TexasSyncUserContext,
  NormalizedTexasSnapshot,
} from "@/lib/texas/types";
import {
  mapSubAgentStatistics,
  mapWalletBalance,
  mergeSnapshotParts,
} from "@/lib/texas/statistics-mapper";
import { TexasSessionService } from "@/lib/services/TexasSessionService";

const DEFAULT_PAGE_SIZE = 1000;
const DEFAULT_CURRENCY_FILTER: TexasFilterMap = {
  currency: {
    action: "=",
    value: "multi",
    valueLabel: "multi",
  },
};

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
 *
 * Statistics polling mirrors the route handler:
 * POST /Statistics/getSubAgentStatistics { start, limit, filter }
 */
export class TexasSyncService {
  constructor(
    private readonly session = new TexasSessionService(),
    private readonly pageSize = DEFAULT_PAGE_SIZE
  ) {}

  async syncUser(
    context: TexasSyncUserContext,
    options: TexasSyncOptions = {}
  ): Promise<TexasSyncResult> {
    const client = await this.session.getClient(context.credentials);
    const pageSize = options.pageSize ?? this.pageSize;

    const [wallet, statistics] = await Promise.all([
      this.fetchAgentWallet(client),
      this.fetchAllSubAgentStatistics(client, {
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

  /** GET wallet — same source as Agent/getAgentAllWallets route */
  async fetchAgentWallet(client: AxiosInstance) {
    const response = await client.post<AgentAllWalletsResponse>(
      "/Agent/getAgentAllWallets"
    );

    if (!response.data?.status || !response.data.result?.[0]) {
      throw new Error("getAgentAllWallets returned no wallet data");
    }

    return response.data.result[0];
  }

  /**
   * Paginated fetch for getSubAgentStatistics.
   * Increments `start` by `limit` until all records are retrieved.
   */
  async fetchAllSubAgentStatistics(
    client: AxiosInstance,
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
    const limit = options.pageSize ?? this.pageSize;
    const filter: TexasFilterMap = {
      ...DEFAULT_CURRENCY_FILTER,
      ...options.extraFilter,
    };

    const allRecords: SubAgentStatisticsResponse["result"]["records"] = [];
    let start = 0;
    let pagesFetched = 0;
    let totalRecords = Infinity;
    let lastResponse: SubAgentStatisticsResponse | null = null;

    while (start < totalRecords) {
      const body: TexasPagedRequest = { start, limit, filter };
      const response = await client.post<SubAgentStatisticsResponse>(
        "/Statistics/getSubAgentStatistics",
        body
      );

      pagesFetched += 1;
      lastResponse = response.data;

      if (!response.data?.status) {
        throw new Error(
          `getSubAgentStatistics failed at start=${start}: status=false`
        );
      }

      const pageRecords = response.data.result?.records ?? [];
      allRecords.push(...pageRecords);

      const totalRaw = response.data.result?.totalRecordsCount ?? "0";
      totalRecords = parseInt(totalRaw, 10);
      if (Number.isNaN(totalRecords)) totalRecords = allRecords.length;

      start += limit;

      if (!options.paginate) break;
      if (pageRecords.length === 0) break;
      if (allRecords.length >= totalRecords) break;
    }

    if (!lastResponse) {
      throw new Error("getSubAgentStatistics returned no pages");
    }

    const merged: SubAgentStatisticsResponse = {
      ...lastResponse,
      result: {
        ...lastResponse.result,
        records: allRecords,
        totalRecordsCount: String(allRecords.length),
      },
    };

    return {
      response: merged,
      pagesFetched,
      recordCount: allRecords.length,
    };
  }

  /**
   * Optional scoped filter — e.g. restrict statistics to one affiliate row.
   * Follows the same filter DSL as getPlayersStatisticsPro.
   */
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
