import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import { SubscriptionExpiredError } from "@/lib/subscription/errors";

export class SubscriptionService {
  constructor(private readonly supabase: SupabaseClient = getSupabaseServiceClient()) {}

  async isActive(userId: string): Promise<boolean> {
    const { data, error } = await this.supabase.rpc("is_subscription_active", {
      p_user_id: userId,
    });

    if (error) throw error;
    return Boolean(data);
  }

  async assertActive(userId: string): Promise<void> {
    const active = await this.isActive(userId);
    if (!active) throw new SubscriptionExpiredError(userId);
  }

  async getEndDate(userId: string): Promise<string | null> {
    const { data, error } = await this.supabase
      .from("users")
      .select("subscription_end_date, role")
      .eq("id", userId)
      .maybeSingle();

    if (error) throw error;
    if (!data) return null;
    if (data.role === "super_master") return null;
    return data.subscription_end_date as string | null;
  }
}
