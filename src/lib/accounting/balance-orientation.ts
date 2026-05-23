import { roundMoney } from "@/lib/accounting/formulas";

/** Credit — balance favors the agent (system owes him). */
export const BALANCE_CREDIT_LABEL = "له ✅";
/** Debit — balance favors the master (agent owes the system). */
export const BALANCE_DEBIT_LABEL = "عليه 🛑";

export type BalanceOrientation = "credit" | "debit";

export interface OrientedBalance {
  /** Signed monetary value (DB column). */
  signedAmount: number;
  orientation: BalanceOrientation;
  labelAr: string;
}

/**
 * Maps a signed ledger balance to Arabic credit/debit orientation.
 * Positive (≥ 0) → له (credit). Negative → عليه (debit).
 */
export function orientBalance(value: number): OrientedBalance {
  const signedAmount = roundMoney(value);
  if (signedAmount >= 0) {
    return {
      signedAmount,
      orientation: "credit",
      labelAr: BALANCE_CREDIT_LABEL,
    };
  }
  return {
    signedAmount,
    orientation: "debit",
    labelAr: BALANCE_DEBIT_LABEL,
  };
}
