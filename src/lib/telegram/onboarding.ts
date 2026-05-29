import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeTexasLogin } from "@/lib/auth/texas-login";
import {
  parseOnboardingModeChoice,
  resolvePostPasswordAction,
  resolveLicenseStepAction,
  type OnboardingMode,
} from "@/lib/auth/onboarding-auth-flow";
import {
  RegistrationService,
  RegistrationError,
} from "@/lib/services/RegistrationService";
import { getCredentialVault } from "@/lib/security/CredentialVault";
import { sendTelegramMessage, isAdmin } from "@/lib/telegram/bot-api";
import type { TelegramMessage } from "@/lib/telegram/bot-api";
import { SubscriptionService } from "@/lib/subscription/SubscriptionService";
import { botAr } from "@/lib/i18n/bot-ar";
import {
  checkTelegramChannelMembership,
  sendChannelGateMessage,
} from "@/lib/telegram/channel-gate";

type OnboardingStep =
  | "choose_mode"
  | "login"
  | "password"
  | "license"
  | "renewal_license";

const TEXAS_LOGIN_RE = /^[^\s]{3,128}$/;

function displayName(msg: TelegramMessage): string {
  const from = msg.from;
  if (!from) return "ماستر";
  return [from.first_name, from.last_name].filter(Boolean).join(" ") || "ماستر";
}

async function ensureChannelOrGate(
  chatId: number,
  telegramId: number
): Promise<boolean> {
  if (isAdmin(telegramId)) return true;
  const check = await checkTelegramChannelMembership(telegramId);
  if (check.ok) return true;
  await sendChannelGateMessage(chatId, botAr.channelGateRequired);
  return false;
}

function normalizeStep(raw: string): OnboardingStep | null {
  if (raw === "choose_mode") return "choose_mode";
  if (raw === "login" || raw === "email") return "login";
  if (raw === "password") return "password";
  if (raw === "license") return "license";
  if (raw === "renewal_license") return "renewal_license";
  return null;
}

async function finishAuthSuccess(
  chatId: number,
  result: { subscriptionEndDate: string; relinked?: boolean }
): Promise<void> {
  const end = new Date(result.subscriptionEndDate).toLocaleDateString("ar-SY", {
    timeZone: process.env.LEDGER_TIMEZONE ?? "Asia/Damascus",
  });

  const text = result.relinked
    ? botAr.relinkSuccess(end)
    : botAr.registrationComplete(end);

  await sendTelegramMessage(chatId, text);
}

function mapRegistrationError(err: unknown): string {
  if (err instanceof RegistrationError) {
    switch (err.code) {
      case "LICENSE_KEY_INVALID_OR_USED":
        return botAr.licenseInvalidNew;
      case "RENEWAL_LICENSE_INVALID":
        return botAr.renewalLicenseInvalid;
      case "RENEWAL_LICENSE_ALREADY_ON_ACCOUNT":
        return botAr.renewalLicenseAlreadyOnAccount;
      case "TELEGRAM_ALREADY_LINKED_OTHER":
        return botAr.accountLinkedOtherTelegram;
      case "ACCOUNT_NOT_FOUND":
        return botAr.accountNotFoundUseNew;
      case "ACCOUNT_ALREADY_EXISTS":
        return botAr.accountExistsUseLogin;
      case "SUBSCRIPTION_EXPIRED_NEED_RENEWAL":
        return botAr.subscriptionExpiredRenewal;
      case "TELEGRAM_ALREADY_REGISTERED":
        return botAr.telegramAlreadyRegistered;
      default:
        return botAr.registrationFailed(err.message);
    }
  }

  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes("LICENSE_KEY_INVALID")) return botAr.licenseInvalidNew;
  if (msg.includes("Texas sign-in failed")) {
    return botAr.texasLoginFailed("");
  }
  return botAr.registrationFailed(msg);
}

