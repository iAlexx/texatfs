/**
 * Parse WhatsApp group messages for cash payment emojis.
 *
 * 💰 = cash received from branch → Super Master ("وصل منك")
 * 📤 = cash sent from Super Master to branch ("واصل الك")
 *
 * Supported formats (emoji before OR after amount):
 *   "💰 500"            → in 500
 *   "💰500"             → in 500
 *   "💰 1,500.50"       → in 1500.50
 *   "500 💰"            → in 500   (Arabic style: amount first)
 *   "وصل منك 4500 💰"   → in 4500  (Arabic text + amount + emoji)
 *   "📤 1500"           → out 1500
 *   "1500 📤"           → out 1500
 */

const AMOUNT_RE = /[\d,_]+(?:\.\d+)?/;

const PAYMENT_PATTERNS: {
  re: RegExp;
  direction: "in" | "out";
  group: number; // capture group index for the amount
}[] = [
  // emoji BEFORE amount: "💰 500"
  { re: new RegExp(`💰\\s*(${AMOUNT_RE.source})`), direction: "in",  group: 1 },
  // amount BEFORE emoji: "500 💰" or "وصل منك 4500 💰"
  { re: new RegExp(`(${AMOUNT_RE.source})\\s*💰`),  direction: "in",  group: 1 },
  // emoji BEFORE amount: "📤 500"
  { re: new RegExp(`📤\\s*(${AMOUNT_RE.source})`), direction: "out", group: 1 },
  // amount BEFORE emoji: "500 📤"
  { re: new RegExp(`(${AMOUNT_RE.source})\\s*📤`),  direction: "out", group: 1 },
];

export interface ParsedPayment {
  direction: "in" | "out";
  amount: number;
}

export function parseWhatsAppPayment(text: string): ParsedPayment | null {
  if (!text?.trim()) return null;

  for (const { re, direction, group } of PAYMENT_PATTERNS) {
    const m = text.match(re);
    if (!m) continue;
    const raw = m[group];
    if (!raw) continue;
    const clean = raw.replace(/,/g, "").replace(/_/g, "");
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
