/** Field candidates for POST /Statistics/getSubAgentReport (Reports → General). */
export const GENERAL_REPORT_FIELD_MAPPING = {
  deposits: [
    "Deposits",
    "deposits",
    "totalDeposit",
    "depositTotal",
    "depositsTotal",
  ],
  withdrawal: [
    "Withdrawal",
    "Withdrawals",
    "totalWithdraw",
    "withdrawTotal",
    "withdrawalsTotal",
  ],
  ngr: ["NGR", "ngr", "netGamingRevenue", "burn"],
  commission: ["Commission", "commission"],
  agentId: [
    "Agent Id",
    "AgentId",
    "agentId",
    "affiliateId",
    "Agent ID",
  ],
  parentId: ["Parent ID", "ParentId", "parentId", "parentAffiliateId"],
  username: [
    "Agent Username",
    "agentUsername",
    "userName",
    "username",
    "affiliateUsername",
  ],
} as const;
