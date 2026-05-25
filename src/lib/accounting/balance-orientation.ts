import { roundMoney } from "@/lib/accounting/formulas";

/**
 * Gaming settlement orientation:
 *
 *  Positive al_nihai → SA consumed more credits than players withdrew
 *                     → SA owes Master real cash → عليه 🛑
 *
 *  Negative al_nihai → Players won more than issued credits
 *                     → Master owes SA real cash → له ✅
 */

/** Credit — Master owes the agent (agent is owed). */
export const BALANCE_CREDIT_LABEL = "له ✅";
/** Debit — Agent owes the Master. */
export const BALANCE_DEBIT_LABEL = "عليه 🛑";

export type BalanceOrientation = "credit" | "debit";

export interface OrientedBalance {
  /** Signed monetary value (DB column). */
  signedAmount: number;
  orientation: BalanceOrientation;
  labelAr: string;
}

/**
 * Maps a signed settlement balance to Arabic credit/debit orientation.
 *
 *  Positive (> 0) → عليه (agent owes master, debit).
 *  Zero           → settled (shown as عليه with 0 amount).
 *  Negative (< 0) → له   (master owes agent, credit).
 */
export function orientBalance(value: number): OrientedBalance {
  const signedAmount = roundMoney(value);
  if (signedAmount <= 0) {
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
