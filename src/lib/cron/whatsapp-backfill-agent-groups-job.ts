import { createLogger } from "@/lib/observability/logger";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import {
  checkWhatsAppEnv,
  probeWhatsAppMigrations,
  scheduleMissingGroupsForParent,
} from "@/lib/whatsapp/schedule-missing-groups";
import type { DirectChildDbRow } from "@/lib/texas/sub-agents-direct-merge";

const log = createLogger("cron/whatsapp-backfill-agent-groups");

export async function runWhatsAppBackfillAgentGroupsJob(): Promise<{
  env: ReturnType<typeof checkWhatsAppEnv>;
  migrations: Awaited<ReturnType<typeof probeWhatsAppMigrations>>;
  mastersChecked: number;
  mastersWithPhone: number;
  totalMissingTargets: number;
  totalScheduled: number;
  perMaster: Array<{
    masterUserId: string;
    dbDirectChildren: number;
    activeGroupMappings: number;
    missingGroupTargets: number;
    scheduled: boolean;
    skipReason: string | null;
  }>;
}> {
  const supabase = getSupabaseServiceClient();
  const env = checkWhatsAppEnv();
  const migrations = await probeWhatsAppMigrations(supabase);

  if (!env.ok) {
    log.warn("backfill aborted: WhatsApp env missing", { missing: env.missing });
  }

  if (!migrations.ok) {
    log.warn("backfill: migration probe failed", { errors: migrations.errors });
  }

  const { data: masters, error } = await supabase
    .from("users")
    .select("id, whatsapp_phone, role")
    .not("whatsapp_phone", "is", null)
    .eq("is_active", true);

  if (error) throw error;

  const perMaster: Array<{
    masterUserId: string;
    dbDirectChildren: number;
    activeGroupMappings: number;
    missingGroupTargets: number;
    scheduled: boolean;
    skipReason: string | null;
  }> = [];

  let totalMissingTargets = 0;
  let totalScheduled = 0;
  let mastersWithPhone = 0;

  for (const master of masters ?? []) {
    const masterId = String(master.id);
    const phone = master.whatsapp_phone as string | null;
    if (!phone?.trim()) continue;
    mastersWithPhone += 1;

    const { data: children, error: childErr } = await supabase
      .from("users")
      .select("id, texas_affiliate_id, display_name, texas_username, role, is_active")
      .eq("parent_id", masterId)
      .eq("is_active", true);

    if (childErr) {
      log.error("failed to load direct children", {
        masterUserId: masterId,
        error: childErr.message,
      });
      continue;
    }

    const dbChildren = (children ?? []) as DirectChildDbRow[];

    const result = await scheduleMissingGroupsForParent(
      supabase,
      masterId,
      phone,
      dbChildren,
      "cron/whatsapp-backfill-agent-groups"
    );

    totalMissingTargets += result.missingGroupTargets;
    if (result.scheduled) {
      totalScheduled += result.scheduledCount;
    }

    perMaster.push({
      masterUserId: masterId,
      dbDirectChildren: result.dbDirectChildren,
      activeGroupMappings: result.activeGroupMappings,
      missingGroupTargets: result.missingGroupTargets,
      scheduled: result.scheduled,
      skipReason: result.skipReason,
    });

    log.info("backfill master processed", {
      masterUserId: masterId,
      dbDirectChildren: result.dbDirectChildren,
      activeGroupMappings: result.activeGroupMappings,
      missingGroupTargets: result.missingGroupTargets,
      scheduled: result.scheduled,
      skipReason: result.skipReason,
    });
  }

  log.info("backfill complete", {
    mastersChecked: (masters ?? []).length,
    mastersWithPhone,
    totalMissingTargets,
    totalScheduled,
  });

  return {
    env,
    migrations,
    mastersChecked: (masters ?? []).length,
    mastersWithPhone,
    totalMissingTargets,
    totalScheduled,
    perMaster,
  };
}
