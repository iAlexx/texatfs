import type { SupabaseClient } from "@supabase/supabase-js";
import {
  answerCallbackQuery,
  editTelegramMessage,
  sendTelegramMessage,
  type TelegramInlineKeyboard,
} from "@/lib/telegram/bot-api";
import { SubscriptionService } from "@/lib/subscription/SubscriptionService";

const CB = {
  menu: "adm:menu",
  genkey: (m: string) => `adm:gk:${m}`,
  users: (p: number) => `adm:usr:${p}`,
  hero: "adm:hero",
  genkeyMenu: "adm:gkm",
} as const;

function mainKeyboard(): TelegramInlineKeyboard {
  return {
    inline_keyboard: [
      [
        { text: "🔑 مفاتيح الترخيص", callback_data: CB.genkeyMenu },
        { text: "👥 المستخدمون", callback_data: CB.users(0) },
      ],
      [
        { text: "📢 إعلان الصفحة الرئيسية", callback_data: CB.hero },
      ],
      [{ text: "🔄 تحديث", callback_data: CB.menu }],
    ],
  };
}

function genkeyKeyboard(): TelegramInlineKeyboard {
  return {
    inline_keyboard: [
      [
        { text: "1 شهر", callback_data: CB.genkey("1") },
        { text: "3 أشهر", callback_data: CB.genkey("3") },
      ],
      [
        { text: "6 أشهر", callback_data: CB.genkey("6") },
        { text: "12 شهر", callback_data: CB.genkey("12") },
      ],
      [{ text: "◀️ رجوع", callback_data: CB.menu }],
    ],
  };
}

function panelHtml(title: string, body: string): string {
  return `<b>👑 TEXAS FUNDS — لوحة المسؤول</b>\n\n<b>${title}</b>\n${body}`;
}

export async function sendAdminPanel(
  chatId: number,
  supabase: SupabaseClient
): Promise<void> {
  const subscription = new SubscriptionService(supabase);
  const { count } = await supabase
    .from("users")
    .select("id", { count: "exact", head: true })
    .eq("role", "master");

  let active = 0;
  const { data: masters } = await supabase
    .from("users")
    .select("id")
    .eq("role", "master")
    .limit(200);

  for (const m of masters ?? []) {
    if (await subscription.isActive(m.id)) active += 1;
  }

  const { data: ann } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", "hero_announcement")
    .maybeSingle();

  await sendTelegramMessage(
    chatId,
    panelHtml(
      "القائمة الرئيسية",
      `• الماسترز المسجّلون: <b>${count ?? 0}</b>\n• اشتراك فعّال: <b>${active}</b>\n\n📢 <i>إعلان الهيرو:</i>\n${(ann?.value ?? "—").slice(0, 200)}`
    ),
    { parse_mode: "HTML", reply_markup: mainKeyboard() }
  );
}

