/**
 * POST /api/whatsapp/disconnect
 * Body: { initData, telegramUserId }
 * → { ok: true }
 */
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import type { LedgerAuthInput } from "@/lib/ledger/types";
import { LedgerAuthError, resolveLedgerUser } from "@/lib/ledger/resolve-user";
import { disconnectInstance } from "@/lib/whatsapp/instance-manager";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as LedgerAuthInput;
    const { user } = await resolveLedgerUser(body);
    const supabase = getSupabaseServiceClient();
    await disconnectInstance(supabase, user.id);
    return Response.json({ ok: true });
  } catch (e) {
    if (e instanceof LedgerAuthError) {
      return Response.json({ error: e.message }, { status: e.status });
    }
    const msg = e instanceof Error ? e.message : "Server error";
    return Response.json({ error: msg }, { status: 500 });
  }
}
