import type { SupabaseClient } from "@supabase/supabase-js";
import { botAr } from "@/lib/i18n/bot-ar";
import { sendTelegramMessage } from "@/lib/telegram/bot-api";

const SEND_DELAY_MS = 1200;
const MAX_RECIPIENTS = 500;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export async function handleBroadcastCommand(
  supabase: SupabaseClient,
  chatId: number,
  adminTelegramId: number,
  text: string
): Promise<void> {
  const body = text.replace(/^\/broadcast(@\S+)?/i, "").trim();
  if (!body) {
    await sendTelegramMessage(chatId, botAr.broadcastUsage);
    return;
  }

  const message = `📢 تحديث من Texas FUNDS\n\n${body}`;

  const { data: users, error } = await supabase
    .from("users")
    .select("telegram_id")
    .eq("role", "master")
    .not("telegram_id", "is", null)
    .limit(MAX_RECIPIENTS);

  if (error) {
    await sendTelegramMessage(chatId, botAr.genkeyFailed(error.message));
    return;
  }

  const recipients = (users ?? [])
    .map((u) => Number(u.telegram_id))
    .filter((id) => Number.isFinite(id) && id > 0);

  const { data: logRow, error: logErr } = await supabase
    .from("broadcast_logs")
    .insert({
      admin_telegram_id: adminTelegramId,
      message_preview: body.slice(0, 500),
      recipient_filter: "all_masters",
      total_recipients: recipients.length,
      status: "in_progress",
    })
    .select("id")
    .single();

  if (logErr) {
    console.error("[broadcast] log insert failed", logErr.message);
  }

  await sendTelegramMessage(
    chatId,
    botAr.broadcastStarted(recipients.length)
  );

  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (const tgId of recipients) {
    if (tgId === adminTelegramId) {
      skipped += 1;
      continue;
    }

    try {
      await sendTelegramMessage(tgId, message);
      sent += 1;
    } catch (err) {
      failed += 1;
      console.warn("[broadcast] send failed", {
        tgId,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    await sleep(SEND_DELAY_MS);
  }

  if (logRow?.id) {
    await supabase
      .from("broadcast_logs")
      .update({
        sent_count: sent,
        failed_count: failed,
        skipped_count: skipped,
        status: "completed",
        completed_at: new Date().toISOString(),
      })
      .eq("id", logRow.id);
  }

  await sendTelegramMessage(
    chatId,
    botAr.broadcastDone(sent, failed, skipped)
  );
}
