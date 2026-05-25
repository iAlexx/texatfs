/**
 * Pending Cash Confirmations — short-lived state for the 1/2 reply machine.
 *
 * When a master types ✅/🛑 in an agent group, we store a pending row keyed by
 * the bot's confirmation message id. When the master replies "1" or "2" with
 * `quotedMessageId === confirmation.confirm_msg_id`, we resolve the pending
 * row and act accordingly.
 *
 * Rows older than PENDING_TTL_MS are treated as expired.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export const PENDING_TTL_MS = 15 * 60 * 1000; // 15 minutes

export type CashDirection = "in" | "out";

export interface PendingConfirmation {
  id:             string;
  user_id:        string;
  group_id:       string;
  trigger_msg_id: string;
  confirm_msg_id: string;
  affiliate_id:   string;
  email:          string;
  direction:      CashDirection;
  amount:         number;
  created_at:     string;
}

export interface SavePendingInput {
  userId:        string;
  groupId:       string;
  triggerMsgId:  string;
  confirmMsgId:  string;
  affiliateId:   string;
  email:         string;
  direction:     CashDirection;
  amount:        number;
}

export async function savePendingConfirmation(
  supabase: SupabaseClient,
  input: SavePendingInput
): Promise<PendingConfirmation> {
  const { data, error } = await supabase
    .from("whatsapp_pending_confirmations")
    .insert({
      user_id:        input.userId,
      group_id:       input.groupId,
      trigger_msg_id: input.triggerMsgId,
      confirm_msg_id: input.confirmMsgId,
      affiliate_id:   input.affiliateId,
      email:          input.email,
      direction:      input.direction,
      amount:         input.amount,
    })
    .select()
    .single();

  if (error) throw error;
  return data as PendingConfirmation;
}

/**
 * Look up a pending row by the confirmation message id that was quoted in the
 * reply. Returns null if not found or expired.
 */
export async function getPendingByConfirmMsgId(
  supabase: SupabaseClient,
  confirmMsgId: string
): Promise<PendingConfirmation | null> {
  const { data, error } = await supabase
    .from("whatsapp_pending_confirmations")
    .select("*")
    .eq("confirm_msg_id", confirmMsgId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const row = data as PendingConfirmation;
  const ageMs = Date.now() - new Date(row.created_at).getTime();
  if (ageMs > PENDING_TTL_MS) return null;
  return row;
}

/**
 * Fallback: find the most recent non-expired pending row for a group.
 * Used when the user types "1" or "2" without quoting the confirmation msg.
 */
export async function getLatestPendingByGroupId(
  supabase: SupabaseClient,
  groupId: string
): Promise<PendingConfirmation | null> {
  const { data, error } = await supabase
    .from("whatsapp_pending_confirmations")
    .select("*")
    .eq("group_id", groupId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const row = data as PendingConfirmation;
  const ageMs = Date.now() - new Date(row.created_at).getTime();
  if (ageMs > PENDING_TTL_MS) return null;
  return row;
}

export async function deletePendingConfirmation(
  supabase: SupabaseClient,
  id: string
): Promise<void> {
  const { error } = await supabase
    .from("whatsapp_pending_confirmations")
    .delete()
    .eq("id", id);
  if (error) throw error;
}
