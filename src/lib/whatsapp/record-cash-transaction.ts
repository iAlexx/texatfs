/**
 * Persist a confirmed WhatsApp cash payment into the ledger pipeline.
 *
 * Writes to `transactions` (DB trigger fires refresh_ledger_wasel) and keeps
 * `cash_payments` + `whatsapp_inbound_log` as audit mirrors.
 *
 * Idempotency: unique constraint on whatsapp_message_id (23505 = duplicate).
 * Lock guard:  assertLedgerWritable() + DB trigger block locked-ledger inserts.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { flagLedgerDiscrepancyIfNeeded } from "@/lib/accounting/ledger-integrity";
import { assertLedgerWritable, LedgerLockError } from "@/lib/accounting/ledger-lock";
import { resolveLedgerDate } from "@/lib/cron/ledger-date";
import { createLogger } from "@/lib/observability/logger";
import {
  assertMatchingUserId,
  logUserScope,
} from "@/lib/security/user-context";
import type { CashDirection } from "@/lib/whatsapp/pending";

const log = createLogger("whatsapp/record-cash");

export interface RecordCashPaymentInput {
  userId: string;
  groupJid: string;
  groupName: string;
  dedupeKey: string;
  direction: CashDirection;
  amount: number;
  rawMessage: string;
  senderJid: string | null;
  paymentDate?: string;
}

export interface RecordCashPaymentResult {
  ok: boolean;
  duplicate?: boolean;
  transactionId?: string;
  error?: string;
}

function directionToTransactionType(
  direction: CashDirection
): "wasel_menho" | "wasel_eleih" {
  return direction === "out" ? "wasel_menho" : "wasel_eleih";
}

async function ensureDailyLedgerId(
  supabase: SupabaseClient,
  userId: string,
  ledgerDate: string
): Promise<string> {
  const { data: existing, error: readErr } = await supabase
    .from("daily_ledgers")
    .select("id, user_id")
    .eq("user_id", userId)
    .eq("ledger_date", ledgerDate)
    .maybeSingle();

  if (readErr) throw readErr;
  if (existing?.id) {
    assertMatchingUserId(userId, existing.user_id as string, "ensureDailyLedgerId");
    await assertLedgerWritable(supabase, existing.id as string);
    return existing.id as string;
  }

  const { data: created, error: insertErr } = await supabase
    .from("daily_ledgers")
    .insert({
      user_id: userId,
      ledger_date: ledgerDate,
      status: "open",
      baqi_qadim: 0,
      al_nihai: 0,
    })
    .select("id, user_id")
    .single();

  if (insertErr) {
    if (insertErr.code === "23505") {
      const { data: raced, error: raceErr } = await supabase
        .from("daily_ledgers")
        .select("id, user_id")
        .eq("user_id", userId)
        .eq("ledger_date", ledgerDate)
        .maybeSingle();
      if (raceErr) throw raceErr;
      if (raced?.id) {
        assertMatchingUserId(userId, raced.user_id as string, "ensureDailyLedgerId");
        await assertLedgerWritable(supabase, raced.id as string);
        return raced.id as string;
      }
    }
    throw insertErr;
  }

  return created.id as string;
}

export async function recordWhatsAppCashPayment(
  supabase: SupabaseClient,
  input: RecordCashPaymentInput
): Promise<RecordCashPaymentResult> {
  const paymentDate = input.paymentDate ?? resolveLedgerDate();
  const txType = directionToTransactionType(input.direction);

  try {
    logUserScope(
      {
        resolvedUserId: input.userId,
        whatsappChatId: input.groupJid,
      },
      "recordWhatsAppCashPayment"
    );

    const dailyLedgerId = await ensureDailyLedgerId(
      supabase,
      input.userId,
      paymentDate
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
        whatsapp_confirmed_at: new Date().toISOString(),
        parsed_direction: input.direction,
        is_confirmed: true,
      })
      .select("id")
      .single();

    if (txErr) {
      if (txErr.code === "23505") {
        log.info("duplicate whatsapp transaction skipped", {
          dedupeKey: input.dedupeKey,
          userId: input.userId,
        });
        return { ok: true, duplicate: true };
      }
      const lockErr = txErr.message?.includes("LEDGER_LOCKED");
      if (lockErr) {
        log.warn("transaction blocked by locked ledger", {
          ledgerId: dailyLedgerId,
          dedupeKey: input.dedupeKey,
        });
        return { ok: false, error: "هذه اليومية مقفلة — لا يمكن تسجيل عمليات جديدة" };
      }
      log.error("transaction insert failed", { error: txErr.message });
      return { ok: false, error: txErr.message };
    }

    const transactionId = (txRow?.id as string) ?? null;

    // Audit mirrors — awaited to guarantee delivery
    const [inboundResult, cashResult] = await Promise.allSettled([
      supabase.from("whatsapp_inbound_log").upsert(
        {
          whatsapp_message_id: input.dedupeKey,
          whatsapp_group_id: input.groupJid,
          raw_body: input.rawMessage,
          matched: true,
          parsed_type: txType,
          parsed_amount: input.amount,
          assigned_user_id: input.userId,
          transaction_id: transactionId,
        },
        { onConflict: "whatsapp_message_id" }
      ),
      supabase.from("cash_payments").upsert(
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
      ),
    ]);

    if (inboundResult.status === "rejected") {
      log.warn("whatsapp_inbound_log upsert failed", {
        error: String(inboundResult.reason),
      });
    }
    if (cashResult.status === "rejected") {
      log.warn("cash_payments upsert failed", {
        error: String(cashResult.reason),
      });
    }

    void flagLedgerDiscrepancyIfNeeded(supabase, dailyLedgerId).catch((e) => {
      log.warn("discrepancy check failed", {
        ledgerId: dailyLedgerId,
        error: e instanceof Error ? e.message : String(e),
      });
    });

    log.info("whatsapp transaction recorded", {
      transactionId,
      userId: input.userId,
      dedupeKey: input.dedupeKey,
      type: txType,
      amount: input.amount,
      ledgerId: dailyLedgerId,
    });

    return { ok: true, transactionId: transactionId ?? undefined };
  } catch (err) {
    if (err instanceof LedgerLockError) {
      return { ok: false, error: err.message };
    }
    const message = err instanceof Error ? err.message : String(err);
    log.error("record failed", { error: message });
    return { ok: false, error: message };
  }
}
