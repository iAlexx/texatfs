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
    /** Per-row keys from getSubAgentStatistics sub-agent tree grid. */
    subAgentRecord: {
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
 *
 * Live API (2026-05-23): getSubAgentStatistics per-row keys include
 * left, right, currentWallet, balance, credit, creditLine, bonus — but NOT
 * totalDeposit / totalWithdraw / ngr (those appear in result.total for masters).
 */
export const TEXAS_FIELD_MAPPING: TexasFieldMappingConfig = {
  wallet: {
    balance: [
      "currentWallet",
      "balance",
      "availableWallet",
      "availability",
      "credit",
      "walletBalance",
      "current_wallet",
    ],
    currencyCode: ["currencyCode", "mainCurrency", "currency"],
  },
  statistics: {
    record: {
      affiliateId: ["affiliateId", "agentId", "id"],
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
    subAgentRecord: {
      affiliateId: ["affiliateId", "agentId", "id"],
      // Tree-grid columns confirmed on live sub-agent rows
      totalDeposit: [
        "left",
        "credit",
        "totalDeposit",
        "depositsTotal",
        "depositTotal",
        "total_deposit",
        "deposits",
        "totalBet",
        "betTotal",
        "deposit",
        "chargeIn",
      ],
      totalWithdraw: [
        "right",
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
        "bonus",
        "creditLine",
        "ngr",
        "NGR",
        "netGamingRevenue",
        "burn",
        "netRevenue",
        "GGR",
        "ggr",
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
