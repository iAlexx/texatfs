import type { AxiosInstance } from "axios";
import type {
  TexasChildRecord,
  TexasChildrenResponse,
  TexasPagedRequest,
} from "@/lib/texas/types";

const DEFAULT_PAGE_SIZE = 100;

function coerceRecordsArray(value: unknown): TexasChildRecord[] {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object") {
    return Object.values(value as Record<string, unknown>).filter(
      (row): row is TexasChildRecord => row !== null && typeof row === "object"
    );
  }
  return [];
}

/**
 * Paginated fetch for POST /Agent/getChildren (direct sub-agents in Texas dashboard).
 */
export async function fetchAllTexasChildren(
  client: AxiosInstance,
  options: { pageSize?: number } = {}
): Promise<{
  records: TexasChildRecord[];
  pagesFetched: number;
}> {
  const limit = options.pageSize ?? DEFAULT_PAGE_SIZE;
  const allRecords: TexasChildRecord[] = [];
  let start = 0;
  let pagesFetched = 0;
  let totalRecords = Infinity;

  while (start < totalRecords) {
    const body: TexasPagedRequest = {
      start,
      limit,
      filter: {
        self: {
          action: "=",
          value: true,
          valueLabel: true,
        },
      },
      isNextPage: false,
      searchBy: {
        agentChildrenList: "",
      },
    };

    const response = await client.post<TexasChildrenResponse>(
      "/Agent/getChildren",
      body
    );
    pagesFetched += 1;

    if (!response.data?.status) {
      throw new Error(
        `getChildren failed at start=${start}: status=false`
      );
    }

    const pageRecords = coerceRecordsArray(response.data.result?.records);
    if (pageRecords.length) {
      allRecords.push(...pageRecords);
    }

    const totalRaw = response.data.result?.totalRecordsCount ?? "0";
    totalRecords = parseInt(totalRaw, 10);
    if (Number.isNaN(totalRecords)) totalRecords = allRecords.length;

    start += limit;
    if (pageRecords.length === 0) break;
    if (allRecords.length >= totalRecords) break;
  }

  return { records: allRecords, pagesFetched };
}
