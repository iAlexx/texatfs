import type { DailyLedger } from "@/lib/supabase/database.types";

export interface SubAgentSummary {
  id: string;
  display_name: string | null;
  texas_username: string | null;
  role: string;
  ledger: Pick<
    DailyLedger,
    | "id"
    | "ledger_date"
    | "status"
    | "al_harq"
    | "al_nihai"
    | "discrepancy_flag"
    | "tebat"
    | "al_farq"
  > | null;
}

export interface HierarchyPayload {
  consolidated: {
    total_burn: number;
    total_al_nihai: number;
    agent_count: number;
  };
  sub_agents: SubAgentSummary[];
}
