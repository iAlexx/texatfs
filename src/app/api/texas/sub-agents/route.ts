import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import type { LedgerAuthInput } from "@/lib/ledger/types";
import {
  fetchTexasSubAgentsLive,
  type TexasSubAgentsPayload,
  type TexasSubAgentRow,
} from "@/lib/texas/texas-live-sub-agents";
import { computeAlNihai, roundMoney } from "@/lib/accounting/formulas";
import { resolveLedgerDate } from "@/lib/cron/ledger-date";
import { withAuthenticatedTexasClient, texasJsonResponse } from "@/lib/texas/with-authenticated-texas-client";
import { serverCacheGet, serverCacheSet } from "@/lib/texas/server-cache";
import {
  assertCacheScope,
  stampCacheScope,
} from "@/lib/texas/texas-data-scope";
import type { UserScopeContext } from "@/lib/security/user-context";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const runtime = "nodejs";
export const maxDuration = 30;

const SUB_AGENTS_TTL_MS = 90_000;

interface Body extends LedgerAuthInput {
  ledgerDate?: string;
  forceRefresh?: boolean;
}

function todayLedgerDate(): string {
  return resolveLedgerDate();
}

function previousDate(iso: string): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

interface DbEnrichment {
  wasel_menho: number;
  wasel_eleih: number;
  baqi_qadim: number;
}

async function loadDbEnrichment(
  supabase: SupabaseClient,
  masterId: string,
  affiliateIds: string[],
  ledgerDate: string
): Promise<Map<string, DbEnrichment>> {
  const result = new Map<string, DbEnrichment>();
  if (!affiliateIds.length) return result;

  for (const aid of affiliateIds) {
    result.set(aid, { wasel_menho: 0, wasel_eleih: 0, baqi_qadim: 0 });
  }

  // 1) WhatsApp confirmed transactions for today grouped by target_affiliate_id
  const { data: masterLedger } = await supabase
    .from("daily_ledgers")
    .select("id")
    .eq("user_id", masterId)
    .eq("ledger_date", ledgerDate)
    .maybeSingle();

  if (masterLedger) {
    const { data: txns } = await supabase
      .from("transactions")
      .select("target_affiliate_id, type, amount")
      .eq("daily_ledger_id", masterLedger.id)
      .eq("is_confirmed", true)
      .not("target_affiliate_id", "is", null);

    for (const tx of txns ?? []) {
      const aid = tx.target_affiliate_id as string;
      const entry = result.get(aid);
      if (!entry) continue;
      const amt = Number(tx.amount);
      if (tx.type === "wasel_menho") entry.wasel_menho += amt;
      else if (tx.type === "wasel_eleih") entry.wasel_eleih += amt;
    }
  }

  // 2) Previous day's al_nihai as baqi_qadim — look up users by texas_affiliate_id
  const yesterday = previousDate(ledgerDate);

  const { data: linkedUsers } = await supabase
    .from("users")
    .select("id, texas_affiliate_id")
    .in("texas_affiliate_id", affiliateIds);

  const userIdToAffiliate = new Map<string, string>();
  for (const u of linkedUsers ?? []) {
    if (u.texas_affiliate_id) {
      userIdToAffiliate.set(u.id, u.texas_affiliate_id);
    }
  }

  if (userIdToAffiliate.size > 0) {
    const userIds = Array.from(userIdToAffiliate.keys());
    const { data: prevLedgers } = await supabase
      .from("daily_ledgers")
      .select("user_id, al_nihai")
      .in("user_id", userIds)
      .eq("ledger_date", yesterday);

    for (const pl of prevLedgers ?? []) {
      const aid = userIdToAffiliate.get(pl.user_id as string);
      if (!aid) continue;
      const entry = result.get(aid);
      if (entry) entry.baqi_qadim = Number(pl.al_nihai);
    }
  }

  // Round all values
  for (const entry of result.values()) {
    entry.wasel_menho = roundMoney(entry.wasel_menho);
    entry.wasel_eleih = roundMoney(entry.wasel_eleih);
    entry.baqi_qadim = roundMoney(entry.baqi_qadim);
  }

  return result;
}

function enrichPayload(
  payload: TexasSubAgentsPayload,
  enrichment: Map<string, DbEnrichment>
): TexasSubAgentsPayload {
  let totalBurn = 0;
  let combinedBalance = 0;
  let highest: TexasSubAgentsPayload["stats"]["highest_burn_agent"] = null;

  const agents: TexasSubAgentRow[] = payload.agents.map((agent) => {
    const db = enrichment.get(agent.affiliateId);
    if (!db) return agent;

    const m = agent.metrics;
    const wasel_menho = db.wasel_menho;
    const wasel_eleih = db.wasel_eleih;
    const baqi_qadim = db.baqi_qadim;
    const al_nihai = computeAlNihai({
      al_farq: m.al_farq,
      wasel_menho,
      wasel_eleih,
      baqi_qadim,
    });

    const enrichedAgent: TexasSubAgentRow = {
      ...agent,
      metrics: { ...m, wasel_menho, wasel_eleih, baqi_qadim, al_nihai },
    };

    totalBurn += enrichedAgent.metrics.al_harq;
    combinedBalance += enrichedAgent.balance;
    if (!highest || enrichedAgent.metrics.al_harq > highest.al_harq) {
      highest = {
        affiliateId: enrichedAgent.affiliateId,
        label: enrichedAgent.username,
        al_harq: enrichedAgent.metrics.al_harq,
      };
    }

    return enrichedAgent;
  });

  return {
    ...payload,
    agents,
    stats: {
      active_agents: agents.length,
      total_network_burn: roundMoney(totalBurn),
      combined_balance: roundMoney(combinedBalance),
      highest_burn_agent: highest,
    },
  };
}

