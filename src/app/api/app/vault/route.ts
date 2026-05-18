import { NextResponse } from "next/server";
import { resolveLedgerUser, LedgerAuthError } from "@/lib/ledger/resolve-user";
import type { LedgerAuthInput } from "@/lib/ledger/types";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import { loadVaultSummary } from "@/lib/finance/cumulative-vault";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as LedgerAuthInput;
    const { user } = await resolveLedgerUser(body);
    const supabase = getSupabaseServiceClient();
    const vault = await loadVaultSummary(supabase, user.id, 30);
    return NextResponse.json(vault);
  } catch (e) {
    if (e instanceof LedgerAuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    const msg = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
