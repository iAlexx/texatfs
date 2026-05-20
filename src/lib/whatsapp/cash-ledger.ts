import type { SupabaseClient } from "@supabase/supabase-js";
import type { ParsedPayment } from "@/lib/whatsapp/message-parser";

export interface CashPaymentRecord {
  id: string;
  user_id: string;
  group_jid: string;
  group_name: string | null;
  message_id: string;
  direction: "in" | "out";
  amount: number;
  raw_message: string | null;
  sender_jid: string | null;
  payment_date: string;
  created_at: string;
}

export interface DayCashSummary {
  totalIn: number;
  totalOut: number;
  net: number;         // totalIn - totalOut
  payments: CashPaymentRecord[];
}

/** Persist a parsed payment message. Silently ignores duplicate message_id. */
export async function saveCashPayment(
  supabase: SupabaseClient,
  params: {
    userId: string;
    groupJid: string;
    groupName?: string | null;
    messageId: string;
    payment: ParsedPayment;
    rawMessage?: string;
    senderJid?: string;
    paymentDate: string;
  }
): Promise<void> {
  const { error } = await supabase.from("cash_payments").upsert(
    {
      user_id: params.userId,
      group_jid: params.groupJid,
      group_name: params.groupName ?? null,
      message_id: params.messageId,
      direction: params.payment.direction,
      amount: params.payment.amount,
      raw_message: params.rawMessage ?? null,
      sender_jid: params.senderJid ?? null,
      payment_date: params.paymentDate,
    },
    { onConflict: "message_id", ignoreDuplicates: true }
  );

  if (error) {
    console.error("[cash-ledger] saveCashPayment failed", error.message);
  }
}

/** Fetch all cash payments for a user on a specific date. */
export async function getDayCashSummary(
  supabase: SupabaseClient,
  userId: string,
  paymentDate: string
): Promise<DayCashSummary> {
  const { data, error } = await supabase
    .from("cash_payments")
    .select("*")
    .eq("user_id", userId)
    .eq("payment_date", paymentDate)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[cash-ledger] getDayCashSummary failed", error.message);
    return { totalIn: 0, totalOut: 0, net: 0, payments: [] };
  }

  const payments = (data ?? []) as CashPaymentRecord[];
  let totalIn = 0;
  let totalOut = 0;

  for (const p of payments) {
    if (p.direction === "in") totalIn += Number(p.amount);
    else totalOut += Number(p.amount);
  }

  return {
    totalIn: round4(totalIn),
    totalOut: round4(totalOut),
    net: round4(totalIn - totalOut),
    payments,
  };
}

function round4(n: number): number {
  return Math.round(n * 10_000) / 10_000;
}
