import type { SupabaseClient } from "@supabase/supabase-js";
import { assertCanViewUser } from "@/lib/hierarchy/access";
import { loadReportRenderData } from "@/lib/report/load-report-data";
import { dispatchDailySummaryPhoto } from "@/lib/report/daily-summary-dispatcher";
import { resolveLedgerDate } from "@/lib/cron/ledger-date";

export async function generateAndSendReport(params: {
  supabase: SupabaseClient;
  viewerId: string;
  viewerTelegramId: number;
  targetUserId?: string;
  ledgerDate?: string;
}): Promise<{ ok: true; ledger_id: string; message: string }> {
  const ledgerDate = params.ledgerDate ?? resolveLedgerDate();
  const targetUserId = params.targetUserId?.trim() || params.viewerId;

  if (targetUserId !== params.viewerId) {
    await assertCanViewUser(params.supabase, params.viewerId, targetUserId);
  }

  const { data: ledgerRow, error } = await params.supabase
    .from("daily_ledgers")
    .select("id")
    .eq("user_id", targetUserId)
    .eq("ledger_date", ledgerDate)
    .maybeSingle();

  if (error) throw error;
  if (!ledgerRow?.id) {
    throw new Error("لا يوجد تقرير لهذا التاريخ");
  }

  const renderData = await loadReportRenderData(params.supabase, ledgerRow.id);
  if (!renderData) {
    throw new Error("تعذر تحميل التقرير");
  }

  await dispatchDailySummaryPhoto(
    params.viewerTelegramId,
    ledgerRow.id,
    renderData
  );

  return {
    ok: true,
    ledger_id: ledgerRow.id,
    message: "تم إرسال صورة التقرير إلى تيليغرام",
  };
}
