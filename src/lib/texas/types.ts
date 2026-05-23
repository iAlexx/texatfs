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
  titles?: unknown;
  total?: SubAgentStatisticsTotals | null;
}

/**
 * Per-row record from getSubAgentStatistics.
 *
 * Live-confirmed keys (2026-05-22):
 *   left, right, level, parent, affiliateId, name, lastName, userName,
 *   gender, countryCode, city, cellPhone, address, zipCode, email,
 *   statusId, isOnline, mainCurrency, agentRole, currentWallet
 *
 * Financial totals (totalDeposit / totalWithdraw / ngr) appear only in
 * result.total (aggregate footer), NOT in individual per-row records.
 */
export interface SubAgentStatisticsRecord {
  // Identity — confirmed present
  affiliateId: string;
  agentId?: string;

  // Profile fields — confirmed present in per-row records
  name?: string;
  lastName?: string;
  userName?: string;
  username?: string;           // alias used by some endpoints
  affiliateUsername?: string;
  email?: string;
  agentRole?: string;
  mainCurrency?: string;
  currency?: string;
  isOnline?: boolean | string;
  statusId?: string | number;

  // Wallet — confirmed present in per-row records as "currentWallet"
  currentWallet?: string | number;
  balance?: string | number;
  availableWallet?: string | number;

  // Financial totals — present in aggregate footer (result.total), NOT per-row
  // Kept here so pickNumeric can find them if a future API version adds them per-row
  totalDeposit?: string | number;
  depositsTotal?: string | number;
  depositTotal?: string | number;
  totalWithdraw?: string | number;
  withdrawTotal?: string | number;
  withdrawalsTotal?: string | number;
  ngr?: string | number;
  NGR?: string | number;
  netGamingRevenue?: string | number;
  burn?: string | number;

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
  /** Stored texas_username — used to validate API scope */
  texasUsername?: string | null;
  role: "super_master" | "master" | "player";
  credentials: TexasCredentials;
}
