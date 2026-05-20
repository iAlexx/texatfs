/**
 * POST /api/texas/agent-detail
 * Body: { initData, telegramUserId, affiliateId, currencyCode?, ledgerDate? }
 *
 * Fast path  (when list cache ≤30s old): 2 parallel calls — wallet + transfers.
 * Slow path  (cold / cache miss):        4 parallel calls — children + stats + wallet + transfers.
 */
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import type { LedgerAuthInput } from "@/lib/ledger/types";
import {
  texasMetricsToDailyLedger,
  type TexasLiveLedgerMetrics,
} from "@/lib/texas/texas-live-ledger";
import {
  fetchTexasAgentDetailLive,
  fetchTexasAgentWallet,
} from "@/lib/texas/texas-live-sub-agents";
import { withAuthenticatedTexasClient } from "@/lib/texas/with-authenticated-texas-client";
import { serverCacheGet } from "@/lib/texas/server-cache";
import type { TexasSubAgentsPayload } from "@/lib/texas/texas-live-sub-agents";
import {
  fetchAgentsTransfers,
  getTransferSummary,
} from "@/lib/texas/fetch-agents-transfers";
import { pickNumeric, walletMapping } from "@/lib/texas/field-resolver";
import { roundMoney } from "@/lib/accounting/formulas";

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

  const ledgerDate   = body.ledgerDate ?? todayIsoDate();
  const currencyCode = body.currencyCode?.trim() || "NSP";
  const supabase     = getSupabaseServiceClient();

  return withAuthenticatedTexasClient(supabase, body, async ({ user, client }) => {
    // ── FAST PATH: sub-agents list was fetched within the last 30s ────────────
    const listCacheKey = `sub-agents:${user.id}:${ledgerDate}`;
    const cachedList   = serverCacheGet<TexasSubAgentsPayload>(listCacheKey);
    const cachedAgent  = cachedList?.agents.find((a) => a.affiliateId === affiliateId);

    if (cachedAgent) {
      // Only 2 fresh API calls (wallet balance + today's transfers)
      const [wallet, transfersMap] = await Promise.all([
        fetchTexasAgentWallet(client, affiliateId, currencyCode),
        fetchAgentsTransfers(client, { date: ledgerDate }),
      ]);

      const transfers    = getTransferSummary(transfersMap, affiliateId);
      const walletRow    = (wallet ?? {}) as Record<string, unknown>;
      const walletBalance = wallet
        ? pickNumeric(walletRow, walletMapping.balance)
        : null;

      const metrics: TexasLiveLedgerMetrics = {
        ...cachedAgent.metrics,
        wasel_eleih: roundMoney(transfers.depositsToAgent),
        wasel_menho: roundMoney(transfers.withdrawsFromAgent),
        al_nihai:
          walletBalance != null && walletBalance !== 0
            ? roundMoney(walletBalance)
            : cachedAgent.metrics.al_nihai,
      };

      const ledger = texasMetricsToDailyLedger(affiliateId, ledgerDate, metrics);
      return Response.json(
        {
          affiliate_id:  affiliateId,
          username:      cachedAgent.username,
          email:         cachedAgent.email,
          main_currency: cachedAgent.mainCurrency,
          ledger,
          source:        "texas_api" as const,
        },
        { status: 200 }
      );
    }

    // ── SLOW PATH: cold open — 4 parallel Texas API calls ────────────────────
    const detail = await fetchTexasAgentDetailLive(
      client,
      affiliateId,
      currencyCode,
      ledgerDate
    );

    const ledger = texasMetricsToDailyLedger(affiliateId, ledgerDate, detail.metrics);
    return Response.json(
      {
        affiliate_id:  affiliateId,
        username:      detail.username,
        email:         detail.email,
        main_currency: detail.mainCurrency,
        ledger,
        source:        "texas_api" as const,
      },
      { status: 200 }
    );
  });
}
