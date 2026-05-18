import type { SupabaseClient } from "@supabase/supabase-js";

export async function extendSubscription(
  supabase: SupabaseClient,
  userId: string,
  days: number
): Promise<string> {
  const { data: user, error } = await supabase
    .from("users")
    .select("subscription_end_date, role")
    .eq("id", userId)
    .single();

  if (error) throw error;
  if (user.role === "super_master") {
    throw new Error("لا يمكن تعديل اشتراك سوبر ماستر");
  }

  const base = user.subscription_end_date
    ? new Date(user.subscription_end_date)
    : new Date();
  if (base < new Date()) base.setTime(Date.now());
  base.setDate(base.getDate() + days);

  const end = base.toISOString().slice(0, 10);
  const { error: upd } = await supabase
    .from("users")
    .update({ subscription_end_date: end, updated_at: new Date().toISOString() })
    .eq("id", userId);

  if (upd) throw upd;
  return end;
}

export async function shrinkSubscription(
  supabase: SupabaseClient,
  userId: string,
  days: number
): Promise<string> {
  const { data: user, error } = await supabase
    .from("users")
    .select("subscription_end_date, role")
    .eq("id", userId)
    .single();

  if (error) throw error;
  if (!user.subscription_end_date) {
    throw new Error("لا يوجد تاريخ اشتراك");
  }

  const base = new Date(user.subscription_end_date);
  base.setDate(base.getDate() - days);
  const end = base.toISOString().slice(0, 10);

  const { error: upd } = await supabase
    .from("users")
    .update({ subscription_end_date: end, updated_at: new Date().toISOString() })
    .eq("id", userId);

  if (upd) throw upd;
  return end;
}

export async function setUserFrozen(
  supabase: SupabaseClient,
  userId: string,
  frozen: boolean
): Promise<void> {
  const { error } = await supabase
    .from("users")
    .update({ is_frozen: frozen, updated_at: new Date().toISOString() })
    .eq("id", userId);
  if (error) throw error;
}

export async function deleteUser(
  supabase: SupabaseClient,
  userId: string
): Promise<void> {
  const { error } = await supabase
    .from("users")
    .update({
      is_active: false,
      is_frozen: true,
      texas_email_encrypted: null,
      texas_password_encrypted: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId);
  if (error) throw error;
}
