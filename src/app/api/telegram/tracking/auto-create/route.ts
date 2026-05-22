import { NextResponse } from "next/server";
import { resolveLedgerUser, LedgerAuthError } from "@/lib/ledger/resolve-user";
import type { LedgerAuthInput } from "@/lib/ledger/types";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import {
  autoCreateTelegramTrackerGroup,
  UserbotError,
} from "@/lib/telegram/userbot-client";
import { upsertTrackingGroup } from "@/lib/telegram/tracking-groups";
import { initTrackingGroup } from "@/lib/telegram/forum-manager";
import {
  createForumTopic,
  sendMessageToTopic,
  sendTelegramMessage,
} from "@/lib/telegram/bot-api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
/**
 * maxDuration covers the 4 gramjs steps (~2–8 s) + Commands topic creation
 * + DM dispatch. Topic creation per sub-agent runs fire-and-forget in the
 * background so it does NOT count against this limit.
 */
export const maxDuration = 30;

// ── Private link helper ───────────────────────────────────────────────────────

/**
 * Converts a Bot API chat_id (-1001234567890) to a t.me/c/ invite link.
 * Works for private supergroups created via the userbot.
 */
function toGroupLink(chatId: number): string {
  // Remove the leading -100 prefix to get the bare channel ID
  const bare = String(Math.abs(chatId)).substring(3);
  return `https://t.me/c/${bare}`;
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  let chatId: number | undefined;
  let chatTitle: string | undefined;

  try {
    const body = (await request.json()) as LedgerAuthInput;
    const { user } = await resolveLedgerUser(body);

    const masterName =
      user.display_name?.trim() || user.texas_username?.trim() || "Master";

    // ── 1. Run the 4-step automated group setup via userbot ─────────────────
    const result = await autoCreateTelegramTrackerGroup(user.id, masterName);
    chatId = result.chatId;
    chatTitle = result.chatTitle;

    const supabase = getSupabaseServiceClient();

    // ── 2. Persist the group record ─────────────────────────────────────────
    const group = await upsertTrackingGroup(
      supabase,
      user.id,
      chatId,
      chatTitle
    );

    // ── 3. Create the "Commands" (أوامر) topic via Bot API ──────────────────
    // The bot is now an admin — it can create topics immediately.
    let commandsTopicId: number | null = null;
    try {
      const cmdTopic = await createForumTopic(chatId, "⚙️ أوامر البوت");
      commandsTopicId = cmdTopic.message_thread_id;

      // Pin a welcome message in the Commands topic
      await sendMessageToTopic(
        chatId,
        commandsTopicId,
        [
          "👑 <b>مرحباً بك في لوحة تحكم Texas Funds</b>",
          "",
          "📌 <b>هذا الموضوع مخصص للتواصل مع البوت وإدارة النظام.</b>",
          "",
          "💰 اكتب <code>💰 500</code> في موضوع أي وكيل لتسجيل كاش وصل منه",
          "📤 اكتب <code>📤 250</code> في موضوع أي وكيل لتسجيل كاش واصل إليه",
          "📊 سيُرسل التقرير اليومي الساعة <b>4:00 صباحاً</b> (دمشق) في كل موضوع تلقائياً",
          "",
          "⏳ <i>جاري إنشاء مواضيع الوكلاء الفرعيين في الخلفية…</i>",
        ].join("\n"),
        { parse_mode: "HTML" }
      );
    } catch (topicErr) {
      // Non-fatal — topic creation may fail if the bot has a slight delay
      // in receiving admin rights. initTrackingGroup will retry topic creation.
      console.warn(
        "[auto-create] Commands topic creation failed (non-fatal):",
        topicErr instanceof Error ? topicErr.message : String(topicErr)
      );
    }

    // ── 4. Notify the master's private DM with the group link ───────────────
    if (user.telegram_id) {
      const groupLink = toGroupLink(chatId);
      void sendTelegramMessage(
        user.telegram_id,
        [
          `🎉 <b>تم إنشاء مجموعة التتبع بنجاح!</b>`,
          "",
          `📌 <b>المجموعة:</b> ${chatTitle}`,
          `🔗 <a href="${groupLink}">فتح المجموعة</a>`,
          "",
          "⏳ <i>جاري إنشاء موضوع خاص لكل وكيل فرعي… ستصلك رسالة تأكيد في المجموعة خلال دقيقتين.</i>",
        ].join("\n"),
        { parse_mode: "HTML" }
      ).catch((e) =>
        console.warn(
          "[auto-create] DM to master failed (non-fatal):",
          e instanceof Error ? e.message : String(e)
        )
      );
    }

    // ── 5. Fire-and-forget: create per-agent topics in the background ───────
    // initTrackingGroup uses Puppeteer (Texas sign-in) and may take 60–120 s.
    // Railway keeps the Node process alive after the response, so this WILL
    // complete — it is not orphaned. The Commands topic welcome message above
    // already informs the user that creation is in progress.
    void initTrackingGroup(supabase, user.id, chatId, chatTitle).catch((e) => {
      console.error(
        "[auto-create] initTrackingGroup error:",
        e instanceof Error ? e.message : String(e)
      );
    });

    return NextResponse.json({
      success: true,
      chatId,
      chatTitle,
      groupId: group.id,
      commandsTopicId,
      groupLink: toGroupLink(chatId),
    });
  } catch (err) {
    if (err instanceof LedgerAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }

    if (err instanceof UserbotError) {
      const status =
        err.code === "not_configured"
          ? 503
          : err.code === "flood_wait"
          ? 429
          : 500;

      return NextResponse.json(
        {
          error: err.message,
          code: err.code,
          retryAfterSeconds: err.retryAfterSeconds,
          fallback: true,
        },
        { status }
      );
    }

    const msg = err instanceof Error ? err.message : "Server error";
    console.error("[auto-create] unexpected error:", msg);
    return NextResponse.json({ error: msg, fallback: true }, { status: 500 });
  }
}
