import type { TexasHttpClient } from "@/lib/texas/texas-http-client";
import { pickNumeric, pickString } from "@/lib/texas/field-resolver";
import { GENERAL_REPORT_FIELD_MAPPING } from "@/lib/texas/texas-general-report-mapping";
import { createLogger } from "@/lib/observability/logger";
import type {
  SubAgentReportResponse,
  TexasDashboardGeneral,
  TexasFilterMap,
} from "@/lib/texas/types";

const log = createLogger("texas/fetch-sub-agent-report");

function coerceRecordsArray(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) {
    return value.filter(
      (r): r is Record<string, unknown> =>
        r !== null && typeof r === "object" && !Array.isArray(r)
    );
  }
  if (value && typeof value === "object") {
    return Object.values(value as Record<string, unknown>).filter(
      (r): r is Record<string, unknown> =>
        r !== null && typeof r === "object" && !Array.isArray(r)
    );
  }
  return [];
}

/** Merge label/value rows (Texas detail cards) into one bag. */
function recordsToFieldBag(records: Record<string, unknown>[]): Record<string, unknown> {
  if (records.length === 0) return {};

  const first = records[0]!;
  const looksLikeKv =
    records.length > 1 &&
    records.every(
      (r) =>
        (r.label !== undefined || r.name !== undefined || r.title !== undefined) &&
        (r.value !== undefined || r.text !== undefined)
    );

  if (!looksLikeKv) {
    return first;
  }

  const bag: Record<string, unknown> = {};
  for (const row of records) {
    const label = String(row.label ?? row.name ?? row.title ?? "").trim();
    const value = row.value ?? row.text;
    if (label) bag[label] = value;
  }
  return bag;
}

export function mapGeneralReportBag(
  bag: Record<string, unknown>
): TexasDashboardGeneral {
  return {
    deposits: pickNumeric(bag, GENERAL_REPORT_FIELD_MAPPING.deposits),
    withdrawal: pickNumeric(bag, GENERAL_REPORT_FIELD_MAPPING.withdrawal),
    ngr: pickNumeric(bag, GENERAL_REPORT_FIELD_MAPPING.ngr),
    commission: pickNumeric(bag, GENERAL_REPORT_FIELD_MAPPING.commission),
    agentId:
      pickString(bag, GENERAL_REPORT_FIELD_MAPPING.agentId) ?? undefined,
    parentId:
      pickString(bag, GENERAL_REPORT_FIELD_MAPPING.parentId) ?? undefined,
    username:
      pickString(bag, GENERAL_REPORT_FIELD_MAPPING.username) ?? undefined,
    raw: bag,
  };
}

export function parseSubAgentReportResponse(
  response: SubAgentReportResponse | null | undefined
): TexasDashboardGeneral | null {
  if (!response?.status) return null;

  const result = response.result;
  if (!result || typeof result !== "object") return null;

  const bag = result as Record<string, unknown>;
  const records = coerceRecordsArray(bag.records ?? bag.rows ?? bag);
  const merged = records.length > 0 ? recordsToFieldBag(records) : bag;

  const mapped = mapGeneralReportBag(merged);
  const hasData =
    mapped.deposits !== 0 ||
    mapped.withdrawal !== 0 ||
    mapped.ngr !== 0 ||
    Boolean(mapped.agentId);

  return hasData ? mapped : null;
}

export interface FetchSubAgentReportOptions {
  affiliateId?: string;
  username?: string;
  extraFilter?: TexasFilterMap;
}

function buildAgentFilter(
  field: "affiliateId" | "agentId" | "userId",
  value: string
): TexasFilterMap {
  return {
    [field]: {
      action: "=",
      value,
      valueLabel: value,
    },
  };
}

/**
 * POST /Statistics/getSubAgentReport — Reports → General (cumulative panel).
 */
export async function fetchSubAgentGeneralReport(
  client: TexasHttpClient,
  options: FetchSubAgentReportOptions = {}
): Promise<TexasDashboardGeneral | null> {
  const affiliateId = options.affiliateId?.trim();
  const username = options.username?.trim();

  const filterAttempts: TexasFilterMap[] = [{ ...options.extraFilter }];

  if (affiliateId) {
    filterAttempts.unshift(
      { ...buildAgentFilter("affiliateId", affiliateId), ...options.extraFilter },
      { ...buildAgentFilter("agentId", affiliateId), ...options.extraFilter }
    );
  }

  if (username) {
    filterAttempts.push({
      userName: { action: "=", value: username, valueLabel: username },
      ...options.extraFilter,
    });
  }

  for (const filter of filterAttempts) {
    try {
      const response = await client.post<SubAgentReportResponse>(
        "/Statistics/getSubAgentReport",
        { start: 0, limit: 50, filter }
      );

      const parsed = parseSubAgentReportResponse(response.data);
      if (parsed) {
        log.info("getSubAgentReport parsed", {
          filterKeys: Object.keys(filter).join(","),
          deposits: parsed.deposits,
          withdrawal: parsed.withdrawal,
          ngr: parsed.ngr,
          agentId: parsed.agentId,
        });
        return parsed;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.warn("getSubAgentReport attempt failed", {
        filterKeys: Object.keys(filter).join(","),
        error: msg,
      });
    }
  }

  log.warn("getSubAgentReport returned no usable data", {
    affiliateId: affiliateId ?? null,
    username: username ?? null,
  });
  return null;
}
