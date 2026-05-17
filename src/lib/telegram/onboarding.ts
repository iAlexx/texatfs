import type { SupabaseClient } from "@supabase/supabase-js";
import { RegistrationService } from "@/lib/services/RegistrationService";
import { getCredentialVault } from "@/lib/security/CredentialVault";
import { sendTelegramMessage } from "@/lib/telegram/bot-api";
import type { TelegramMessage } from "@/lib/telegram/bot-api";
import { SubscriptionService } from "@/lib/subscription/SubscriptionService";

type OnboardingStep = "email" | "password" | "license";

const LOGIN_RE = /^[^\s@]{3,128}$/;

function displayName(msg: TelegramMessage): string {
  const from = msg.from;
  if (!from) return "Master";
  return [from.first_name, from.last_name].filter(Boolean).join(" ") || "Master";
}

function miniAppHint(): string {
  const url = process.env.TELEGRAM_MINI_APP_URL ?? process.env.NEXT_PUBLIC_APP_URL;
  return url
    ? `\n\nOpen your dashboard: ${url}`
    : "\n\nOpen TEXAS FUNDS from the bot menu.";
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
          `Welcome back, ${existing.display_name ?? "Master"}! Your subscription is active.${miniAppHint()}`
        );
      } else {
        await sendTelegramMessage(
          chatId,
          "Your subscription has expired. Contact admin for a new license key to renew."
        );
      }
      return;
    }

    await supabase.from("telegram_onboarding_sessions").upsert({
      telegram_id: telegramId,
      step: "email",
      texas_email_encrypted: null,
      texas_password_encrypted: null,
    });

    await sendTelegramMessage(
      chatId,
      "Welcome to TEXAS FUNDS calculate.\n\nStep 1/3 — Send your Texas dashboard username or email (same as agents.texas4win.com login):"
    );
    return;
  }

  const { data: session } = await supabase
    .from("telegram_onboarding_sessions")
    .select("*")
    .eq("telegram_id", telegramId)
    .maybeSingle();

  if (!session) {
    await sendTelegramMessage(
      chatId,
      "Send /start to begin registration."
    );
    return;
  }

  const vault = getCredentialVault();
  const step = session.step as OnboardingStep;

  if (step === "email") {
    if (!LOGIN_RE.test(text)) {
      await sendTelegramMessage(
        chatId,
        "Please send your Texas username or email (at least 3 characters, no spaces)."
      );
      return;
    }

    await supabase
      .from("telegram_onboarding_sessions")
      .update({
        step: "password",
        texas_email_encrypted: vault.encrypt(text),
      })
      .eq("telegram_id", telegramId);

    await sendTelegramMessage(
      chatId,
      "Step 2/3 — Send your Texas dashboard password.\n\n(Message is encrypted before storage.)"
    );
    return;
  }

  if (step === "password") {
    if (text.length < 4) {
      await sendTelegramMessage(chatId, "Password is too short. Try again.");
      return;
    }

    await supabase
      .from("telegram_onboarding_sessions")
      .update({
        step: "license",
        texas_password_encrypted: vault.encrypt(text),
      })
      .eq("telegram_id", telegramId);

    await sendTelegramMessage(
      chatId,
      "Step 3/3 — Send your license key (e.g. TEXAS-XXXX-XXXX-XXXX):"
    );
    return;
  }

  if (step === "license") {
    const licenseKey = text.toUpperCase();
    const { data: freshSession, error: sessionError } = await supabase
      .from("telegram_onboarding_sessions")
      .select("texas_email_encrypted, texas_password_encrypted")
      .eq("telegram_id", telegramId)
      .single();

    if (sessionError || !freshSession?.texas_email_encrypted || !freshSession?.texas_password_encrypted) {
      await sendTelegramMessage(chatId, "Session expired. Send /start to register again.");
      return;
    }

    const login = vault.decrypt(freshSession.texas_email_encrypted).trim();
    const password = vault.decrypt(freshSession.texas_password_encrypted).trim();

    await sendTelegramMessage(chatId, "Validating Texas credentials and license…");

    try {
      const result = await registration.completeRegistration({
        telegramId,
        displayName: displayName(message),
        texasEmail: login,
        texasPassword: password,
        licenseKey,
      });

      const end = new Date(result.subscriptionEndDate).toLocaleDateString(
        "en-GB",
        { timeZone: process.env.LEDGER_TIMEZONE ?? "Asia/Damascus" }
      );

      await sendTelegramMessage(
        chatId,
        `Registration complete.\n\nSubscription active until: ${end}${miniAppHint()}`
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Registration failed";

      if (msg.includes("LICENSE_KEY_INVALID")) {
        await sendTelegramMessage(
          chatId,
          "Invalid or already used license key. Check the key and try again."
        );
        return;
      }
      if (msg.includes("TELEGRAM_ALREADY_REGISTERED")) {
        await sendTelegramMessage(
          chatId,
          "This Telegram account is already registered. Send /start."
        );
        return;
      }
      if (msg.includes("Texas sign-in failed")) {
        await sendTelegramMessage(
          chatId,
          "Texas login failed. Check your email and password, then send /start to try again."
        );
        await supabase
          .from("telegram_onboarding_sessions")
          .delete()
          .eq("telegram_id", telegramId);
        return;
      }

      await sendTelegramMessage(
        chatId,
        `Registration failed: ${msg}\n\nSend /start to try again.`
      );
    }
  }
}
