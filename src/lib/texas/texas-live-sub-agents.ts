import type { TexasHttpClient } from "@/lib/texas/texas-http-client";
import { fetchAllSubAgentStatistics } from "@/lib/texas/fetch-sub-agent-statistics";
import { fetchAllTexasChildren } from "@/lib/texas/fetch-texas-children";
import { fetchAgentTransfers } from "@/lib/texas/fetch-agent-transfers";
import {
  pickAffiliateId,
  texasRoleLabel,
  type TexasLiveLedgerMetrics,
} from "@/lib/texas/texas-live-ledger";
import {
  computeAlFarq,
  computeAlHarqFromAlFarq,
  computeAlNihai,
  roundMoney,
} from "@/lib/accounting/formulas";
import { pickNumeric, walletMapping } from "@/lib/texas/field-resolver";
import { createLogger } from "@/lib/observability/logger";
import type {
  AgentTransferRecord,
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

function resolveTransferAmount(rec: Record<string, unknown>): number {
  const AMOUNT_KEYS = ["amount", "value", "total", "chargeIn", "chargeOut", "sum"];
  for (const key of AMOUNT_KEYS) {
    const raw = rec[key];
    if (raw === undefined || raw === null || raw === "") continue;
    const n = Math.abs(Number(String(raw).replace(/,/g, "")));
    if (!Number.isNaN(n) && n > 0) return n;
  }
  return 0;
}

function resolveTransferType(rec: Record<string, unknown>): string {
  const raw = rec.type ?? rec.typeId ?? rec.transferType ?? rec.actionType ?? "";
  return String(raw).trim().toLowerCase();
}

function resolveId(rec: Record<string, unknown>, ...keys: string[]): string {
  for (const k of keys) {
    const v = rec[k];
    if (v !== undefined && v !== null && String(v).trim() !== "") {
      return String(v).trim();
    }
  }
  return "";
}

/**
 * Group transfer records by child affiliateId.
 *
 * Texas getAgentsTransfers records have `fromId`/`toId` (not `affiliateId`).
 *   - Deposit:  money goes FROM master TO child → child.tebat
 *   - Withdraw: money goes FROM child TO master → child.suhoubat
 *
 * We match `fromId`/`toId` against the set of known child affiliateIds
 * to attribute each transfer to the correct sub-agent.
 */
function groupTransfersByAffiliate(
  records: AgentTransferRecord[],
  childAffiliateIds: Set<string>
): Map<string, { tebat: number; suhoubat: number }> {
  const map = new Map<string, { tebat: number; suhoubat: number }>();

  const ensure = (id: string) => {
    if (!map.has(id)) map.set(id, { tebat: 0, suhoubat: 0 });
    return map.get(id)!;
  };

  let matched = 0;
  let skipped = 0;

  if (records.length > 0) {
    const s = records[0] as Record<string, unknown>;
    log.info("transfer record sample for grouping", {
      keys: Object.keys(s).sort().join(", "),
      fromId: s.fromId,
      toId: s.toId,
      affiliateId: s.affiliateId,
      type: s.type,
      amount: s.amount,
    });
  }

  for (const rec of records) {
    const bag = rec as Record<string, unknown>;
    const fromId = resolveId(bag, "fromId", "from_id", "fromAffiliateId");
    const toId = resolveId(bag, "toId", "to_id", "toAffiliateId");
    const amount = resolveTransferAmount(bag);
    const t = resolveTransferType(bag);

    if (t === "2" || t === "deposit") {
      if (toId && childAffiliateIds.has(toId)) {
        ensure(toId).tebat += amount;
        matched++;
      } else if (fromId && childAffiliateIds.has(fromId)) {
        ensure(fromId).tebat += amount;
        matched++;
      } else {
        skipped++;
      }
    } else if (t === "3" || t === "withdraw") {
      if (fromId && childAffiliateIds.has(fromId)) {
        ensure(fromId).suhoubat += amount;
        matched++;
      } else if (toId && childAffiliateIds.has(toId)) {
        ensure(toId).suhoubat += amount;
        matched++;
      } else {
        skipped++;
      }
    } else {
      skipped++;
    }
  }

  for (const entry of map.values()) {
    entry.tebat = roundMoney(entry.tebat);
    entry.suhoubat = roundMoney(entry.suhoubat);
  }

  log.info("transfers grouped by affiliate", {
    totalRecords: records.length,
    matched,
    skipped,
    uniqueAgents: map.size,
    childAffiliateIdsCount: childAffiliateIds.size,
    perAgent: Array.from(map.entries())
      .map(([id, v]) => `${id}:dep=${v.tebat},wd=${v.suhoubat}`)
      .join(" | "),
  });

  return map;
}

function buildMetrics(tebat: number, suhoubat: number): TexasLiveLedgerMetrics {
  const al_farq = computeAlFarq(tebat, suhoubat);
  const al_harq = computeAlHarqFromAlFarq(al_farq);
  const al_nihai = computeAlNihai({
    al_farq,
    wasel_menho: 0,
    wasel_eleih: 0,
    baqi_qadim: 0,
  });

  return {
    tebat,
    suhoubat,
    al_farq,
    al_harq,
    wasel_menho: 0,
    wasel_eleih: 0,
    baqi_qadim: 0,
    al_nihai,
  };
}

/**
 * Live sub-agents: 3 parallel Texas API calls:
 *   1. getChildren            → agent list with affiliateId, username, role
 *   2. getSubAgentStatistics  → per-agent currentWallet (balance)
 *   3. getAgentsTransfers     → per-agent deposit/withdraw records (tebat/suhoubat)
 */
export async function fetchTexasSubAgentsLive(
  client: TexasHttpClient,
  ledgerDate: string
): Promise<TexasSubAgentsPayload> {
  const [
    { records: children },
    { response: statsResponse },
    { records: transferRecords, totals: networkTotals },
  ] = await Promise.all([
    fetchAllTexasChildren(client),
    fetchAllSubAgentStatistics(client, { paginate: true }),
    fetchAgentTransfers(client, { paginate: true }),
  ]);

  const statsRecords = statsResponse.result?.records ?? [];
  const statsById = indexStatisticsByAffiliate(statsRecords);

  const childAffiliateIds = new Set(
    children.map((c) => String(c.affiliateId)).filter(Boolean)
  );
  const transfersByAgent = groupTransfersByAffiliate(
    transferRecords,
    childAffiliateIds
  );

  log.info("API responses", {
    children: children.length,
    statsRecords: statsRecords.length,
    transferRecords: transferRecords.length,
    agentsWithTransfers: transfersByAgent.size,
    networkTotalDeposit: networkTotals.totalDeposit,
    networkTotalWithdraw: networkTotals.totalWithdraw,
  });

  if (children.length > 0) {
    const s = children[0] as Record<string, unknown>;
    log.info("children row sample", {
      keys: Object.keys(s).sort().join(", "),
      affiliateId: s.affiliateId,
      balance: s.balance,
      currentWallet: s.currentWallet,
    });
  }

  const agents: TexasSubAgentRow[] = children.map((child) => {
    const affiliateId = String(child.affiliateId);
    const stats = statsById.get(affiliateId) ?? null;
    const transfers = transfersByAgent.get(affiliateId);
    const balance = extractBalance(stats, child);

    const tebat = transfers?.tebat ?? 0;
    const suhoubat = transfers?.suhoubat ?? 0;
    const metrics = buildMetrics(tebat, suhoubat);

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
    if (!highest || Math.abs(agent.metrics.al_harq) > Math.abs(highest.al_harq)) {
      highest = {
        affiliateId: agent.affiliateId,
        label: agent.username,
        al_harq: agent.metrics.al_harq,
      };
    }
  }

  log.info("sub-agents built", {
    agentCount: agents.length,
    agentsWithBalance: agents.filter((a) => a.balance > 0).length,
    agentsWithTransfers: agents.filter(
      (a) => a.metrics.tebat > 0 || a.metrics.suhoubat > 0
    ).length,
    perAgent: agents.map((a) => ({
      name: a.username,
      balance: a.balance,
      tebat: a.metrics.tebat,
      suhoubat: a.metrics.suhoubat,
      al_nihai: a.metrics.al_nihai,
    })),
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
  balance: number;
  metrics: TexasLiveLedgerMetrics;
}> {
  const [
    { records: children },
    { response: statsResponse },
    { records: transferRecords },
  ] = await Promise.all([
    fetchAllTexasChildren(client),
    fetchAllSubAgentStatistics(client, { paginate: true }),
    fetchAgentTransfers(client, { paginate: true }),
  ]);

  const child =
    children.find((c) => String(c.affiliateId) === affiliateId) ?? null;
  const stats =
    (statsResponse.result?.records ?? []).find(
      (r) => pickAffiliateId(r) === affiliateId
    ) ?? null;

  const childIds = new Set([affiliateId]);
  const transfersByAgent = groupTransfersByAffiliate(transferRecords, childIds);
  const agentTx = transfersByAgent.get(affiliateId);

  const username = child
    ? child.username?.trim() || child.email?.trim() || affiliateId
    : affiliateId;
  const email = child?.email?.trim() || child?.username?.trim() || affiliateId;
  const balance = extractBalance(stats, child);

  const metrics = buildMetrics(agentTx?.tebat ?? 0, agentTx?.suhoubat ?? 0);

  return {
    affiliateId,
    username,
    email,
    mainCurrency: child?.mainCurrency?.trim() || _currencyCode,
    balance,
    metrics,
  };
}
