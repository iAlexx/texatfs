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
import {
  auditDirectChildVisibility,
  filterOutViewerSelfChildren,
  mergeDirectChildrenWithTexas,
  type DirectChildDbRow,
  type ViewerIdentity,
} from "@/lib/texas/sub-agents-direct-merge";
import {
  deactivateTexasChildrenRemovedFromPortal,
  ensureTexasPortalDirectChildrenInDb,
  repairMisassignedDirectChildren,
} from "@/lib/texas/link-texas-portal-children";
import { collectTexasChildrenForDbLink } from "@/lib/texas/texas-portal-hierarchy";
import { resolveViewerTexasAffiliateId } from "@/lib/texas/resolve-viewer-affiliate";
import { normalizeAffiliateId } from "@/lib/texas/sub-agents-direct-merge";
import {
  probeWhatsAppMigrations,
  scheduleMissingGroupsForParent,
} from "@/lib/whatsapp/schedule-missing-groups";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const runtime = "nodejs";
export const maxDuration = 30;

const SUB_AGENTS_TTL_MS = 15_000;

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

async function loadDirectChildren(
  supabase: SupabaseClient,
  viewerId: string
): Promise<DirectChildDbRow[]> {
  const { data, error } = await supabase
    .from("users")
    .select("id, texas_affiliate_id, display_name, texas_username, role, is_active")
    .eq("parent_id", viewerId)
    .eq("is_active", true);

  if (error) throw error;
  return (data ?? []) as DirectChildDbRow[];
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

function enrichAgents(
  agents: TexasSubAgentRow[],
  enrichment: Map<string, DbEnrichment>
): TexasSubAgentRow[] {
  return agents.map((agent) => {
    if (!agent.has_live_texas_data) return agent;

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

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Body;
  const ledgerDate = body.ledgerDate ?? todayLedgerDate();
  const supabase = getSupabaseServiceClient();

  return withAuthenticatedTexasClient(supabase, body, async ({ user, client, creds }) => {
    const cacheKey = `sub-agents:v3:${user.id}:${ledgerDate}`;

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

    // 1) Texas live data (full enrichment index from getChildren + stats + transfers)
    const texasLive = await fetchTexasSubAgentsLive(client, ledgerDate, null);
    const texasPayload = texasLive.payload;

    const viewerAffiliateId = await resolveViewerTexasAffiliateId(
      supabase,
      user.id,
      creds.texas_affiliate_id,
      texasLive.texasParentByAffiliate
    );

    const linkableRefs = collectTexasChildrenForDbLink(
      texasLive.allChildrenRecords,
      viewerAffiliateId
    );

    const texasAffiliateIdsInPortal = new Set(
      texasLive.allChildrenRecords
        .map((c) => normalizeAffiliateId(String(c.affiliateId ?? "")))
        .filter((id): id is string => Boolean(id))
    );

    const trueDirectAffiliateIds = new Set(
      linkableRefs
        .map((r) => normalizeAffiliateId(r.affiliateId))
        .filter((id): id is string => Boolean(id))
    );

    // 2) Repair mistaken parent_id=viewer on grandchildren (from prior reparent bug)
    const repaired = await repairMisassignedDirectChildren(
      supabase,
      user.id,
      viewerAffiliateId,
      texasLive.texasParentByAffiliate,
      trueDirectAffiliateIds
    );

    // 3) Create only missing DB rows for verified portal-direct children (no reparent)
    const linkResult = await ensureTexasPortalDirectChildrenInDb(
      supabase,
      user.id,
      linkableRefs
    );
    linkResult.repaired = repaired;

    const deactivated = await deactivateTexasChildrenRemovedFromPortal(
      supabase,
      user.id,
      texasAffiliateIdsInPortal
    );

    // 4) Visibility: DB direct children only (exclude viewer's own row)
    const dbChildrenRaw = await loadDirectChildren(supabase, user.id);

    const viewerIdentity: ViewerIdentity = {
      userId: user.id,
      texasAffiliateId: viewerAffiliateId ?? creds.texas_affiliate_id ?? null,
      texasUsername:
        creds.texas_username ?? creds.username ?? user.texas_username ?? null,
      displayName: user.display_name ?? null,
      email: creds.texas_username ?? creds.username ?? user.texas_username ?? null,
    };

    const dbChildren = filterOutViewerSelfChildren(dbChildrenRaw, viewerIdentity);
    const excludedViewerSelf = dbChildrenRaw.length - dbChildren.length;

    const { data: parentRow } = await supabase
      .from("users")
      .select("whatsapp_phone")
      .eq("id", user.id)
      .maybeSingle();

    const whatsappSchedule = await scheduleMissingGroupsForParent(
      supabase,
      user.id,
      parentRow?.whatsapp_phone ?? null,
      dbChildren,
      "sub-agents"
    );

    const migrationProbe = await probeWhatsAppMigrations(supabase);

    // 5) Merge: iterate DB children, enrich or stub, drop non-direct Texas rows
    const { agents: mergedAgents, stats, diagnostics } = mergeDirectChildrenWithTexas(
      dbChildren,
      texasPayload
    );

    const audit = auditDirectChildVisibility(user.id, dbChildren, texasPayload);

    const affiliateIds = mergedAgents
      .filter((a) => a.has_live_texas_data)
      .map((a) => a.affiliateId);
    const dbData = await loadDbEnrichment(supabase, user.id, affiliateIds, ledgerDate);
    const enrichedAgents = enrichAgents(mergedAgents, dbData);

    const payload: TexasSubAgentsPayload = {
      ledger_date: ledgerDate,
      fetched_at: texasPayload.fetched_at,
      agents: enrichedAgents,
      stats,
      whatsapp_groups: {
        dbDirectChildren: whatsappSchedule.dbDirectChildren,
        activeGroupMappings: whatsappSchedule.activeGroupMappings,
        missingGroupTargets: whatsappSchedule.missingGroupTargets,
        scheduledGroupSpawn: whatsappSchedule.scheduled
          ? whatsappSchedule.scheduledCount
          : 0,
        skipReason: whatsappSchedule.skipReason,
        envOk: whatsappSchedule.env.ok,
        migrationsOk: migrationProbe.ok,
      },
    };

    console.info("[sub-agents] visibility merge", {
      viewerId: user.id,
      ledgerDate,
      viewerAffiliateId,
      viewerAffiliateSource: creds.texas_affiliate_id
        ? "creds"
        : viewerAffiliateId
          ? "db_or_inferred"
          : "none",
      texasChildrenInPortal: texasLive.allChildrenRecords.length,
      linkableForDb: linkableRefs.length,
      deactivatedFromPortal: deactivated,
      linkResult,
      excludedViewerSelf,
      whatsappDbDirectChildren: whatsappSchedule.dbDirectChildren,
      whatsappActiveGroupMappings: whatsappSchedule.activeGroupMappings,
      whatsappMissingGroupTargets: whatsappSchedule.missingGroupTargets,
      scheduledGroupSpawn: whatsappSchedule.scheduled
        ? whatsappSchedule.scheduledCount
        : 0,
      whatsappSkipReason: whatsappSchedule.skipReason,
      whatsappEnvOk: whatsappSchedule.env.ok,
      whatsappMigrationsOk: migrationProbe.ok,
      ...diagnostics,
      directChildrenReturned: payload.agents.length,
      renderedEnriched: payload.agents.filter((a) => a.has_live_texas_data).length,
      renderedStubs: payload.agents.filter((a) => !a.has_live_texas_data).length,
    });

    console.info("[sub-agents] per-child audit", {
      viewerId: user.id,
      rows: audit,
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
