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
import type { TexasLiveLedgerMetrics } from "@/lib/texas/texas-live-ledger";

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

/* ── DB types ── */

interface DirectChildRow {
  id: string;
  texas_affiliate_id: string | null;
  display_name: string | null;
  texas_username: string | null;
  role: string | null;
  is_active: boolean;
}

interface DbEnrichment {
  wasel_menho: number;
  wasel_eleih: number;
  baqi_qadim: number;
}

/* ── DB enrichment (WhatsApp txns + previous-day al_nihai) ── */

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

  for (const entry of result.values()) {
    entry.wasel_menho = roundMoney(entry.wasel_menho);
    entry.wasel_eleih = roundMoney(entry.wasel_eleih);
    entry.baqi_qadim = roundMoney(entry.baqi_qadim);
  }

  return result;
}

/* ── Enrich metrics with DB data (WhatsApp + baqi_qadim) ── */

function enrichAgents(
  agents: TexasSubAgentRow[],
  enrichment: Map<string, DbEnrichment>
): TexasSubAgentRow[] {
  return agents.map((agent) => {
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

    return {
      ...agent,
      metrics: { ...m, wasel_menho, wasel_eleih, baqi_qadim, al_nihai },
    };
  });
}

/* ── Recompute aggregate stats for a list of agents ── */

function computeStats(agents: TexasSubAgentRow[]): TexasSubAgentsPayload["stats"] {
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

  return {
    active_agents: agents.length,
    total_network_burn: roundMoney(totalBurn),
    combined_balance: roundMoney(combinedBalance),
    highest_burn_agent: highest,
  };
}

/* ── Zero-valued metrics placeholder ── */

const ZERO_METRICS: TexasLiveLedgerMetrics = {
  tebat: 0,
  suhoubat: 0,
  al_farq: 0,
  al_harq: 0,
  wasel_menho: 0,
  wasel_eleih: 0,
  baqi_qadim: 0,
  al_nihai: 0,
};

/**
 * PRIVACY GATE — DB is the single source of truth for visibility.
 *
 * 1. Load direct children from `users WHERE parent_id = viewer.id AND is_active`.
 * 2. Build allow-list of texas_affiliate_id values.
 * 3. Filter Texas payload to only those in the allow-list.
 * 4. For any DB child whose texas_affiliate_id is NULL or not found in the Texas
 *    payload, create a stub row with has_live_texas_data=false so the UI still
 *    shows them.
 */
async function buildDirectChildrenPayload(
  supabase: SupabaseClient,
  viewerId: string,
  texasPayload: TexasSubAgentsPayload,
  ledgerDate: string
): Promise<TexasSubAgentsPayload> {
  const { data: dbChildren } = await supabase
    .from("users")
    .select("id, texas_affiliate_id, display_name, texas_username, role, is_active")
    .eq("parent_id", viewerId)
    .eq("is_active", true);

  const directRows: DirectChildRow[] = (dbChildren ?? []) as DirectChildRow[];

  const allowedAffiliateIds = new Set<string>();
  for (const row of directRows) {
    if (row.texas_affiliate_id) {
      allowedAffiliateIds.add(String(row.texas_affiliate_id));
    }
  }

  const texasByAffiliate = new Map<string, TexasSubAgentRow>();
  for (const agent of texasPayload.agents) {
    texasByAffiliate.set(agent.affiliateId, agent);
  }

  const agents: TexasSubAgentRow[] = [];
  const matchedTexasIds = new Set<string>();

  for (const dbChild of directRows) {
    const aid = dbChild.texas_affiliate_id
      ? String(dbChild.texas_affiliate_id)
      : null;

    if (aid && texasByAffiliate.has(aid)) {
      agents.push(texasByAffiliate.get(aid)!);
      matchedTexasIds.add(aid);
    } else {
      const label =
        dbChild.display_name ??
        dbChild.texas_username ??
        aid ??
        dbChild.id.slice(0, 8);

      agents.push({
        affiliateId: aid ?? `db:${dbChild.id}`,
        username: label,
        email: dbChild.texas_username ?? label,
        texasRole: dbChild.role ?? "agent",
        mainCurrency: "NSP",
        balance: 0,
        metrics: { ...ZERO_METRICS },
      });
    }
  }

  const droppedFromTexas = texasPayload.agents.filter(
    (a) => !matchedTexasIds.has(a.affiliateId)
  );

  console.info("[sub-agents] privacy gate: DB-driven direct children", {
    viewerId,
    dbDirectChildren: directRows.length,
    dbChildrenWithAffiliateId: allowedAffiliateIds.size,
    texasTotal: texasPayload.agents.length,
    matchedFromTexas: matchedTexasIds.size,
    stubsCreated: agents.length - matchedTexasIds.size,
    droppedFromTexas: droppedFromTexas.length,
    droppedIds: droppedFromTexas.map((a) => a.affiliateId),
    resultAgents: agents.length,
  });

  return {
    ledger_date: ledgerDate,
    fetched_at: texasPayload.fetched_at,
    agents,
    stats: computeStats(agents),
  };
}

/* ── Route handler ── */

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

    const directPayload = await buildDirectChildrenPayload(
      supabase,
      user.id,
      texasPayload,
      ledgerDate
    );

    const affiliateIds = directPayload.agents
      .map((a) => a.affiliateId)
      .filter((id) => !id.startsWith("db:"));
    const dbData = await loadDbEnrichment(supabase, user.id, affiliateIds, ledgerDate);
    const enrichedAgents = enrichAgents(directPayload.agents, dbData);

    const payload: TexasSubAgentsPayload = {
      ledger_date: directPayload.ledger_date,
      fetched_at: directPayload.fetched_at,
      agents: enrichedAgents,
      stats: computeStats(enrichedAgents),
    };

    console.info("[sub-agents] final response", {
      userId: user.id,
      ledgerDate,
      totalFromTexas: texasPayload.agents.length,
      directChildrenReturned: payload.agents.length,
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
