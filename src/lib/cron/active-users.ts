import type { SupabaseClient } from "@supabase/supabase-js";
import { SubscriptionService } from "@/lib/subscription/SubscriptionService";

export interface CronSubscriber {
  id: string;
  telegram_id: number;
  texas_affiliate_id: string | null;
  display_name: string | null;
  texas_username: string | null;
}

/**
 * Masters registered via Telegram with stored Texas credentials and active subscription.
 */
export async function fetchActiveCronSubscribers(
  supabase: SupabaseClient
): Promise<CronSubscriber[]> {
  const subscription = new SubscriptionService(supabase);

  const { data: rows, error } = await supabase
    .from("users")
    .select(
      "id, telegram_id, texas_affiliate_id, display_name, texas_username, role, is_active, registered_via, texas_email_encrypted, subscription_end_date"
    )
    .eq("role", "master")
    .eq("is_active", true)
    .eq("registered_via", "telegram_bot")
    .not("telegram_id", "is", null)
    .not("texas_email_encrypted", "is", null);

  if (error) throw error;

  const eligible: CronSubscriber[] = [];

  for (const row of rows ?? []) {
    if (!row.telegram_id) continue;
    const active = await subscription.isActive(row.id);
    if (!active) continue;

    eligible.push({
      id: row.id,
      telegram_id: row.telegram_id,
      texas_affiliate_id: row.texas_affiliate_id,
      display_name: row.display_name,
      texas_username: row.texas_username,
    });
  }

  return eligible;
}
