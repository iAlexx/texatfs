import { NextResponse } from "next/server";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import type { LedgerAuthInput } from "@/lib/ledger/types";
import { LedgerAuthError, resolveLedgerUser } from "@/lib/ledger/resolve-user";
import { canManageNetwork } from "@/lib/hierarchy/access";
import { fetchNetworkPayload } from "@/lib/hierarchy/network";
import { refreshStaleSubtreeLedgers } from "@/lib/scraper/ensure-user-ledger-sync";
import { resolveLedgerDate } from "@/lib/cron/ledger-date";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface Body extends LedgerAuthInput {
  ledgerDate?: string;
  /** Refresh stale per-user Texas syncs before building network */
  syncStale?: boolean;
  /** Only return direct children (depth=1) with children counts */
  directOnly?: boolean;
}

function todayLedgerDate(): string {
  return resolveLedgerDate();
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
    const ledgerDate = body.ledgerDate ?? todayLedgerDate();

    if (body.syncStale !== false) {
      const { data: directChildren } = await supabase
        .from("users")
        .select("id")
        .eq("parent_id", user.id)
        .eq("is_active", true);
      const memberIds = (directChildren ?? []).map((r) => r.id as string);
      await refreshStaleSubtreeLedgers(supabase, memberIds, ledgerDate);
    }

    console.info("[get-network] fetching", {
      userId: user.id,
      role: user.role,
      ledgerDate,
      directOnly: body.directOnly ?? true,
      syncStale: body.syncStale,
    });

    const network = await fetchNetworkPayload(
      supabase,
      user.id,
      user.role,
      ledgerDate,
      { directOnly: body.directOnly ?? true }
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
