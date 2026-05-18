import type { SupabaseClient } from "@supabase/supabase-js";
import { sendTelegramMessage } from "@/lib/telegram/bot-api";

export async function checkAndSendSmartAlerts(
  supabase: SupabaseClient,
  userId: string,
  telegramId: number,
  ledger: {
    al_harq: number;
    al_nihai: number;
    suhoubat: number;
    tebat: number;
  },
  subscriptionEndDate: string | null
): Promise<void> {
  const since = new Date();
  since.setDate(since.getDate() - 7);
  const sinceIso = since.toISOString().slice(0, 10);

  const { data: history } = await supabase
    .from("daily_ledgers")
    .select("al_harq, suhoubat")
    .eq("user_id", userId)
    .gte("ledger_date", sinceIso)
    .order("ledger_date", { ascending: false })
    .limit(7);

  const avgHarq =
    history && history.length > 0
      ? history.reduce((s, r) => s + Number(r.al_harq), 0) / history.length
      : 0;

  const alerts: string[] = [];

  if (avgHarq > 0 && ledger.al_harq > avgHarq * 0.8) {
    alerts.push("🔥 <b>تنبيه حرق مرتفع</b>: حرق اليوم يتجاوز 80% من متوسط الأسبوع.");
  }

  if (ledger.al_nihai < 0) {
    alerts.push("⚠️ <b>رصيد حرج</b>: الرصيد النهائي سالب — تدخل فوري مطلوب.");
  } else if (ledger.al_nihai < 100) {
    alerts.push("⚠️ <b>رصيد منخفض</b>: الرصيد النهائي منخفض جداً اليوم.");
  }

  if (subscriptionEndDate) {
    const end = new Date(subscriptionEndDate);
    const now = new Date();
    const diffDays = Math.ceil(
      (end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
    );
    if (diffDays >= 0 && diffDays <= 3) {
      alerts.push(
        `⏳ <b>اشتراكك ينتهي خلال ${diffDays} يوم</b> — جدّد مفتاح الترخيص من حسابي.`
      );
    }
  }

  for (const text of alerts) {
    await sendTelegramMessage(telegramId, text, { parse_mode: "HTML" }).catch(
      () => undefined
    );
  }
}
