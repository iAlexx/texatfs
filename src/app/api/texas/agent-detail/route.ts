/**
 * POST /api/texas/agent-detail
 * Body: { initData, telegramUserId, affiliateId, currencyCode?, ledgerDate?,
 *         username?, tebat?, suhoubat?, al_harq? }
 *
 * PERFORMANCE: When the client passes pre-fetched stats from the list view,
 * we only call getAgentWalletByAgentId (1 Texas API call instead of 3).
 */
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import type { LedgerAuthInput } from "@/lib/ledger/types";
import { texasMetricsToDailyLedger } from "@/lib/texas/texas-live-ledger";
import {
  fetchTexasAgentDetailLive,
  fetchTexasAgentWallet,
} from "@/lib/texas/texas-live-sub-agents";
import { withAuthenticatedTexasClient } from "@/lib/texas/with-authenticated-texas-client";
import { serverCacheGet } from "@/lib/texas/server-cache";
import type { TexasSubAgentsPayload } from "@/lib/texas/texas-live-sub-agents";
import { computeAlFarq, roundMoney } from "@/lib/accounting/formulas";
import { pickNumeric } from "@/lib/texas/field-resolver";
import { TEXAS_FIELD_MAPPING } from "@/lib/texas/texas-mapping.config";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const runtime = "nodejs";
export const maxDuration = 20;

interface Body extends LedgerAuthInput {
  affiliateId: string;
  currencyCode?: string;
  ledgerDate?: string;
  /** Pre-populated from list view to avoid refetching */
  username?: string;
  tebat?: number;
  suhoubat?: number;
  al_harq?: number;
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
  const supabase = getSupabaseServiceClient();

  return withAuthenticatedTexasClient(supabase, body, async ({ user, client }) => {
    const currencyCode = body.currencyCode?.trim() || "NSP";

    // ── FAST PATH: client provided stats from list + server cache has sub-agents ─
    const cacheKey = `sub-agents:${user.id}:${ledgerDate}`;
    const cachedList = serverCacheGet<TexasSubAgentsPayload>(cacheKey);
    const cachedAgent = cachedList?.agents.find((a) => a.affiliateId === affiliateId);

    const hasClientStats =
      body.tebat !== undefined &&
      body.suhoubat !== undefined &&
      body.al_harq !== undefined;

    if (hasClientStats || cachedAgent) {
      // Only call wallet endpoint — 1 API call
      const wallet = await fetchTexasAgentWallet(client, affiliateId, currencyCode);

      const tebat   = body.tebat   ?? cachedAgent?.metrics.tebat   ?? 0;
      const suhoubat = body.suhoubat ?? cachedAgent?.metrics.suhoubat ?? 0;
      const al_harq  = body.al_harq  ?? cachedAgent?.metrics.al_harq  ?? 0;
      const al_farq  = computeAlFarq(tebat, suhoubat);

      const walletRow = wallet as Record<string, unknown> | null;
      const walletBalance = wallet
        ? pickNumeric(walletRow!, TEXAS_FIELD_MAPPING.wallet.balance)
        : 0;

      const metrics = {
        tebat,
        suhoubat,
        al_farq,
        al_harq,
        wasel_menho: 0,
        wasel_eleih: 0,
        baqi_qadim: 0,
        al_nihai: roundMoney(walletBalance),
      };

      const username = body.username?.trim() || cachedAgent?.username || affiliateId;
      const email    = cachedAgent?.email || affiliateId;
      const mainCurrency = cachedAgent?.mainCurrency || currencyCode;
      const ledger   = texasMetricsToDailyLedger(affiliateId, ledgerDate, metrics);

      return Response.json(
        { affiliate_id: affiliateId, username, email, main_currency: mainCurrency, ledger, source: "texas_api" },
        { status: 200 }
      );
    }

    // ── SLOW PATH: fetch all data from Texas API (first open of deep-dive) ──
    const detail = await fetchTexasAgentDetailLive(client, affiliateId, currencyCode);
    const ledger = texasMetricsToDailyLedger(affiliateId, ledgerDate, detail.metrics);

    return Response.json(
      {
        affiliate_id: affiliateId,
        username: detail.username,
        email: detail.email,
        main_currency: detail.mainCurrency,
        ledger,
        source: "texas_api" as const,
      },
      { status: 200 }
    );
  });
}
