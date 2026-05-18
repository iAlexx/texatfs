import type { SupabaseClient } from "@supabase/supabase-js";
import {
  answerCallbackQuery,
  editTelegramMessage,
  sendTelegramMessage,
  type TelegramInlineKeyboard,
} from "@/lib/telegram/bot-api";
import { SubscriptionService } from "@/lib/subscription/SubscriptionService";
import {
  deleteUser,
  extendSubscription,
  setUserFrozen,
  shrinkSubscription,
} from "@/lib/admin/user-actions";
import { forceSyncUser } from "@/lib/admin/force-sync";

const CB = {
  menu: "adm:menu",
  genkey: (m: string) => `adm:gk:${m}`,
  users: (p: number) => `adm:usr:${p}`,
  userView: (id: string) => `adm:uv:${id}`,
  hero: "adm:hero",
  genkeyMenu: "adm:gkm",
  logs: (p: number) => `adm:log:${p}`,
  ext: (id: string) => `adm:e30:${id}`,
  shr: (id: string) => `adm:s30:${id}`,
  freeze: (id: string) => `adm:frz:${id}`,
  del: (id: string) => `adm:del:${id}`,
  delConfirm: (id: string) => `adm:delc:${id}`,
  sync: (id: string) => `adm:sync:${id}`,
} as const;

