/**
 * WhatsApp Cash Handler — Phase 1 (trigger) + Phase 2 (1/2 reply confirm).
 *
 *  Phase 1 — Trigger
 *    Group member types  "✅90000"  or  "/✅ 90000"  → outgoing (wasel_menho)
 *                        "🛑45000"  or  "/🛑 45000"  → incoming (wasel_eleih)
 *    Bot:
 *      • Looks up agent for this groupId.
 *      • Quotes the trigger and replies with the confirmation message.
 *      • Persists a pending row keyed by the confirmation message id.
 *
 *  Phase 2 — Confirmation
 *    Member replies to the confirmation message with body "1" or "2".
 *      • "1" → write to transactions (ledger) + cash_payments audit + reply
 *               ("✅ واصل منك ..." / "🛑 واصل الك ...").
 *      • "2" → reply "❌ تم إلغاء العملية".
 *    In either case, the pending row is deleted.
 *
 *  Accounting mapping:
 *    ✅ → direction "out" → wasel_menho (Super Agent paid Master real cash)
 *    🛑 → direction "in"  → wasel_eleih (Master paid Super Agent real cash)
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { createLogger } from "@/lib/observability/logger";
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
import { recordWhatsAppCashPayment } from "@/lib/whatsapp/record-cash-transaction";
import { resolveLedgerDate } from "@/lib/cron/ledger-date";

const log = createLogger("whatsapp/cash-handler");

// ── Regex patterns ────────────────────────────────────────────────────────────

const TRIGGER_OUT_RE = /^[/]?\s*✅\s*([\d,.،٬]+)\s*$/u;
const TRIGGER_IN_RE  = /^[/]?\s*🛑\s*([\d,.،٬]+)\s*$/u;

const CONFIRM_RE = /^\s*(?:1\u20e3|١|1)\s*$/;
const CANCEL_RE  = /^\s*(?:2\u20e3|٢|2)\s*$/;

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

export async function handleWhatsAppCashEvent(
  supabase: SupabaseClient,
  msg: WhatsAppIncomingMessage
): Promise<boolean> {
  try {
    log.info("cash event received", {
      groupId: msg.groupId,
      senderId: msg.senderId,
      text: msg.text.slice(0, 60),
      messageId: msg.messageId,
      hasQuote: !!msg.quotedMessageId,
    });

    if (msg.quotedMessageId) {
      const handled = await handleConfirmationReply(supabase, msg);
      if (handled) return true;
    }

    const trigger = parseTrigger(msg.text);
    if (trigger) {
      log.info("trigger parsed", {
        direction: trigger.direction,
        amount: trigger.amount,
        txType: trigger.direction === "out" ? "wasel_menho" : "wasel_eleih",
        groupId: msg.groupId,
      });
      return await handleTrigger(supabase, msg, trigger);
    }

    return false;
  } catch (err) {
    log.error("handler error", {
      error: err instanceof Error ? err.message : String(err),
      groupId: msg.groupId,
    });
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
    log.warn("trigger in unmapped group — no agent found", {
      groupId: msg.groupId,
      text: msg.text,
    });
    return false;
  }

  log.info("agent resolved for group", {
    groupId: msg.groupId,
    userId: agent.userId,
    affiliateId: agent.affiliateId,
    email: agent.email,
  });

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
    log.info("confirmation prompt sent", {
      groupId: msg.groupId,
      replyMessageId: sendResult.messageId,
    });
  } catch (err) {
    if (err instanceof WhatsAppError) {
      log.error("reply send failed", { error: err.message, code: err.code, groupId: msg.groupId });
    } else {
      log.error("reply send unknown error", { error: String(err), groupId: msg.groupId });
    }
    return true;
  }

  if (!sendResult.messageId) {
    log.warn("gateway did not return messageId — cannot track confirmation", {
      groupId: msg.groupId,
    });
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
    log.info("pending confirmation saved", {
      confirmMsgId: sendResult.messageId,
      direction,
      amount,
      affiliateId: agent.affiliateId,
    });
  } catch (err) {
    log.error("failed to persist pending row", {
      error: err instanceof Error ? err.message : String(err),
      groupId: msg.groupId,
    });
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
    log.info("no matching pending confirmation (expired or not found)", {
      quotedMessageId: msg.quotedMessageId,
      groupId: msg.groupId,
    });
    return false;
  }

  log.info("pending confirmation found", {
    pendingId: pending.id,
    direction: pending.direction,
    amount: Number(pending.amount),
    affiliateId: pending.affiliate_id,
    email: pending.email,
    action: isConfirm ? "confirm" : "cancel",
  });

  // ── Cancel ─────────────────────────────────────────────────────────────────
  if (isCancel) {
    await deletePendingConfirmation(supabase, pending.id);
    await safeReply(msg.groupId, msg.messageId, "❌ تم إلغاء العملية");
    log.info("transaction cancelled", { pendingId: pending.id });
    return true;
  }

  // ── Confirm ────────────────────────────────────────────────────────────────
  const direction = pending.direction;
  const amount    = Number(pending.amount);
  const paymentDate = resolveLedgerDate();

  const dedupeKey = `wa-${pending.group_id}-${pending.trigger_msg_id}`;
  const rawMessage = `${direction === "out" ? "✅" : "🛑"}${amount}`;

  log.info("recording transaction", {
    userId: pending.user_id,
    direction,
    txType: direction === "out" ? "wasel_menho" : "wasel_eleih",
    amount,
    affiliateId: pending.affiliate_id,
    dedupeKey,
    paymentDate,
  });

  const recorded = await recordWhatsAppCashPayment(supabase, {
    userId: pending.user_id,
    groupJid: pending.group_id,
    groupName: pending.email,
    dedupeKey,
    direction,
    amount,
    rawMessage,
    senderJid: msg.senderId ?? null,
    paymentDate,
    targetAffiliateId: pending.affiliate_id ?? null,
  });

  if (!recorded.ok) {
    log.error("transaction recording failed", {
      error: recorded.error,
      dedupeKey,
    });
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

  log.info("transaction confirmed and recorded", {
    transactionId: recorded.transactionId,
    direction,
    txType: direction === "out" ? "wasel_menho" : "wasel_eleih",
    amount,
    affiliateId: pending.affiliate_id,
    duplicate: recorded.duplicate ?? false,
  });

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
    log.error("reply failed", {
      groupId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
