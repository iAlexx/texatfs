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

/** Inferred keys — adjust only this object after live API validation */
export const TEXAS_FIELD_MAPPING: TexasFieldMappingConfig = {
  wallet: {
    balance: ["balance"],
    currencyCode: ["currencyCode", "mainCurrency"],
  },
  statistics: {
    record: {
      affiliateId: ["affiliateId"],
      totalDeposit: [
        "totalDeposit",
        "depositsTotal",
        "depositTotal",
        "total_deposit",
        "deposits",
      ],
      totalWithdraw: [
        "totalWithdraw",
        "withdrawTotal",
        "withdrawalsTotal",
        "total_withdraw",
        "withdrawals",
      ],
      ngr: ["ngr", "NGR", "netGamingRevenue", "burn", "netRevenue"],
    },
    totalsFooter: {
      totalDeposit: [
        "totalDeposit",
        "depositsTotal",
        "depositTotal",
        "total_deposit",
      ],
      totalWithdraw: [
        "totalWithdraw",
        "withdrawTotal",
        "withdrawalsTotal",
        "total_withdraw",
      ],
      ngr: ["ngr", "NGR", "netGamingRevenue", "burn", "netRevenue"],
    },
  },
};
