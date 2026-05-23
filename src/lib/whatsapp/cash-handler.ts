/**
 * WhatsApp Cash Handler — Phase 1 (trigger) + Phase 2 (1/2 reply confirm).
 *
 *  Phase 1 — Trigger
 *    Group member types  "✅90000"  or  "/✅ 90000"  → outgoing
 *                        "🛑45000"  or  "/🛑 45000"  → incoming
 *    Bot:
 *      • Looks up agent for this groupId.
 *      • Quotes the trigger and replies with the confirmation message.
 *      • Persists a pending row keyed by the confirmation message id.
 *
 *  Phase 2 — Confirmation
 *    Member replies to the confirmation message with body "1" or "2".
 *      • "1" → write to cash_payments + reply with final status
 *               ("✅ واصل منك ..." / "🛑 واصل الك ...").
 *      • "2" → reply "❌ تم إلغاء العملية".
 *    In either case, the pending row is deleted.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  replyToWhatsAppMessage,
  WhatsAppError,
} from "@/lib/whatsapp/client";
import { getAgentByGroupId } from "@/lib/whatsapp/agent-groups";
import {
  savePendingConfirmation,
  getPendingByConfirmMsgId,
  deletePendingConfirmation,
  type CashDirection,
} from "@/lib/whatsapp/pending";
import type { WhatsAppIncomingMessage } from "@/lib/whatsapp/webhook-types";

// ── Regex patterns ────────────────────────────────────────────────────────────

// Trigger: optional leading "/", emoji, optional space, digits (with separators).
const TRIGGER_OUT_RE = /^[/]?\s*✅\s*([\d,.،٬]+)\s*$/u;
const TRIGGER_IN_RE  = /^[/]?\s*🛑\s*([\d,.،٬]+)\s*$/u;

// Reply confirmation: "1" or "2" possibly wrapped in emoji or whitespace.
const CONFIRM_RE = /^\s*(?:1\u20e3|١|1)\s*$/;   // 1 or ١ or 1️⃣
const CANCEL_RE  = /^\s*(?:2\u20e3|٢|2)\s*$/;   // 2 or ٢ or 2️⃣

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseAmount(raw: string): number | null {
  const parts = raw.split(/[,.،٬]/);
  let normalised: string;
  if (parts.length > 1 && parts[parts.length - 1].length <= 2) {
    normalised = parts.slice(0, -1).join("") + "." + parts[parts.length - 1];
  } else {
    normalised = parts.join("");
  }
  const n = Number(normalised);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function parseTrigger(
  text: string
): { direction: CashDirection; amount: number } | null {
  const outM = TRIGGER_OUT_RE.exec(text);
  if (outM) {
    const amount = parseAmount(outM[1]);
    return amount !== null ? { direction: "out", amount } : null;
  }
  const inM = TRIGGER_IN_RE.exec(text);
  if (inM) {
    const amount = parseAmount(inM[1]);
    return amount !== null ? { direction: "in", amount } : null;
  }
  return null;
}

function fmt(n: number): string {
  return n.toLocaleString("ar-SY");
}

// ── Public entry point ────────────────────────────────────────────────────────

/**
 * Routes an incoming WhatsApp group message. Returns true if it was handled
 * as a cash-system event (trigger or confirmation), false otherwise.
 *
 * Errors are caught and logged; the function never throws so the webhook
 * can always return 200 OK quickly.
 */
export async function handleWhatsAppCashEvent(
  supabase: SupabaseClient,
  msg: WhatsAppIncomingMessage
): Promise<boolean> {
  try {
    // Phase 2 first: if this is a reply to one of our pending confirmations,
    // it takes priority over the trigger regex.
    if (msg.quotedMessageId) {
      const handled = await handleConfirmationReply(supabase, msg);
      if (handled) return true;
    }

    // Phase 1: try to parse as a trigger.
    const trigger = parseTrigger(msg.text);
    if (trigger) {
      return await handleTrigger(supabase, msg, trigger);
    }

    return false;
  } catch (err) {
    console.error(
      "[whatsapp-cash] handler error:",
      err instanceof Error ? err.message : String(err)
    );
    return false;
  }
}

// ── Phase 1 ───────────────────────────────────────────────────────────────────

