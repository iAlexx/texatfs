/**
 * Schedule WhatsApp group creation for direct children missing an active group mapping.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { createLogger } from "@/lib/observability/logger";
import { normalizeAffiliateId } from "@/lib/texas/sub-agents-direct-merge";
import type { DirectChildDbRow } from "@/lib/texas/sub-agents-direct-merge";
import {
  scheduleGroupSpawnJob,
  type GroupSpawnTarget,
} from "@/lib/whatsapp/group-spawn-job";

const log = createLogger("whatsapp/schedule-missing-groups");

export const WHATSAPP_AUTO_SKIP_NO_PHONE =
  "WhatsApp auto group skipped: parent whatsapp_phone missing";

export interface WhatsAppEnvStatus {
  ok: boolean;
  tokenConfigured: boolean;
  baseUrl: string;
  missing: string[];
}

export function checkWhatsAppEnv(): WhatsAppEnvStatus {
  const missing: string[] = [];
  const tokenConfigured = Boolean(process.env.WHATSAPP_API_TOKEN?.trim());
  if (!tokenConfigured) {
    missing.push("WHATSAPP_API_TOKEN");
  }
  const baseUrl =
    process.env.WHATSAPP_API_URL?.trim() || "https://api.wasenderapi.com";
  return {
    ok: missing.length === 0,
    tokenConfigured,
    baseUrl,
    missing,
  };
}

export interface MissingGroupTargetsResult {
  dbDirectChildren: number;
  activeGroupMappings: number;
  missingGroupTargets: GroupSpawnTarget[];
  mappingAffiliateIds: string[];
}

/** Pure helper for tests and collectMissingGroupTargets. */
export function computeMissingGroupTargets(
  dbChildren: DirectChildDbRow[],
  activeAffiliateIds: Set<string>
): GroupSpawnTarget[] {
  const missingGroupTargets: GroupSpawnTarget[] = [];

  for (const child of dbChildren) {
    const affiliateId = normalizeAffiliateId(child.texas_affiliate_id);
    if (!affiliateId) continue;
    if (activeAffiliateIds.has(affiliateId)) continue;

    missingGroupTargets.push({
      affiliateId,
      displayName: resolveChildDisplayName(child),
      username: child.texas_username ?? null,
    });
  }

  return missingGroupTargets;
}

function resolveChildDisplayName(child: DirectChildDbRow): string {
  return (
    child.display_name?.trim() ||
    child.texas_username?.trim() ||
    normalizeAffiliateId(child.texas_affiliate_id) ||
    child.id.slice(0, 8)
  );
}

function isRealGroupId(groupId: string): boolean {
  return Boolean(groupId) && !groupId.startsWith("pending:");
}

/**
 * Direct children with texas_affiliate_id that lack an active, real WhatsApp group mapping.
 */
export async function collectMissingGroupTargets(
  supabase: SupabaseClient,
  parentUserId: string,
  dbChildren: DirectChildDbRow[]
): Promise<MissingGroupTargetsResult> {
  const { data: mappingRows, error } = await supabase
    .from("whatsapp_agent_groups")
    .select("affiliate_id, group_id, is_active")
    .eq("user_id", parentUserId);

  if (error) throw error;

  const activeAffiliateIds = new Set<string>();
  for (const row of mappingRows ?? []) {
    const aid = normalizeAffiliateId(String(row.affiliate_id));
    if (!aid) continue;
    if (row.is_active && isRealGroupId(String(row.group_id))) {
      activeAffiliateIds.add(aid);
    }
  }

  const missingGroupTargets = computeMissingGroupTargets(
    dbChildren,
    activeAffiliateIds
  );

  return {
    dbDirectChildren: dbChildren.length,
    activeGroupMappings: activeAffiliateIds.size,
    missingGroupTargets,
    mappingAffiliateIds: Array.from(activeAffiliateIds),
  };
}

