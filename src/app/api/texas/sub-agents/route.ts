import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import type { LedgerAuthInput } from "@/lib/ledger/types";
import {
  fetchTexasSubAgentsLive,
  type TexasSubAgentsPayload,
  type TexasSubAgentRow,
} from "@/lib/texas/texas-live-sub-agents";
import { enrichSubAgentsWithPerAgentData } from "@/lib/accounting/sub-agents-row-enrichment";
import { resolveLedgerDate } from "@/lib/cron/ledger-date";
import { refreshStaleSubtreeLedgers } from "@/lib/scraper/ensure-user-ledger-sync";
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
import {
  maskTexasUsername,
  messageForSubAgentsEmptyReason,
  resolveSubAgentsEmptyReason,
  type SubAgentsDiagnostics,
} from "@/lib/texas/sub-agents-empty-reason";
import { resolveUserCredentials } from "@/lib/scraper/resolve-user-credentials";

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

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Body;
  const ledgerDate = body.ledgerDate ?? todayLedgerDate();
  const supabase = getSupabaseServiceClient();

  return withAuthenticatedTexasClient(supabase, body, async ({ user, client, creds }) => {
    const cacheKey = `sub-agents:v4:${user.id}:${ledgerDate}`;

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
    let dbChildrenRaw = await loadDirectChildren(supabase, user.id);

    const viewerIdentity: ViewerIdentity = {
      userId: user.id,
      texasAffiliateId: viewerAffiliateId ?? creds.texas_affiliate_id ?? null,
      texasUsername:
        creds.texas_username ?? creds.username ?? user.texas_username ?? null,
      displayName: user.display_name ?? null,
    };

    let dbChildren = filterOutViewerSelfChildren(dbChildrenRaw, viewerIdentity);
    let excludedViewerSelf = dbChildrenRaw.length - dbChildren.length;

    if (dbChildrenRaw.length > 0 && dbChildren.length === 0) {
      console.warn("[sub-agents] self-filter removed all rows — using raw list", {
        viewerId: user.id,
        dbDirectChildrenRaw: dbChildrenRaw.length,
        excludedViewerSelf,
      });
      dbChildren = dbChildrenRaw;
      excludedViewerSelf = 0;
    }

    if (body.forceRefresh && dbChildren.length > 0) {
      const childIds = dbChildren.map((c) => c.id);
      try {
        await refreshStaleSubtreeLedgers(supabase, childIds, ledgerDate);
      } catch (syncErr) {
        console.warn("[sub-agents] child ledger refresh on forceRefresh failed", {
          viewerId: user.id,
          error:
            syncErr instanceof Error ? syncErr.message : String(syncErr),
        });
      }
    }

    const { data: parentRow } = await supabase
      .from("users")
      .select("whatsapp_phone, onboarding_status")
      .eq("id", user.id)
      .maybeSingle();

    const parentWhatsappVerified =
      parentRow?.onboarding_status === "VERIFIED_COMPLETED";

    const whatsappSchedule = await scheduleMissingGroupsForParent(
      supabase,
      user.id,
      parentRow?.whatsapp_phone ?? null,
      dbChildren,
      "sub-agents"
    );

    const migrationProbe = await probeWhatsAppMigrations(supabase);

    // 5) Merge: iterate DB children, enrich or stub, drop non-direct Texas rows
    const { agents: mergedAgents, stats, diagnostics: mergeDiagnostics } =
      mergeDirectChildrenWithTexas(dbChildren, texasPayload);

    const audit = auditDirectChildVisibility(user.id, dbChildren, texasPayload);

    const {
      agents: enrichedAgents,
      agentRowsWithMtdMetrics,
      whatsappGroupStatusCount,
      commissionStatusCount,
    } = await enrichSubAgentsWithPerAgentData(
      supabase,
      user.id,
      mergedAgents,
      ledgerDate,
      { parentWhatsappVerified }
    );

    const credCheck = await resolveUserCredentials(supabase, user.id);

    const routeDiagnostics: SubAgentsDiagnostics = {
      viewerId: user.id,
      hasTexasCredentials: credCheck.hasCredentials,
      texasUsernameMasked: maskTexasUsername(
        creds.texas_username ?? creds.username
      ),
      viewerTexasAffiliateId: viewerAffiliateId ?? creds.texas_affiliate_id ?? null,
      texasRowsTotal: texasPayload.agents.length,
      texasChildrenInPortal: texasLive.allChildrenRecords.length,
      linkableForDb: linkableRefs.length,
      linkResult: linkResult as unknown as Record<string, unknown>,
      dbDirectChildrenRaw: dbChildrenRaw.length,
      excludedViewerSelf,
      afterSelfFilter: dbChildren.length,
      directChildrenReturned: enrichedAgents.length,
      matchedEnriched: mergeDiagnostics.matchedEnriched,
      stubCount: mergeDiagnostics.stubCount,
      droppedTexasRows: mergeDiagnostics.droppedTexasRows,
      emptyReason: null,
    };

    const emptyReason = resolveSubAgentsEmptyReason({
      texasRowsTotal: routeDiagnostics.texasRowsTotal,
      texasChildrenInPortal: routeDiagnostics.texasChildrenInPortal,
      linkableForDb: routeDiagnostics.linkableForDb,
      linkCreated: linkResult.created,
      linkSkipped: linkResult.skipped,
      dbDirectChildrenRaw: routeDiagnostics.dbDirectChildrenRaw,
      excludedViewerSelf: routeDiagnostics.excludedViewerSelf,
      afterSelfFilter: routeDiagnostics.afterSelfFilter,
      directChildrenReturned: routeDiagnostics.directChildrenReturned,
      matchedEnriched: routeDiagnostics.matchedEnriched,
      stubCount: routeDiagnostics.stubCount,
      droppedTexasRows: routeDiagnostics.droppedTexasRows,
    });

    routeDiagnostics.emptyReason = emptyReason;

    console.info("[sub-agents] visibility merge", {
      viewerId: user.id,
      ledgerDate,
      directChildrenReturned: enrichedAgents.length,
      agentRowsWithMtdMetrics,
      whatsappGroupStatusCount,
      commissionStatusCount,
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
      dbDirectChildrenRaw: dbChildrenRaw.length,
      excludedViewerSelf,
      afterSelfFilter: dbChildren.length,
      matchedEnriched: routeDiagnostics.matchedEnriched,
      stubCount: routeDiagnostics.stubCount,
      droppedTexasRows: routeDiagnostics.droppedTexasRows,
      emptyReason,
      whatsappDbDirectChildren: whatsappSchedule.dbDirectChildren,
      whatsappActiveGroupMappings: whatsappSchedule.activeGroupMappings,
      whatsappMissingGroupTargets: whatsappSchedule.missingGroupTargets,
      scheduledGroupSpawn: whatsappSchedule.scheduled
        ? whatsappSchedule.scheduledCount
        : 0,
      whatsappSkipReason: whatsappSchedule.skipReason,
      whatsappEnvOk: whatsappSchedule.env.ok,
      whatsappMigrationsOk: migrationProbe.ok,
    });

    console.info("[sub-agents] per-child audit", {
      viewerId: user.id,
      rows: audit,
    });

    if (emptyReason) {
      const message = messageForSubAgentsEmptyReason(emptyReason);
      console.warn("[sub-agents] empty list blocked — returning diagnostic error", {
        viewerId: user.id,
        emptyReason,
        diagnostics: routeDiagnostics,
      });
      return texasJsonResponse(
        {
          error: message,
          empty_reason: emptyReason,
          diagnostics: routeDiagnostics,
        },
        422
      );
    }

    const payload: TexasSubAgentsPayload = {
      ledger_date: ledgerDate,
      fetched_at: texasPayload.fetched_at,
      agents: enrichedAgents,
      stats,
      diagnostics: routeDiagnostics,
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
