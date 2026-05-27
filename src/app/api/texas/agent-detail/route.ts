/**
 * POST /api/texas/agent-detail
 * Body: { initData, telegramUserId, affiliateId, currencyCode?, ledgerDate? }
 */
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import type { LedgerAuthInput } from "@/lib/ledger/types";
import { texasMetricsToDailyLedger } from "@/lib/texas/texas-live-ledger";
import { fetchTexasAgentDetailLive } from "@/lib/texas/texas-live-sub-agents";
import {
  texasJsonResponse,
  withAuthenticatedTexasClient,
} from "@/lib/texas/with-authenticated-texas-client";
import { serverCacheGet } from "@/lib/texas/server-cache";
import type { TexasSubAgentsPayload } from "@/lib/texas/texas-live-sub-agents";
import { assertCacheScope } from "@/lib/texas/texas-data-scope";
import type { UserScopeContext } from "@/lib/security/user-context";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const runtime = "nodejs";
export const maxDuration = 30;

interface Body extends LedgerAuthInput {
  affiliateId: string;
  currencyCode?: string;
  ledgerDate?: string;
}

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Body;
  const affiliateId = body.affiliateId?.trim();

  if (!affiliateId) {
    return Response.json({ error: "affiliateId مطلوب" }, { status: 400 });
  }

  const ledgerDate = body.ledgerDate ?? todayIsoDate();
  const currencyCode = body.currencyCode?.trim() || "NSP";
  const supabase = getSupabaseServiceClient();

  return withAuthenticatedTexasClient(supabase, body, async ({ user, client }) => {
    // --- PRIVACY ENFORCEMENT: only allow viewing direct children ---
    const { data: directChild } = await supabase
      .from("users")
      .select("id")
      .eq("parent_id", user.id)
      .eq("texas_affiliate_id", affiliateId)
      .eq("is_active", true)
      .maybeSingle();

    if (!directChild) {
      console.warn("[agent-detail] access denied — not a direct child", {
        viewerId: user.id,
        requestedAffiliateId: affiliateId,
      });
      return Response.json(
        { error: "غير مسموح بعرض بيانات هذا الوكيل" },
        { status: 403 }
      );
    }

    const listCacheKey = `sub-agents:v3:${user.id}:${ledgerDate}`;
    const cachedList = serverCacheGet<
      TexasSubAgentsPayload & { _scope?: UserScopeContext }
    >(listCacheKey, user.id);

    if (cachedList) {
      assertCacheScope(cachedList, user.id, listCacheKey);
      const cachedAgent = cachedList.agents.find(
        (a) => a.affiliateId === affiliateId
      );

      if (cachedAgent) {
        const ledger = texasMetricsToDailyLedger(
          affiliateId,
          ledgerDate,
          cachedAgent.metrics
        );
        return texasJsonResponse(
          {
            affiliate_id: affiliateId,
            username: cachedAgent.username,
            email: cachedAgent.email,
            main_currency: cachedAgent.mainCurrency,
            ledger,
            source: "texas_api" as const,
          },
          200
        );
      }
    }

    const detail = await fetchTexasAgentDetailLive(
      client,
      affiliateId,
      currencyCode,
      ledgerDate
    );

    const ledger = texasMetricsToDailyLedger(affiliateId, ledgerDate, detail.metrics);
    return texasJsonResponse(
      {
        affiliate_id: affiliateId,
        username: detail.username,
        email: detail.email,
        main_currency: detail.mainCurrency,
        ledger,
        source: "texas_api" as const,
      },
      200
    );
  });
}
