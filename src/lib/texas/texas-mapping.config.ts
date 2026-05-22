/**
 * Single source of truth for Texas API → internal field paths.
 * Update this file when live JSON keys are confirmed.
 */
export interface TexasFieldMappingConfig {
  wallet: {
    balance: readonly string[];
    currencyCode: readonly string[];
  };
  statistics: {
    record: {
      affiliateId: readonly string[];
      totalDeposit: readonly string[];
      totalWithdraw: readonly string[];
      ngr: readonly string[];
    };
    totalsFooter: {
      totalDeposit: readonly string[];
      totalWithdraw: readonly string[];
      ngr: readonly string[];
    };
  };
}

/**
 * Field-name candidates ordered by likelihood.
 * Live API validation (2026-05-22): getSubAgentStatistics per-row keys confirmed:
 *   affiliateId, currentWallet — present
 *   totalDeposit, totalWithdraw, ngr — NOT in per-row records (only in result.total)
 * Update the first entry of each array when a live key is confirmed.
 */
export const TEXAS_FIELD_MAPPING: TexasFieldMappingConfig = {
  wallet: {
    // "currentWallet" is confirmed in both getSubAgentStatistics rows AND
    // getAgentWalletByAgentId result. Always try it first.
    balance: [
      "currentWallet",
      "balance",
      "availableWallet",
      "walletBalance",
      "current_wallet",
      "availability",
    ],
    currencyCode: ["currencyCode", "mainCurrency", "currency"],
  },
  statistics: {
    record: {
      affiliateId: ["affiliateId", "agentId", "id"],
      // These fields may appear in per-row records with various naming conventions.
      // If none match, pickNumeric returns 0 (safe default).
      totalDeposit: [
        "totalDeposit",
        "depositsTotal",
        "depositTotal",
        "total_deposit",
        "deposits",
        "totalBet",
        "betTotal",
        "deposit",
        "totalBets",
        "chargeIn",
        "netDeposit",
      ],
      totalWithdraw: [
        "totalWithdraw",
        "withdrawTotal",
        "withdrawalsTotal",
        "total_withdraw",
        "withdrawals",
        "totalCashout",
        "cashout",
        "withdraw",
        "chargeOut",
      ],
      ngr: [
        "ngr",
        "NGR",
        "netGamingRevenue",
        "burn",
        "netRevenue",
        "net",
        "profit",
        "GGR",
        "ggr",
        "netProfit",
        "revenue",
      ],
    },
    totalsFooter: {
      totalDeposit: [
        "totalDeposit",
        "depositsTotal",
        "depositTotal",
        "total_deposit",
        "totalBet",
        "betTotal",
      ],
      totalWithdraw: [
        "totalWithdraw",
        "withdrawTotal",
        "withdrawalsTotal",
        "total_withdraw",
        "totalCashout",
      ],
      ngr: [
        "ngr",
        "NGR",
        "netGamingRevenue",
        "burn",
        "netRevenue",
        "GGR",
        "ggr",
      ],
    },
  },
};
