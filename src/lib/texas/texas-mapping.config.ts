/**
 * Single source of truth for Texas API → internal field paths.
 *
 * IMPORTANT: The per-row records from getSubAgentStatistics may contain BOTH
 * financial columns (totalDeposit, totalWithdraw, ngr) AND tree-grid layout
 * columns (left, right, creditLine, bonus). The financial columns are the
 * correct source for tebat/suhoubat/ngr. The tree-grid columns are positional
 * metadata and must NOT be used as financial values.
 *
 * The `subAgentRecord` mapping is a fallback for rare API versions that omit
 * standard financial keys. It should never be preferred over `record`.
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
    /** Fallback for tree-grid-only rows missing standard financial columns. */
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
 * Live API (confirmed via docs/samples/getSubAgentStatistics.sample.json):
 *   Per-row: totalDeposit, totalWithdraw, ngr, balance, affiliateId, ...
 *   Footer:  result.total.totalDeposit, result.total.totalWithdraw, result.total.ngr
 *
 * The `left`/`right`/`bonus`/`creditLine` fields are tree-grid layout columns
 * and are NOT deposits/withdrawals/NGR. They must only be used as a last-resort
 * fallback if no standard financial keys are found on the row.
 */
export const TEXAS_FIELD_MAPPING: TexasFieldMappingConfig = {
  wallet: {
    balance: [
      "balance",
      "currentWallet",
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
      totalDeposit: [
        "totalDeposit",
        "depositsTotal",
        "depositTotal",
        "total_deposit",
        "deposits",
        "totalBet",
        "betTotal",
        "deposit",
        "chargeIn",
        // Tree-grid fallbacks (last resort only)
        "left",
        "credit",
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
        // Tree-grid fallbacks (last resort only)
        "right",
      ],
      ngr: [
        "ngr",
        "NGR",
        "netGamingRevenue",
        "burn",
        "netRevenue",
        "GGR",
        "ggr",
        // Tree-grid fallbacks (last resort only)
        "bonus",
        "creditLine",
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
