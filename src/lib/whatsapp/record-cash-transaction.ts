/**
 * Persist a confirmed WhatsApp cash payment into the ledger pipeline.
 *
 * Writes to `transactions` (triggers refresh_ledger_wasel) and keeps
 * `cash_payments` as an audit mirror. Idempotent on whatsapp_message_id.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveLedgerDate } from "@/lib/cron/ledger-date";
import type { CashDirection } from "@/lib/whatsapp/pending";

export interface RecordCashPaymentInput {
  userId: string;
  groupJid: string;
  groupName: string;
  dedupeKey: string;
  direction: CashDirection;
  amount: number;
  rawMessage: string;
  senderJid: string | null;
  /** Defaults to business date (Asia/Damascus). */
  paymentDate?: string;
}

export interface RecordCashPaymentResult {
  ok: boolean;
  duplicate?: boolean;
  error?: string;
}

function directionToTransactionType(
  direction: CashDirection
): "wasel_menho" | "wasel_eleih" {
  // ✅ outgoing (master → agent) = wasel_menho; 🛑 incoming = wasel_eleih
  return direction === "out" ? "wasel_menho" : "wasel_eleih";
}

async function ensureDailyLedgerId(
  supabase: SupabaseClient,
  userId: string,
  ledgerDate: string
): Promise<string> {
  const { data: existing, error: readErr } = await supabase
    .from("daily_ledgers")
    .select("id")
    .eq("user_id", userId)
    .eq("ledger_date", ledgerDate)
    .maybeSingle();

  if (readErr) throw readErr;
  if (existing?.id) return existing.id as string;

  const { data: created, error: insertErr } = await supabase
    .from("daily_ledgers")
    .insert({
      user_id: userId,
      ledger_date: ledgerDate,
      status: "open",
      baqi_qadim: 0,
      al_nihai: 0,
    })
    .select("id")
    .single();

  if (insertErr) {
    if (insertErr.code === "23505") {
      const { data: raced, error: raceErr } = await supabase
        .from("daily_ledgers")
        .select("id")
        .eq("user_id", userId)
        .eq("ledger_date", ledgerDate)
        .maybeSingle();
      if (raceErr) throw raceErr;
      if (raced?.id) return raced.id as string;
    }
    throw insertErr;
  }

  return created.id as string;
}

/**
 * Record a confirmed payment. Never throws — safe for webhook handler.
 */
export async function recordWhatsAppCashPayment(
  supabase: SupabaseClient,
  input: RecordCashPaymentInput
): Promise<RecordCashPaymentResult> {
  const paymentDate = input.paymentDate ?? resolveLedgerDate();
  const txType = directionToTransactionType(input.direction);

  try {
    const { data: existingTx } = await supabase
      .from("transactions")
      .select("id")
      .eq("whatsapp_message_id", input.dedupeKey)
      .maybeSingle();

    if (existingTx) {
      return { ok: true, duplicate: true };
    }

    const dailyLedgerId = await ensureDailyLedgerId(
      supabase,
      input.userId,
      paymentDate
    );

    await supabase.from("whatsapp_inbound_log").upsert(
      {
        whatsapp_message_id: input.dedupeKey,
        whatsapp_group_id: input.groupJid,
        raw_body: input.rawMessage,
        matched: true,
        parsed_type: txType,
        parsed_amount: input.amount,
        assigned_user_id: input.userId,
      },
      { onConflict: "whatsapp_message_id", ignoreDuplicates: true }
    );

    const { data: txRow, error: txErr } = await supabase
      .from("transactions")
      .insert({
        user_id: input.userId,
        daily_ledger_id: dailyLedgerId,
        type: txType,
        source: "whatsapp",
        amount: input.amount,
        raw_message: input.rawMessage,
        whatsapp_group_id: input.groupJid,
        whatsapp_message_id: input.dedupeKey,
        parsed_direction: input.direction,
        is_confirmed: true,
      })
      .select("id")
      .single();

    if (txErr) {
      if (txErr.code === "23505") {
        return { ok: true, duplicate: true };
      }
      console.error("[whatsapp/record-cash] transaction insert failed:", txErr.message);
      return { ok: false, error: txErr.message };
    }

    if (txRow?.id) {
      await supabase
        .from("whatsapp_inbound_log")
        .update({ transaction_id: txRow.id as string })
        .eq("whatsapp_message_id", input.dedupeKey);
    }

    const { error: auditErr } = await supabase.from("cash_payments").upsert(
      {
        user_id: input.userId,
        group_jid: input.groupJid,
        group_name: input.groupName,
        message_id: input.dedupeKey,
        direction: input.direction,
        amount: input.amount,
        raw_message: input.rawMessage,
        sender_jid: input.senderJid,
        payment_date: paymentDate,
      },
      { onConflict: "message_id" }
    );

    if (auditErr) {
      console.warn(
        "[whatsapp/record-cash] cash_payments audit upsert failed (non-fatal):",
        auditErr.message
      );
    }

    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[whatsapp/record-cash] failed:", message);
    return { ok: false, error: message };
  }
}
