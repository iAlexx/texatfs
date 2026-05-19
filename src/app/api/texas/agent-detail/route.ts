import { getSupabaseServiceClient } from "@/lib/supabase/server";
import type { LedgerAuthInput } from "@/lib/ledger/types";
import { texasMetricsToDailyLedger } from "@/lib/texas/texas-live-ledger";
import { fetchTexasAgentDetailLive } from "@/lib/texas/texas-live-sub-agents";
import { withAuthenticatedTexasClient } from "@/lib/texas/with-authenticated-texas-client";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const runtime = "nodejs";

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
  const supabase = getSupabaseServiceClient();

  return withAuthenticatedTexasClient(supabase, body, async ({ client }) => {
    const detail = await fetchTexasAgentDetailLive(
      client,
      affiliateId,
      body.currencyCode?.trim() || "NSP"
    );

    const ledger = texasMetricsToDailyLedger(
      affiliateId,
      ledgerDate,
      detail.metrics
    );

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