export async function handleAdminCallback(
  supabase: SupabaseClient,
  chatId: number,
  messageId: number,
  data: string,
  callbackQueryId: string
): Promise<void> {
  try {
    if (data === CB.menu) {
      const subscription = new SubscriptionService(supabase);
      const { count } = await supabase
        .from("users")
        .select("id", { count: "exact", head: true })
        .eq("role", "master");

      let active = 0;
      const { data: masters } = await supabase
        .from("users")
        .select("id")
        .eq("role", "master")
        .limit(200);
      for (const m of masters ?? []) {
        if (await subscription.isActive(m.id)) active += 1;
      }

      await editTelegramMessage(
        chatId,
        messageId,
        panelHtml(
          "القائمة الرئيسية",
          `• الماسترز: <b>${count ?? 0}</b> | فعّال: <b>${active}</b>`
        ),
        { parse_mode: "HTML", reply_markup: mainKeyboard() }
      );
      await answerCallbackQuery(callbackQueryId);
      return;
    }

    if (data === CB.genkeyMenu) {
      await editTelegramMessage(
        chatId,
        messageId,
        panelHtml("مولّد المفاتيح", "اختر مدة الاشتراك:"),
        { parse_mode: "HTML", reply_markup: genkeyKeyboard() }
      );
      await answerCallbackQuery(callbackQueryId);
      return;
    }

    if (data.startsWith("adm:gk:")) {
      const months = data.replace("adm:gk:", "");
      const { data: key, error } = await supabase.rpc("generate_license_key", {
        p_duration_months: months,
        p_created_by: null,
        p_notes: `Admin panel ${months}mo`,
      });
      if (error) throw error;
      await editTelegramMessage(
        chatId,
        messageId,
        panelHtml(
          `مفتاح ${months} شهر`,
          `<code>${key}</code>\n\nانسخه وأرسله للماستر.`
        ),
        { parse_mode: "HTML", reply_markup: genkeyKeyboard() }
      );
      await answerCallbackQuery(callbackQueryId, "تم إنشاء المفتاح");
      return;
    }

    if (data.startsWith("adm:usr:")) {
      const page = Number(data.replace("adm:usr:", "")) || 0;
      const pageSize = 8;
      const from = page * pageSize;
      const { data: rows } = await supabase
        .from("users")
        .select(
          "id, display_name, texas_username, telegram_id, subscription_end_date, is_active"
        )
        .eq("role", "master")
        .order("created_at", { ascending: false })
        .range(from, from + pageSize - 1);

      const subscription = new SubscriptionService(supabase);
      const lines: string[] = [];
      for (const u of rows ?? []) {
        const active = await subscription.isActive(u.id);
        const name = u.display_name ?? u.texas_username ?? u.id.slice(0, 8);
        lines.push(
          `${active ? "🟢" : "🔴"} <b>${name}</b>\n   TG: ${u.telegram_id ?? "—"} | حتى: ${u.subscription_end_date ?? "—"}`
        );
      }

      const nav: TelegramInlineKeyboard = {
        inline_keyboard: [
          [
            ...(page > 0
              ? [{ text: "◀️ السابق", callback_data: CB.users(page - 1) }]
              : []),
            ...(rows && rows.length === pageSize
              ? [{ text: "التالي ▶️", callback_data: CB.users(page + 1) }]
              : []),
          ],
          [{ text: "◀️ القائمة", callback_data: CB.menu }],
        ],
      };

      await editTelegramMessage(
        chatId,
        messageId,
        panelHtml(
          `المستخدمون (صفحة ${page + 1})`,
          lines.length ? lines.join("\n\n") : "لا يوجد مستخدمون."
        ),
        { parse_mode: "HTML", reply_markup: nav }
      );
      await answerCallbackQuery(callbackQueryId);
      return;
    }

    if (data === CB.hero) {
      await editTelegramMessage(
        chatId,
        messageId,
        panelHtml(
          "إعلان الصفحة الرئيسية",
          "لتحديث الإعلان، أرسل رسالة بهذا الشكل:\n\n<code>/announce نص الإعلان الجديد</code>"
        ),
        { parse_mode: "HTML", reply_markup: mainKeyboard() }
      );
      await answerCallbackQuery(callbackQueryId);
      return;
    }

    await answerCallbackQuery(callbackQueryId, "أمر غير معروف");
  } catch (e) {
    const msg = e instanceof Error ? e.message : "خطأ";
    await answerCallbackQuery(callbackQueryId, msg.slice(0, 200));
  }
}

export async function handleAnnounceCommand(
  supabase: SupabaseClient,
  chatId: number,
  text: string
): Promise<void> {
  const announcement = text.replace(/^\/announce\s*/i, "").trim();
  if (!announcement) {
    await sendTelegramMessage(
      chatId,
      "الاستخدام: <code>/announce نص الإعلان</code>",
      { parse_mode: "HTML" }
    );
    return;
  }

  await supabase.from("app_settings").upsert({
    key: "hero_announcement",
    value: announcement,
    updated_at: new Date().toISOString(),
  });

  await sendTelegramMessage(
    chatId,
    `✅ تم تحديث إعلان الصفحة الرئيسية:\n\n<i>${announcement}</i>`,
    { parse_mode: "HTML", reply_markup: mainKeyboard() }
  );
}
