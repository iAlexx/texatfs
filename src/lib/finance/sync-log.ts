import type { SupabaseClient } from "@supabase/supabase-js";
import { sendTelegramMessage } from "@/lib/telegram/bot-api";
import { getAdminTelegramIds } from "@/lib/telegram/bot-api";

export async function recordSyncLog(
  supabase: SupabaseClient,
  params: {
    userId: string;
    status: "success" | "failed";
    errorMessage?: string;
    ledgerDate?: string;
    durationMs?: number;
  }
): Promise<void> {
  await supabase.from("sync_logs").insert({
    user_id: params.userId,
    status: params.status,
    error_message: params.errorMessage ?? null,
    ledger_date: params.ledgerDate ?? null,
    duration_ms: params.durationMs ?? null,
  });

  if (params.status === "failed" && params.errorMessage) {
    const admins = getAdminTelegramIds();
    const text = `⚠️ <b>فشل مزامنة</b>\nالمستخدم: <code>${params.userId.slice(0, 8)}…</code>\nالسبب: ${params.errorMessage}`;
    for (const chatId of admins) {
      await sendTelegramMessage(chatId, text, { parse_mode: "HTML" }).catch(
        () => undefined
      );
    }
  }
}