function mainKeyboard(): TelegramInlineKeyboard {
  return {
    inline_keyboard: [
      [
        { text: "🔑 مفاتيح", callback_data: CB.genkeyMenu },
        { text: "👥 المستخدمون", callback_data: CB.users(0) },
      ],
      [
        { text: "📊 سجلات المزامنة", callback_data: CB.logs(0) },
        { text: "📢 إعلان الهيرو", callback_data: CB.hero },
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
  return `<b>👑 TEXAS FUNDS — لوحة التحكم</b>\n\n<b>${title}</b>\n${body}`;
}

function userActionKeyboard(userId: string, frozen: boolean): TelegramInlineKeyboard {
  return {
    inline_keyboard: [
      [
        { text: "⏳ +30d", callback_data: CB.ext(userId) },
        { text: "⌛ -30d", callback_data: CB.shr(userId) },
      ],
      [
        {
          text: frozen ? "🔥 إلغاء التجميد" : "❄️ تجميد",
          callback_data: CB.freeze(userId),
        },
        { text: "🔄 مزامنة", callback_data: CB.sync(userId) },
      ],
      [
        { text: "🗑️ حذف", callback_data: CB.del(userId) },
        { text: "◀️ القائمة", callback_data: CB.users(0) },
      ],
    ],
  };
}

export async function sendAdminPanel(
  chatId: number,
  supabase: SupabaseClient
): Promise<void> {
  const stats = await loadDashboardStats(supabase);
  const { data: ann } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", "hero_announcement")
    .maybeSingle();

  await sendTelegramMessage(
    chatId,
    panelHtml(
      "لوحة القيادة",
      `• الماسترز: <b>${stats.total}</b> | فعّال: <b>${stats.active}</b> | مجمّد: <b>${stats.frozen}</b>\n• فشل مزامنة (24س): <b>${stats.failedSyncs24h}</b>\n\n📢 <i>${(ann?.value ?? "—").slice(0, 120)}</i>`
    ),
    { parse_mode: "HTML", reply_markup: mainKeyboard() }
  );
}

async function loadDashboardStats(supabase: SupabaseClient) {
  const subscription = new SubscriptionService(supabase);
  const { count } = await supabase
    .from("users")
    .select("id", { count: "exact", head: true })
    .eq("role", "master");

  const { data: masters } = await supabase
    .from("users")
    .select("id, is_frozen")
    .eq("role", "master")
    .limit(300);

  let active = 0;
  let frozen = 0;
  for (const m of masters ?? []) {
    if (m.is_frozen) frozen += 1;
    if (await subscription.isActive(m.id)) active += 1;
  }

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count: failedSyncs24h } = await supabase
    .from("sync_logs")
    .select("id", { count: "exact", head: true })
    .eq("status", "failed")
    .gte("created_at", since);

  return {
    total: count ?? 0,
    active,
    frozen,
    failedSyncs24h: failedSyncs24h ?? 0,
  };
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
      const stats = await loadDashboardStats(supabase);
      await editTelegramMessage(
        chatId,
        messageId,
        panelHtml(
          "لوحة القيادة",
          `• الماسترز: <b>${stats.total}</b> | فعّال: <b>${stats.active}</b> | مجمّد: <b>${stats.frozen}</b>`
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

    if (data.startsWith("adm:log:")) {
      const page = Number(data.replace("adm:log:", "")) || 0;
      const pageSize = 6;
      const from = page * pageSize;
      const { data: logs } = await supabase
        .from("sync_logs")
        .select("status, error_message, created_at, user_id")
        .order("created_at", { ascending: false })
        .range(from, from + pageSize - 1);

      const lines = (logs ?? []).map((l) => {
        const icon = l.status === "success" ? "✅" : "❌";
        const err = l.error_message ? `\n   <i>${l.error_message.slice(0, 80)}</i>` : "";
        return `${icon} ${new Date(l.created_at as string).toLocaleString("ar-SY")}${err}`;
      });

      const nav: TelegramInlineKeyboard = {
        inline_keyboard: [
          [
            ...(page > 0
              ? [{ text: "◀️", callback_data: CB.logs(page - 1) }]
              : []),
            ...(logs && logs.length === pageSize
              ? [{ text: "▶️", callback_data: CB.logs(page + 1) }]
              : []),
          ],
          [{ text: "◀️ القائمة", callback_data: CB.menu }],
        ],
      };

      await editTelegramMessage(
        chatId,
        messageId,
        panelHtml(
          `سجلات المزامنة (${page + 1})`,
          lines.length ? lines.join("\n\n") : "لا توجد سجلات."
        ),
        { parse_mode: "HTML", reply_markup: nav }
      );
      await answerCallbackQuery(callbackQueryId);
      return;
    }

    if (data.startsWith("adm:usr:")) {
      const page = Number(data.replace("adm:usr:", "")) || 0;
      await renderUsersList(supabase, chatId, messageId, page);
      await answerCallbackQuery(callbackQueryId);
      return;
    }

    if (data.startsWith("adm:uv:")) {
      const userId = data.replace("adm:uv:", "");
      await renderUserDetail(supabase, chatId, messageId, userId);
      await answerCallbackQuery(callbackQueryId);
      return;
    }

    if (data.startsWith("adm:e30:")) {
      const userId = data.replace("adm:e30:", "");
      const end = await extendSubscription(supabase, userId, 30);
      await answerCallbackQuery(callbackQueryId, `تم التمديد حتى ${end}`);
      await renderUserDetail(supabase, chatId, messageId, userId);
      return;
    }

    if (data.startsWith("adm:s30:")) {
      const userId = data.replace("adm:s30:", "");
      const end = await shrinkSubscription(supabase, userId, 30);
      await answerCallbackQuery(callbackQueryId, `تم الخصم حتى ${end}`);
      await renderUserDetail(supabase, chatId, messageId, userId);
      return;
    }

    if (data.startsWith("adm:frz:")) {
      const userId = data.replace("adm:frz:", "");
      const { data: u } = await supabase
        .from("users")
        .select("is_frozen")
        .eq("id", userId)
        .single();
      await setUserFrozen(supabase, userId, !u?.is_frozen);
      await answerCallbackQuery(
        callbackQueryId,
        u?.is_frozen ? "تم إلغاء التجميد" : "تم التجميد"
      );
      await renderUserDetail(supabase, chatId, messageId, userId);
      return;
    }

    if (data.startsWith("adm:del:") && !data.startsWith("adm:delc:")) {
      const userId = data.replace("adm:del:", "");
      const kb: TelegramInlineKeyboard = {
        inline_keyboard: [
          [
            {
              text: "✅ تأكيد الحذف",
              callback_data: CB.delConfirm(userId),
            },
            { text: "❌ إلغاء", callback_data: CB.userView(userId) },
          ],
        ],
      };
      await editTelegramMessage(
        chatId,
        messageId,
        panelHtml(
          "تأكيد الحذف",
          "هل أنت متأكد؟ سيتم تعطيل الحساب وحذف بيانات تكساس المشفّرة."
        ),
        { parse_mode: "HTML", reply_markup: kb }
      );
      await answerCallbackQuery(callbackQueryId);
      return;
    }

    if (data.startsWith("adm:delc:")) {
      const userId = data.replace("adm:delc:", "");
      await deleteUser(supabase, userId);
      await answerCallbackQuery(callbackQueryId, "تم حذف/تعطيل المستخدم");
      await renderUsersList(supabase, chatId, messageId, 0);
      return;
    }

    if (data.startsWith("adm:sync:")) {
      const userId = data.replace("adm:sync:", "");
      await answerCallbackQuery(callbackQueryId, "جاري المزامنة…");
      const result = await forceSyncUser(supabase, userId);
      if (result.ok) {
        await answerCallbackQuery(
          callbackQueryId,
          `تمت المزامنة — النهائي: ${result.al_nihai}`
        );
      } else {
        await answerCallbackQuery(callbackQueryId, result.error);
      }
      await renderUserDetail(supabase, chatId, messageId, userId);
      return;
    }

    if (data === CB.hero) {
      await editTelegramMessage(
        chatId,
        messageId,
        panelHtml(
          "إعلان الصفحة الرئيسية",
          "<code>/announce نص الإعلان الجديد</code>"
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

async function renderUsersList(
  supabase: SupabaseClient,
  chatId: number,
  messageId: number,
  page: number
) {
  const pageSize = 6;
  const from = page * pageSize;
  const { data: rows } = await supabase
    .from("users")
    .select(
      "id, display_name, texas_username, telegram_id, subscription_end_date, is_frozen"
    )
    .eq("role", "master")
    .order("created_at", { ascending: false })
    .range(from, from + pageSize - 1);

  const subscription = new SubscriptionService(supabase);
  const lines: string[] = [];
  const buttons: Array<{ text: string; callback_data: string }> = [];

  for (const u of rows ?? []) {
    const active = await subscription.isActive(u.id);
    const name = u.display_name ?? u.texas_username ?? u.id.slice(0, 8);
    lines.push(
      `${active ? "🟢" : "🔴"}${u.is_frozen ? " ❄️" : ""} <b>${name}</b>`
    );
    buttons.push({
      text: `⚙️ ${name.slice(0, 12)}`,
      callback_data: CB.userView(u.id),
    });
  }

  const keyboard: TelegramInlineKeyboard = {
    inline_keyboard: [
      ...chunk(buttons, 2),
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
      `المستخدمون (${page + 1})`,
      lines.length ? lines.join("\n") : "لا يوجد مستخدمون."
    ),
    { parse_mode: "HTML", reply_markup: keyboard }
  );
}

async function renderUserDetail(
  supabase: SupabaseClient,
  chatId: number,
  messageId: number,
  userId: string
) {
  const subscription = new SubscriptionService(supabase);
  const { data: u } = await supabase
    .from("users")
    .select(
      "id, display_name, texas_username, telegram_id, subscription_end_date, is_frozen, is_active, referral_code"
    )
    .eq("id", userId)
    .single();

  if (!u) {
    await editTelegramMessage(chatId, messageId, panelHtml("خطأ", "المستخدم غير موجود"), {
      parse_mode: "HTML",
      reply_markup: mainKeyboard(),
    });
    return;
  }

  const active = await subscription.isActive(u.id);
  const name = u.display_name ?? u.texas_username ?? u.id.slice(0, 8);

  await editTelegramMessage(
    chatId,
    messageId,
    panelHtml(
      name,
      `• الحالة: ${active ? "🟢 فعّال" : "🔴 غير فعّال"}${u.is_frozen ? " ❄️ مجمّد" : ""}\n• TG: <code>${u.telegram_id ?? "—"}</code>\n• تكساس: ${u.texas_username ?? "—"}\n• اشتراك حتى: <b>${u.subscription_end_date ?? "—"}</b>\n• إحالة: <code>${u.referral_code ?? "—"}</code>`
    ),
    {
      parse_mode: "HTML",
      reply_markup: userActionKeyboard(userId, Boolean(u.is_frozen)),
    }
  );
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
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
