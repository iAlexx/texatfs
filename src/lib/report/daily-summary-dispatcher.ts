import { ar } from "@/lib/i18n/ar";
import { formatLedgerDate, formatMoney } from "@/lib/utils/format";
import { resolvePerformanceSummary } from "@/lib/i18n/performance";
import { sendTelegramMessage, sendTelegramPhoto } from "@/lib/telegram/bot-api";
import { captureDailyReportImage } from "@/lib/report/report-screenshot";
import type { ReportRenderData } from "@/lib/report/types";

export function buildDailySummaryCaption(data: ReportRenderData): string {
  const name =
    data.user.display_name ?? data.user.texas_username ?? ar.brand;
  const date = formatLedgerDate(data.ledger.ledger_date);
  const final = formatMoney(data.ledger.al_nihai);
  const performance = resolvePerformanceSummary({
    al_harq: data.ledger.al_harq,
    al_nihai: data.ledger.al_nihai,
    discrepancy_flag: data.ledger.discrepancy_flag,
    tebat: data.ledger.tebat,
  });

  return [
    `📊 ${ar.dailySummary} — ${ar.brandEn}`,
    `👤 ${name}`,
    `📅 ${date}`,
    `💰 ${ar.alNihai}: ${final}`,
    `📌 ${performance}`,
  ].join("\n");
}

export async function dispatchDailySummaryPhoto(
  telegramId: number,
  ledgerId: string,
  captionData: ReportRenderData
): Promise<void> {
  const caption = buildDailySummaryCaption(captionData);

  try {
    const image = await captureDailyReportImage(ledgerId);
    await sendTelegramPhoto(telegramId, image, {
      caption,
      filename: `texas-funds-${captionData.ledger.ledger_date}.png`,
    });
  } catch (photoError) {
    const msg =
      photoError instanceof Error ? photoError.message : String(photoError);
    console.error("[daily-summary] sendPhoto failed, falling back to text", {
      telegramId,
      ledgerId,
      msg,
    });
    await sendTelegramMessage(
      telegramId,
      `${caption}\n\n⚠️ ${ar.photoFallback}`
    );
  }
}
