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
import {
  sumTransfersAttributedToAffiliate,
  type TransferFilterProbeResult,
} from "@/lib/texas/transfer-affiliate-attribution";
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

const AMOUNT_FIELD_CANDIDATES = [
  "amount",
  "value",
  "total",
  "deposit",
  "withdraw",
  "left",
  "right",
  "balance",
  "credit",
  "chargeIn",
  "chargeOut",
  "netDeposit",
  "sum",
] as const;

/**
 * Extracts the numeric amount from a transfer record by trying multiple
 * possible field names. Returns `{ amount, field }` so callers can log
 * which key was actually used.
 */
function extractRecordAmount(record: AgentTransferRecord): { amount: number; field: string | null } {
  const bag = record as Record<string, unknown>;
  for (const key of AMOUNT_FIELD_CANDIDATES) {
    const raw = bag[key];
    if (raw === undefined || raw === null || raw === "") continue;
    const n = parseAmount(raw);
    if (n > 0) return { amount: n, field: key };
  }
  return { amount: 0, field: null };
}

function resolveRecordType(record: AgentTransferRecord): string {
  const raw = record.type ?? (record as Record<string, unknown>).typeId ?? "";
  return String(raw).trim().toLowerCase();
}

function isDepositType(record: AgentTransferRecord): boolean {
  const t = resolveRecordType(record);
  return t === DEPOSIT_TYPE || t === "deposit";
}

function isWithdrawType(record: AgentTransferRecord): boolean {
  const t = resolveRecordType(record);
  return t === WITHDRAW_TYPE || t === "withdraw";
}

let _transferTypeLogged = false;
let _transferDiagnosticsLogged = false;

export function buildTransferDateFilter(
  fromDate: string,
  toDate: string
): TexasFilterMap {
  return {
    date: {
      action: "=",
      from: fromDate,
      to: toDate,
      value: toDate,
    },
  };
}

export interface FetchAgentTransfersOptions {
  pageSize?: number;
  /** Scope to a single affiliate (Master/Player). Uses client-side fromId/toId attribution. */
  affiliateId?: string;
  /** Additional filters (e.g. date range) */
  extraFilter?: TexasFilterMap;
  paginate?: boolean;
  /** Log server-side filter probe results (affiliateId vs agentId vs userId). */
  probeServerFilters?: boolean;
}

function buildScopedFilter(
  field: "affiliateId" | "agentId" | "userId",
  value: string
): TexasFilterMap {
  return {
    [field]: { action: "=", value, valueLabel: value },
  };
}

/**
 * One-time probe: which filter key Texas accepts when narrowing Transaction report.
 * Does not change totals — attribution remains authoritative.
 */
export async function probeTransferServerFilters(
  client: TexasHttpClient,
  affiliateId: string,
  pageSize = 50
): Promise<TransferFilterProbeResult[]> {
  const keys = ["affiliateId", "agentId", "userId"] as const;
  const results: TransferFilterProbeResult[] = [];

  for (const key of keys) {
    const filter: TexasFilterMap = {
      ...TRANSFER_TYPE_FILTER,
      ...buildScopedFilter(key, affiliateId),
    };
    try {
      const response = await client.post<AgentTransfersResponse>(
        "/Statistics/getAgentsTransfers",
        { start: 0, limit: pageSize, filter }
      );
      const records = coerceRecordsArray(response.data?.result?.records);
      const attributed = sumTransfersAttributedToAffiliate(records, affiliateId);
      results.push({
        key,
        recordCount: records.length,
        totalDeposit: attributed.totalDeposit,
        totalWithdraw: attributed.totalWithdraw,
        filterPayload: filter,
      });
    } catch {
      results.push({
        key,
        recordCount: 0,
        totalDeposit: 0,
        totalWithdraw: 0,
        filterPayload: { ...TRANSFER_TYPE_FILTER, ...buildScopedFilter(key, affiliateId) },
      });
    }
  }

  log.info("transfer server filter probe", {
    affiliateId,
    results: results.map((r) => ({
      key: r.key,
      records: r.recordCount,
      dep: r.totalDeposit,
      wd: r.totalWithdraw,
    })),
  });

  return results;
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
  filterProbe?: TransferFilterProbeResult[];
  attribution?: ReturnType<typeof sumTransfersAttributedToAffiliate>;
}> {
  const limit = options.pageSize ?? DEFAULT_PAGE_SIZE;
  const scopedAffiliateId = options.affiliateId?.trim() ?? "";

  if (scopedAffiliateId && options.probeServerFilters) {
    await probeTransferServerFilters(client, scopedAffiliateId, Math.min(limit, 50));
  }

  const filter: TexasFilterMap = {
    ...TRANSFER_TYPE_FILTER,
    ...options.extraFilter,
  };

  if (scopedAffiliateId) {
    log.info("fetching transfers for affiliate (type filter + client attribution)", {
      affiliateId: scopedAffiliateId,
    });
  } else {
    log.info("fetching transfers unfiltered (super_master)");
  }

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

  let totals: AgentTransfersTotals;
  let attribution: ReturnType<typeof sumTransfersAttributedToAffiliate> | undefined;

  if (scopedAffiliateId) {
    attribution = sumTransfersAttributedToAffiliate(allRecords, scopedAffiliateId);
    totals = {
      totalDeposit: attribution.totalDeposit,
      totalWithdraw: attribution.totalWithdraw,
      transactionCount:
        attribution.matchedDeposits + attribution.matchedWithdraws,
    };
    log.info("transfers attributed to affiliate", {
      affiliateId: scopedAffiliateId,
      ...attribution,
      pagesFetched,
      allRecordsFetched: allRecords.length,
    });
  } else {
    totals = sumTransferRecords(allRecords);
  }

  log.info("transfers summary", {
    totalDeposit: totals.totalDeposit,
    totalWithdraw: totals.totalWithdraw,
    transactionCount: totals.transactionCount,
    pagesFetched,
  });

  return {
    totals,
    records: allRecords,
    pagesFetched,
    attribution,
  };
}

