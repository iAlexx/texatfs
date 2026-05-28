/**
 * Monthly burn commission — percentage replies in agent WhatsApp groups.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { createLogger } from "@/lib/observability/logger";
import {
  applyMonthlyBurnCommission,
  computeBurnCommissionAmount,
  formatOrientedBalanceLine,
  parseCommissionPercent,
} from "@/lib/accounting/monthly-burn-commission";
import {
  completeMonthlyCommission,
  findLatestPendingCommissionByGroup,
} from "@/lib/accounting/monthly-commission-repository";
import { sendWhatsAppMessage } from "@/lib/whatsapp/client";
import type { WhatsAppIncomingMessage } from "@/lib/whatsapp/webhook-types";
import { jidToPhoneDigits } from "@/lib/whatsapp/phone";

const log = createLogger("whatsapp/commission-handler");

const INVALID_PERCENT_MSG =
  "النسبة غير صحيحة. اكتب رقم بين 0 و 100، مثال: 25";

function fmt(n: number): string {
  return n.toLocaleString("ar-SY");
}

async function isParentSender(
  supabase: SupabaseClient,
  parentUserId: string,
  msg: WhatsAppIncomingMessage
): Promise<boolean> {
  const { data: parent } = await supabase
    .from("users")
    .select("whatsapp_phone")
    .eq("id", parentUserId)
    .maybeSingle();

  const parentPhone = parent?.whatsapp_phone as string | null | undefined;
  if (!parentPhone) return true;

  const senderDigits =
    msg.senderPhone?.trim() ||
    (msg.senderId ? jidToPhoneDigits(msg.senderId) : "");
  if (!senderDigits) return true;

  return (
    senderDigits === parentPhone ||
    senderDigits.endsWith(parentPhone) ||
    parentPhone.endsWith(senderDigits)
  );
}

export async function handleWhatsAppCommissionReply(
  supabase: SupabaseClient,
  msg: WhatsAppIncomingMessage
): Promise<boolean> {
  const pending = await findLatestPendingCommissionByGroup(
    supabase,
    msg.groupId
  );
  if (!pending?.requested_at) return false;

  const percent = parseCommissionPercent(msg.text);
  if (percent === null) {
    if (/^\s*[\d٠-٩۰-۹%nسبة]/u.test(msg.text.trim())) {
      await sendWhatsAppMessage(msg.groupId, INVALID_PERCENT_MSG);
      return true;
    }
    return false;
  }

  if (!(await isParentSender(supabase, pending.parent_user_id, msg))) {
    log.info("commission reply ignored: not parent phone", {
      groupId: msg.groupId,
      senderPhone: msg.senderPhone,
    });
    return false;
  }

  const { data: agent } = await supabase
    .from("users")
    .select("display_name, texas_username")
    .eq("id", pending.agent_user_id ?? "")
    .maybeSingle();

  const agentName =
    agent?.display_name?.trim() ||
    agent?.texas_username?.trim() ||
    pending.affiliate_id;

  const commissionAmount = computeBurnCommissionAmount(
    Number(pending.burn_amount),
    percent
  );

  const applied = applyMonthlyBurnCommission(
    Number(pending.final_before_commission),
    commissionAmount
  );

  try {
    await completeMonthlyCommission(supabase, pending.id, {
      percent,
      commissionAmount: applied.commissionAmount,
      finalAfterCommission: applied.finalAfterCommission,
    });
  } catch (err) {
    log.warn("commission already completed or race", {
      id: pending.id,
      error: err instanceof Error ? err.message : String(err),
    });
    return true;
  }

  const beforeLine = formatOrientedBalanceLine(
    applied.finalBeforeCommission,
    "النهائي قبل النسبة"
  );
  const afterLine = formatOrientedBalanceLine(
    applied.finalAfterCommission,
    "النهائي بعد النسبة"
  );

  const confirmText =
    `تم تسجيل نسبة *${fmt(percent)}%* للوكيل *${agentName}*.\n` +
    `حرق الشهر: *${fmt(Number(pending.burn_amount))}*\n` +
    `قيمة النسبة: *${fmt(applied.commissionAmount)}*\n` +
    `${beforeLine}\n` +
    `${afterLine}`;

  await sendWhatsAppMessage(msg.groupId, confirmText);

  log.info("monthly commission completed", {
    groupId: msg.groupId,
    affiliateId: pending.affiliate_id,
    monthKey: pending.month_key,
    percent,
    commissionAmount: applied.commissionAmount,
  });

  return true;
}
