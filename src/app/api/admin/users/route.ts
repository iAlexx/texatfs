/**
 * POST /api/admin/users
 * Body: { initData, telegramUserId, page?, limit?, search? }
 *
 * Returns paginated, searchable user list.
 * subscription_active is computed inline from subscription_end_date —
 * no per-row queries, no N+1.
 */
import { NextResponse } from "next/server";
import {
  AdminAuthError,
  requireAdmin,
  type AdminAuthInput,
} from "@/lib/admin/auth";
import type { AdminUserRow, AdminUsersResponse } from "@/lib/admin/types";
import { getSupabaseServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const runtime = "nodejs";

interface UsersBody extends AdminAuthInput {
  page?: number;
  limit?: number;
  search?: string;
}

function isSubscriptionActive(endDate: string | null | undefined): boolean {
  if (!endDate) return false;
  return new Date(endDate) > new Date();
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as UsersBody;
    requireAdmin(body);

    const page   = Math.max(1, Number(body.page  ?? 1));
    const limit  = Math.min(100, Math.max(1, Number(body.limit ?? 20)));
    const search = (body.search ?? "").trim();
    const from   = (page - 1) * limit;
    const to     = from + limit - 1;

    const supabase = getSupabaseServiceClient();

    // Single, efficient query — no N+1
    let query = supabase
      .from("users")
      .select(
        "id, telegram_id, display_name, texas_username, role, subscription_end_date, license_key_id, registered_via, is_active, created_at",
        { count: "exact" }
      )
      .order("created_at", { ascending: false })
      .range(from, to);

    if (search) {
      // Search across display_name, texas_username, and telegram_id (cast to text)
      query = query.or(
        `display_name.ilike.%${search}%,texas_username.ilike.%${search}%`
      );
    }

    const { data: rows, error, count } = await query;

    if (error) throw error;

    const users: AdminUserRow[] = (rows ?? []).map((row) => ({
      id:                    row.id,
      telegram_id:           row.telegram_id,
      display_name:          row.display_name,
      texas_username:        row.texas_username,
      role:                  row.role,
      subscription_end_date: row.subscription_end_date,
      subscription_active:   isSubscriptionActive(row.subscription_end_date),
      license_key_id:        row.license_key_id,
      registered_via:        row.registered_via,
      is_active:             row.is_active,
      created_at:            row.created_at,
    }));

    const total      = count ?? 0;
    const totalPages = Math.ceil(total / limit);

    const payload: AdminUsersResponse = {
      users,
      total,
      page,
      totalPages,
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
