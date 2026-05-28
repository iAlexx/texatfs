/**
 * Safe sequential WhatsApp group creation for all Texas sub-agents.
 * 15-second delay between each group to reduce ban risk.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { createLogger } from "@/lib/observability/logger";
import { sendWhatsAppMessage } from "@/lib/whatsapp/client";
import { resolveGroupSpawnDelayMs } from "@/lib/whatsapp/rate-limiter";
import {
  createWhatsAppGroup,
  getWhatsAppGroupInviteLink,
  promoteWhatsAppGroupParticipants,
} from "@/lib/whatsapp/groups-api";
import { upsertAgentGroup } from "@/lib/whatsapp/agent-groups";
import { phoneToWhatsAppJid } from "@/lib/whatsapp/phone";
import { fetchTexasChildrenSafe } from "@/lib/whatsapp/texas-children-fetch";
import type { TexasChildRecord } from "@/lib/texas/types";

const log = createLogger("whatsapp/group-spawner");

export const GROUP_SPAWN_DELAY_MS = 15_000; // fallback; prefer resolveGroupSpawnDelayMs()
export const BOT_GROUP_PREFIX = "⚜️ ";
const PENDING_GROUP_ID_PREFIX = "pending:";

export function buildBotGroupName(agentDisplayName: string): string {
  return `${BOT_GROUP_PREFIX}${agentDisplayName}`;
}

export type GroupSpawnDecision =
  | { kind: "skip-active" }
  | { kind: "skip-inprogress" }
  | { kind: "activate-existing" }
  | { kind: "create-new" };

export function decideGroupSpawnAction(existing: null | { is_active: boolean; group_id: string } | undefined): GroupSpawnDecision {
  if (!existing) return { kind: "create-new" };
  if (existing.is_active) return { kind: "skip-active" };
  if (existing.group_id?.startsWith(PENDING_GROUP_ID_PREFIX)) {
    return { kind: "skip-inprogress" };
  }
  return { kind: "activate-existing" };
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function resolveAgentLabel(child: TexasChildRecord): string {
  return (
    (child.email as string | undefined)?.trim() ||
    (child.username as string | undefined)?.trim() ||
    String(child.affiliateId)
  );
}

function resolveAgentEmail(child: TexasChildRecord): string {
  const email = (child.email as string | undefined)?.trim();
  if (email) return email;
  const user = (child.username as string | undefined)?.trim();
  if (user) return user;
  return `agent-${child.affiliateId}@texas.local`;
}

/**
 * Creates one WhatsApp group per sub-agent (sequential, 15s apart).
 * Each group name follows: "Texas | {email}" pattern.
 * Sends a summary DM to the master when finished.
 */
