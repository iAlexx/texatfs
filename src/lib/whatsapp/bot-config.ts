/**
 * WhatsApp bot display number for user-initiated onboarding (wa.me links).
 * E.164 digits only, no + prefix — e.g. 963988899474
 */
import { createLogger } from "@/lib/observability/logger";
import {
  WHATSAPP_ACTIVATION_EMOJI,
  WHATSAPP_USER_INIT_INSTRUCTION_AR,
} from "@/lib/whatsapp/onboarding-copy";

export { WHATSAPP_ACTIVATION_EMOJI, WHATSAPP_USER_INIT_INSTRUCTION_AR };

const log = createLogger("whatsapp/bot-config");

export function getWhatsAppBotNumber(): string | null {
  const raw =
    process.env.WHATSAPP_BOT_NUMBER?.trim() ||
    process.env.NEXT_PUBLIC_WHATSAPP_BOT_NUMBER?.trim() ||
    "";
  const digits = raw.replace(/\D/g, "");
  if (!digits) {
    log.warn("WHATSAPP_BOT_NUMBER not configured");
    return null;
  }
  return digits;
}

export function buildWhatsAppActivationDeepLink(
  botNumberDigits: string | null,
  presetText = WHATSAPP_ACTIVATION_EMOJI
): string | null {
  if (!botNumberDigits) return null;
  const encoded = encodeURIComponent(presetText);
  return `https://wa.me/${botNumberDigits}?text=${encoded}`;
}

export function getWhatsAppBotConfigForClient(): {
  botWhatsappNumber: string | null;
  whatsappActivationUrl: string | null;
  instructionText: string;
  botNumberConfigured: boolean;
} {
  const botWhatsappNumber = getWhatsAppBotNumber();
  return {
    botWhatsappNumber,
    whatsappActivationUrl: buildWhatsAppActivationDeepLink(botWhatsappNumber),
    instructionText: WHATSAPP_USER_INIT_INSTRUCTION_AR,
    botNumberConfigured: Boolean(botWhatsappNumber),
  };
}
