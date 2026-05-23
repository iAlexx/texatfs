import { NextResponse } from "next/server";
import { AdminAuthError, requireAdmin } from "@/lib/admin/auth";
import { loadAdminHealthStatus } from "@/lib/observability/health-status";
import { getSupabaseServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      initData?: string;
      telegramUserId?: number;
    };

    await requireAdmin(body);

    const supabase = getSupabaseServiceClient();
    const status = await loadAdminHealthStatus(supabase);

    return NextResponse.json(status);
  } catch (err) {
    if (err instanceof AdminAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    const message = err instanceof Error ? err.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
