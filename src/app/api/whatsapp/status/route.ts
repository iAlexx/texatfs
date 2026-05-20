/**
 * POST /api/whatsapp/status
 * Body: { initData, telegramUserId }
 * → { status, phone_number, connected_at, groups_count }
 *
 * Syncs connection state from Evolution API, then returns DB record.
 */
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import type { LedgerAuthInput } from "@/lib/ledger/types";
import { LedgerAuthError, resolveLedgerUser } from "@/lib/ledger/resolve-user";
import {
  getUserInstance,
  syncInstanceStatus,
} from "@/lib/whatsapp/instance-manager";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as LedgerAuthInput;
    const { user } = await resolveLedgerUser(body);
    const supabase = getSupabaseServiceClient();

    const status = await syncInstanceStatus(supabase, user.id);
    const instance = await getUserInstance(supabase, user.id);

    // Count 🔥 groups
    const { count: fireGroupsCount } = await supabase
      .from("whatsapp_groups")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("is_fire_group", true);

    return Response.json({
      ok: true,
      status,
      phone_number: instance?.phone_number ?? null,
      connected_at: instance?.connected_at ?? null,
      fire_groups_count: fireGroupsCount ?? 0,
    });
  } catch (e) {
    if (e instanceof LedgerAuthError) {
      return Response.json({ error: e.message }, { status: e.status });
    }
    const msg = e instanceof Error ? e.message : "Server error";
    return Response.json({ error: msg }, { status: 500 });
  }
}