export async function spawnAgentGroupsForMaster(
  supabase: SupabaseClient,
  userId: string,
  masterPhoneDigits: string,
  targets?: Array<{
    affiliateId: string;
    displayName: string;
    username?: string | null;
  }>
): Promise<{ created: number; skipped: number; failed: number }> {
  const stats = { created: 0, skipped: 0, failed: 0 };
  const masterJid = phoneToWhatsAppJid(masterPhoneDigits);

  let children: TexasChildRecord[] = [];
  if (targets?.length) {
    // Build a minimal "children-like" list from explicit targets.
    children = targets.map((t) => ({
      affiliateId: t.affiliateId,
      username: t.username ?? null,
      email: null,
      // The Texas API shape includes many fields; only affiliateId/username are needed here.
      role: "agent",
      parent: null,
      balance: 0,
      mainCurrency: "NSP",
    })) as unknown as TexasChildRecord[];
    log.info("spawning groups for explicit targets", {
      userId,
      targets: targets.map((t) => `${t.affiliateId}:${t.displayName}`).join(", "),
    });
  } else {
    log.info("fetching Texas children", { userId });
    const texasFetch = await fetchTexasChildrenSafe(supabase, userId);
    children = texasFetch.records;

    if (!texasFetch.ok) {
      log.error("Texas children fetch failed", { userId });
      await sendWhatsAppMessage(
        masterJid,
        "⚠️ تعذّر جلب قائمة الوكلاء من تكساس. يرجى التأكد من ربط حساب Texas ثم إعادة المحاولة من الدعم."
      ).catch(() => undefined);
      return stats;
    }
  }

  if (!children.length) {
    log.info("no Texas children found", { userId });
    await sendWhatsAppMessage(
      masterJid,
      "ℹ️ لا يوجد وكلاء فرعيون على حسابك في تكساس حالياً."
    ).catch(() => undefined);
    return stats;
  }

  log.info("children loaded", {
    userId,
    childrenCount: children.length,
    children: children.map((c) => resolveAgentLabel(c)).join(", "),
  });

  const affiliateIds = children.map((c) => String(c.affiliateId));

  const { data: existingRows } = await supabase
    .from("whatsapp_agent_groups")
    .select("affiliate_id,is_active,group_id")
    .eq("user_id", userId)
    .in("affiliate_id", affiliateIds);

  const existingByAffiliate = new Map<
    string,
    { is_active: boolean; group_id: string }
  >(
    (existingRows ?? []).map((r) => [
      String(r.affiliate_id),
      { is_active: Boolean(r.is_active), group_id: String(r.group_id) },
    ])
  );

  log.info("existing groups check", {
    userId,
    existingCount: existingByAffiliate.size,
    total: children.length,
    toCreate: children.filter(
      (c) => !existingByAffiliate.has(String(c.affiliateId))
    ).length,
  });

  const targetsList = targets?.length ? targets : undefined;

  const createdGroupsForMessage: Array<{ displayName: string; groupJid: string }> = [];

  for (let i = 0; i < children.length; i++) {
    const child = children[i]!;
    const affiliateId = String(child.affiliateId);

    const existing = existingByAffiliate.get(affiliateId);
    if (existing?.is_active) {
      stats.skipped += 1;
      log.info("group already active, skipping", {
        affiliateId,
        label: resolveAgentLabel(child),
      });
      if (i < children.length - 1) await sleep(resolveGroupSpawnDelayMs());
      continue;
    }

    const label = targetsList?.[i]?.displayName ?? resolveAgentLabel(child);
    const groupName = buildBotGroupName(label);
    const email =
      (child.username as string | undefined | null)?.trim() ||
      resolveAgentEmail(child);

    // Concurrency safety:
    // - If another job is already creating this group, we may have a row with
    //   is_active=false and a `pending:*` group_id. In that case we skip.
    // - If is_active=false but group_id already looks like a real WhatsApp jid,
    //   we can re-activate the mapping without creating a duplicate group.
    const pendingRowLooksLikeLock =
      existing?.group_id?.startsWith(PENDING_GROUP_ID_PREFIX);

    let placeholderGroupId: string | null = null;

    try {
      const needsCreate = !existing;

      // If we saw a placeholder "lock" row from another job — do nothing.
      if (existing && pendingRowLooksLikeLock) {
        stats.skipped += 1;
        log.info("placeholder in-progress, skipping create", {
          affiliateId,
          group_id: existing.group_id,
        });
        if (i < children.length - 1) await sleep(resolveGroupSpawnDelayMs());
        continue;
      }

      // If group_id exists but mapping inactive, just activate it (no create).
      if (existing && !pendingRowLooksLikeLock) {
        log.info("activating existing in-progress group_id", {
          affiliateId,
          group_id: existing.group_id,
          groupName,
        });

        let inviteLink = "";
        try {
          inviteLink = await getWhatsAppGroupInviteLink(existing.group_id);
        } catch {
          inviteLink = "";
        }

        await upsertAgentGroup(supabase, {
          userId,
          affiliateId,
          email,
          groupId: existing.group_id,
          groupName,
          inviteLink: inviteLink || null,
          createdByBot: true,
        });

        existingByAffiliate.set(affiliateId, {
          is_active: true,
          group_id: existing.group_id,
        });

        stats.created += 1;
        createdGroupsForMessage.push({
          displayName: label,
          groupJid: existing.group_id,
        });

        if (i < children.length - 1) await sleep(resolveGroupSpawnDelayMs());
        continue;
      }

      // Create placeholder row so concurrent job won't create duplicate group.
      // (We rely on UNIQUE(user_id,affiliate_id) to prevent races.)
      placeholderGroupId = `pending:${userId}:${affiliateId}:${Date.now()}`;
      if (needsCreate || (!existing && !existingByAffiliate.has(affiliateId))) {
        const { error: placeholderErr } = await supabase
          .from("whatsapp_agent_groups")
          .insert({
            user_id: userId,
            affiliate_id: affiliateId,
            email,
            group_id: placeholderGroupId,
            group_name: groupName,
            invite_link: null,
            is_active: false,
            created_by_bot: true,
          });

        if (placeholderErr) {
          // Another job won the race and inserted the row.
          log.info("placeholder insert conflict, skipping", {
            affiliateId,
            error: placeholderErr.message,
          });
          stats.skipped += 1;
          if (i < children.length - 1) await sleep(resolveGroupSpawnDelayMs());
          continue;
        }
      }

      log.info("creating group", { affiliateId, groupName, index: i + 1, total: children.length });

      const { groupJid } = await createWhatsAppGroup(groupName, [masterJid]);

      log.info("group created", { affiliateId, groupJid, groupName });

      try {
        await promoteWhatsAppGroupParticipants(groupJid, [masterJid]);
        log.info("master promoted to admin", { groupJid });
      } catch (promoteErr) {
        log.warn("promote failed (non-fatal)", {
          groupJid,
          error: promoteErr instanceof Error ? promoteErr.message : String(promoteErr),
        });
      }

      let inviteLink = "";
      try {
        inviteLink = await getWhatsAppGroupInviteLink(groupJid);
        log.info("invite link obtained", { groupJid, hasLink: !!inviteLink });
      } catch (linkErr) {
        log.warn("invite link failed (non-fatal)", {
          groupJid,
          error: linkErr instanceof Error ? linkErr.message : String(linkErr),
        });
      }

      try {
        await upsertAgentGroup(supabase, {
          userId,
          affiliateId,
          email,
          groupId: groupJid,
          groupName,
          inviteLink: inviteLink || null,
          createdByBot: true,
        });
      } catch (dbErr) {
        // If DB upsert fails after WhatsApp group exists, store group_id so
        // future runs can activate without creating duplicates.
        try {
          await supabase
            .from("whatsapp_agent_groups")
            .update({ group_id: groupJid, group_name: groupName })
            .eq("user_id", userId)
            .eq("affiliate_id", affiliateId)
            .eq("group_id", placeholderGroupId);
        } catch {
          // best-effort, ignore
        }
        throw dbErr;
      }

      existingByAffiliate.set(affiliateId, {
        is_active: true,
        group_id: groupJid,
      });

      stats.created += 1;
      log.info("group persisted to DB", { affiliateId, groupJid, groupName });

      if (targetsList?.length) {
        createdGroupsForMessage.push({
          displayName: label,
          groupJid,
        });
      }
    } catch (err) {
      stats.failed += 1;
      log.error("group create failed", {
        affiliateId,
        groupName,
        error: err instanceof Error ? err.message : String(err),
      });

      // If we failed before switching placeholder row to a real group_id,
      // remove the lock so a future retry can safely attempt again.
      // (If we already stored the real group_id, placeholderGroupId will
      // not match and we won't delete it.)
      if (typeof placeholderGroupId === "string") {
        try {
          await supabase
            .from("whatsapp_agent_groups")
            .delete()
            .eq("user_id", userId)
            .eq("affiliate_id", affiliateId)
            .eq("group_id", placeholderGroupId);
        } catch {
          // best-effort
        }
      }
    }

    if (i < children.length - 1) {
      await sleep(resolveGroupSpawnDelayMs());
    }
  }

  const summary = [
    "📊 *اكتمل إنشاء مجموعات التتبع*",
    "",
    `✅ تم إنشاء: *${stats.created}*`,
    stats.skipped > 0 ? `♻️ موجودة مسبقاً: *${stats.skipped}*` : "",
    stats.failed > 0 ? `⚠️ فشل: *${stats.failed}*` : "",
    "",
    "يمكنك الآن إضافة الكاشيرات عبر روابط المجموعات — أنت مشرف في كل مجموعة.",
  ]
    .filter(Boolean)
    .join("\n");

  if (targetsList?.length) {
    if (createdGroupsForMessage.length) {
      const dm = [
        `${createdGroupsForMessage.length} groups created for new agents`,
        ...createdGroupsForMessage.map(
          (g) => `- ${g.displayName}: ${g.groupJid}`
        ),
      ].join("\n");
      await sendWhatsAppMessage(masterJid, dm).catch(() => undefined);
    }
  } else {
    await sendWhatsAppMessage(masterJid, summary).catch(() => undefined);
  }

  log.info("spawn finished", {
    userId,
    created: stats.created,
    skipped: stats.skipped,
    failed: stats.failed,
  });

  return stats;
}