/**
 * Sum deposit and withdraw amounts from transfer records.
 * Type "2" = Deposit → totalDeposit
 * Type "3" = Withdraw → totalWithdraw
 *
 * Tries multiple field name candidates for the amount value since the
 * Texas API may use different keys depending on account type / version.
 */
export function sumTransferRecords(
  records: AgentTransferRecord[]
): AgentTransfersTotals {
  if (!_transferDiagnosticsLogged && records.length > 0) {
    _transferDiagnosticsLogged = true;
    const sample = records.slice(0, 3);
    for (let i = 0; i < sample.length; i++) {
      const bag = sample[i] as Record<string, unknown>;
      const keys = Object.keys(bag).sort();
      const values: Record<string, unknown> = {};
      for (const k of keys) {
        const v = bag[k];
        if (v !== undefined && v !== null && v !== "") {
          values[k] = typeof v === "string" && v.length > 60 ? v.slice(0, 60) + "…" : v;
        }
      }
      log.info(`transfer record sample [${i}]`, {
        keys: keys.join(","),
        type: bag.type ?? bag.typeId ?? "unknown",
        values,
      });
    }
  }

  let totalDeposit = 0;
  let totalWithdraw = 0;
  let amountFieldUsed: string | null = null;
  let depositCount = 0;
  let withdrawCount = 0;
  let unmatchedCount = 0;

  for (const record of records) {
    const { amount, field } = extractRecordAmount(record);
    if (field && !amountFieldUsed) {
      amountFieldUsed = field;
    }

    if (isDepositType(record)) {
      totalDeposit += amount;
      depositCount += 1;
    } else if (isWithdrawType(record)) {
      totalWithdraw += amount;
      withdrawCount += 1;
    } else {
      unmatchedCount += 1;
    }
  }

  if (!_transferTypeLogged && records.length > 0) {
    _transferTypeLogged = true;
    const sampleType = records[0].type ?? (records[0] as Record<string, unknown>).typeId ?? "missing";
    log.info("transfer type classification", {
      sampleRawType: sampleType,
      resolvedAs: resolveRecordType(records[0]),
      depositCount,
      withdrawCount,
      unmatchedCount,
      totalRecords: records.length,
    });
  }

  if (amountFieldUsed) {
    log.info("amount field resolved", { field: amountFieldUsed });
  } else if (records.length > 0) {
    const firstBag = records[0] as Record<string, unknown>;
    log.warn("no amount field found in transfer records", {
      recordCount: records.length,
      sampleKeys: Object.keys(firstBag).sort().join(","),
      triedFields: AMOUNT_FIELD_CANDIDATES.join(","),
    });
  }

  log.info("sumTransferRecords result", {
    totalDeposit,
    totalWithdraw,
    transactionCount: records.length,
    amountField: amountFieldUsed,
  });

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
    log.warn("hierarchical transfers: affiliateId missing — fetching unfiltered", {
      role,
    });
    const result = await fetchAgentTransfers(client, {
      pageSize: options.pageSize,
      extraFilter: options.extraFilter,
      paginate: true,
    });
    return { ...result, scopedAffiliateIds: [] };
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
