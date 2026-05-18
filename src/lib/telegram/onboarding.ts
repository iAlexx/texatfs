import type { SupabaseClient } from "@supabase/supabase-js";
import { RegistrationService } from "@/lib/services/RegistrationService";
import { getCredentialVault } from "@/lib/security/CredentialVault";
import { normalizeTexasUsername } from "@/lib/texas/texas-api-config";
import { sendTelegramMessage } from "@/lib/telegram/bot-api";
import type { TelegramMessage } from "@/lib/telegram/bot-api";
import { SubscriptionService } from "@/lib/subscription/SubscriptionService";
import { botAr, miniAppHint } from "@/lib/i18n/bot-ar";

type OnboardingStep = "login" | "password" | "license";

const TEXAS_LOGIN_RE = /^[^\s]{3,128}$/;

function displayName(msg: TelegramMessage): string {
  const from = msg.from;
  if (!from) return "ماستر";
  return [from.first_name, from.last_name].filter(Boolean).join(" ") || "ماستر";
}

function appUrl(): string | undefined {
  return process.env.TELEGRAM_MINI_APP_URL ?? process.env.NEXT_PUBLIC_APP_URL;
}

function normalizeStep(raw: string): OnboardingStep | null {
  if (raw === "login" || raw === "email") return "login";
  if (raw === "password" || raw === "license") return raw;
  return null;
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

  if (text === "/start") {
    const existing = await registration.findUserByTelegramId(telegramId);
    if (existing) {
      const active = await subscription.isActive(existing.id);
      if (active) {
        await sendTelegramMessage(
          chatId,
          botAr.welcomeBackActive(existing.display_name ?? "ماستر", appUrl())
        );
      } else {
        await sendTelegramMessage(chatId, botAr.subscriptionExpired);
      }
      return;
    }

    const { error: sessionUpsertError } = await supabase
      .from("telegram_onboarding_sessions")
      .upsert(
        {
          telegram_id: telegramId,
          step: "email",
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

    await sendTelegramMessage(chatId, botAr.welcomeNew);
    return;
  }

  const { data: session, error: sessionFetchError } = await supabase
    .from("telegram_onboarding_sessions")
    .select("*")
    .eq("telegram_id", telegramId)
    .maybeSingle();

  if (sessionFetchError) {
    console.error("[onboarding] session fetch failed", {
      telegramId,
      error: sessionFetchError.message,
    });
    await sendTelegramMessage(chatId, botAr.sessionFetchError);
    return;
  }

  if (!session) {
    await sendTelegramMessage(chatId, botAr.sendStart);
    return;
  }

  const vault = getCredentialVault();
  const step = normalizeStep(session.step as string);

  if (!step) {
    await sendTelegramMessage(chatId, botAr.sessionInvalid);
    return;
  }

  if (step === "login") {
    const texasLogin = normalizeTexasUsername(text);
    if (!TEXAS_LOGIN_RE.test(texasLogin)) {
      await sendTelegramMessage(chatId, botAr.loginInvalid);
      return;
    }

    const { error: loginSaveError } = await supabase
      .from("telegram_onboarding_sessions")
      .update({
        step: "password",
        texas_email_encrypted: vault.encrypt(texasLogin),
      })
      .eq("telegram_id", telegramId);

    if (loginSaveError) {
      console.error("[onboarding] login save failed", {
        telegramId,
        error: loginSaveError.message,
      });
      await sendTelegramMessage(chatId, botAr.loginSaveError);
      return;
    }

    await sendTelegramMessage(chatId, botAr.stepPassword);
    return;
  }

  if (step === "password") {
    if (text.length < 4) {
      await sendTelegramMessage(chatId, botAr.passwordShort);
      return;
    }

    const { error: passwordSaveError } = await supabase
      .from("telegram_onboarding_sessions")
      .update({
        step: "license",
        texas_password_encrypted: vault.encrypt(text),
      })
      .eq("telegram_id", telegramId);

    if (passwordSaveError) {
      console.error("[onboarding] password save failed", {
        telegramId,
        error: passwordSaveError.message,
      });
      await sendTelegramMessage(chatId, botAr.passwordSaveError);
      return;
    }

    await sendTelegramMessage(chatId, botAr.stepLicense);
    return;
  }

  if (step === "license") {
    const licenseKey = text.toUpperCase();
    const { data: freshSession, error: sessionError } = await supabase
      .from("telegram_onboarding_sessions")
      .select("texas_email_encrypted, texas_password_encrypted")
      .eq("telegram_id", telegramId)
      .single();

    if (
      sessionError ||
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

    await sendTelegramMessage(chatId, botAr.validating);

    try {
      const result = await registration.completeRegistration({
        telegramId,
        displayName: displayName(message),
        texasLogin,
        texasPassword,
        licenseKey,
      });

      const end = new Date(result.subscriptionEndDate).toLocaleDateString(
        "ar-SY",
        { timeZone: process.env.LEDGER_TIMEZONE ?? "Asia/Damascus" }
      );

      await sendTelegramMessage(
        chatId,
        botAr.registrationComplete(end) + miniAppHint(appUrl())
      );
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      const msg = err.message || "فشل التسجيل";
      console.error("[onboarding] registration failed", {
        telegramId,
        error: msg,
      });

      if (msg.includes("LICENSE_KEY_INVALID")) {
        await sendTelegramMessage(chatId, botAr.licenseInvalid);
        return;
      }
      if (msg.includes("TELEGRAM_ALREADY_REGISTERED")) {
        await sendTelegramMessage(chatId, botAr.telegramAlreadyRegistered);
        return;
      }
      if (msg.includes("Texas sign-in failed")) {
        let detail = "";
        if (msg.includes("Invalid username or password")) {
          detail = "\n\nتكساس: اسم مستخدم أو كلمة مرور غير صحيحة.";
        } else if (msg.includes("HTTP 403")) {
          detail = "\n\nمحظور من تكساس/Cloudflare (403).";
        } else if (msg.includes("HTTP 401")) {
          detail = "\n\nرفض الجلسة (401).";
        }
        await sendTelegramMessage(chatId, botAr.texasLoginFailed(detail));
        await supabase
          .from("telegram_onboarding_sessions")
          .delete()
          .eq("telegram_id", telegramId);
        return;
      }

      await sendTelegramMessage(chatId, botAr.registrationFailed(msg));
    }
  }
}
