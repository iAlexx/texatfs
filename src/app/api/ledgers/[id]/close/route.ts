import { NextResponse } from "next/server";
import { z } from "zod";
import { closeDailyLedger } from "@/lib/accounting/ledger-closer";
import { LedgerLockError } from "@/lib/accounting/ledger-lock";
import { assertCanViewUser } from "@/lib/hierarchy/access";
import {
  LedgerAuthError,
  resolveLedgerUser,
} from "@/lib/ledger/resolve-user";
import type { LedgerAuthInput } from "@/lib/ledger/types";
import { getSupabaseServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const runtime = "nodejs";

const bodySchema = z.object({
  initData: z.string().optional(),
  telegramUserId: z.number().optional(),
  reason: z.string().max(500).optional(),
});

export async function POST(
  request: Request,
  context: { params: { id: string } }
): Promise<Response> {
  const ledgerId = context.params.id?.trim();
  if (!ledgerId) {
    return NextResponse.json({ error: "معرّف اليومية مطلوب" }, { status: 400 });
  }

  try {
    const raw = (await request.json().catch(() => ({}))) as LedgerAuthInput & {
      reason?: string;
    };
    const parsed = bodySchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "بيانات الطلب غير صالحة" },
        { status: 400 }
      );
    }

    const { user, subscriptionActive } = await resolveLedgerUser(parsed.data);
    if (!subscriptionActive) {
      return NextResponse.json(
        { error: "انتهى الاشتراك", subscription_active: false },
        { status: 402 }
      );
    }

    const supabase = getSupabaseServiceClient();

    const { data: ledgerRow, error: ledgerErr } = await supabase
      .from("daily_ledgers")
      .select("id, user_id")
      .eq("id", ledgerId)
      .maybeSingle();

    if (ledgerErr) throw ledgerErr;
    if (!ledgerRow) {
      return NextResponse.json({ error: "اليومية غير موجودة" }, { status: 404 });
    }

    await assertCanViewUser(supabase, user.id, ledgerRow.user_id as string);

    const result = await closeDailyLedger(
      supabase,
      ledgerId,
      user.id,
      parsed.data.reason
    );

    return NextResponse.json({
      ok: true,
      message: "تم إغلاق اليومية بنجاح",
      ledger_id: result.ledgerId,
      user_id: result.userId,
      closed_at: result.closedAt,
      closed_by: result.closedBy,
      calculation_trace: result.calculationTrace,
    });
  } catch (e) {
    if (e instanceof LedgerAuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    if (e instanceof LedgerLockError) {
      return NextResponse.json(
        { ok: false, error: e.message, code: e.code },
        { status: e.status }
      );
    }
    const msg = e instanceof Error ? e.message : "Server error";
    const status = msg.includes("غير مصرح") ? 403 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
