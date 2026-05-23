/**
 * GET /api/whatsapp/onboarding-status?telegram_id=<number>
 */
import { NextResponse } from "next/server";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import { listAgentGroupsForUser } from "@/lib/whatsapp/agent-groups";
import type { OnboardingStatus } from "@/lib/whatsapp/onboarding-users";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const rawId = searchParams.get("telegram_id");

  if (!rawId) {
    return NextResponse.json(
      { error: "telegram_id query param is required" },
      { status: 400 }
    );
  }

  const telegramId = Number(rawId);
  if (Number.isNaN(telegramId) || telegramId <= 0) {
    return NextResponse.json({ error: "Invalid telegram_id" }, { status: 400 });
  }

  try {
    const supabase = getSupabaseServiceClient();

    const { data: userRow, error: userErr } = await supabase
      .from("users")
      .select("id, whatsapp_phone, onboarding_status")
      .eq("telegram_id", telegramId)
      .maybeSingle();

    if (userErr) throw userErr;

    if (!userRow) {
      return NextResponse.json({
        onboardingStatus: "PENDING_REGISTRATION" as OnboardingStatus,
        whatsappPhone: null,
        groupCount: 0,
      });
    }

    const groups = await listAgentGroupsForUser(supabase, userRow.id);

    return NextResponse.json({
      onboardingStatus: (userRow.onboarding_status ??
        "PENDING_REGISTRATION") as OnboardingStatus,
      whatsappPhone: userRow.whatsapp_phone as string | null,
      groupCount: groups.length,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Server error";
    console.error("[whatsapp/onboarding-status] error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
