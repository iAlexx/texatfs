import type { SupabaseClient } from "@supabase/supabase-js";
import { RegistrationService } from "@/lib/services/RegistrationService";
import { getCredentialVault } from "@/lib/security/CredentialVault";
import { sendTelegramMessage } from "@/lib/telegram/bot-api";
import type { TelegramMessage } from "@/lib/telegram/bot-api";
import { SubscriptionService } from "@/lib/subscription/SubscriptionService";

type OnboardingStep = "login" | "password" | "license";

/** Texas logins like Alitest@Regional.Nsp — allow @ and preserve case. */
const TEXAS_LOGIN_RE = /^[^\s]{3,128}$/;

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

    const { error: sessionUpsertError } = await supabase
      .from("telegram_onboarding_sessions")
      .upsert(
        {
          telegram_id: telegramId,
          // DB CHECK allows 'email' | 'password' | 'license' (not 'login')
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
        code: sessionUpsertError.code,
      });
      await sendTelegramMessage(
        chatId,
        "Could not start registration (database error). Contact support or try again later."
      );
      return;
    }

    await sendTelegramMessage(
      chatId,
      "Welcome to TEXAS FUNDS calculate.\n\nStep 1/3 — Send your Texas agents.texas4win.com username or email exactly as shown on the login page (case matters, e.g. Alitest@Regional.Nsp):"
    );
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
    await sendTelegramMessage(
      chatId,
      "Registration session error. Send /start to try again."
    );
    return;
  }

  if (!session) {
    await sendTelegramMessage(chatId, "Send /start to begin registration.");
    return;
  }

  const vault = getCredentialVault();
  const step = normalizeStep(session.step as string);

  if (!step) {
    await sendTelegramMessage(chatId, "Session invalid. Send /start to begin again.");
    return;
  }

  if (step === "login") {
    if (!TEXAS_LOGIN_RE.test(text)) {
      await sendTelegramMessage(
        chatId,
        "Invalid login. Send your Texas username or email (3–128 characters, no spaces). Example: Alitest@Regional.Nsp"
      );
      return;
    }

    const { error: loginSaveError } = await supabase
      .from("telegram_onboarding_sessions")
      .update({
        step: "password",
        texas_email_encrypted: vault.encrypt(text),
      })
      .eq("telegram_id", telegramId);

    if (loginSaveError) {
      console.error("[onboarding] login save failed", {
        telegramId,
        error: loginSaveError.message,
      });
      await sendTelegramMessage(
        chatId,
        "Could not save your login. Send /start and try again."
      );
      return;
    }

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
      await sendTelegramMessage(
        chatId,
        "Could not save your password. Send /start and try again."
      );
      return;
    }

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

    if (
      sessionError ||
      !freshSession?.texas_email_encrypted ||
      !freshSession?.texas_password_encrypted
    ) {
      await sendTelegramMessage(
        chatId,
        "Session expired. Send /start to register again."
      );
      return;
    }

    const texasLogin = vault.decrypt(freshSession.texas_email_encrypted).trim();
    const texasPassword = vault
      .decrypt(freshSession.texas_password_encrypted)
      .trim();

    await sendTelegramMessage(
      chatId,
      "Validating your Texas agent account and license key…"
    );

    try {
      const result = await registration.completeRegistration({
        telegramId,
        displayName: displayName(message),
        texasLogin,
        texasPassword,
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
      console.error("[onboarding] registration failed", {
        telegramId,
        error: msg,
      });

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
        const texasDetail = msg.includes("Invalid username or password")
          ? "\n\nTexas says: Invalid username or password."
          : msg.includes("HTTP 403")
            ? "\n\nBlocked by Texas/Cloudflare (403). Try again in a few minutes."
            : msg.includes("HTTP 401")
              ? "\n\nSession rejected (401)."
              : "";
        await sendTelegramMessage(
          chatId,
          `Texas login failed. Use the exact username and password from agents.texas4win.com (case-sensitive).${texasDetail}\n\nSend /start to try again.`
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
