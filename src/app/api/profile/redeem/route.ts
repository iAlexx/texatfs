import { NextResponse } from "next/server";
import { resolveLedgerUser, LedgerAuthError } from "@/lib/ledger/resolve-user";
import type { LedgerAuthInput } from "@/lib/ledger/types";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import { formatSupabaseError } from "@/lib/utils/supabase-error";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface RedeemBody extends LedgerAuthInput {
  licenseKey: string;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as RedeemBody;
    const { user } = await resolveLedgerUser(body);
    const key = body.licenseKey?.trim().toUpperCase();

    if (!key) {
      return NextResponse.json({ error: "أدخل مفتاح الترخيص" }, { status: 400 });
    }

    const supabase = getSupabaseServiceClient();
    const { error } = await supabase.rpc("redeem_license_key", {
      p_key: key,
      p_user_id: user.id,
    });

    if (error) {
      throw formatSupabaseError(error);
    }

    const { data: updated } = await supabase
      .from("users")
      .select("subscription_end_date")
      .eq("id", user.id)
      .single();

    return NextResponse.json({
      ok: true,
      subscription_end_date: updated?.subscription_end_date ?? null,
    });
  } catch (e) {
    if (e instanceof LedgerAuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    const msg = e instanceof Error ? e.message : "Server error";
    const status = msg.includes("LICENSE") || msg.includes("مفتاح") ? 400 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
