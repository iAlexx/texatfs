/**
 * Cash Payment Handler — ✅ (outgoing) and 🛑 (incoming) triggers.
 *
 * Only active in Telegram Forum Topic threads (supergroup messages).
 * Private messages are completely ignored.
 *
 * Trigger format (raw emoji or slash-prefixed):
 *   ✅90000   /✅90000   ✅ 90000    → outgoing: master sent money to sub-agent
 *   🛑45000   /🛑45000   🛑 45,000  → incoming: master received money from sub-agent
 *
 * Confirmation flow:
 *   1. Bot sends confirmation message with [✅ تأكيد] [❌ إلغاء] buttons in same thread.
 *   2. On confirm → record saved to cash_payments, message edited to final status.
 *   3. On cancel  → message edited to "❌ تم إلغاء العملية".
 *
 * Callback data encoding (max 64 bytes):
 *   Confirm → "cc|out|90000"  or  "cc|in|45000"
 *   Cancel  → "cx"
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  TelegramMessage,
  TelegramCallbackQuery,
} from "@/lib/telegram/bot-api";
import {
  sendMessageToTopic,
  editTelegramMessage,
  answerCallbackQuery,
} from "@/lib/telegram/bot-api";
import { getAgentByTopicId } from "@/lib/telegram/tracking-groups";

// ── Regex patterns ────────────────────────────────────────────────────────────

// Supports: ✅90000 | /✅90000 | ✅ 90,000 | ✅90.000 | ✅90،000
const CASH_OUT_RE = /^[/]?✅\s*([\d,.،٬]+)$/u;
const CASH_IN_RE  = /^[/]?🛑\s*([\d,.،٬]+)$/u;

type CashDirection = "in" | "out";

interface CashTrigger {
  direction: CashDirection;
  amount: number;
}

/** Normalise Arabic/Persian thousand separators and parse a positive number. */
function parseAmount(raw: string): number | null {
  // Remove thousand separators (comma, Arabic comma, Persian comma, dot-as-separator)
  // Keep a single dot for decimal only if it is the last separator
  const parts = raw.split(/[,.،٬]/);
  let normalised: string;
  if (parts.length > 1 && parts[parts.length - 1].length <= 2) {
    // Last segment has 1-2 digits → treat as decimal fraction
    normalised = parts.slice(0, -1).join("") + "." + parts[parts.length - 1];
  } else {
    normalised = parts.join("");
  }
  const n = Number(normalised);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function parseCashTrigger(text: string): CashTrigger | null {
  const t = text.trim();
  const outM = CASH_OUT_RE.exec(t);
  if (outM) {
    const amount = parseAmount(outM[1]);
    return amount !== null ? { direction: "out", amount } : null;
  }
  const inM = CASH_IN_RE.exec(t);
  if (inM) {
    const amount = parseAmount(inM[1]);
    return amount !== null ? { direction: "in", amount } : null;
  }
  return null;
}

/** Format amount with locale thousands separator (Arabic-friendly). */
function fmt(n: number): string {
  return n.toLocaleString("ar-SY");
}

// ── Message handler ───────────────────────────────────────────────────────────

/**
 * Called for every incoming Telegram message.
 * Returns true if the message was handled as a cash trigger, false otherwise.
 */
export async function handleCashMessage(
  supabase: SupabaseClient,
  message: TelegramMessage
): Promise<boolean> {
  // Only group/supergroup forum threads — ignore private messages entirely
  if (message.chat.type === "private") return false;
  const topicId = message.message_thread_id;
  if (!topicId) return false;
  if (!message.text) return false;

  const trigger = parseCashTrigger(message.text);
  if (!trigger) return false;

  const chatId = message.chat.id;

  // Resolve sub-agent for this topic thread
  const agent = await getAgentByTopicId(supabase, chatId, topicId);
  if (!agent) return false; // Topic not mapped to any agent — ignore

  const { direction, amount } = trigger;
  const amountStr = String(amount);

  const actionAr =
    direction === "out"
      ? `إرسال مبلغ *${fmt(amount)}* إلى`
      : `استلام مبلغ *${fmt(amount)}* من`;

  const confirmText = `هل أنت متأكد أنك تريد ${actionAr} *${agent.username}*؟`;

  // Encode: "cc|{direction}|{amount}" — well within the 64-byte Telegram limit
  const confirmData = `cc|${direction}|${amountStr}`;

  await sendMessageToTopic(chatId, topicId, confirmText, {
    parse_mode: "Markdown",
    reply_markup: {
      inline_keyboard: [
        [
          { text: "✅ تأكيد", callback_data: confirmData },
          { text: "❌ إلغاء", callback_data: "cx" },
        ],
      ],
    },
  });

  return true;
}

// ── Callback handler ──────────────────────────────────────────────────────────

/**
 * Handles confirm / cancel callback_query originating from a cash trigger.
 * Returns true if the data was a cash callback, false otherwise.
 */
export async function handleCashCallback(
  supabase: SupabaseClient,
  cq: TelegramCallbackQuery
): Promise<boolean> {
  const data = cq.data ?? "";
  if (!data.startsWith("cc|") && data !== "cx") return false;

  const chatId   = cq.message?.chat.id;
  const messageId = cq.message?.message_id;
  const topicId   = cq.message?.message_thread_id;

  if (!chatId || !messageId) return false;

  // Always dismiss the spinner on the button first
  await answerCallbackQuery(cq.id).catch(() => undefined);

  // ── Cancel ────────────────────────────────────────────────────────────────
  if (data === "cx") {
    await editTelegramMessage(chatId, messageId, "❌ تم إلغاء العملية");
    return true;
  }

  // ── Confirm ───────────────────────────────────────────────────────────────
  // Callback data: "cc|{direction}|{amount}"
  const parts = data.split("|");
  const direction = parts[1] as CashDirection;
  const amount    = Number(parts[2]);

  if (!topicId || (direction !== "in" && direction !== "out") || !Number.isFinite(amount) || amount <= 0) {
    await editTelegramMessage(chatId, messageId, "❌ بيانات غير صالحة، أعد المحاولة.");
    return true;
  }

  // Look up agent from DB (re-query rather than encoding in callback data)
  let agent: Awaited<ReturnType<typeof getAgentByTopicId>>;
  try {
    agent = await getAgentByTopicId(supabase, chatId, topicId);
  } catch {
    agent = null;
  }

  if (!agent) {
    await editTelegramMessage(
      chatId,
      messageId,
      "❌ لم يتم العثور على الوكيل المرتبط بهذا الموضوع."
    );
    return true;
  }

  // Idempotent upsert (message_id is unique)
  const msgKey = `tg-${chatId}-${messageId}`;
  const paymentDate = new Date().toISOString().slice(0, 10);

  const { error: dbErr } = await supabase.from("cash_payments").upsert(
    {
      user_id:     agent.userId,
      group_jid:   String(chatId),
      group_name:  agent.username,
      message_id:  msgKey,
      direction,
      amount,
      raw_message: `${direction === "out" ? "✅" : "🛑"}${amount}`,
      sender_jid:  cq.from?.id ? String(cq.from.id) : null,
      payment_date: paymentDate,
    },
    { onConflict: "message_id" }
  );

  if (dbErr) {
    console.error("[cash-handler] DB insert failed:", dbErr.message);
    await editTelegramMessage(
      chatId,
      messageId,
      "❌ فشل حفظ العملية. حاول مرة أخرى."
    );
    return true;
  }

  // Final status message
  const statusText =
    direction === "out"
      ? `✅ واصل منك *${fmt(amount)}* → *${agent.username}*`
      : `🛑 واصل الك *${fmt(amount)}* ← *${agent.username}*`;

  await editTelegramMessage(chatId, messageId, statusText, {
    parse_mode: "Markdown",
  });

  return true;
}
