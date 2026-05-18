import { NextResponse } from "next/server";
import {
  AdminAuthError,
  requireAdmin,
  type AdminAuthInput,
} from "@/lib/admin/auth";
import type { AdminUserRow, AdminUsersResponse } from "@/lib/admin/types";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import { SubscriptionService } from "@/lib/subscription/SubscriptionService";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as AdminAuthInput;
    requireAdmin(body);

    const supabase = getSupabaseServiceClient();
    const subscription = new SubscriptionService(supabase);

    const { data: rows, error } = await supabase
      .from("users")
      .select(
        "id, telegram_id, display_name, texas_username, role, subscription_end_date, license_key_id, registered_via, is_active, created_at"
      )
      .order("created_at", { ascending: false });

    if (error) throw error;

    const users: AdminUserRow[] = await Promise.all(
      (rows ?? []).map(async (row) => ({
        id: row.id,
        telegram_id: row.telegram_id,
        display_name: row.display_name,
        texas_username: row.texas_username,
        role: row.role,
        subscription_end_date: row.subscription_end_date,
        subscription_active: await subscription.isActive(row.id),
        license_key_id: row.license_key_id,
        registered_via: row.registered_via,
        is_active: row.is_active,
        created_at: row.created_at,
      }))
    );

    const payload: AdminUsersResponse = {
      users,
      total: users.length,
    };

    return NextResponse.json(payload);
  } catch (e) {
    if (e instanceof AdminAuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    const msg = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
