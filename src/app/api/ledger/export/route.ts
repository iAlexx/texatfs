import { NextResponse } from "next/server";
import { resolveLedgerUser, LedgerAuthError } from "@/lib/ledger/resolve-user";
import { assertCanViewUser } from "@/lib/hierarchy/sub-agents";
import { loadReportRenderData } from "@/lib/report/load-report-data";
import { dispatchDailySummaryPhoto } from "@/lib/report/daily-summary-dispatcher";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import { resolveLedgerDate } from "@/lib/cron/ledger-date";
import type { LedgerAuthInput } from "@/lib/ledger/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

interface ExportBody extends LedgerAuthInput {
  /** Omit to share your own ledger report */
  targetUserId?: string;
  ledgerDate?: string;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ExportBody;
    const { user } = await resolveLedgerUser(body);
    const supabase = getSupabaseServiceClient();
    const ledgerDate = body.ledgerDate ?? resolveLedgerDate();

    const targetUserId = body.targetUserId?.trim() || user.id;
    if (targetUserId !== user.id) {
      await assertCanViewUser(supabase, user.id, targetUserId);
    }

    const masterTelegramId = user.telegram_id;
    if (!masterTelegramId) {
      return NextResponse.json(
        { error: "حساب تيليغرام غير مربوط" },
        { status: 400 }
      );
    }

    const { data: ledgerRow, error } = await supabase
      .from("daily_ledgers")
      .select("id")
      .eq("user_id", targetUserId)
      .eq("ledger_date", ledgerDate)
      .maybeSingle();

    if (error) throw error;
    if (!ledgerRow?.id) {
      return NextResponse.json(
        { error: "لا يوجد تقرير لهذا الوكيل في هذا التاريخ" },
        { status: 404 }
      );
    }

    const renderData = await loadReportRenderData(supabase, ledgerRow.id);
    if (!renderData) {
      return NextResponse.json({ error: "تعذر تحميل التقرير" }, { status: 404 });
    }

    await dispatchDailySummaryPhoto(masterTelegramId, ledgerRow.id, renderData);

    return NextResponse.json({
      ok: true,
      message: "تم إرسال صورة التقرير إلى تيليغرام",
      ledger_id: ledgerRow.id,
    });
  } catch (e) {
    if (e instanceof LedgerAuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    const msg = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
