/**
 * POST /api/cron/telegram-report
 * Triggered daily at 4:00 AM Damascus time = 01:00 AM UTC.
 * Railway cron expression: 0 1 * * *
 *
 * For each active telegram_tracking_group:
 *  1. Authenticate with Texas API using the group owner's credentials
 *  2. Fetch per-agent sub-agent statistics
 *  3. Fetch today's cash payments from DB
 *  4. For each sub-agent, render a PNG report via Puppeteer
 *  5. Send the PNG to the agent's dedicated Forum Topic via sendPhotoToTopic
 */
import { NextResponse } from "next/server";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import { CronAuthError, verifyCronSecret } from "@/lib/cron/auth";
import { getAllActiveGroups, getAgentTopics } from "@/lib/telegram/tracking-groups";
import { sendPhotoToTopic, sendMessageToTopic } from "@/lib/telegram/bot-api";
import { renderTelegramReportHtml, type TelegramReportData } from "@/lib/telegram/render-telegram-report-html";
import { screenshotHtmlToPng } from "@/lib/telegram/report-renderer";
import { TexasSessionService } from "@/lib/services/TexasSessionService";
import { resolveUserCredentials } from "@/lib/scraper/resolve-user-credentials";
import { fetchTexasSubAgentsLive } from "@/lib/texas/texas-live-sub-agents";
import { getSupabaseServiceClient as getSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const runtime = "nodejs";
export const maxDuration = 300;

function todayDamascus(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Damascus" });
}

export async function POST(request: Request): Promise<Response> {
  try {
    verifyCronSecret(request);
  } catch (e) {
    if (e instanceof CronAuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }

  // Always return 202 immediately — this job takes minutes (Puppeteer per agent)
  void runTelegramReportJob().catch((e) => {
    console.error(
      "[cron/telegram-report] job failed:",
      e instanceof Error ? e.message : String(e)
    );
  });

  return NextResponse.json({
    ok: true,
    started: true,
    message: "Telegram daily report job started in background",
  });
}

async function runTelegramReportJob(): Promise<void> {
  const supabase = getSupabaseServiceClient();
  const ledgerDate = todayDamascus();

  console.info("[cron/telegram-report] starting, date=", ledgerDate);

  const groups = await getAllActiveGroups(supabase);
  if (!groups.length) {
    console.info("[cron/telegram-report] no active groups — done");
    return;
  }

  console.info(`[cron/telegram-report] ${groups.length} active group(s)`);

  for (const group of groups) {
    try {
      await processOneGroup(supabase, group.user_id, group.chat_id, group.id, ledgerDate);
    } catch (e) {
      console.error(
        `[cron/telegram-report] group ${group.chat_id} failed:`,
        e instanceof Error ? e.message : String(e)
      );
    }
  }

  console.info("[cron/telegram-report] all groups processed");
}

async function processOneGroup(
  supabase: ReturnType<typeof getSupabase>,
  userId: string,
  chatId: number,
  groupId: string,
  ledgerDate: string
): Promise<void> {
  console.info("[cron/telegram-report] processing group", { chatId, userId });

  // 1. Owner display name
  const { data: userRow } = await supabase
    .from("users")
    .select("display_name, texas_username")
    .eq("id", userId)
    .maybeSingle();
  const ownerName = userRow?.display_name ?? userRow?.texas_username ?? "Texas Funds";

  // 2. Texas credentials
  const creds = await resolveUserCredentials(supabase, userId);
  if (!creds.hasCredentials) {
    console.warn("[cron/telegram-report] no Texas creds for user", userId);
    return;
  }

  // 3. Texas session
  const session = new TexasSessionService();
  const token = await session.signIn({ username: creds.username, password: creds.password });
  const client = session.getClientFromToken(token);

  // 4. Sub-agents with live metrics
  const payload = await fetchTexasSubAgentsLive(client, ledgerDate);

  // 5. Topic map for this group
  const topicMap = await getAgentTopics(supabase, groupId);

  if (!topicMap.size) {
    console.info("[cron/telegram-report] no topics stored for group", groupId);
    return;
  }

  // 6. Cash payments summary per agent (keyed by affiliateId from cash_payments)
  // We reuse the cash_payments table — amounts recorded by bot messages.
  const { data: cashRows } = await supabase
    .from("cash_payments")
    .select("user_id, direction, amount")
    .eq("user_id", userId)
    .eq("payment_date", ledgerDate);

  // Aggregate: total cash in/out for all agents combined (owner-level summary)
  let totalCashIn = 0;
  let totalCashOut = 0;
  for (const row of cashRows ?? []) {
    if (row.direction === "in")  totalCashIn  += Number(row.amount);
    if (row.direction === "out") totalCashOut += Number(row.amount);
  }

  // 7. For each sub-agent that has a topic, render + send
  const generatedAt = new Date().toISOString();

  for (const agent of payload.agents) {
    const topicId = topicMap.get(agent.affiliateId);
    if (!topicId) continue;

    const reportData: TelegramReportData = {
      ownerName,
      agentLabel:    agent.username,
      ledgerDate,
      texasBalance:  agent.metrics.al_nihai,
      totalDeposit:  agent.metrics.tebat,
      totalWithdraw: agent.metrics.suhoubat,
      ngr:           agent.metrics.al_harq,
      cashIn:        totalCashIn,
      cashOut:       totalCashOut,
      finalBalance:  agent.metrics.al_nihai + totalCashIn - totalCashOut,
      generatedAt,
    };

    try {
      const html   = renderTelegramReportHtml(reportData);
      const png    = await screenshotHtmlToPng(html);
      const caption = `📊 ${agent.username} · ${ledgerDate}`;
      await sendPhotoToTopic(chatId, topicId, png, caption);

      console.info("[cron/telegram-report] sent to topic", {
        agent: agent.username,
        topicId,
        chatId,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[cron/telegram-report] failed for agent ${agent.affiliateId}:`, msg);

      // Fallback: send plain text to the topic so the master is aware
      await sendMessageToTopic(
        chatId,
        topicId,
        `⚠️ فشل إنشاء التقرير الصوري لـ <b>${agent.username}</b>\n<code>${msg}</code>`,
        { parse_mode: "HTML" }
      ).catch(() => undefined);
    }
  }
}
