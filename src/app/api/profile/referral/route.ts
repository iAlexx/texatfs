import { NextResponse } from "next/server";
import { resolveLedgerUser, LedgerAuthError } from "@/lib/ledger/resolve-user";
import type { LedgerAuthInput } from "@/lib/ledger/types";
import { getSupabaseServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as LedgerAuthInput;
    const { user } = await resolveLedgerUser(body);
    const supabase = getSupabaseServiceClient();

    const { data: me } = await supabase
      .from("users")
      .select("referral_code, referral_reward_days")
      .eq("id", user.id)
      .single();

    let code = me?.referral_code as string | null;
    if (!code) {
      code = user.id.replace(/-/g, "").slice(0, 8).toUpperCase();
      await supabase
        .from("users")
        .update({ referral_code: code })
        .eq("id", user.id);
    }

    const { count } = await supabase
      .from("users")
      .select("id", { count: "exact", head: true })
      .eq("referred_by", user.id);

    return NextResponse.json({
      referral_code: code,
      invited_count: count ?? 0,
      reward_days: me?.referral_reward_days ?? 0,
    });
  } catch (e) {
    if (e instanceof LedgerAuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    const msg = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
