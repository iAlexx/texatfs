export type UserRole = "super_master" | "master" | "agent" | "player";
export type LedgerStatus = "open" | "closed";

export interface DailyLedger {
  id: string;
  user_id: string;
  ledger_date: string;
  status: LedgerStatus;
  tebat: number;
  suhoubat: number;
  al_farq: number;
  al_harq: number;
  wasel_menho: number;
  wasel_eleih: number;
  baqi_qadim: number;
  al_nihai: number;
  discrepancy_flag: boolean;
  is_locked?: boolean;
  closed_at?: string | null;
  closed_by?: string | null;
  close_reason?: string | null;
  updated_at: string;
}

export interface AppUser {
  id: string;
  telegram_id: number | null;
  role: UserRole;
  display_name: string | null;
  texas_username: string | null;
  parent_id?: string | null;
  subscription_end_date?: string | null;
  subscription_active?: boolean;
  is_tenant_master?: boolean;
}

export interface LedgerSyncMeta {
  target_user_id: string;
  synced: boolean;
  reason: string;
  network_synced?: number;
}

/** Texas panel reference (daily movement vs cumulative dashboard). */
export interface TexasPanelSnapshot {
  daily_movement: {
    tebat: number;
    suhoubat: number;
    al_farq: number;
    al_harq: number;
  } | null;
  transaction_cumulative: {
    deposits: number;
    withdrawals: number;
  } | null;
  dashboard_general: {
    deposits: number;
    withdrawal: number;
    ngr: number;
    commission?: number;
    agentId?: string;
    parentId?: string;
    username?: string;
  } | null;
}

export interface LedgerSessionResponse {
  user: AppUser;
  ledger: DailyLedger | null;
  subscription_active: boolean;
  hierarchy?: import("@/lib/hierarchy/types").HierarchyPayload;
  network?: import("@/lib/hierarchy/types").NetworkPayload;
  viewing_user_id?: string;
  view_mode?: "daily" | "monthly";
  monthly_commission?: {
    month_key: string;
    burn_amount: number;
    percent: number | null;
    commission_amount: number | null;
    final_before_commission: number;
    final_after_commission: number | null;
    status: string;
  };
  texas_panel?: TexasPanelSnapshot | null;
  sync_meta?: LedgerSyncMeta;
}
