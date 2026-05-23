/**
 * Safe sequential WhatsApp group creation for all Texas sub-agents.
 * 15-second delay between each group to reduce ban risk.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { sendWhatsAppMessage } from "@/lib/whatsapp/client";
import {
  createWhatsAppGroup,
  getWhatsAppGroupInviteLink,
  promoteWhatsAppGroupParticipants,
} from "@/lib/whatsapp/groups-api";
import { upsertAgentGroup } from "@/lib/whatsapp/agent-groups";
import { phoneToWhatsAppJid } from "@/lib/whatsapp/phone";
import { fetchTexasChildrenSafe } from "@/lib/whatsapp/texas-children-fetch";
import type { TexasChildRecord } from "@/lib/texas/types";

/** Compulsory anti-ban pacing between group creations. */
export const GROUP_SPAWN_DELAY_MS = 15_000;

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
 * Sends a summary DM to the master when finished.
 */
export async function spawnAgentGroupsForMaster(
  supabase: SupabaseClient,
  userId: string,
  masterPhoneDigits: string
): Promise<{ created: number; skipped: number; failed: number }> {
  const stats = { created: 0, skipped: 0, failed: 0 };
  const masterJid = phoneToWhatsAppJid(masterPhoneDigits);

  const texasFetch = await fetchTexasChildrenSafe(supabase, userId);
  const children: TexasChildRecord[] = texasFetch.records;

  if (!texasFetch.ok) {
    await sendWhatsAppMessage(
      masterJid,
      "⚠️ تعذّر جلب قائمة الوكلاء من تكساس. يرجى التأكد من ربط حساب Texas ثم إعادة المحاولة من الدعم."
    ).catch(() => undefined);
    return stats;
  }

  if (!children.length) {
    await sendWhatsAppMessage(
      masterJid,
      "ℹ️ لا يوجد وكلاء فرعيون على حسابك في تكساس حالياً."
    ).catch(() => undefined);
    return stats;
  }

  const { data: existingRows } = await supabase
    .from("whatsapp_agent_groups")
    .select("affiliate_id")
    .eq("user_id", userId)
    .eq("is_active", true);

  const existingAffiliates = new Set(
    (existingRows ?? []).map((r) => String(r.affiliate_id))
  );

  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    const affiliateId = String(child.affiliateId);

    if (existingAffiliates.has(affiliateId)) {
      stats.skipped += 1;
      if (i < children.length - 1) await sleep(GROUP_SPAWN_DELAY_MS);
      continue;
    }

    const groupName = resolveAgentLabel(child);
    const email = resolveAgentEmail(child);

    try {
      const { groupJid } = await createWhatsAppGroup(groupName, [masterJid]);

      try {
        await promoteWhatsAppGroupParticipants(groupJid, [masterJid]);
      } catch (promoteErr) {
        console.warn(
          "[group-spawner] promote failed (non-fatal):",
          promoteErr instanceof Error ? promoteErr.message : promoteErr
        );
      }

      let inviteLink = "";
      try {
        inviteLink = await getWhatsAppGroupInviteLink(groupJid);
      } catch (linkErr) {
        console.warn(
          "[group-spawner] invite link failed (non-fatal):",
          linkErr instanceof Error ? linkErr.message : linkErr
        );
      }

      await upsertAgentGroup(supabase, {
        userId,
        affiliateId,
        email,
        groupId: groupJid,
        groupName,
        inviteLink: inviteLink || null,
      });

      existingAffiliates.add(affiliateId);
      stats.created += 1;
      console.info("[group-spawner] group created", { groupName, groupJid });
    } catch (err) {
      stats.failed += 1;
      console.error(
        "[group-spawner] group create failed for",
        affiliateId,
        err instanceof Error ? err.message : String(err)
      );
    }

    if (i < children.length - 1) {
      await sleep(GROUP_SPAWN_DELAY_MS);
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

  await sendWhatsAppMessage(masterJid, summary).catch(() => undefined);

  return stats;
}
