import { NextResponse } from "next/server";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import type { LedgerAuthInput } from "@/lib/ledger/types";
import { LedgerAuthError, resolveLedgerUser } from "@/lib/ledger/resolve-user";
import { canManageNetwork } from "@/lib/hierarchy/access";
import { fetchNetworkPayload } from "@/lib/hierarchy/network";
import { refreshStaleSubtreeLedgers } from "@/lib/scraper/ensure-user-ledger-sync";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface Body extends LedgerAuthInput {
  ledgerDate?: string;
  /** Refresh stale per-user Texas syncs before building network */
  syncStale?: boolean;
  /** Only return direct children (depth=1) with children counts */
  directOnly?: boolean;
}

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Body;
    const { user, subscriptionActive } = await resolveLedgerUser(body);

    if (!subscriptionActive) {
      return NextResponse.json({ error: "انتهى الاشتراك" }, { status: 402 });
    }

    if (!canManageNetwork(user.role)) {
      return NextResponse.json(
        { error: "لا تملك صلاحية عرض الشبكة" },
        { status: 403 }
      );
    }

    const supabase = getSupabaseServiceClient();
    const ledgerDate = body.ledgerDate ?? todayIsoDate();

    if (body.syncStale !== false) {
      const { data: descendants } = await supabase.rpc(
        "get_descendant_user_ids",
        { p_root_id: user.id }
      );
      const memberIds = (descendants ?? []).map((r: { id: string }) => r.id);
      await refreshStaleSubtreeLedgers(supabase, memberIds, ledgerDate);
    }

    console.info("[get-network] fetching", {
      userId: user.id,
      role: user.role,
      ledgerDate,
      directOnly: body.directOnly ?? false,
      syncStale: body.syncStale,
    });

    const network = await fetchNetworkPayload(
      supabase,
      user.id,
      user.role,
      ledgerDate,
      { directOnly: body.directOnly ?? false }
    );

    console.info("[get-network] result", {
      userId: user.id,
      membersCount: network.members.length,
      statsActiveAgents: network.stats.active_agents,
    });

    return NextResponse.json(network);
  } catch (e) {
    if (e instanceof LedgerAuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    const msg = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
