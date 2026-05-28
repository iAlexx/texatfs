import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeTexasLogin } from "@/lib/auth/texas-login";
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
  texasLogin: string;
  texasPassword: string;
  licenseKey: string;
}

export interface CompleteRegistrationResult {
  userId: string;
  subscriptionEndDate: string;
  licenseKey: string;
  relinked?: boolean;
}

export type RegistrationErrorCode =
  | "LICENSE_KEY_INVALID_OR_USED"
  | "RENEWAL_LICENSE_INVALID"
  | "RENEWAL_LICENSE_ALREADY_ON_ACCOUNT"
  | "TELEGRAM_ALREADY_REGISTERED"
  | "TELEGRAM_ALREADY_LINKED_OTHER"
  | "ACCOUNT_NOT_FOUND"
  | "ACCOUNT_ALREADY_EXISTS"
  | "SUBSCRIPTION_EXPIRED_NEED_RENEWAL";

export class RegistrationError extends Error {
  constructor(
    readonly code: RegistrationErrorCode,
    message?: string
  ) {
    super(message ?? code);
    this.name = "RegistrationError";
  }
}

/**
 * Multi-tenant SaaS registration: each Master uses their own Texas credentials.
 */
export class RegistrationService {
  private readonly vault = getCredentialVault();
  private readonly texasSession = new TexasSessionService();
  private readonly subscription = new SubscriptionService();

  constructor(private readonly supabase: SupabaseClient) {}