/**
 * Privacy gate: strip the Texas API response down to ONLY direct children.
 *
 * Strategy:
 *  1. Query DB for users WHERE parent_id = viewer → collect their texas_affiliate_id
 *  2. If the viewer has a texas_affiliate_id, also check each Texas record for a
 *     parentAffiliateId field matching the viewer (handles agents not yet in DB).
 *  3. Keep only agents that pass either check.
 */
async function filterToDirectChildren(
  supabase: SupabaseClient,
  viewerId: string,
  viewerAffiliateId: string | null | undefined,
  payload: TexasSubAgentsPayload
): Promise<TexasSubAgentsPayload> {
  const { data: directChildren } = await supabase
    .from("users")
    .select("texas_affiliate_id")
    .eq("parent_id", viewerId)
    .eq("is_active", true);

  const allowedIds = new Set<string>();
  for (const row of directChildren ?? []) {
    if (row.texas_affiliate_id) {
      allowedIds.add(String(row.texas_affiliate_id));
    }
  }

  const viewerAid = viewerAffiliateId ? String(viewerAffiliateId) : null;

  const agents = payload.agents.filter((agent) => {
    if (allowedIds.has(agent.affiliateId)) return true;

    if (viewerAid) {
      const rec = agent as unknown as Record<string, unknown>;
      const parentId =
        rec.parentAffiliateId ?? rec.parent_affiliate_id ?? rec.parentId;
      if (parentId !== undefined && String(parentId) === viewerAid) return true;
    }

    return false;
  });

  let totalBurn = 0;
  let combinedBalance = 0;
  let highest: TexasSubAgentsPayload["stats"]["highest_burn_agent"] = null;
  for (const a of agents) {
    totalBurn += a.metrics.al_harq;
    combinedBalance += a.balance;
    if (!highest || Math.abs(a.metrics.al_harq) > Math.abs(highest.al_harq)) {
      highest = {
        affiliateId: a.affiliateId,
        label: a.username,
        al_harq: a.metrics.al_harq,
      };
    }
  }

  console.info("[sub-agents] privacy filter applied", {
    viewerId,
    viewerAffiliateId: viewerAid,
    dbDirectChildren: allowedIds.size,
    allowedAffiliateIds: Array.from(allowedIds),
    texasTotal: payload.agents.length,
    afterFilter: agents.length,
    droppedCount: payload.agents.length - agents.length,
    dropped: payload.agents
      .filter((a) => !agents.includes(a))
      .map((a) => a.affiliateId),
  });

  return {
    ...payload,
    agents,
    stats: {
      active_agents: agents.length,
      total_network_burn: roundMoney(totalBurn),
      combined_balance: roundMoney(combinedBalance),
      highest_burn_agent: highest,
    },
  };
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Body;
  const ledgerDate = body.ledgerDate ?? todayLedgerDate();
  const supabase = getSupabaseServiceClient();

  return withAuthenticatedTexasClient(supabase, body, async ({ user, client, creds }) => {
    const cacheKey = `sub-agents:${user.id}:${ledgerDate}`;

    if (!body.forceRefresh) {
      const cached = serverCacheGet<
        TexasSubAgentsPayload & { _scope?: UserScopeContext }
      >(cacheKey, user.id);
      if (cached) {
        assertCacheScope(cached, user.id, cacheKey);
        const { _scope: _ignored, ...payload } = cached;
        return texasJsonResponse({ ...payload, _cached: true }, 200);
      }
    }

    const texasPayload = await fetchTexasSubAgentsLive(client, ledgerDate);

    // --- PRIVACY ENFORCEMENT: only show direct children ---
    const filteredPayload = await filterToDirectChildren(
      supabase,
      user.id,
      creds.texas_affiliate_id,
      texasPayload
    );

    const affiliateIds = filteredPayload.agents.map((a) => a.affiliateId);
    const dbData = await loadDbEnrichment(supabase, user.id, affiliateIds, ledgerDate);
    const payload = enrichPayload(filteredPayload, dbData);

    console.info("[sub-agents] enriched", {
      userId: user.id,
      ledgerDate,
      totalFromTexas: texasPayload.agents.length,
      afterDirectFilter: filteredPayload.agents.length,
      agentCount: payload.agents.length,
      withWasel: Array.from(dbData.values()).filter(
        (d) => d.wasel_menho > 0 || d.wasel_eleih > 0
      ).length,
      withBaqiQadim: Array.from(dbData.values()).filter(
        (d) => d.baqi_qadim !== 0
      ).length,
    });

    const scoped = stampCacheScope(payload, {
      resolvedUserId: user.id,
      texasUsername: creds.texas_username ?? creds.username,
      texasAffiliateId: creds.texas_affiliate_id,
      cacheKey,
    });

    serverCacheSet(cacheKey, user.id, scoped, SUB_AGENTS_TTL_MS);

    return texasJsonResponse(payload, 200);
  });
}