export interface ScheduleMissingGroupsResult {
  scheduled: boolean;
  scheduledCount: number;
  skipReason: string | null;
  env: WhatsAppEnvStatus;
  dbDirectChildren: number;
  activeGroupMappings: number;
  missingGroupTargets: number;
}

/**
 * Idempotent: schedules spawn only for children without active group mapping.
 */
export function scheduleMissingGroupsForParent(
  supabase: SupabaseClient,
  parentUserId: string,
  masterPhoneDigits: string | null | undefined,
  dbChildren: DirectChildDbRow[],
  logScope = "whatsapp/schedule-missing-groups"
): Promise<ScheduleMissingGroupsResult> {
  return collectMissingGroupTargets(supabase, parentUserId, dbChildren).then(
    (collected) => {
      const env = checkWhatsAppEnv();

      const baseLog = {
        scope: logScope,
        parentUserId,
        dbDirectChildren: collected.dbDirectChildren,
        activeGroupMappings: collected.activeGroupMappings,
        missingGroupTargets: collected.missingGroupTargets.length,
        missingAffiliateIds: collected.missingGroupTargets.map(
          (t) => t.affiliateId
        ),
        envOk: env.ok,
        envMissing: env.missing,
      };

      if (!collected.missingGroupTargets.length) {
        log.info("no missing WhatsApp group targets", baseLog);
        return {
          scheduled: false,
          scheduledCount: 0,
          skipReason: null,
          env,
          dbDirectChildren: collected.dbDirectChildren,
          activeGroupMappings: collected.activeGroupMappings,
          missingGroupTargets: 0,
        };
      }

      if (!env.ok) {
        log.warn("WhatsApp auto group skipped: env not configured", {
          ...baseLog,
          skipReason: `missing env: ${env.missing.join(", ")}`,
        });
        return {
          scheduled: false,
          scheduledCount: 0,
          skipReason: `missing env: ${env.missing.join(", ")}`,
          env,
          dbDirectChildren: collected.dbDirectChildren,
          activeGroupMappings: collected.activeGroupMappings,
          missingGroupTargets: collected.missingGroupTargets.length,
        };
      }

      if (!masterPhoneDigits?.trim()) {
        log.warn(WHATSAPP_AUTO_SKIP_NO_PHONE, baseLog);
        return {
          scheduled: false,
          scheduledCount: 0,
          skipReason: WHATSAPP_AUTO_SKIP_NO_PHONE,
          env,
          dbDirectChildren: collected.dbDirectChildren,
          activeGroupMappings: collected.activeGroupMappings,
          missingGroupTargets: collected.missingGroupTargets.length,
        };
      }

      log.info("scheduling group spawn for missing targets", {
        ...baseLog,
        scheduledGroupSpawn: collected.missingGroupTargets.length,
      });

      scheduleGroupSpawnJob(
        supabase,
        parentUserId,
        masterPhoneDigits.trim(),
        collected.missingGroupTargets
      );

      return {
        scheduled: true,
        scheduledCount: collected.missingGroupTargets.length,
        skipReason: null,
        env,
        dbDirectChildren: collected.dbDirectChildren,
        activeGroupMappings: collected.activeGroupMappings,
        missingGroupTargets: collected.missingGroupTargets.length,
      };
    }
  );
}

export async function probeWhatsAppMigrations(
  supabase: SupabaseClient
): Promise<{ ok: boolean; errors: string[] }> {
  const errors: string[] = [];

  const groupsProbe = await supabase
    .from("whatsapp_agent_groups")
    .select("created_by_bot")
    .limit(1);
  if (groupsProbe.error) {
    errors.push(`whatsapp_agent_groups.created_by_bot: ${groupsProbe.error.message}`);
  }

  const dispatchProbe = await supabase
    .from("whatsapp_ledger_dispatch_log")
    .select("id")
    .limit(1);
  if (dispatchProbe.error) {
    errors.push(
      `whatsapp_ledger_dispatch_log: ${dispatchProbe.error.message}`
    );
  }

  return { ok: errors.length === 0, errors };
}
