import type { AxiosInstance } from "axios";
import { fetchAllSubAgentStatistics } from "@/lib/texas/fetch-sub-agent-statistics";
import { fetchAllTexasChildren } from "@/lib/texas/fetch-texas-children";
import {
  fetchAgentsTransfers,
  getTransferSummary,
} from "@/lib/texas/fetch-agents-transfers";
import {
  metricsFromTexasSources,
  pickAffiliateId,
  texasRoleLabel,
  type TexasLiveLedgerMetrics,
} from "@/lib/texas/texas-live-ledger";
import type {
  SubAgentStatisticsRecord,
  TexasChildRecord,
} from "@/lib/texas/types";

export interface TexasSubAgentRow {
  affiliateId: string;
  username: string;
  email: string;
  texasRole: string;
  mainCurrency: string;
  metrics: TexasLiveLedgerMetrics;
}

export interface TexasSubAgentsPayload {
  ledger_date: string;
  fetched_at: string;
  agents: TexasSubAgentRow[];
  stats: {
    active_agents: number;
    total_network_burn: number;
    combined_balance: number;
    highest_burn_agent: { affiliateId: string; label: string; al_harq: number } | null;
  };
}

/**
 * Resolve a display label from a child record.
 * Live API returns different name fields depending on the endpoint version:
 *   getChildren     → username, email
 *   getSubAgentStatistics → userName, name, lastName, email
 */
function resolveLabel(record: Record<string, unknown>): string {
  const candidates = [
    record.username,
    record.userName,
    record.name,
    record.affiliateUsername,
    record.email,
  ];
  for (const v of candidates) {
    const s = typeof v === "string" ? v.trim() : "";
    if (s) return s;
  }
  return String(record.affiliateId ?? record.agentId ?? "");
}

function childLabel(child: TexasChildRecord): string {
  return resolveLabel(child as Record<string, unknown>);
}

/**
 * Build a Map<affiliateId, statsRecord> from the statistics endpoint records.
 * Tries multiple possible ID field names to handle API field-name drift.
 */
function indexStatisticsByAffiliate(
  records: SubAgentStatisticsRecord[]
): Map<string, SubAgentStatisticsRecord> {
  const map = new Map<string, SubAgentStatisticsRecord>();
  for (const row of records) {
    // pickAffiliateId already tries ["affiliateId", "agentId", "id"]
    const id = pickAffiliateId(row);
    if (id) map.set(id, row);
  }
  return map;
}

/**
 * Live sub-agents list: getChildren + getSubAgentStatistics + getAgentsTransfers.
 * All three calls run in parallel.
 */
export async function fetchTexasSubAgentsLive(
  client: AxiosInstance,
  ledgerDate: string
): Promise<TexasSubAgentsPayload> {
  const [{ records: children }, { response: statsResponse }, transfersMap] =
    await Promise.all([
      fetchAllTexasChildren(client),
      fetchAllSubAgentStatistics(client, { paginate: true }),
      fetchAgentsTransfers(client, { date: ledgerDate }),
    ]);

  const statsById = indexStatisticsByAffiliate(
    statsResponse.result?.records ?? []
  );

  const agents: TexasSubAgentRow[] = children.map((child) => {
    const affiliateId = String(child.affiliateId);
    const stats     = statsById.get(affiliateId) ?? null;
    const transfers = getTransferSummary(transfersMap, affiliateId);
    const metrics   = metricsFromTexasSources(stats, null, transfers);

    return {
      affiliateId,
      username:     childLabel(child),
      email:        child.email?.trim() || child.username?.trim() || affiliateId,
      texasRole:    texasRoleLabel(child.role),
      mainCurrency: child.mainCurrency?.trim() || "NSP",
      metrics,
    };
  });

  let totalBurn       = 0;
  let combinedBalance = 0;
  let highest: TexasSubAgentsPayload["stats"]["highest_burn_agent"] = null;

  for (const agent of agents) {
    totalBurn       += agent.metrics.al_harq;
    combinedBalance += agent.metrics.al_nihai;
    if (!highest || agent.metrics.al_harq > highest.al_harq) {
      highest = {
        affiliateId: agent.affiliateId,
        label:       agent.username,
        al_harq:     agent.metrics.al_harq,
      };
    }
  }

  return {
    ledger_date: ledgerDate,
    fetched_at:  new Date().toISOString(),
    agents,
    stats: {
      active_agents:       agents.length,
      total_network_burn:  roundAgg(totalBurn),
      combined_balance:    roundAgg(combinedBalance),
      highest_burn_agent:  highest,
    },
  };
}

function roundAgg(n: number): number {
  return Math.round(n * 10_000) / 10_000;
}

export async function fetchTexasAgentWallet(
  client: AxiosInstance,
  affiliateId: string,
  currencyCode: string
): Promise<import("@/lib/texas/types").TexasAgentWalletResult | null> {
  const response = await client.post<
    import("@/lib/texas/types").TexasAgentWalletResponse
  >("/Agent/getAgentWalletByAgentId", { affiliateId, currencyCode });

  if (!response.data?.status || !response.data.result) return null;
  return response.data.result;
}

/**
 * Full detail fetch for a single agent — always live, no cache shortcut.
 * Calls getChildren + getSubAgentStatistics + getAgentWalletByAgentId +
 * getAgentsTransfers in parallel.
 */
export async function fetchTexasAgentDetailLive(
  client: AxiosInstance,
  affiliateId: string,
  currencyCode: string,
  ledgerDate: string
): Promise<{
  affiliateId: string;
  username: string;
  email: string;
  mainCurrency: string;
  metrics: TexasLiveLedgerMetrics;
}> {
  const [
    { records: children },
    { response: statsResponse },
    wallet,
    transfersMap,
  ] = await Promise.all([
    fetchAllTexasChildren(client),
    fetchAllSubAgentStatistics(client, { paginate: true }),
    fetchTexasAgentWallet(client, affiliateId, currencyCode),
    fetchAgentsTransfers(client, { date: ledgerDate }),
  ]);

  const child =
    children.find((c) => String(c.affiliateId) === affiliateId) ?? null;
  const stats =
    (statsResponse.result?.records ?? []).find(
      (r) => pickAffiliateId(r) === affiliateId
    ) ?? null;

  const transfers = getTransferSummary(transfersMap, affiliateId);

  const username = child
    ? child.username?.trim() || child.email?.trim() || affiliateId
    : affiliateId;
  const email = child?.email?.trim() || child?.username?.trim() || affiliateId;

  return {
    affiliateId,
    username,
    email,
    mainCurrency: child?.mainCurrency?.trim() || currencyCode,
    metrics: metricsFromTexasSources(stats, wallet, transfers),
  };
}
