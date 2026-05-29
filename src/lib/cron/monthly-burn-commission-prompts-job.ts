import { createLogger } from "@/lib/observability/logger";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import { resolveLedgerDate } from "@/lib/cron/ledger-date";
import {
  formatMonthKeyArabic,
  loadMonthlyAgentSettlement,
  resolvePreviousMonthKey,
} from "@/lib/accounting/monthly-agent-settlement";
import { upsertPendingMonthlyCommission } from "@/lib/accounting/monthly-commission-repository";
import { sendWhatsAppMessage } from "@/lib/whatsapp/client";

const log = createLogger("cron/monthly-burn-commission-prompts");

function fmt(n: number): string {
  return n.toLocaleString("ar-SY");
}

export async function runMonthlyBurnCommissionPromptsJob(): Promise<{
  ledgerDate: string;
  previousMonthKey: string;
  groupsChecked: number;
  promptsSent: number;
  skippedExisting: number;
  skippedNoSettlement: number;
  failed: number;
}> {
  const ledgerDate = resolveLedgerDate();
  const day = ledgerDate.slice(8, 10);
  const previousMonthKey = resolvePreviousMonthKey(ledgerDate);
  const supabase = getSupabaseServiceClient();

  if (day !== "01") {
    log.info("skipped: not first day of month in ledger timezone", {
      ledgerDate,
      day,
    });
  }

  const { data: groups, error } = await supabase
    .from("whatsapp_agent_groups")
    .select(
      "user_id, affiliate_id, group_id, group_name, email, created_by_bot, is_active"
    )
    .eq("is_active", true)
    .eq("created_by_bot", true)
    .ilike("group_name", "⚜️ %");

  if (error) throw error;

  let promptsSent = 0;
  let skippedExisting = 0;
  let skippedNoSettlement = 0;
  let failed = 0;

  const monthLabel = formatMonthKeyArabic(previousMonthKey);

  for (const g of groups ?? []) {
    const parentUserId = String(g.user_id);
    const affiliateId = String(g.affiliate_id);
    const groupId = String(g.group_id);

    if (!groupId || groupId.startsWith("pending:")) continue;

    try {
      const { data: agent } = await supabase
        .from("users")
        .select("id, display_name, texas_username, is_active")
        .eq("parent_id", parentUserId)
        .eq("texas_affiliate_id", affiliateId)
        .eq("is_active", true)
        .maybeSingle();

      if (!agent?.id) {
        skippedNoSettlement += 1;
        continue;
      }

      const settlement = await loadMonthlyAgentSettlement(
        supabase,
        agent.id as string,
        previousMonthKey
      );

      if (!settlement) {
        skippedNoSettlement += 1;
        continue;
      }

      const agentName =
        (agent.display_name as string | null)?.trim() ||
        (agent.texas_username as string | null)?.trim() ||
        (g.email as string | null)?.trim() ||
        affiliateId;

      const { row, shouldSendPrompt } = await upsertPendingMonthlyCommission(
        supabase,
        {
          parentUserId,
          agentUserId: agent.id as string,
          affiliateId,
          groupId,
          monthKey: previousMonthKey,
          burnAmount: settlement.burnAmount,
          finalBeforeCommission: settlement.finalBeforeCommission,
        }
      );

      if (!shouldSendPrompt) {
        skippedExisting += 1;
        continue;
      }

      const promptText =
        `انتهى شهر *${monthLabel}*.\n` +
        `الوكيل *${agentName}* طلع حرقه عندك: *${fmt(settlement.burnAmount)}*.\n` +
        `كم بدك تعطيه نسبة مئوية؟`;

      const { assertWhatsAppMessagingAllowed } = await import(
        "@/lib/whatsapp/opt-out"
      );
      const allowed = await assertWhatsAppMessagingAllowed(
        supabase,
        parentUserId,
        "monthly-commission-prompt"
      );
      if (!allowed) {
        skippedExisting += 1;
        continue;
      }

      await sendWhatsAppMessage(groupId, promptText);

      await supabase
        .from("monthly_agent_commissions")
        .update({ requested_at: new Date().toISOString() })
        .eq("id", row.id);

      promptsSent += 1;
      log.info("commission prompt sent", {
        parentUserId,
        affiliateId,
        monthKey: previousMonthKey,
        burnAmount: settlement.burnAmount,
        groupId,
      });
    } catch (err) {
      failed += 1;
      log.error("commission prompt failed for group", {
        parentUserId,
        affiliateId,
        groupId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  log.info("monthly commission prompts complete", {
    ledgerDate,
    previousMonthKey,
    groupsChecked: (groups ?? []).length,
    promptsSent,
    skippedExisting,
    skippedNoSettlement,
    failed,
  });

  return {
    ledgerDate,
    previousMonthKey,
    groupsChecked: (groups ?? []).length,
    promptsSent,
    skippedExisting,
    skippedNoSettlement,
    failed,
  };
}
