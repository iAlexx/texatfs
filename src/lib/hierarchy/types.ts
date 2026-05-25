import type { DailyLedger, UserRole } from "@/lib/supabase/database.types";

export type AgentLedgerSummary = Pick<
  DailyLedger,
  | "id"
  | "ledger_date"
  | "status"
  | "tebat"
  | "suhoubat"
  | "al_farq"
  | "al_harq"
  | "wasel_menho"
  | "wasel_eleih"
  | "baqi_qadim"
  | "al_nihai"
  | "discrepancy_flag"
>;

/** @deprecated Use NetworkMember */
export interface SubAgentSummary {
  id: string;
  display_name: string | null;
  texas_username: string | null;
  role: string;
  ledger: AgentLedgerSummary | null;
}

/** @deprecated Use NetworkPayload */
export interface HierarchyPayload {
  consolidated: {
    total_burn: number;
    total_al_nihai: number;
    agent_count: number;
  };
  sub_agents: SubAgentSummary[];
}

export interface NetworkMemberSnapshot {
  balance: number;
  total_deposit: number;
  total_withdraw: number;
}

export interface NetworkMember {
  id: string;
  display_name: string | null;
  texas_username: string | null;
  texas_affiliate_id: string | null;
  telegram_id: number | null;
  role: UserRole;
  parent_id: string | null;
  depth: number;
  is_active: boolean;
  ledger: AgentLedgerSummary | null;
  /** Latest api_snapshot balance data */
  snapshot: NetworkMemberSnapshot | null;
  /** Number of direct children this member has (only populated when requested) */
  direct_children_count?: number;
}

export interface NetworkStats {
  active_agents: number;
  combined_balance: number;
  total_network_burn: number;
  highest_burn_agent: {
    id: string;
    name: string;
    al_harq: number;
  } | null;
}

export interface NetworkPayload {
  viewer_id: string;
  viewer_role: UserRole;
  ledger_date: string;
  stats: NetworkStats;
  members: NetworkMember[];
  /** Includes viewer own ledger in totals when present */
  own_ledger: AgentLedgerSummary | null;
}

export interface LedgerContextInput {
  ledgerDate?: string;
  agent_id?: string;
}
