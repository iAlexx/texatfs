/**
 * Forum Manager — one-time setup when the bot is added to a Topics-enabled supergroup.
 *
 * Flow:
 *  1. Upsert the group record in telegram_tracking_groups
 *  2. Authenticate with Texas API using the master's stored credentials
 *  3. Fetch direct sub-agents via getChildren
 *  4. Create one Forum Topic per sub-agent (idempotent via DB upsert)
 *  5. Post an activation summary to the General topic (thread_id = 1)
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createForumTopic,
  sendMessageToTopic,
} from "@/lib/telegram/bot-api";
import {
  upsertTrackingGroup,
  saveAgentTopic,
  markTopicsCreated,
  getAgentTopics,
} from "@/lib/telegram/tracking-groups";
import { TexasSessionService } from "@/lib/services/TexasSessionService";
import { resolveUserCredentials } from "@/lib/scraper/resolve-user-credentials";
import { fetchAllTexasChildren } from "@/lib/texas/fetch-texas-children";

const GENERAL_TOPIC_THREAD_ID = 1; // Telegram: "General" topic always has thread_id = 1

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Called once when the bot receives my_chat_member with administrator status
 * in a forum supergroup.
 *
 * This function is designed to be fire-and-forget from the webhook handler;
 * it logs errors but does not rethrow.
 */
export async function initTrackingGroup(
  supabase: SupabaseClient,
  userId: string,
  chatId: number,
  chatTitle: string
): Promise<void> {
  console.info("[forum-manager] initTrackingGroup start", { userId, chatId, chatTitle });

  // 1. Upsert the group record
  const group = await upsertTrackingGroup(supabase, userId, chatId, chatTitle);

  // 2. Get existing topics to avoid duplicate creation
  const existingTopics = await getAgentTopics(supabase, group.id);

  // 3. Authenticate with Texas API
  const creds = await resolveUserCredentials(supabase, userId);
  if (!creds.hasCredentials) {
    console.warn("[forum-manager] no Texas credentials for user", userId);
    await sendMessageToTopic(
      chatId,
      GENERAL_TOPIC_THREAD_ID,
      "⚠️ <b>تحذير:</b> لم يتم ربط حساب Texas بعد.\nيرجى ربط حساب Texas من تطبيق Texas Funds أولاً.",
      { parse_mode: "HTML" }
    ).catch(() => undefined);
    return;
  }

  const session = new TexasSessionService();
  const token = await session.signIn({
    username: creds.username,
    password: creds.password,
  });
  const client = session.getClientFromToken(token);

  // 4. Fetch sub-agents
  const { records: children } = await fetchAllTexasChildren(client);
  if (!children.length) {
    console.info("[forum-manager] no sub-agents found for user", userId);
    await sendMessageToTopic(
      chatId,
      GENERAL_TOPIC_THREAD_ID,
      "ℹ️ لا يوجد وكلاء فرعيون مرتبطون بحسابك على Texas حالياً.",
      { parse_mode: "HTML" }
    ).catch(() => undefined);
    return;
  }

  // 5. Create one topic per sub-agent (skip if already exists)
  let created = 0;
  let skipped = 0;

  for (const child of children) {
    const affiliateId = String(child.affiliateId);
    if (existingTopics.has(affiliateId)) {
      skipped += 1;
      continue;
    }

    const label =
      (child.username as string | undefined)?.trim() ||
      (child.email as string | undefined)?.trim() ||
      affiliateId;

    try {
      const topic = await createForumTopic(chatId, label);
      await saveAgentTopic(supabase, group.id, affiliateId, label, topic.message_thread_id);
      created += 1;
      // Small delay to avoid hitting Telegram rate limits (30 req/s for groups)
      await sleep(350);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // Privacy restriction or permissions issue — log and continue
      if (msg.includes("TOPIC_LIMIT") || msg.includes("FORUM_DISABLED")) {
        console.error("[forum-manager] fatal topic error", msg);
        break;
      }
      console.warn("[forum-manager] topic create failed for", affiliateId, msg);
    }
  }

  await markTopicsCreated(supabase, group.id);

  console.info("[forum-manager] topics done", { created, skipped, total: children.length });

  // 6. Post activation summary to General topic
  const summaryLines = [
    "✅ <b>تم تفعيل نظام التتبع عبر تلغرام</b>",
    "",
    `📊 تم إنشاء <b>${created}</b> موضوع للوكلاء الفرعيين`,
    skipped > 0 ? `♻️ <b>${skipped}</b> موضوع موجود مسبقاً` : "",
    "",
    "🕓 سيُرسل التقرير اليومي الساعة <b>4:00 صباحاً</b> (دمشق) لكل وكيل في موضوعه الخاص.",
    "💰 اكتب <code>💰 500</code> لتسجيل كاش وصل منك",
    "📤 اكتب <code>📤 250</code> لتسجيل كاش واصل إليك",
  ]
    .filter(Boolean)
    .join("\n");

  await sendMessageToTopic(chatId, GENERAL_TOPIC_THREAD_ID, summaryLines, {
    parse_mode: "HTML",
  }).catch((e) => {
    console.warn("[forum-manager] failed to send activation summary:", e instanceof Error ? e.message : e);
  });
}
