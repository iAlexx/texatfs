import { roundMoney } from "@/lib/accounting/formulas";
import {
  orientBalance,
  type BalanceOrientation,
} from "@/lib/accounting/balance-orientation";

/** Commission from dashboard burn and parent-entered percent (0–100). */
export function computeBurnCommissionAmount(
  burnAmount: number,
  percent: number
): number {
  const burn = roundMoney(Math.max(0, burnAmount));
  const pct = Math.min(100, Math.max(0, percent));
  return roundMoney((burn * pct) / 100);
}

export interface AppliedMonthlyCommission {
  finalBeforeCommission: number;
  finalAfterCommission: number;
  commissionAmount: number;
  orientation: BalanceOrientation;
  labelAr: string;
  /** Absolute amount for Arabic display (له / عليه). */
  displayAmount: number;
}

/**
 * Apply burn commission to monthly al_nihai using existing sign convention:
 *  positive → عليه (debit), negative/zero → له (credit).
 */
export function applyMonthlyBurnCommission(
  finalBeforeCommission: number,
  commissionAmount: number
): AppliedMonthlyCommission {
  const before = roundMoney(finalBeforeCommission);
  const commission = roundMoney(Math.max(0, commissionAmount));
  const orientedBefore = orientBalance(before);

  let after: number;
  if (orientedBefore.orientation === "credit") {
    // له — commission increases credit (more negative signed value)
    after = roundMoney(before - commission);
  } else {
    // عليه — commission reduces debt
    after = roundMoney(before - commission);
  }

  const orientedAfter = orientBalance(after);
  return {
    finalBeforeCommission: before,
    finalAfterCommission: after,
    commissionAmount: commission,
    orientation: orientedAfter.orientation,
    labelAr: orientedAfter.labelAr,
    displayAmount: Math.abs(after),
  };
}

const ARABIC_INDIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";
const ARABIC_EASTERN_DIGITS = "۰۱۲۳۴۵۶۷۸۹";

function normalizeArabicDigits(text: string): string {
  let out = text;
  for (let i = 0; i < 10; i++) {
    out = out
      .replaceAll(ARABIC_INDIC_DIGITS[i]!, String(i))
      .replaceAll(ARABIC_EASTERN_DIGITS[i]!, String(i));
  }
  return out;
}

/**
 * Parse parent percentage reply: `25`, `25%`, `نسبة 25`, Arabic digits.
 */
export function parseCommissionPercent(text: string): number | null {
  const trimmed = text.trim();
  if (/[-−]/.test(trimmed)) return null;

  const normalized = normalizeArabicDigits(trimmed);
  const m =
    /(?:نسبة\s*)?(\d{1,3}(?:[.,]\d{1,2})?)\s*%?/u.exec(normalized) ??
    /^(\d{1,3}(?:[.,]\d{1,2})?)\s*%?$/u.exec(normalized);
  if (!m) return null;

  const raw = m[1]!.replace(",", ".");
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0 || n > 100) return null;
  return roundMoney(n);
}

export function formatOrientedBalanceLine(
  signedAmount: number,
  prefix: string
): string {
  const o = orientBalance(signedAmount);
  const abs = Math.abs(signedAmount).toLocaleString("ar-SY");
  const side = o.orientation === "credit" ? "له" : "عليه";
  return `${prefix}: ${side} ${abs}`;
}