  async findUserByTexasLogin(texasLogin: string) {
    const normalized = normalizeTexasLogin(texasLogin);

    const { data, error } = await this.supabase
      .from("users")
      .select(
        "id, telegram_id, role, display_name, subscription_end_date, license_key_id, texas_username, is_active"
      )
      .eq("texas_username", normalized)
      .maybeSingle();

    if (error) throw error;
    if (data) return data;

    const { data: ilikeRow, error: ilikeErr } = await this.supabase
      .from("users")
      .select(
        "id, telegram_id, role, display_name, subscription_end_date, license_key_id, texas_username, is_active"
      )
      .ilike("texas_username", normalized)
      .maybeSingle();

    if (ilikeErr) throw ilikeErr;
    return ilikeRow;
  }

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
    await this.texasSession.verifyAgentAccount({
      username: login.trim(),
      password,
    });
  }

  /** Persist verified Texas portal credentials (required for mini-app / sub-agents API). */
  private encryptTexasCredentials(
    normalizedLogin: string,
    password: string
  ): {
    texas_email_encrypted: string;
    texas_password_encrypted: string;
  } {
    return {
      texas_email_encrypted: this.vault.encrypt(normalizedLogin),
      texas_password_encrypted: this.vault.encrypt(password),
    };
  }

  /**
   * Re-attach Telegram to an existing account (after logout).
   * Active subscription: no license required.
   * Expired: requires valid unused renewal license.
   */
  async relinkTelegramToExistingAccount(input: {
    telegramId: number;
    displayName: string;
    texasLogin: string;
    texasPassword: string;
    renewalLicenseKey?: string | null;
  }): Promise<CompleteRegistrationResult> {
    const normalizedLogin = normalizeTexasLogin(input.texasLogin);
    const existing = await this.findUserByTexasLogin(normalizedLogin);

    if (!existing?.id) {
      console.info("[auth/relink] denied: account not found", {
        texasLogin: normalizedLogin,
      });
      throw new RegistrationError("ACCOUNT_NOT_FOUND");
    }

    if (
      existing.telegram_id != null &&
      Number(existing.telegram_id) !== input.telegramId
    ) {
      console.warn("[auth/relink] denied: linked to other telegram", {
        userId: existing.id,
        existingTelegramId: existing.telegram_id,
        attemptedTelegramId: input.telegramId,
      });
      throw new RegistrationError("TELEGRAM_ALREADY_LINKED_OTHER");
    }

    try {
      await this.verifyTexasCredentials(input.texasLogin, input.texasPassword);
    } catch (e) {
      console.warn("[auth/relink] denied: Texas credentials invalid", {
        userId: existing.id,
        error: e instanceof Error ? e.message : String(e),
      });
      throw e;
    }

    const subscriptionActive = await this.subscription.isActive(
      existing.id as string
    );

    let subscriptionEndDate = String(existing.subscription_end_date ?? "");
    let licenseKey = String(existing.license_key_id ?? "");

    if (!subscriptionActive) {
      const renewalKey = input.renewalLicenseKey?.trim().toUpperCase() ?? "";
      const existingLicense = String(existing.license_key_id ?? "").toUpperCase();

      if (renewalKey && existingLicense && renewalKey === existingLicense) {
        console.info("[auth/relink] user re-entered original license on expired account", {
          userId: existing.id,
        });
        throw new RegistrationError("RENEWAL_LICENSE_ALREADY_ON_ACCOUNT");
      }

      if (!renewalKey) {
        console.info("[auth/relink] denied: subscription expired, no renewal key", {
          userId: existing.id,
        });
        throw new RegistrationError("SUBSCRIPTION_EXPIRED_NEED_RENEWAL");
      }

      if (!(await this.licenseKeyAvailable(renewalKey))) {
        console.warn("[auth/relink] denied: invalid renewal license", {
          userId: existing.id,
        });
        throw new RegistrationError("RENEWAL_LICENSE_INVALID");
      }

      const { data: endDate, error: redeemError } = await this.supabase.rpc(
        "redeem_license_key",
        { p_key: renewalKey, p_user_id: existing.id }
      );

      if (redeemError) {
        console.warn("[auth/relink] renewal redeem failed", {
          userId: existing.id,
          error: redeemError.message,
        });
        throw new RegistrationError("RENEWAL_LICENSE_INVALID");
      }

      subscriptionEndDate = String(endDate);
      licenseKey = renewalKey;
      console.info("[auth/relink] renewal license redeemed", {
        userId: existing.id,
        subscriptionEndDate,
      });
    }

    const texasCreds = this.encryptTexasCredentials(
      normalizedLogin,
      input.texasPassword
    );

    const { error: updErr } = await this.supabase
      .from("users")
      .update({
        telegram_id: input.telegramId,
        display_name: input.displayName,
        texas_username: normalizedLogin,
        ...texasCreds,
        is_active: true,
      })
      .eq("id", existing.id);

    if (updErr) throw updErr;

    console.info("[auth/relink] Texas credentials re-saved for mini-app", {
      userId: existing.id,
      texasUsername: normalizedLogin,
    });

    await this.supabase
      .from("telegram_onboarding_sessions")
      .delete()
      .eq("telegram_id", input.telegramId);

    console.info("[auth/relink] success", {
      userId: existing.id,
      telegramId: input.telegramId,
      subscriptionActive,
    });

    return {
      userId: existing.id as string,
      subscriptionEndDate,
      licenseKey,
      relinked: true,
    };
  }

  /** New master account — fails if Texas login already registered. */
  async completeRegistration(
    input: CompleteRegistrationInput
  ): Promise<CompleteRegistrationResult> {
    const licenseKey = input.licenseKey.trim().toUpperCase();
    const normalizedLogin = normalizeTexasLogin(input.texasLogin);
    const texasPassword = input.texasPassword;

    const existing = await this.findUserByTexasLogin(normalizedLogin);
    if (existing?.id) {
      console.warn("[auth/register] denied: account already exists", {
        userId: existing.id,
        texasLogin: normalizedLogin,
      });
      throw new RegistrationError(
        "ACCOUNT_ALREADY_EXISTS",
        "Account exists — use existing login flow"
      );
    }

    const trace = (step: string, extra?: Record<string, unknown>) => {
      console.info("[registration] step", {
        step,
        telegramId: input.telegramId,
        ...extra,
      });
    };

    try {
      trace("verifyTexasCredentials.start");
      await this.verifyTexasCredentials(input.texasLogin, texasPassword);
      trace("verifyTexasCredentials.done");

      trace("licenseKeyAvailable.start", { licenseKey });
      const available = await this.licenseKeyAvailable(licenseKey);
      if (!available) {
        throw new RegistrationError("LICENSE_KEY_INVALID_OR_USED");
      }

      const { data: licenseRow, error: licenseRowError } = await this.supabase
        .from("license_keys")
        .select("duration_months")
        .eq("key", licenseKey)
        .eq("is_used", false)
        .single();

      if (licenseRowError || !licenseRow) {
        throw new RegistrationError("LICENSE_KEY_INVALID_OR_USED");
      }

      const { data: subscriptionEndDate, error: subEndError } =
        await this.supabase.rpc("subscription_end_from_duration", {
          p_duration: licenseRow.duration_months,
        });

      if (subEndError || !subscriptionEndDate) {
        if (subEndError) throwSupabaseError(subEndError);
        throw new Error("Failed to compute subscription end date");
      }

      const texasCreds = this.encryptTexasCredentials(
        normalizedLogin,
        texasPassword
      );

      const { data: user, error: insertError } = await this.supabase
        .from("users")
        .insert({
          telegram_id: input.telegramId,
          role: "master",
          parent_id: null,
          display_name: input.displayName,
          texas_username: normalizedLogin,
          ...texasCreds,
          registered_via: "telegram_bot",
          is_active: true,
          license_key_id: licenseKey,
          subscription_end_date: subscriptionEndDate,
        })
        .select("id")
        .single();

      if (insertError) {
        if (insertError.code === "23505") {
          throw new RegistrationError("TELEGRAM_ALREADY_REGISTERED");
        }
        throwSupabaseError(insertError);
      }

      const { data: endDate, error: redeemError } = await this.supabase.rpc(
        "redeem_license_key",
        { p_key: licenseKey, p_user_id: user.id }
      );

      if (redeemError) {
        await this.supabase.from("users").delete().eq("id", user.id);
        throw new RegistrationError("LICENSE_KEY_INVALID_OR_USED");
      }

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
        relinked: false,
      };
    } catch (error) {
      if (error instanceof RegistrationError) throw error;
      const err =
        error instanceof Error
          ? error
          : formatSupabaseError(
              error as { message?: string; code?: string; details?: string }
            );
      console.error("[registration] step failed", {
        telegramId: input.telegramId,
        message: err.message,
      });
      throw err;
    }
  }

  async isSubscriptionActive(userId: string): Promise<boolean> {
    return this.subscription.isActive(userId);
  }

  async loadTexasCredentials(userId: string): Promise<{
    username: string;
    password: string;
  }> {
    const { requireUserCredentials } = await import(
      "@/lib/scraper/resolve-user-credentials"
    );
    const creds = await requireUserCredentials(this.supabase, userId);
    return { username: creds.username, password: creds.password };
  }
}