export async function handleOnboardingMessage(
  supabase: SupabaseClient,
  message: TelegramMessage
): Promise<void> {
  const chatId = message.chat.id;
  const telegramId = message.from?.id ?? chatId;
  const text = (message.text ?? "").trim();
  const registration = new RegistrationService(supabase);
  const subscription = new SubscriptionService(supabase);
  const vault = getCredentialVault();

  if (text === "/start") {
    if (!(await ensureChannelOrGate(chatId, telegramId))) return;

    const existing = await registration.findUserByTelegramId(telegramId);
    if (existing) {
      const active = await subscription.isActive(existing.id);
      if (active) {
        await sendTelegramMessage(
          chatId,
          botAr.welcomeBackActive(existing.display_name ?? "ماستر")
        );
      } else {
        await sendTelegramMessage(chatId, botAr.subscriptionExpiredRenewal);
      }
      return;
    }

    const { error: sessionUpsertError } = await supabase
      .from("telegram_onboarding_sessions")
      .upsert(
        {
          telegram_id: telegramId,
          step: "choose_mode",
          onboarding_mode: null,
          texas_email_encrypted: null,
          texas_password_encrypted: null,
        },
        { onConflict: "telegram_id" }
      );

    if (sessionUpsertError) {
      console.error("[onboarding] session upsert failed", {
        telegramId,
        error: sessionUpsertError.message,
      });
      await sendTelegramMessage(chatId, botAr.sessionDbError);
      return;
    }

    await sendTelegramMessage(chatId, botAr.chooseMode);
    return;
  }

  const { data: session, error: sessionFetchError } = await supabase
    .from("telegram_onboarding_sessions")
    .select("*")
    .eq("telegram_id", telegramId)
    .maybeSingle();

  if (sessionFetchError) {
    await sendTelegramMessage(chatId, botAr.sessionFetchError);
    return;
  }

  if (!session) {
    await sendTelegramMessage(chatId, botAr.sendStart);
    return;
  }

  const step = normalizeStep(session.step as string);
  if (!step) {
    await sendTelegramMessage(chatId, botAr.sessionInvalid);
    return;
  }

  if (step === "choose_mode") {
    const mode = parseOnboardingModeChoice(text);
    if (!mode) {
      await sendTelegramMessage(chatId, botAr.chooseModeInvalid);
      return;
    }

    await supabase
      .from("telegram_onboarding_sessions")
      .update({ step: "email", onboarding_mode: mode })
      .eq("telegram_id", telegramId);

    await sendTelegramMessage(
      chatId,
      mode === "existing" ? botAr.stepLoginExisting : botAr.stepLoginNew
    );
    return;
  }

  const mode = (session.onboarding_mode as OnboardingMode | null) ?? "new";

  if (step === "login") {
    const texasLogin = normalizeTexasLogin(text);
    if (!TEXAS_LOGIN_RE.test(texasLogin)) {
      await sendTelegramMessage(chatId, botAr.loginInvalid);
      return;
    }

    await supabase
      .from("telegram_onboarding_sessions")
      .update({
        step: "password",
        texas_email_encrypted: vault.encrypt(texasLogin),
      })
      .eq("telegram_id", telegramId);

    await sendTelegramMessage(chatId, botAr.stepPassword);
    return;
  }

  if (step === "password") {
    if (text.length < 4) {
      await sendTelegramMessage(chatId, botAr.passwordShort);
      return;
    }

    const { data: fresh } = await supabase
      .from("telegram_onboarding_sessions")
      .select("texas_email_encrypted, onboarding_mode")
      .eq("telegram_id", telegramId)
      .single();

    if (!fresh?.texas_email_encrypted) {
      await sendTelegramMessage(chatId, botAr.sessionExpired);
      return;
    }

    const texasLogin = vault.decrypt(fresh.texas_email_encrypted).trim();
    const sessionMode = (fresh.onboarding_mode as OnboardingMode | null) ?? mode;

    await supabase
      .from("telegram_onboarding_sessions")
      .update({
        texas_password_encrypted: vault.encrypt(text),
      })
      .eq("telegram_id", telegramId);

    const account = await registration.findUserByTexasLogin(texasLogin);
    const subscriptionActive = account?.id
      ? await subscription.isActive(account.id as string)
      : false;

    const action = resolvePostPasswordAction({
      mode: sessionMode,
      accountExists: Boolean(account?.id),
      accountTelegramId: account?.telegram_id != null
        ? Number(account.telegram_id)
        : null,
      currentTelegramId: telegramId,
      subscriptionActive,
    });

    if (action.kind === "deny_other_telegram") {
      await sendTelegramMessage(chatId, botAr.accountLinkedOtherTelegram);
      return;
    }

    if (action.kind === "deny_use_existing") {
      await sendTelegramMessage(chatId, botAr.accountNotFoundUseNew);
      return;
    }

    if (action.kind === "relink_active") {
      await sendTelegramMessage(chatId, botAr.validating);
      try {
        const result = await registration.relinkTelegramToExistingAccount({
          telegramId,
          displayName: displayName(message),
          texasLogin,
          texasPassword: text,
        });
        await finishAuthSuccess(chatId, result);
      } catch (e) {
        await sendTelegramMessage(chatId, mapRegistrationError(e));
      }
      return;
    }

    if (action.kind === "relink_expired") {
      await supabase
        .from("telegram_onboarding_sessions")
        .update({ step: "renewal_license" })
        .eq("telegram_id", telegramId);
      await sendTelegramMessage(chatId, botAr.stepRenewalLicense);
      return;
    }

    await supabase
      .from("telegram_onboarding_sessions")
      .update({ step: "license" })
      .eq("telegram_id", telegramId);
    await sendTelegramMessage(chatId, botAr.stepLicense);
    return;
  }

  if (step === "renewal_license" || step === "license") {
    const licenseKey = text.toUpperCase();
    const { data: freshSession } = await supabase
      .from("telegram_onboarding_sessions")
      .select(
        "texas_email_encrypted, texas_password_encrypted, onboarding_mode"
      )
      .eq("telegram_id", telegramId)
      .single();

    if (
      !freshSession?.texas_email_encrypted ||
      !freshSession?.texas_password_encrypted
    ) {
      await sendTelegramMessage(chatId, botAr.sessionExpired);
      return;
    }

    const texasLogin = vault.decrypt(freshSession.texas_email_encrypted).trim();
    const texasPassword = vault
      .decrypt(freshSession.texas_password_encrypted)
      .trim();
    const sessionMode =
      (freshSession.onboarding_mode as OnboardingMode | null) ?? "new";

    const account = await registration.findUserByTexasLogin(texasLogin);
    const subscriptionActive = account?.id
      ? await subscription.isActive(account.id as string)
      : false;

    const licenseAction = resolveLicenseStepAction({
      mode: sessionMode,
      accountExists: Boolean(account?.id),
      accountTelegramId: account?.telegram_id != null
        ? Number(account.telegram_id)
        : null,
      currentTelegramId: telegramId,
      subscriptionActive,
    });

    await sendTelegramMessage(chatId, botAr.validating);

    try {
      if (licenseAction.kind === "relink_active") {
        if (
          step === "license" &&
          subscriptionActive &&
          account?.license_key_id &&
          licenseKey === String(account.license_key_id).toUpperCase()
        ) {
          await sendTelegramMessage(chatId, botAr.relinkNoLicenseNeeded);
        } else if (step === "license" && subscriptionActive) {
          await sendTelegramMessage(chatId, botAr.relinkNoLicenseNeeded);
        }
        const result = await registration.relinkTelegramToExistingAccount({
          telegramId,
          displayName: displayName(message),
          texasLogin,
          texasPassword,
        });
        await finishAuthSuccess(chatId, result);
        return;
      }

      if (licenseAction.kind === "relink_with_renewal") {
        const result = await registration.relinkTelegramToExistingAccount({
          telegramId,
          displayName: displayName(message),
          texasLogin,
          texasPassword,
          renewalLicenseKey: licenseKey,
        });
        await finishAuthSuccess(chatId, result);
        return;
      }

      if (licenseAction.kind === "register_new") {
        const result = await registration.completeRegistration({
          telegramId,
          displayName: displayName(message),
          texasLogin,
          texasPassword,
          licenseKey,
        });
        await finishAuthSuccess(chatId, result);
        return;
      }

      await sendTelegramMessage(chatId, botAr.sessionInvalid);
    } catch (e) {
      console.error("[onboarding] auth failed", {
        telegramId,
        step,
        error: e instanceof Error ? e.message : String(e),
      });
      await sendTelegramMessage(chatId, mapRegistrationError(e));
    }
  }
}
