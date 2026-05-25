import { NextResponse } from "next/server";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import type { LedgerAuthInput } from "@/lib/ledger/types";
import { LedgerAuthError, resolveLedgerUser } from "@/lib/ledger/resolve-user";
import { canManageNetwork } from "@/lib/hierarchy/access";
import { fetchNetworkPayload } from "@/lib/hierarchy/network";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface Body extends LedgerAuthInput {
  parentId: string;
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

    if (!body.parentId) {
      return NextResponse.json(
        { error: "parentId is required" },
        { status: 400 }
      );
    }

    const supabase = getSupabaseServiceClient();
    const ledgerDate = body.ledgerDate ?? todayIsoDate();

    const canView = await supabase.rpc("can_view_user_for", {
      p_viewer_id: user.id,
      p_target_id: body.parentId,
    });

    if (!canView.data && user.id !== body.parentId) {
      return NextResponse.json(
        { error: "لا تملك صلاحية عرض هذا الحساب" },
        { status: 403 }
      );
    }

    const { data: parent } = await supabase
      .from("users")
      .select("role")
      .eq("id", body.parentId)
      .single();

    const network = await fetchNetworkPayload(
      supabase,
      body.parentId,
      (parent?.role ?? "agent") as import("@/lib/supabase/database.types").UserRole,
      ledgerDate,
      { directOnly: true }
    );

    return NextResponse.json({ members: network.members });
  } catch (e) {
    if (e instanceof LedgerAuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    const msg = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
