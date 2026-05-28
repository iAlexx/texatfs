/**
 * POST /api/whatsapp/onboarding-status
 * Body: { initData, telegramUserId? }
 */
import { NextResponse } from "next/server";
import {
  resolveLedgerUserIdOnly,
  LedgerAuthError,
} from "@/lib/ledger/resolve-user";
import type { LedgerAuthInput } from "@/lib/ledger/types";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import { listAgentGroupsForUser } from "@/lib/whatsapp/agent-groups";
import { getOnboardingStatusForUserId } from "@/lib/whatsapp/onboarding-users";
import type { OnboardingStatus } from "@/lib/whatsapp/onboarding-users";
import { resolveUserCredentials } from "@/lib/scraper/resolve-user-credentials";
import { getWhatsAppBotConfigForClient } from "@/lib/whatsapp/bot-config";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  try {
    const body = (await request.json()) as LedgerAuthInput;
    const { userId } = await resolveLedgerUserIdOnly(body);

    const supabase = getSupabaseServiceClient();
    const user = await getOnboardingStatusForUserId(supabase, userId);

    if (!user) {
      return NextResponse.json({
        onboardingStatus: "PENDING_REGISTRATION" as OnboardingStatus,
        whatsappPhone: null,
        groupCount: 0,
        hasTexasCredentials: false,
        ...getWhatsAppBotConfigForClient(),
      });
    }

    const groups = await listAgentGroupsForUser(supabase, userId);
    const creds = await resolveUserCredentials(supabase, userId);

    return NextResponse.json({
      onboardingStatus: (user.onboarding_status ??
        "PENDING_REGISTRATION") as OnboardingStatus,
      whatsappPhone: user.whatsapp_phone,
      groupCount: groups.length,
      hasTexasCredentials: creds.hasCredentials,
      ...getWhatsAppBotConfigForClient(),
    });
  } catch (e) {
    if (e instanceof LedgerAuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    const msg = e instanceof Error ? e.message : "Server error";
    console.error("[whatsapp/onboarding-status] error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
