/**
 * Parse WhatsApp group messages for cash payment emojis.
 *
 * 💰 = cash received from branch → Super Master ("وصل منك")
 * 📤 = cash sent from Super Master to branch ("واصل الك")
 *
 * Supported formats:
 *   "💰 500"       → in 500
 *   "💰500"        → in 500
 *   "💰 1,500.50"  → in 1500.50
 *   "📤 1500"      → out 1500
 *   "📤 2.5k"      → not supported (only plain numbers)
 */

const AMOUNT_RE = /[\d,_]+(?:\.\d+)?/;

const PAYMENT_PATTERNS: {
  re: RegExp;
  direction: "in" | "out";
}[] = [
  { re: new RegExp(`💰\\s*(${AMOUNT_RE.source})`), direction: "in" },
  { re: new RegExp(`📤\\s*(${AMOUNT_RE.source})`), direction: "out" },
];

export interface ParsedPayment {
  direction: "in" | "out";
  amount: number;
}

export function parseWhatsAppPayment(text: string): ParsedPayment | null {
  if (!text?.trim()) return null;

  for (const { re, direction } of PAYMENT_PATTERNS) {
    const m = text.match(re);
    if (!m) continue;
    const clean = m[1].replace(/,/g, "").replace(/_/g, "");
    const amount = parseFloat(clean);
    if (!isFinite(amount) || amount <= 0) continue;
    return { direction, amount };
  }
  return null;
}

/** True only if the message contains 💰 or 📤 — quick pre-filter. */
export function mightBePaymentMessage(text: string): boolean {
  return text.includes("💰") || text.includes("📤");
}
