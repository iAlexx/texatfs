import type { SupabaseClient } from "@supabase/supabase-js";
import { mapLedgerRow } from "@/lib/supabase/client";
import type { DailyLedger } from "@/lib/supabase/database.types";
import type { HierarchyPayload, SubAgentSummary } from "@/lib/hierarchy/types";

export async function fetchSubAgentsWithLedgers(
  supabase: SupabaseClient,
  parentUserId: string,
  ledgerDate: string
): Promise<SubAgentSummary[]> {
  const { data: children, error: childError } = await supabase
    .from("users")
    .select("id, display_name, texas_username, role")
    .eq("parent_id", parentUserId)
    .eq("is_active", true)
    .order("display_name", { ascending: true });

  if (childError) throw childError;
  if (!children?.length) return [];

  const ids = children.map((c) => c.id);
  const { data: ledgers, error: ledgerError } = await supabase
    .from("daily_ledgers")
    .select(
      "id, user_id, ledger_date, status, tebat, al_farq, al_harq, al_nihai, discrepancy_flag"
    )
    .in("user_id", ids)
    .eq("ledger_date", ledgerDate);

  if (ledgerError) throw ledgerError;

  const ledgerByUser = new Map(
    (ledgers ?? []).map((row) => [row.user_id, mapLedgerRow(row)])
  );

  return children.map((child) => {
    const full = ledgerByUser.get(child.id) ?? null;
    const ledger = full
      ? {
          id: full.id,
          ledger_date: full.ledger_date,
          status: full.status,
          al_harq: full.al_harq,
          al_nihai: full.al_nihai,
          discrepancy_flag: full.discrepancy_flag,
          tebat: full.tebat,
          al_farq: full.al_farq,
        }
      : null;

    return {
      id: child.id,
      display_name: child.display_name,
      texas_username: child.texas_username,
      role: child.role,
      ledger,
    };
  });
}

export function buildHierarchyPayload(
  subAgents: SubAgentSummary[],
  ownLedger: DailyLedger | null
): HierarchyPayload {
  let totalBurn = ownLedger?.al_harq ?? 0;
  let totalAlNihai = ownLedger?.al_nihai ?? 0;

  for (const agent of subAgents) {
    if (agent.ledger) {
      totalBurn += agent.ledger.al_harq;
      totalAlNihai += agent.ledger.al_nihai;
    }
  }

  return {
    consolidated: {
      total_burn: totalBurn,
      total_al_nihai: totalAlNihai,
      agent_count: subAgents.length,
    },
    sub_agents: subAgents,
  };
}

export async function assertCanViewUser(
  supabase: SupabaseClient,
  requesterId: string,
  targetUserId: string
): Promise<void> {
  if (requesterId === targetUserId) return;

  const { data, error } = await supabase
    .from("users")
    .select("id")
    .eq("id", targetUserId)
    .eq("parent_id", requesterId)
    .maybeSingle();

  if (error) throw error;
  if (!data) {
    throw new Error("غير مصرح بعرض هذا الحساب");
  }
}
