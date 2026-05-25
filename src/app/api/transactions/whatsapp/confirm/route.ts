import { NextResponse } from "next/server";
import { z } from "zod";
import { LedgerLockError } from "@/lib/accounting/ledger-lock";
import { getWaselFromWhatsApp } from "@/lib/accounting/whatsapp-wasel";
import {
  LedgerAuthError,
  resolveLedgerUser,
} from "@/lib/ledger/resolve-user";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import { assertCanViewUser } from "@/lib/hierarchy/access";
import { recordWhatsAppCashPayment } from "@/lib/whatsapp/record-cash-transaction";
import { createLogger } from "@/lib/observability/logger";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const runtime = "nodejs";

const log = createLogger("api/transactions/whatsapp/confirm");

const bodySchema = z.object({
  initData: z.string().optional(),
  telegramUserId: z.number().optional(),
  ledger_id: z.string().uuid(),
  amount: z.number().positive(),
  direction: z.enum(["in", "out"]),
  whatsapp_message_id: z.string().min(1).max(512),
  group_jid: z.string().min(1).max(512),
  group_name: z.string().max(256).default(""),
  raw_message: z.string().max(4096).default(""),
  sender_jid: z.string().max(256).nullable().optional(),
});

export async function POST(request: Request): Promise<Response> {
  try {
    const raw = await request.json().catch(() => null);
    if (!raw) {
      return NextResponse.json(
        { ok: false, error: "بيانات الطلب غير صالحة" },
        { status: 400 }
      );
    }

    const parsed = bodySchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        {
          ok: false,
          error: "بيانات الطلب غير صالحة",
          details: parsed.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    const body = parsed.data;

    const { user, subscriptionActive } = await resolveLedgerUser(body);
    if (!subscriptionActive) {
      return NextResponse.json(
        { ok: false, error: "انتهى الاشتراك", subscription_active: false },
        { status: 402 }
      );
    }

    const supabase = getSupabaseServiceClient();

    const { data: ledgerRow, error: ledgerErr } = await supabase
      .from("daily_ledgers")
      .select("id, user_id, ledger_date")
      .eq("id", body.ledger_id)
      .maybeSingle();

    if (ledgerErr) throw ledgerErr;
    if (!ledgerRow) {
      return NextResponse.json(
        { ok: false, error: "اليومية غير موجودة" },
        { status: 404 }
      );
    }

    await assertCanViewUser(supabase, user.id, ledgerRow.user_id as string);

    const result = await recordWhatsAppCashPayment(supabase, {
      userId: ledgerRow.user_id as string,
      groupJid: body.group_jid,
      groupName: body.group_name,
      dedupeKey: body.whatsapp_message_id,
      direction: body.direction,
      amount: body.amount,
      rawMessage: body.raw_message,
      senderJid: body.sender_jid ?? null,
      paymentDate: ledgerRow.ledger_date as string,
    });

    if (!result.ok) {
      const status = result.error?.includes("مقفلة") ? 409 : 500;
      return NextResponse.json(
        { ok: false, error: result.error },
        { status }
      );
    }

    if (result.duplicate) {
      const existing = await supabase
        .from("transactions")
        .select("id, type, amount, whatsapp_confirmed_at, created_at")
        .eq("whatsapp_message_id", body.whatsapp_message_id)
        .maybeSingle();

      return NextResponse.json({
        ok: true,
        duplicate: true,
        message: "العملية مسجّلة مسبقاً — لا يوجد تكرار",
        transaction: existing.data ?? null,
      });
    }

    const wasel = await getWaselFromWhatsApp(supabase, body.ledger_id);

    log.info("whatsapp transaction confirmed via API", {
      userId: user.id,
      ledgerId: body.ledger_id,
      transactionId: result.transactionId,
      messageId: body.whatsapp_message_id,
    });

    return NextResponse.json({
      ok: true,
      message: "تم تسجيل العملية المؤكدة من واتساب بنجاح",
      transaction_id: result.transactionId,
      ledger_id: body.ledger_id,
      wasel_totals: wasel,
    });
  } catch (e) {
    if (e instanceof LedgerAuthError) {
      return NextResponse.json(
        { ok: false, error: e.message },
        { status: e.status }
      );
    }
    if (e instanceof LedgerLockError) {
      return NextResponse.json(
        { ok: false, error: e.message, code: e.code },
        { status: e.status }
      );
    }
    const msg = e instanceof Error ? e.message : "Server error";
    log.error("confirm endpoint error", { error: msg });
    return NextResponse.json(
      { ok: false, error: msg },
      { status: 500 }
    );
  }
}
