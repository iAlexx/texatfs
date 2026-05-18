import { NextResponse } from "next/server";
import {
  AdminAuthError,
  getConfiguredAdminIds,
  requireAdmin,
  type AdminAuthInput,
} from "@/lib/admin/auth";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as AdminAuthInput;
    const auth = requireAdmin(body);
    return NextResponse.json({
      ok: true,
      telegramUserId: auth.telegramUserId,
      adminCount: getConfiguredAdminIds().length,
    });
  } catch (e) {
    if (e instanceof AdminAuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    const msg = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
