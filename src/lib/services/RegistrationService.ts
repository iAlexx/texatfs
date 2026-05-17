import type { SupabaseClient } from "@supabase/supabase-js";
import { getCredentialVault } from "@/lib/security/CredentialVault";
import { TexasSessionService } from "@/lib/services/TexasSessionService";
import { SubscriptionService } from "@/lib/subscription/SubscriptionService";

export interface CompleteRegistrationInput {
  telegramId: number;
  displayName: string;
  texasEmail: string;
  texasPassword: string;
  licenseKey: string;
}

export interface CompleteRegistrationResult {
  userId: string;
  subscriptionEndDate: string;
  licenseKey: string;
}

export class RegistrationService {
  private readonly vault = getCredentialVault();
  private readonly texasSession = new TexasSessionService();
  private readonly subscription = new SubscriptionService();

  constructor(private readonly supabase: SupabaseClient) {}

  async findUserByTelegramId(telegramId: number) {
    const { data, error } = await this.supabase
      .from("users")
      .select(
        "id, telegram_id, role, display_name, subscription_end_date, registered_via"
      )
      .eq("telegram_id", telegramId)
      .maybeSingle();

    if (error) throw error;
    return data;
  }

  async licenseKeyAvailable(key: string): Promise<boolean> {
    const { data, error } = await this.supabase
      .from("license_keys")
      .select("key")
      .eq("key", key)
      .eq("is_used", false)
      .maybeSingle();

    if (error) throw error;
    return Boolean(data);
  }

  async verifyTexasCredentials(login: string, password: string): Promise<void> {
    const username = login.trim();
    const pass = password.trim();
    await this.texasSession.verifySession({ username, password: pass });
  }

  async completeRegistration(
    input: CompleteRegistrationInput
  ): Promise<CompleteRegistrationResult> {
    const licenseKey = input.licenseKey.trim().toUpperCase();

    const available = await this.licenseKeyAvailable(licenseKey);
    if (!available) {
      throw new Error("LICENSE_KEY_INVALID_OR_USED");
    }

    await this.verifyTexasCredentials(input.texasEmail, input.texasPassword);

    const emailEnc = this.vault.encrypt(input.texasEmail.trim());
    const passEnc = this.vault.encrypt(input.texasPassword);

    const { data: user, error: insertError } = await this.supabase
      .from("users")
      .insert({
        telegram_id: input.telegramId,
        role: "master",
        parent_id: null,
        display_name: input.displayName,
        texas_username: input.texasEmail.trim(),
        texas_email_encrypted: emailEnc,
        texas_password_encrypted: passEnc,
        registered_via: "admin",
        is_active: true,
      })
      .select("id")
      .single();

    if (insertError) {
      if (insertError.code === "23505") {
        throw new Error("TELEGRAM_ALREADY_REGISTERED");
      }
      throw insertError;
    }

    const { data: endDate, error: redeemError } = await this.supabase.rpc(
      "redeem_license_key",
      { p_key: licenseKey, p_user_id: user.id }
    );

    if (redeemError) {
      await this.supabase.from("users").delete().eq("id", user.id);
      throw redeemError;
    }

    await this.supabase
      .from("users")
      .update({ registered_via: "telegram_bot" })
      .eq("id", user.id);

    const ledgerDate = new Date().toISOString().slice(0, 10);
    await this.supabase.from("daily_ledgers").upsert(
      {
        user_id: user.id,
        ledger_date: ledgerDate,
        status: "open",
        baqi_qadim: 0,
        al_nihai: 0,
      },
      { onConflict: "user_id,ledger_date" }
    );

    await this.supabase
      .from("telegram_onboarding_sessions")
      .delete()
      .eq("telegram_id", input.telegramId);

    return {
      userId: user.id,
      subscriptionEndDate: String(endDate),
      licenseKey,
    };
  }

  async isSubscriptionActive(userId: string): Promise<boolean> {
    return this.subscription.isActive(userId);
  }

  async loadTexasCredentials(userId: string): Promise<{
    username: string;
    password: string;
  }> {
    const { data, error } = await this.supabase
      .from("users")
      .select("texas_email_encrypted, texas_password_encrypted")
      .eq("id", userId)
      .single();

    if (error) throw error;
    if (!data.texas_email_encrypted || !data.texas_password_encrypted) {
      throw new Error("Texas credentials not stored for user");
    }

    return {
      username: this.vault.decrypt(data.texas_email_encrypted),
      password: this.vault.decrypt(data.texas_password_encrypted),
    };
  }
}
