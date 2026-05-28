import type { SupabaseClient } from "@supabase/supabase-js";

export type MonthlyCommissionStatus =
  | "pending"
  | "completed"
  | "expired"
  | "failed";

export interface MonthlyCommissionRow {
  id: string;
  parent_user_id: string;
  agent_user_id: string | null;
  affiliate_id: string;
  group_id: string | null;
  month_key: string;
  burn_amount: number;
  percent: number | null;
  commission_amount: number | null;
  final_before_commission: number;
  final_after_commission: number | null;
  status: MonthlyCommissionStatus;
  requested_at: string | null;
  response_received_at: string | null;
  prompt_message_id: string | null;
}

export async function getMonthlyCommission(
  supabase: SupabaseClient,
  parentUserId: string,
  affiliateId: string,
  monthKey: string
): Promise<MonthlyCommissionRow | null> {
  const { data, error } = await supabase
    .from("monthly_agent_commissions")
    .select("*")
    .eq("parent_user_id", parentUserId)
    .eq("affiliate_id", affiliateId)
    .eq("month_key", monthKey)
    .maybeSingle();

  if (error) throw error;
  return data as MonthlyCommissionRow | null;
}

export async function upsertPendingMonthlyCommission(
  supabase: SupabaseClient,
  input: {
    parentUserId: string;
    agentUserId: string;
    affiliateId: string;
    groupId: string;
    monthKey: string;
    burnAmount: number;
    finalBeforeCommission: number;
    promptMessageId?: string | null;
  }
): Promise<{
  row: MonthlyCommissionRow;
  created: boolean;
  shouldSendPrompt: boolean;
}> {
  const existing = await getMonthlyCommission(
    supabase,
    input.parentUserId,
    input.affiliateId,
    input.monthKey
  );

  if (existing) {
    const alreadyPrompted =
      existing.status !== "pending" || Boolean(existing.requested_at);
    if (alreadyPrompted) {
      return { row: existing, created: false, shouldSendPrompt: false };
    }

    const { data, error } = await supabase
      .from("monthly_agent_commissions")
      .update({
        burn_amount: input.burnAmount,
        final_before_commission: input.finalBeforeCommission,
        agent_user_id: input.agentUserId,
        group_id: input.groupId,
        prompt_message_id: input.promptMessageId ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id)
      .select("*")
      .single();

    if (error) throw error;
    return {
      row: data as MonthlyCommissionRow,
      created: false,
      shouldSendPrompt: true,
    };
  }

  const { data, error } = await supabase
    .from("monthly_agent_commissions")
    .insert({
      parent_user_id: input.parentUserId,
      agent_user_id: input.agentUserId,
      affiliate_id: input.affiliateId,
      group_id: input.groupId,
      month_key: input.monthKey,
      burn_amount: input.burnAmount,
      final_before_commission: input.finalBeforeCommission,
      status: "pending",
      requested_at: new Date().toISOString(),
      prompt_message_id: input.promptMessageId ?? null,
    })
    .select("*")
    .single();

  if (error) {
    if (error.code === "23505") {
      const again = await getMonthlyCommission(
        supabase,
        input.parentUserId,
        input.affiliateId,
        input.monthKey
      );
      if (again) {
        const skip = again.status !== "pending" || Boolean(again.requested_at);
        return { row: again, created: false, shouldSendPrompt: !skip };
      }
    }
    throw error;
  }

  return {
    row: data as MonthlyCommissionRow,
    created: true,
    shouldSendPrompt: true,
  };
}

export async function completeMonthlyCommission(
  supabase: SupabaseClient,
  id: string,
  update: {
    percent: number;
    commissionAmount: number;
    finalAfterCommission: number;
  }
): Promise<MonthlyCommissionRow> {
  const { data, error } = await supabase
    .from("monthly_agent_commissions")
    .update({
      percent: update.percent,
      commission_amount: update.commissionAmount,
      final_after_commission: update.finalAfterCommission,
      status: "completed",
      response_received_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("status", "pending")
    .select("*")
    .single();

  if (error) throw error;
  return data as MonthlyCommissionRow;
}

export async function findLatestPendingCommissionByGroup(
  supabase: SupabaseClient,
  groupId: string
): Promise<MonthlyCommissionRow | null> {
  const { data, error } = await supabase
    .from("monthly_agent_commissions")
    .select("*")
    .eq("group_id", groupId)
    .eq("status", "pending")
    .order("requested_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data as MonthlyCommissionRow | null;
}
