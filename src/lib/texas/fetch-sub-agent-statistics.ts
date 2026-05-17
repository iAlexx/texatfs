import type { AxiosInstance } from "axios";
import type {
  SubAgentStatisticsResponse,
  TexasFilterMap,
  TexasPagedRequest,
} from "@/lib/texas/types";

const DEFAULT_PAGE_SIZE = 1000;
const DEFAULT_CURRENCY_FILTER: TexasFilterMap = {
  currency: {
    action: "=",
    value: "multi",
    valueLabel: "multi",
  },
};

/**
 * Paginated fetch for getSubAgentStatistics — no Puppeteer / session imports.
 */
export async function fetchAllSubAgentStatistics(
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
  const limit = options.pageSize ?? DEFAULT_PAGE_SIZE;
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
