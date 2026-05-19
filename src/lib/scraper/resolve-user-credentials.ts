import type { SupabaseClient } from "@supabase/supabase-js";
import { getCredentialVault } from "@/lib/security/CredentialVault";
import type { UserRole } from "@/lib/supabase/database.types";

export interface ResolvedUserCredentials {
  userId: string;
  username: string;
  password: string;
  texas_username: string | null;
  texas_affiliate_id: string | null;
  role: UserRole;
  hasCredentials: boolean;
}

/**
 * Resolve per-tenant Texas login credentials from encrypted columns.
 * Never reads TEXAS_SYNC_* env vars.
 */
export async function resolveUserCredentials(
  supabase: SupabaseClient,
  userId: string
): Promise<ResolvedUserCredentials> {
  const { data, error } = await supabase
    .from("users")
    .select(
      "id, role, texas_username, texas_affiliate_id, texas_email_encrypted, texas_password_encrypted, is_active"
    )
    .eq("id", userId)
    .maybeSingle();

  if (error) throw error;
  if (!data) {
    throw new Error("المستخدم غير موجود");
  }

  const base: ResolvedUserCredentials = {
    userId: data.id,
    username: "",
    password: "",
    texas_username: data.texas_username,
    texas_affiliate_id: data.texas_affiliate_id,
    role: data.role as UserRole,
    hasCredentials: false,
  };

  if (!data.texas_email_encrypted || !data.texas_password_encrypted) {
    return base;
  }

  const vault = getCredentialVault();
  const username = vault.decrypt(data.texas_email_encrypted).trim();
  const password = vault.decrypt(data.texas_password_encrypted).trim();
  return {
    ...base,
    username,
    password,
    hasCredentials: Boolean(username && password),
  };
}

export async function requireUserCredentials(
  supabase: SupabaseClient,
  userId: string
): Promise<ResolvedUserCredentials & { hasCredentials: true }> {
  const creds = await resolveUserCredentials(supabase, userId);
  if (!creds.hasCredentials) {
    throw new Error(
      "لا توجد بيانات دخول تكساس مخزّنة لهذا الحساب — يجب ربط حساب تكساس أولاً"
    );
  }
  return creds as ResolvedUserCredentials & { hasCredentials: true };
}

/** Texas statistics API role (agent tier uses master-scoped stats). */
export function toTexasSyncRole(
  role: UserRole
): "super_master" | "master" | "player" {
  if (role === "super_master") return "super_master";
  if (role === "player") return "player";
  return "master";
}
