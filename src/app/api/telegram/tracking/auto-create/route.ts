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
export const maxDuration = 30;

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as LedgerAuthInput;
    const { user } = await resolveLedgerUser(body);

    const masterName =
      user.display_name?.trim() || user.texas_username?.trim() || "Master";

    // ── 1. 4-step automated group setup via userbot ─────────────────────────
    const { chatId, chatTitle, inviteLink } =
      await autoCreateTelegramTrackerGroup(user.id, masterName);

    const supabase = getSupabaseServiceClient();

    // ── 2. Persist group record (include invite link) ───────────────────────
    const group = await upsertTrackingGroup(
      supabase,
      user.id,
      chatId,
      chatTitle,
      inviteLink || undefined
    );

    // ── 3. Create "⚙️ أوامر البوت" topic + send rich welcome message ────────
    let commandsTopicId: number | null = null;
    try {
      const cmdTopic = await createForumTopic(chatId, "⚙️ أوامر البوت");
      commandsTopicId = cmdTopic.message_thread_id;

      const welcomeLines = [
        "👑 <b>مرحباً بك في Texas Funds — نظام التتبع عبر تلغرام</b>",
        "",
        "━━━━━━━━━━━━━━━━━━━━━━",
        "📋 <b>كيف يعمل النظام؟</b>",
        "━━━━━━━━━━━━━━━━━━━━━━",
        "",
        "سيتم إنشاء <b>موضوع (Topic) مستقل</b> لكل وكيل فرعي في هذه المجموعة.",
        "كل موضوع يحمل اسم بريد الوكيل، على سبيل المثال:",
        "<code>agent.demo@texas.com</code>",
        "",
        "━━━━━━━━━━━━━━━━━━━━━━",
        "💸 <b>تسجيل المعاملات النقدية</b>",
        "━━━━━━━━━━━━━━━━━━━━━━",
        "",
        "اكتب الأمر في موضوع الوكيل المعني مباشرةً:",
        "",
        "✅ <b>واصل منك</b> — أنت أرسلت مبلغاً للوكيل",
        "   مثال: <code>✅90000</code>",
        "",
        "🛑 <b>واصل الك</b> — الوكيل أرسل لك مبلغاً",
        "   مثال: <code>🛑45000</code>",
        "",
        "سيطلب منك البوت تأكيد كل عملية قبل حفظها.",
        "",
        "━━━━━━━━━━━━━━━━━━━━━━",
        "📊 <b>التقرير اليومي</b>",
        "━━━━━━━━━━━━━━━━━━━━━━",
        "",
        "كل يوم في الساعة <b>4:00 صباحاً</b> (توقيت دمشق)",
        "يُرسل البوت تقريراً مالياً مفصّلاً لكل وكيل في موضوعه.",
        "",
        "━━━━━━━━━━━━━━━━━━━━━━",
        "⏳ <i>جاري الآن: إنشاء مواضيع الوكلاء الفرعيين…",
        "ستصلك رسالة تأكيد هنا فور الانتهاء.</i>",
      ].join("\n");

      await sendMessageToTopic(chatId, commandsTopicId, welcomeLines, {
        parse_mode: "HTML",
      });
    } catch (topicErr) {
      console.warn(
        "[auto-create] Commands topic creation failed (non-fatal):",
        topicErr instanceof Error ? topicErr.message : String(topicErr)
      );
    }

    // ── 4. Send DM to master with the real invite link ──────────────────────
    if (user.telegram_id) {
      const linkLine = inviteLink
        ? `🔗 <a href="${inviteLink}">رابط الانضمام للمجموعة</a>`
        : `📌 المجموعة: ${chatTitle}`;

      void sendTelegramMessage(
        user.telegram_id,
        [
          `🎉 <b>تم إنشاء مجموعة التتبع بنجاح!</b>`,
          "",
          `📌 الاسم: <b>${chatTitle}</b>`,
          linkLine,
          "",
          "⏳ <i>جاري إنشاء موضوع لكل وكيل فرعي…",
          "ستصلك رسالة تأكيد في موضوع الأوامر خلال دقيقتين.</i>",
        ].join("\n"),
        { parse_mode: "HTML" }
      ).catch((e) =>
        console.warn(
          "[auto-create] DM failed (non-fatal):",
          e instanceof Error ? e.message : String(e)
        )
      );
    }

    // ── 5. Fire-and-forget: create per-agent topics ─────────────────────────
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
      inviteLink: inviteLink || null,
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
