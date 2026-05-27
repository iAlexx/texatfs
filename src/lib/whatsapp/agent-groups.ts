/**
 * WhatsApp Agent Groups — DB helper layer.
 *
 * Each row in `whatsapp_agent_groups` maps a sub-agent (by email + affiliate_id)
 * to a unique WhatsApp group id, owned by a master user.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export interface WhatsAppAgentGroup {
  id:           string;
  user_id:      string;
  affiliate_id: string;
  email:        string;
  group_id:     string;
  group_name:   string | null;
  invite_link:  string | null;
  is_active:    boolean;
  created_by_bot: boolean;
  created_at:   string;
  updated_at:   string;
}

export interface AgentGroupLookup {
  userId:      string;
  affiliateId: string;
  email:       string;
  groupId:     string;
  groupName:   string | null;
}

// ── Lookup ────────────────────────────────────────────────────────────────────

/**
 * Resolves `{ userId, affiliateId, email }` for an incoming WhatsApp groupId.
 * Returns null if the group is not mapped to any sub-agent.
 */
export async function getAgentByGroupId(
  supabase: SupabaseClient,
  groupId: string
): Promise<AgentGroupLookup | null> {
  const { data, error } = await supabase
    .from("whatsapp_agent_groups")
    .select("user_id, affiliate_id, email, group_id, group_name")
    .eq("group_id", groupId)
    .eq("is_active", true)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return {
    userId:      data.user_id as string,
    affiliateId: data.affiliate_id as string,
    email:       data.email as string,
    groupId:     data.group_id as string,
    groupName:   (data.group_name as string | null) ?? null,
  };
}

// ── Upsert ────────────────────────────────────────────────────────────────────

export interface UpsertAgentGroupInput {
  userId:      string;
  affiliateId: string;
  email:       string;
  groupId:     string;
  groupName?:  string | null;
  inviteLink?: string | null;
  createdByBot?: boolean;
}

/**
 * Idempotently upserts a (user, affiliate) → group mapping.
 * Conflict is resolved on (user_id, affiliate_id) — re-assigning an agent
 * to a different group simply overwrites the old row.
 */
export async function upsertAgentGroup(
  supabase: SupabaseClient,
  input: UpsertAgentGroupInput
): Promise<WhatsAppAgentGroup> {
  const { data, error } = await supabase
    .from("whatsapp_agent_groups")
    .upsert(
      {
        user_id:      input.userId,
        affiliate_id: input.affiliateId,
        email:        input.email,
        group_id:     input.groupId,
        group_name:   input.groupName ?? null,
        invite_link:  input.inviteLink ?? null,
        is_active:    true,
        created_by_bot: input.createdByBot ?? true,
      },
      { onConflict: "user_id,affiliate_id", ignoreDuplicates: false }
    )
    .select()
    .single();

  if (error) throw error;
  return data as WhatsAppAgentGroup;
}

// ── Listing ───────────────────────────────────────────────────────────────────

export async function listAgentGroupsForUser(
  supabase: SupabaseClient,
  userId: string
): Promise<WhatsAppAgentGroup[]> {
  const { data, error } = await supabase
    .from("whatsapp_agent_groups")
    .select("*")
    .eq("user_id", userId)
    .eq("is_active", true)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as WhatsAppAgentGroup[];
}