async function handleTrigger(
  supabase: SupabaseClient,
  msg:     WhatsAppIncomingMessage,
  trigger: { direction: CashDirection; amount: number }
): Promise<boolean> {
  const agent = await getAgentByGroupId(supabase, msg.groupId);
  if (!agent) {
    console.info("[whatsapp-cash] trigger in unmapped group, ignoring:", msg.groupId);
    return false;
  }

  const { direction, amount } = trigger;
  const verbAr = direction === "out" ? "إرسال"  : "استلام";
  const prepAr = direction === "out" ? "إلى"    : "من";

  const confirmText =
    `⚠️ *تأكيد عملية مالية* ⚠️\n` +
    `\n` +
    `هل أنت متأكد أنك تريد ${verbAr} مبلغ *${fmt(amount)}* ${prepAr} *${agent.email}*؟\n` +
    `\n` +
    `اضغط رد (Reply) على هذه الرسالة واكتب:\n` +
    `1️⃣ لتأكيد العملية\n` +
    `2️⃣ لإلغاء العملية`;

  let sendResult;
  try {
    sendResult = await replyToWhatsAppMessage(
      msg.groupId,
      msg.messageId,
      confirmText
    );
  } catch (err) {
    if (err instanceof WhatsAppError) {
      console.error("[whatsapp-cash] reply send failed:", err.message, err.code);
    } else {
      console.error("[whatsapp-cash] reply send unknown error:", err);
    }
    return true; // we did parse the trigger; just couldn't send
  }

  if (!sendResult.messageId) {
    console.warn(
      "[whatsapp-cash] gateway did not return a messageId — cannot track confirmation"
    );
    return true;
  }

  try {
    await savePendingConfirmation(supabase, {
      userId:        agent.userId,
      groupId:       msg.groupId,
      triggerMsgId:  msg.messageId,
      confirmMsgId:  sendResult.messageId,
      affiliateId:   agent.affiliateId,
      email:         agent.email,
      direction,
      amount,
    });
  } catch (err) {
    console.error(
      "[whatsapp-cash] failed to persist pending row:",
      err instanceof Error ? err.message : String(err)
    );
  }

  return true;
}

// ── Phase 2 ───────────────────────────────────────────────────────────────────

async function handleConfirmationReply(
  supabase: SupabaseClient,
  msg:      WhatsAppIncomingMessage
): Promise<boolean> {
  if (!msg.quotedMessageId) return false;

  const isConfirm = CONFIRM_RE.test(msg.text);
  const isCancel  = CANCEL_RE.test(msg.text);
  if (!isConfirm && !isCancel) return false;

  const pending = await getPendingByConfirmMsgId(supabase, msg.quotedMessageId);
  if (!pending) {
    // Could be expired or for a different bot message — silently ignore.
    return false;
  }

  // ── Cancel ─────────────────────────────────────────────────────────────────
  if (isCancel) {
    await deletePendingConfirmation(supabase, pending.id);
    await safeReply(
      msg.groupId,
      msg.messageId,
      "❌ تم إلغاء العملية"
    );
    return true;
  }

  // ── Confirm ────────────────────────────────────────────────────────────────
  const direction = pending.direction;
  const amount    = Number(pending.amount);
  const today     = new Date().toISOString().slice(0, 10);

  // Idempotent on (message_id) — trigger msg id is unique per group.
  const dedupeKey = `wa-${pending.group_id}-${pending.trigger_msg_id}`;

  const { error: dbErr } = await supabase.from("cash_payments").upsert(
    {
      user_id:      pending.user_id,
      group_jid:    pending.group_id,
      group_name:   pending.email,
      message_id:   dedupeKey,
      direction,
      amount,
      raw_message:  `${direction === "out" ? "✅" : "🛑"}${amount}`,
      sender_jid:   msg.senderId ?? null,
      payment_date: today,
    },
    { onConflict: "message_id" }
  );

  if (dbErr) {
    console.error("[whatsapp-cash] DB upsert failed:", dbErr.message);
    await safeReply(
      msg.groupId,
      msg.messageId,
      "❌ فشل حفظ العملية. حاول مرة أخرى."
    );
    return true;
  }

  await deletePendingConfirmation(supabase, pending.id);

  const finalText =
    direction === "out"
      ? `✅ *واصل منك* *${fmt(amount)}* → *${pending.email}*`
      : `🛑 *واصل الك* *${fmt(amount)}* ← *${pending.email}*`;

  await safeReply(msg.groupId, msg.messageId, finalText);
  return true;
}

// ── Internals ─────────────────────────────────────────────────────────────────

async function safeReply(
  groupId: string,
  quotedMessageId: string,
  text: string
): Promise<void> {
  try {
    await replyToWhatsAppMessage(groupId, quotedMessageId, text);
  } catch (err) {
    console.error(
      "[whatsapp-cash] reply failed:",
      err instanceof Error ? err.message : String(err)
    );
  }
}
