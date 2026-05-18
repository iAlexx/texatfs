import type { SupabaseClient } from "@supabase/supabase-js";
import { getCredentialVault } from "@/lib/security/CredentialVault";
import { TexasSessionService } from "@/lib/services/TexasSessionService";
import { SubscriptionService } from "@/lib/subscription/SubscriptionService";
import {
  formatSupabaseError,
  throwSupabaseError,
} from "@/lib/utils/supabase-error";

export interface CompleteRegistrationInput {
  telegramId: number;
  displayName: string;
  /** Texas dashboard username or email — stored as-is (case-sensitive). */
  texasLogin: string;
  texasPassword: string;
  licenseKey: string;
}

export interface CompleteRegistrationResult {
  userId: string;
  subscriptionEndDate: string;
  licenseKey: string;
}

/**
 * Multi-tenant SaaS registration: each Master uses their own Texas credentials.
 * Never uses TEXAS_SYNC_* env vars — only the credentials passed from onboarding.
 */
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

  /**
   * Validates Texas agent account using the user's own credentials only.
   * POST /User/signIn (result.type === 0) + POST /Agent/getAgentAllWallets.
   */
  async verifyTexasCredentials(login: string, password: string): Promise<void> {
    await this.texasSession.verifyAgentAccount({
      username: login.trim(),
      password,
    });
  }

  async completeRegistration(
    input: CompleteRegistrationInput
  ): Promise<CompleteRegistrationResult> {
    const licenseKey = input.licenseKey.trim().toUpperCase();
    const texasLogin = input.texasLogin.trim();
    const texasPassword = input.texasPassword;

    const trace = (step: string, extra?: Record<string, unknown>) => {
      console.info("[registration] step", { step, telegramId: input.telegramId, ...extra });
    };

    try {
      // 1) Texas credentials must work (user-specific — not env defaults)
      trace("verifyTexasCredentials.start");
      await this.verifyTexasCredentials(texasLogin, texasPassword);
      trace("verifyTexasCredentials.done");

      // 2) License key must be valid and unused
      trace("licenseKeyAvailable.start", { licenseKey });
      const available = await this.licenseKeyAvailable(licenseKey);
      trace("licenseKeyAvailable.done", { available });
      if (!available) {
        throw new Error("LICENSE_KEY_INVALID_OR_USED");
      }

      // users_licensed_master_chk requires subscription_end_date + license_key_id at INSERT
      // for role=master + registered_via=telegram_bot (not only after redeem_license_key).
      trace("licenseKey.resolve.start", { licenseKey });
      const { data: licenseRow, error: licenseRowError } = await this.supabase
        .from("license_keys")
        .select("duration_months")
        .eq("key", licenseKey)
        .eq("is_used", false)
        .single();

      if (licenseRowError || !licenseRow) {
        trace("licenseKey.resolve.error", {
          message: licenseRowError?.message,
          code: licenseRowError?.code,
        });
        throw new Error("LICENSE_KEY_INVALID_OR_USED");
      }

      const { data: subscriptionEndDate, error: subEndError } =
        await this.supabase.rpc("subscription_end_from_duration", {
          p_duration: licenseRow.duration_months,
        });

      if (subEndError || !subscriptionEndDate) {
        trace("subscription_end_from_duration.error", {
          message: subEndError?.message,
          code: subEndError?.code,
        });
        if (subEndError) throwSupabaseError(subEndError);
        throw new Error("Failed to compute subscription end date");
      }
      trace("licenseKey.resolve.done", {
        durationMonths: licenseRow.duration_months,
        subscriptionEndDate,
      });

      // 3) Persist encrypted per-tenant credentials + license fields (satisfies CHECK)
      trace("users.insert.start");
      const loginEnc = this.vault.encrypt(texasLogin);
      const passEnc = this.vault.encrypt(texasPassword);

      const { data: user, error: insertError } = await this.supabase
        .from("users")
        .insert({
          telegram_id: input.telegramId,
          role: "master",
          parent_id: null,
          display_name: input.displayName,
          texas_username: texasLogin,
          texas_email_encrypted: loginEnc,
          texas_password_encrypted: passEnc,
          registered_via: "telegram_bot",
          is_active: true,
          license_key_id: licenseKey,
          subscription_end_date: subscriptionEndDate,
        })
        .select("id")
        .single();

      if (insertError) {
        trace("users.insert.error", {
          code: insertError.code,
          message: insertError.message,
          details: insertError.details,
          hint: insertError.hint,
        });
        if (insertError.code === "23505") {
          throw new Error("TELEGRAM_ALREADY_REGISTERED");
        }
        if (insertError.code === "23514") {
          throw new Error(
            `Database constraint ${insertError.message} — ensure license_key_id, subscription_end_date, and Texas credentials are set for telegram_bot masters.`
          );
        }
        throwSupabaseError(insertError);
      }
      trace("users.insert.done", { userId: user.id });

      // 4) Redeem license → sets subscription_end_date from key duration
      trace("redeem_license_key.start");
      const { data: endDate, error: redeemError } = await this.supabase.rpc(
        "redeem_license_key",
        { p_key: licenseKey, p_user_id: user.id }
      );

      if (redeemError) {
        trace("redeem_license_key.error", {
          code: redeemError.code,
          message: redeemError.message,
        });
        await this.supabase.from("users").delete().eq("id", user.id);
        if (
          redeemError.message?.includes("LICENSE_KEY_INVALID") ||
          redeemError.code === "P0001"
        ) {
          throw new Error("LICENSE_KEY_INVALID_OR_USED");
        }
        throwSupabaseError(redeemError);
      }
      trace("redeem_license_key.done", { endDate });

      const ledgerDate = new Date().toISOString().slice(0, 10);
      trace("daily_ledgers.upsert.start");
      const { error: ledgerError } = await this.supabase.from("daily_ledgers").upsert(
        {
          user_id: user.id,
          ledger_date: ledgerDate,
          status: "open",
          baqi_qadim: 0,
          al_nihai: 0,
        },
        { onConflict: "user_id,ledger_date" }
      );
      if (ledgerError) {
        trace("daily_ledgers.upsert.error", { message: ledgerError.message });
        throwSupabaseError(ledgerError);
      }
      trace("daily_ledgers.upsert.done");

      trace("onboarding_session.delete.start");
      const { error: sessionDeleteError } = await this.supabase
        .from("telegram_onboarding_sessions")
        .delete()
        .eq("telegram_id", input.telegramId);
      if (sessionDeleteError) {
        trace("onboarding_session.delete.error", {
          message: sessionDeleteError.message,
        });
        throwSupabaseError(sessionDeleteError);
      }
      trace("completeRegistration.done");

      return {
        userId: user.id,
        subscriptionEndDate: String(endDate),
        licenseKey,
      };
    } catch (error) {
      const err =
        error instanceof Error
          ? error
          : formatSupabaseError(
              error as { message?: string; code?: string; details?: string }
            );
      const cause =
        err.cause instanceof Error
          ? err.cause.message
          : err.cause != null
            ? String(err.cause)
            : undefined;
      console.error("[registration] step failed", {
        telegramId: input.telegramId,
        message: err.message,
        cause,
        stack: err.stack?.split("\n").slice(0, 8).join("\n"),
      });
      throw err;
    }
  }

  async isSubscriptionActive(userId: string): Promise<boolean> {
    return this.subscription.isActive(userId);
  }

  /** Load this tenant's Texas credentials for sync jobs (never global env). */
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
      username: this.vault.decrypt(data.texas_email_encrypted).trim(),
      password: this.vault.decrypt(data.texas_password_encrypted).trim(),
    };
  }
}
