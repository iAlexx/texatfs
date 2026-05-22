import type { SupabaseClient } from "@supabase/supabase-js";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TrackingGroup {
  id: string;
  user_id: string;
  chat_id: number;
  chat_title: string;
  is_active: boolean;
  topics_created_at: string | null;
  created_at: string;
}

export interface AgentTopic {
  id: string;
  group_id: string;
  affiliate_id: string;
  username: string;
  topic_id: number;
}

export interface TrackingStatus {
  active: boolean;
  chatTitle: string | null;
  chatId: number | null;
  topicCount: number;
}

// ─── Group helpers ────────────────────────────────────────────────────────────

export async function upsertTrackingGroup(
  supabase: SupabaseClient,
  userId: string,
  chatId: number,
  chatTitle: string
): Promise<TrackingGroup> {
  const { data, error } = await supabase
    .from("telegram_tracking_groups")
    .upsert(
      { user_id: userId, chat_id: chatId, chat_title: chatTitle, is_active: true },
      { onConflict: "user_id", ignoreDuplicates: false }
    )
    .select()
    .single();

  if (error) throw error;
  return data as TrackingGroup;
}

export async function markTopicsCreated(
  supabase: SupabaseClient,
  groupId: string
): Promise<void> {
  const { error } = await supabase
    .from("telegram_tracking_groups")
    .update({ topics_created_at: new Date().toISOString() })
    .eq("id", groupId);
  if (error) throw error;
}

export async function getTrackingGroupByUserId(
  supabase: SupabaseClient,
  userId: string
): Promise<TrackingGroup | null> {
  const { data, error } = await supabase
    .from("telegram_tracking_groups")
    .select("*")
    .eq("user_id", userId)
    .eq("is_active", true)
    .maybeSingle();

  if (error) throw error;
  return (data as TrackingGroup | null);
}

export async function getTrackingGroupByTelegramId(
  supabase: SupabaseClient,
  telegramId: number
): Promise<{ group: TrackingGroup; userId: string } | null> {
  // Join via users table to find the master who owns this telegram account
  const { data: userRow, error: userErr } = await supabase
    .from("users")
    .select("id")
    .eq("telegram_id", telegramId)
    .maybeSingle();

  if (userErr) throw userErr;
  if (!userRow) return null;

  const group = await getTrackingGroupByUserId(supabase, userRow.id);
  if (!group) return null;
  return { group, userId: userRow.id };
}

export async function getAllActiveGroups(
  supabase: SupabaseClient
): Promise<Array<TrackingGroup & { user_id: string }>> {
  const { data, error } = await supabase
    .from("telegram_tracking_groups")
    .select("*")
    .eq("is_active", true);

  if (error) throw error;
  return (data ?? []) as Array<TrackingGroup & { user_id: string }>;
}

// ─── Topic helpers ────────────────────────────────────────────────────────────

export async function saveAgentTopic(
  supabase: SupabaseClient,
  groupId: string,
  affiliateId: string,
  username: string,
  topicId: number
): Promise<void> {
  const { error } = await supabase
    .from("telegram_agent_topics")
    .upsert(
      { group_id: groupId, affiliate_id: affiliateId, username, topic_id: topicId },
      { onConflict: "group_id,affiliate_id", ignoreDuplicates: false }
    );
  if (error) throw error;
}

/** Returns a Map<affiliateId, topicId> for a given group. */
export async function getAgentTopics(
  supabase: SupabaseClient,
  groupId: string
): Promise<Map<string, number>> {
  const { data, error } = await supabase
    .from("telegram_agent_topics")
    .select("affiliate_id, topic_id")
    .eq("group_id", groupId);

  if (error) throw error;
  const map = new Map<string, number>();
  for (const row of data ?? []) {
    map.set(String(row.affiliate_id), Number(row.topic_id));
  }
  return map;
}

// ─── Status aggregation ───────────────────────────────────────────────────────

export async function getTrackingStatusForUser(
  supabase: SupabaseClient,
  userId: string
): Promise<TrackingStatus> {
  const group = await getTrackingGroupByUserId(supabase, userId);
  if (!group) {
    return { active: false, chatTitle: null, chatId: null, topicCount: 0 };
  }

  const { count, error } = await supabase
    .from("telegram_agent_topics")
    .select("id", { count: "exact", head: true })
    .eq("group_id", group.id);

  if (error) throw error;

  return {
    active: true,
    chatTitle: group.chat_title,
    chatId: group.chat_id,
    topicCount: count ?? 0,
  };
}
