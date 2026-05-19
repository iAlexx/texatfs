import type { DailyLedger, UserRole } from "@/lib/supabase/database.types";

export type AgentLedgerSummary = Pick<
  DailyLedger,
  | "id"
  | "ledger_date"
  | "status"
  | "al_harq"
  | "al_nihai"
  | "discrepancy_flag"
  | "tebat"
  | "al_farq"
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

export interface NetworkMember {
  id: string;
  display_name: string | null;
  texas_username: string | null;
  role: UserRole;
  parent_id: string | null;
  depth: number;
  is_active: boolean;
  ledger: AgentLedgerSummary | null;
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
