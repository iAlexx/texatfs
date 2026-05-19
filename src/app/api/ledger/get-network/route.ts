import { NextResponse } from "next/server";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import type { LedgerAuthInput } from "@/lib/ledger/types";
import { LedgerAuthError, resolveLedgerUser } from "@/lib/ledger/resolve-user";
import { canManageNetwork } from "@/lib/hierarchy/access";
import { fetchNetworkPayload } from "@/lib/hierarchy/network";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface Body extends LedgerAuthInput {
  ledgerDate?: string;
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
    const network = await fetchNetworkPayload(
      supabase,
      user.id,
      user.role,
      ledgerDate
    );

    return NextResponse.json(network);
  } catch (e) {
    if (e instanceof LedgerAuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    const msg = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
