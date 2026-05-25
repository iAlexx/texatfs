import type { TexasHttpClient } from "@/lib/texas/texas-http-client";
import type {
  AgentTransferRecord,
  AgentTransfersResponse,
  AgentTransfersTotals,
  TexasFilterMap,
  TexasPagedRequest,
  TexasSyncUserContext,
} from "@/lib/texas/types";
import { fetchAllTexasChildren } from "@/lib/texas/fetch-texas-children";
import { createLogger } from "@/lib/observability/logger";

const log = createLogger("texas/fetch-transfers");

const DEFAULT_PAGE_SIZE = 1000;

/** Texas type IDs: "2" = Deposit, "3" = Withdraw */
const DEPOSIT_TYPE = "2";
const WITHDRAW_TYPE = "3";

const TRANSFER_TYPE_FILTER: TexasFilterMap = {
  type: {
    action: "in",
    value: [DEPOSIT_TYPE, WITHDRAW_TYPE],
    valueLabel: "Deposit,Withdraw",
    staticDataKey: "type",
  },
};

function coerceRecordsArray(value: unknown): AgentTransferRecord[] {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object") {
    return Object.values(value as Record<string, unknown>).filter(
      (row): row is AgentTransferRecord =>
        row !== null && typeof row === "object"
    );
  }
  return [];
}

function parseAmount(raw: unknown): number {
  if (raw === undefined || raw === null || raw === "") return 0;
  const n = Number(String(raw).replace(/,/g, ""));
  return Number.isNaN(n) ? 0 : Math.abs(n);
}

function isDepositType(record: AgentTransferRecord): boolean {
  return String(record.type) === DEPOSIT_TYPE;
}

function isWithdrawType(record: AgentTransferRecord): boolean {
  return String(record.type) === WITHDRAW_TYPE;
}

export interface FetchAgentTransfersOptions {
  pageSize?: number;
  /** Scope to a single affiliate (Master/Player). Omit for Super Master. */
  affiliateId?: string;
  /** Additional filters (e.g. date range) */
  extraFilter?: TexasFilterMap;
  paginate?: boolean;
}

/**
 * Fetches deposit/withdraw transfer records from POST /Statistics/getAgentsTransfers
 * and sums them to produce totalDeposit and totalWithdraw.
 *
 * This endpoint returns the actual transaction-level data that getSubAgentStatistics
 * does not include in per-row records for master/sub-agent accounts.
 */
export async function fetchAgentTransfers(
  client: TexasHttpClient,
  options: FetchAgentTransfersOptions = {}
): Promise<{
  totals: AgentTransfersTotals;
  records: AgentTransferRecord[];
  pagesFetched: number;
}> {
  const limit = options.pageSize ?? DEFAULT_PAGE_SIZE;

  const affiliateFilter: TexasFilterMap = options.affiliateId
    ? { affiliateId: { action: "=", value: options.affiliateId } }
    : {};

  if (options.affiliateId) {
    log.info("filtering transfers by affiliateId", {
      affiliateId: options.affiliateId,
    });
  } else {
    log.info("fetching transfers unfiltered (super_master)");
  }

  const filter: TexasFilterMap = {
    ...TRANSFER_TYPE_FILTER,
    ...affiliateFilter,
    ...options.extraFilter,
  };

  const allRecords: AgentTransferRecord[] = [];
  let start = 0;
  let pagesFetched = 0;
  let totalRecords = Infinity;

  while (start < totalRecords) {
    const body: TexasPagedRequest = { start, limit, filter };

    const response = await client.post<AgentTransfersResponse>(
      "/Statistics/getAgentsTransfers",
      body
    );

    pagesFetched += 1;

    if (!response.data?.status) {
      throw new Error(
        `getAgentsTransfers failed at start=${start}: status=${response.data?.status}`
      );
    }

    const pageRecords = coerceRecordsArray(response.data?.result?.records);
    if (pageRecords.length) {
      allRecords.push(...pageRecords);
    }

    const totalRaw = String(
      response.data?.result?.totalRecordsCount ?? "0"
    );
    totalRecords = parseInt(totalRaw, 10);
    if (Number.isNaN(totalRecords)) totalRecords = allRecords.length;

    log.info("transfers page fetched", {
      page: pagesFetched,
      pageRecords: pageRecords.length,
      totalSoFar: allRecords.length,
      totalExpected: totalRecords,
    });

    start += limit;

    if (options.paginate === false) break;
    if (pageRecords.length === 0) break;
    if (allRecords.length >= totalRecords) break;
  }

  const totals = sumTransferRecords(allRecords);

  log.info("transfers summary", {
    totalDeposit: totals.totalDeposit,
    totalWithdraw: totals.totalWithdraw,
    transactionCount: totals.transactionCount,
    pagesFetched,
  });

  return { totals, records: allRecords, pagesFetched };
}

