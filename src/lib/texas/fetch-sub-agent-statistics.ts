import type { TexasHttpClient } from "@/lib/texas/texas-http-client";
import type {
  SubAgentStatisticsResponse,
  TexasFilterMap,
  TexasPagedRequest,
} from "@/lib/texas/types";
import { createLogger } from "@/lib/observability/logger";
import { parseTexasStatisticsResponse } from "@/lib/validation/texas-response";

const log = createLogger("texas/fetch-stats");

const DEFAULT_PAGE_SIZE = 1000;

const DEFAULT_CURRENCY_FILTER: TexasFilterMap = {
  currency: {
    action: "=",
    value: "multi",
    valueLabel: "multi",
  },
};

/** Texas API sometimes returns `records` as a non-array object — avoid spread crash. */
function coerceRecordsArray(
  value: unknown
): SubAgentStatisticsResponse["result"]["records"] {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object") {
    return Object.values(value as Record<string, unknown>).filter(
      (row): row is SubAgentStatisticsResponse["result"]["records"][number] =>
        row !== null && typeof row === "object"
    );
  }
  return [];
}

/**
 * Paginated fetch for getSubAgentStatistics — no Puppeteer / session imports.
 */
export async function fetchAllSubAgentStatistics(
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
  const limit = options.pageSize ?? DEFAULT_PAGE_SIZE;
  const filter: TexasFilterMap = {
    ...DEFAULT_CURRENCY_FILTER,
    ...options.extraFilter,
  };

  log.info("fetching sub-agent statistics", {
    filter: JSON.parse(JSON.stringify(filter)),
    pageSize: limit,
    paginate: options.paginate ?? true,
  });

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

    const validated = parseTexasStatisticsResponse(response.data);
    if (!validated.ok) {
      const raw = response.data as unknown as Record<string, unknown> | null;
      log.warn("invalid Texas statistics page", {
        start,
        error: validated.error,
        responseStatus: raw?.status,
        resultType: raw?.result === null ? "null" : typeof raw?.result,
        responseKeys: raw && typeof raw === "object" ? Object.keys(raw) : [],
      });
      throw new Error(
        `getSubAgentStatistics invalid response at start=${start}: ${validated.error}`
      );
    }

    if (!validated.data.status) {
      throw new Error(
        `getSubAgentStatistics failed at start=${start}: status=false`
      );
    }

    const pageRecords = coerceRecordsArray(validated.data.result?.records);
    if (pageRecords.length) {
      allRecords.push(...pageRecords);
    }

    const totalRaw = String(validated.data.result?.totalRecordsCount ?? "0");
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

  const baseResult =
    lastResponse.result &&
    typeof lastResponse.result === "object" &&
    !Array.isArray(lastResponse.result)
      ? lastResponse.result
      : {};

  const merged: SubAgentStatisticsResponse = {
    ...lastResponse,
    result: {
      ...baseResult,
      records: allRecords,
      totalRecordsCount: String(allRecords.length),
    },
  };

  const footerTotal = merged.result?.total;
  log.info("statistics fetch complete", {
    pagesFetched,
    recordCount: allRecords.length,
    hasFooter: !!footerTotal,
    footerKeys: footerTotal ? Object.keys(footerTotal) : [],
  });

  return {
    response: merged,
    pagesFetched,
    recordCount: allRecords.length,
  };
}
