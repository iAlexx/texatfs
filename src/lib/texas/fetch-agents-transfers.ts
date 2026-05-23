/**
 * Fetches agent-to-agent transfers via POST /Statistics/getAgentsTransfers.
 *
 * Transfer types (from Texas API reference):
 *   type "2" = Deposit TO agent   → agent received money from master = wasel_eleih
 *   type "3" = Withdraw FROM agent → agent sent money to master      = wasel_menho
 */
import type { TexasHttpClient } from "@/lib/texas/texas-http-client";
import type { TexasFilterMap } from "@/lib/texas/types";

export interface TransferRecord {
  /** Agent ID this transfer belongs to */
  affiliateId?: string;
  agentId?: string;
  id?: string;
  amount?: string | number;
  value?: string | number;
  /** "2" = deposit_to_agent | "3" = withdraw_from_agent */
  type?: string | number;
  transferType?: string | number;
  date?: string;
  createdAt?: string;
  created_at?: string;
  [key: string]: unknown;
}

export interface TransferSummaryPerAgent {
  /** wasel_eleih — money master deposited TO this agent (type 2) */
  depositsToAgent: number;
  /** wasel_menho — money master withdrew FROM this agent (type 3) */
  withdrawsFromAgent: number;
}

/** Returns zero summary for agents not found in transfers. */
const ZERO_SUMMARY: TransferSummaryPerAgent = {
  depositsToAgent: 0,
  withdrawsFromAgent: 0,
};

function coerceRecordsArray(value: unknown): TransferRecord[] {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object") {
    return Object.values(value as Record<string, unknown>).filter(
      (r): r is TransferRecord => r !== null && typeof r === "object"
    );
  }
  return [];
}

function resolveAffiliateId(record: TransferRecord): string | null {
  return (
    record.affiliateId?.toString().trim() ||
    record.agentId?.toString().trim() ||
    record.id?.toString().trim() ||
    null
  );
}

function resolveAmount(record: TransferRecord): number {
  const raw = record.amount ?? record.value;
  if (raw === undefined || raw === null) return 0;
  const n = parseFloat(String(raw).replace(/,/g, ""));
  return isFinite(n) && n > 0 ? n : 0;
}

function resolveType(record: TransferRecord): string {
  return String(record.type ?? record.transferType ?? "").trim();
}

/**
 * Fetch all transfers for the master's sub-agents,
 * optionally filtered by date.
 *
 * Returns a Map<affiliateId, TransferSummaryPerAgent>.
 * Unknown affiliateIds are omitted — use getOrZero() to read.
 */
export async function fetchAgentsTransfers(
  client: TexasHttpClient,
  options: {
    /** ISO date "YYYY-MM-DD" — filter transfers for a specific day */
    date?: string;
  } = {}
): Promise<Map<string, TransferSummaryPerAgent>> {
  const filter: TexasFilterMap = {
    type: {
      action: "in",
      value: ["2", "3"],
      valueLabel: "Deposit,Withdraw",
      staticDataKey: "type",
    },
  };

  // If the API supports date filtering, add it; otherwise filter client-side
  if (options.date) {
    filter.date = {
      action: "=",
      from: options.date,
      to: options.date,
      value: options.date,
    };
  }

  let records: TransferRecord[] = [];
  try {
    const response = await client.post<{
      status?: boolean;
      result?: { records?: unknown; totalRecordsCount?: string } | unknown[] | unknown;
    }>("/Statistics/getAgentsTransfers", {
      start: 0,
      limit: 2000,
      filter,
    });

    if (!response.data?.status && response.data?.status !== undefined) {
      console.warn("[fetch-agents-transfers] status=false from API");
      return new Map();
    }

    // result may be array or paged object
    const raw = response.data?.result;
    if (Array.isArray(raw)) {
      records = raw as TransferRecord[];
    } else if (raw && typeof raw === "object") {
      const paged = raw as { records?: unknown };
      records = coerceRecordsArray(paged.records ?? raw);
    }
  } catch (e) {
    // Non-fatal — wasel fields will be 0 for this call
    console.warn(
      "[fetch-agents-transfers] failed (non-fatal):",
      e instanceof Error ? e.message : String(e)
    );
    return new Map();
  }

  // Client-side date filter as fallback (if API doesn't support it)
  if (options.date) {
    const targetDate = options.date;
    records = records.filter((r) => {
      const d =
        r.date?.slice(0, 10) ||
        r.createdAt?.slice(0, 10) ||
        r.created_at?.slice(0, 10) ||
        "";
      // If no date field at all, keep the record (can't filter)
      return !d || d === targetDate;
    });
  }

  // Aggregate by affiliateId
  const summary = new Map<string, TransferSummaryPerAgent>();

  for (const record of records) {
    const affiliateId = resolveAffiliateId(record);
    if (!affiliateId) continue;

    const amount = resolveAmount(record);
    if (amount === 0) continue;

    const type = resolveType(record);
    if (!summary.has(affiliateId)) {
      summary.set(affiliateId, { depositsToAgent: 0, withdrawsFromAgent: 0 });
    }
    const entry = summary.get(affiliateId)!;

    if (type === "2") {
      entry.depositsToAgent += amount;     // wasel_eleih
    } else if (type === "3") {
      entry.withdrawsFromAgent += amount;  // wasel_menho
    }
  }

  // Round to 4 decimal places
  for (const [, v] of summary) {
    v.depositsToAgent   = round4(v.depositsToAgent);
    v.withdrawsFromAgent = round4(v.withdrawsFromAgent);
  }

  return summary;
}

export function getTransferSummary(
  map: Map<string, TransferSummaryPerAgent>,
  affiliateId: string
): TransferSummaryPerAgent {
  return map.get(affiliateId) ?? ZERO_SUMMARY;
}

function round4(n: number): number {
  return Math.round(n * 10_000) / 10_000;
}
