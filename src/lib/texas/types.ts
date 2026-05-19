/** Shared Texas dashboard envelope */
export interface TexasApiEnvelope<T> {
  status: boolean;
  html: string;
  result: T;
  notification: TexasNotification[];
}

export interface TexasNotification {
  code?: number;
  content?: string;
  title?: string;
  autoHideAfter?: number;
  list?: unknown[];
  status?: string;
}

/** Filter operand used across Statistics / Agent list endpoints */
export interface TexasFilterOperand<T = string | string[] | boolean> {
  action: string;
  value: T;
  valueLabel?: string | string[] | boolean;
  staticDataKey?: string;
  from?: string;
  to?: string;
}

export type TexasFilterMap = Record<string, TexasFilterOperand>;

export interface TexasPagedRequest {
  start: number;
  limit: number;
  filter?: TexasFilterMap;
  searchBy?: Record<string, string>;
  isNextPage?: boolean;
}

export interface TexasPagedResult<TRecord> {
  records: TRecord[];
  totalRecordsCount: string;
  titles: unknown;
  total: SubAgentStatisticsTotals | null;
}

/**
 * Per-row statistics from getSubAgentStatistics.
 * Field names marked INFERRED — confirm against a live response before production.
 */
export interface SubAgentStatisticsRecord {
  affiliateId: string;
  username?: string;
  affiliateUsername?: string;
  mainCurrency?: string;
  currency?: string;

  /** INFERRED — possible keys: totalDeposit | depositsTotal | depositTotal */
  totalDeposit?: string;
  depositsTotal?: string;
  depositTotal?: string;

  /** INFERRED — possible keys: totalWithdraw | withdrawTotal | withdrawalsTotal */
  totalWithdraw?: string;
  withdrawTotal?: string;
  withdrawalsTotal?: string;

  /** INFERRED — NGR / burn */
  ngr?: string;
  NGR?: string;
  netGamingRevenue?: string;
  burn?: string;

  balance?: string;
  [key: string]: unknown;
}

/**
 * Optional aggregate footer on paged statistics grids.
 * INFERRED — may be null until confirmed live.
 */
export interface SubAgentStatisticsTotals {
  totalDeposit?: string;
  totalWithdraw?: string;
  ngr?: string;
  [key: string]: unknown;
}

export type SubAgentStatisticsResponse = TexasApiEnvelope<
  TexasPagedResult<SubAgentStatisticsRecord>
>;

export interface TexasWalletRecord {
  currencyName?: string;
  currencyCode?: string;
  balance: string;
  availableWallet?: string;
  mainCurrency?: string;
  creditLine?: string;
  credit?: string;
  availability?: string;
  bonus?: string;
  frozenBalance?: string;
  withAmount?: string;
  currentWallet?: string;
}

export type AgentAllWalletsResponse = TexasApiEnvelope<TexasWalletRecord[]>;

/** Row from POST /Agent/getChildren */
export interface TexasChildRecord {
  affiliateId: string;
  username?: string;
  email?: string;
  role?: string;
  mainCurrency?: string;
  status?: string;
  address?: string | null;
  promoCode?: string | null;
  [key: string]: unknown;
}

export type TexasChildrenResponse = TexasApiEnvelope<
  TexasPagedResult<TexasChildRecord>
>;

export interface TexasAgentWalletResult {
  transactionId?: string;
  affiliateId?: string;
  balance?: string;
  availability?: string;
  creditLine?: string;
  credit?: string;
  bonus?: string;
  frozenBalance?: string;
  [key: string]: unknown;
}

export type TexasAgentWalletResponse = TexasApiEnvelope<TexasAgentWalletResult>;

export interface NormalizedTexasSnapshot {
  balance: number;
  totalDeposit: number;
  totalWithdraw: number;
  ngr: number;
  currencyCode: string;
  rawWallets: Record<string, unknown>;
  rawStatistics: Record<string, unknown>;
}

export interface TexasCredentials {
  username: string;
  password: string;
}

export interface TexasSyncUserContext {
  userId: string;
  texasAffiliateId: string | null;
  role: "super_master" | "master" | "player";
  credentials: TexasCredentials;
}
