import type { TexasHttpClient } from "@/lib/texas/texas-http-client";
import { fetchAllSubAgentStatistics } from "@/lib/texas/fetch-sub-agent-statistics";
import { fetchAllTexasChildren } from "@/lib/texas/fetch-texas-children";
import {
  metricsFromTexasSources,
  pickAffiliateId,
  texasRoleLabel,
  type TexasLiveLedgerMetrics,
} from "@/lib/texas/texas-live-ledger";
import { pickNumeric, walletMapping } from "@/lib/texas/field-resolver";
import { createLogger } from "@/lib/observability/logger";
import type {
  SubAgentStatisticsRecord,
  TexasChildRecord,
} from "@/lib/texas/types";

const log = createLogger("texas/live-sub-agents");

export interface TexasSubAgentRow {
  affiliateId: string;
  username: string;
  email: string;
  texasRole: string;
  mainCurrency: string;
  /** Wallet balance from Texas portal (currentWallet field) */
  balance: number;
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

const BALANCE_KEYS: readonly string[] = [
  ...walletMapping.balance,
  "totalAvailable",
  "total_available",
  "totalBalance",
];

function indexStatisticsByAffiliate(
  records: SubAgentStatisticsRecord[]
): Map<string, SubAgentStatisticsRecord> {
  const map = new Map<string, SubAgentStatisticsRecord>();
  for (const row of records) {
    const id = pickAffiliateId(row);
    if (id) map.set(String(id), row);
  }
  return map;
}

function extractBalance(
  stats: SubAgentStatisticsRecord | null,
  child: TexasChildRecord | null
): number {
  if (stats) {
    const v = pickNumeric(stats as Record<string, unknown>, BALANCE_KEYS);
    if (v !== 0) return v;
  }
  if (child) {
    const v = pickNumeric(child as Record<string, unknown>, BALANCE_KEYS);
    if (v !== 0) return v;
  }
  return 0;
}

/** Live sub-agents: Texas portal data (getChildren + getSubAgentStatistics). */
export async function fetchTexasSubAgentsLive(
  client: TexasHttpClient,
  ledgerDate: string
): Promise<TexasSubAgentsPayload> {
  const [{ records: children }, { response: statsResponse }] = await Promise.all([
    fetchAllTexasChildren(client),
    fetchAllSubAgentStatistics(client, { paginate: true }),
  ]);

  const statsRecords = statsResponse.result?.records ?? [];
  const statsById = indexStatisticsByAffiliate(statsRecords);

  // Log raw data samples to diagnose field availability
  if (children.length > 0) {
    const sample = children[0] as Record<string, unknown>;
    log.info("raw children row sample", {
      keys: Object.keys(sample).sort().join(", "),
      affiliateId: sample.affiliateId,
      currentWallet: sample.currentWallet,
      balance: sample.balance,
      totalAvailable: sample.totalAvailable,
    });
  }

  if (statsRecords.length > 0) {
    const sample = statsRecords[0] as Record<string, unknown>;
    log.info("raw stats row sample", {
      keys: Object.keys(sample).sort().join(", "),
      affiliateId: sample.affiliateId,
      currentWallet: sample.currentWallet,
      balance: sample.balance,
    });
  }

  // Log which children matched stats and which didn't
  const childIds = children.map((c) => String(c.affiliateId));
  const statsIds = Array.from(statsById.keys());
  const unmatchedChildren = childIds.filter((id) => !statsById.has(id));
  const unmatchedStats = statsIds.filter((id) => !childIds.includes(id));

  if (unmatchedChildren.length > 0 || unmatchedStats.length > 0) {
    log.warn("affiliateId mismatch between children and stats", {
      childrenCount: children.length,
      statsCount: statsRecords.length,
      childrenWithoutStats: unmatchedChildren,
      statsWithoutChildren: unmatchedStats,
    });
  }

  const agents: TexasSubAgentRow[] = children.map((child) => {
    const affiliateId = String(child.affiliateId);
    const stats = statsById.get(affiliateId) ?? null;
    const metrics = metricsFromTexasSources(stats);
    const balance = extractBalance(stats, child);

    return {
      affiliateId,
      username: childLabel(child),
      email: child.email?.trim() || child.username?.trim() || affiliateId,
      texasRole: texasRoleLabel(child.role),
      mainCurrency: child.mainCurrency?.trim() || "NSP",
      balance,
      metrics,
    };
  });

  let totalBurn = 0;
  let combinedBalance = 0;
  let highest: TexasSubAgentsPayload["stats"]["highest_burn_agent"] = null;

  for (const agent of agents) {
    totalBurn += agent.metrics.al_harq;
    combinedBalance += agent.balance;
    if (!highest || agent.metrics.al_harq > highest.al_harq) {
      highest = {
        affiliateId: agent.affiliateId,
        label: agent.username,
        al_harq: agent.metrics.al_harq,
      };
    }
  }

  log.info("sub-agents built", {
    childrenCount: children.length,
    statsRecords: statsRecords.length,
    matched: children.length - unmatchedChildren.length,
    unmatched: unmatchedChildren.length,
    agentsWithBalance: agents.filter((a) => a.balance > 0).length,
    balanceDetails: agents.map((a) => `${a.username}=${a.balance}`).join(", "),
  });

  return {
    ledger_date: ledgerDate,
    fetched_at: new Date().toISOString(),
    agents,
    stats: {
      active_agents: agents.length,
      total_network_burn: roundAgg(totalBurn),
      combined_balance: roundAgg(combinedBalance),
      highest_burn_agent: highest,
    },
  };
}

function roundAgg(n: number): number {
  return Math.round(n * 10_000) / 10_000;
}

export async function fetchTexasAgentDetailLive(
  client: TexasHttpClient,
  affiliateId: string,
  _currencyCode: string,
  _ledgerDate: string
): Promise<{
  affiliateId: string;
  username: string;
  email: string;
  mainCurrency: string;
  metrics: TexasLiveLedgerMetrics;
}> {
  const [{ records: children }, { response: statsResponse }] = await Promise.all([
    fetchAllTexasChildren(client),
    fetchAllSubAgentStatistics(client, { paginate: true }),
  ]);

  const child =
    children.find((c) => String(c.affiliateId) === affiliateId) ?? null;
  const stats =
    (statsResponse.result?.records ?? []).find(
      (r) => pickAffiliateId(r) === affiliateId
    ) ?? null;

  const username = child
    ? child.username?.trim() || child.email?.trim() || affiliateId
    : affiliateId;
  const email = child?.email?.trim() || child?.username?.trim() || affiliateId;

  return {
    affiliateId,
    username,
    email,
    mainCurrency: child?.mainCurrency?.trim() || _currencyCode,
    metrics: metricsFromTexasSources(stats),
  };
}
