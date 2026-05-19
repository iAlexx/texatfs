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

export interface LedgerSessionResponse {
  user: AppUser;
  ledger: DailyLedger | null;
  subscription_active: boolean;
  hierarchy?: import("@/lib/hierarchy/types").HierarchyPayload;
  network?: import("@/lib/hierarchy/types").NetworkPayload;
  viewing_user_id?: string;
}