/**
 * Sum deposit and withdraw amounts from transfer records.
 * Type "2" = Deposit → totalDeposit
 * Type "3" = Withdraw → totalWithdraw
 */
export function sumTransferRecords(
  records: AgentTransferRecord[]
): AgentTransfersTotals {
  let totalDeposit = 0;
  let totalWithdraw = 0;

  for (const record of records) {
    const amount = parseAmount(record.amount);
    if (isDepositType(record)) {
      totalDeposit += amount;
    } else if (isWithdrawType(record)) {
      totalWithdraw += amount;
    }
  }

  return {
    totalDeposit,
    totalWithdraw,
    transactionCount: records.length,
  };
}

// ── Hierarchical transfer scoping ───────────────────────────────────────────

export interface HierarchicalTransfersOptions {
  pageSize?: number;
  extraFilter?: TexasFilterMap;
}

/**
 * Fetches transfers scoped to the user's hierarchy:
 *
 *  - super_master → unfiltered (sees entire network)
 *  - master       → own affiliateId + all direct children affiliateIds (via getChildren)
 *  - player       → own affiliateId only
 *
 * Uses a single `affiliateId: { action: "in", value: [...] }` filter when
 * multiple IDs are needed, so only one paginated pass over getAgentsTransfers
 * is required.
 */
export async function fetchHierarchicalTransfers(
  client: TexasHttpClient,
  context: {
    affiliateId: string | null;
    role: TexasSyncUserContext["role"];
  },
  options: HierarchicalTransfersOptions = {}
): Promise<{
  totals: AgentTransfersTotals;
  records: AgentTransferRecord[];
  pagesFetched: number;
  scopedAffiliateIds: string[];
}> {
  const { role, affiliateId } = context;

  if (role === "super_master") {
    log.info("hierarchical transfers: super_master — unfiltered");
    const result = await fetchAgentTransfers(client, {
      pageSize: options.pageSize,
      extraFilter: options.extraFilter,
      paginate: true,
    });
    return { ...result, scopedAffiliateIds: [] };
  }

  if (!affiliateId) {
    throw new Error(
      "fetchHierarchicalTransfers: affiliateId is required for non-super_master roles"
    );
  }

  if (role === "player") {
    log.info("hierarchical transfers: player — single affiliateId", {
      affiliateId,
    });
    const result = await fetchAgentTransfers(client, {
      pageSize: options.pageSize,
      affiliateId,
      extraFilter: options.extraFilter,
      paginate: true,
    });
    return { ...result, scopedAffiliateIds: [affiliateId] };
  }

  // role === "master": fetch own + children
  const { records: children } = await fetchAllTexasChildren(client);
  const childIds = children
    .map((c) => c.affiliateId)
    .filter((id): id is string => !!id);

  const allIds = [affiliateId, ...childIds];
  const uniqueIds = [...new Set(allIds)];

  log.info("hierarchical transfers: master — scoped to subtree", {
    affiliateId,
    childrenCount: childIds.length,
    totalScopedIds: uniqueIds.length,
  });

  const affiliateFilter: TexasFilterMap =
    uniqueIds.length === 1
      ? { affiliateId: { action: "=", value: uniqueIds[0] } }
      : {
          affiliateId: {
            action: "in",
            value: uniqueIds,
            valueLabel: uniqueIds.join(","),
          },
        };

  const result = await fetchAgentTransfers(client, {
    pageSize: options.pageSize,
    extraFilter: { ...affiliateFilter, ...options.extraFilter },
    paginate: true,
  });

  log.info("hierarchical transfers summary", {
    role,
    affiliateId,
    scopedIds: uniqueIds.length,
    totalDeposit: result.totals.totalDeposit,
    totalWithdraw: result.totals.totalWithdraw,
    transactionCount: result.totals.transactionCount,
  });

  return { ...result, scopedAffiliateIds: uniqueIds };
}
