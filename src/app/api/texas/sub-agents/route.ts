import { getSupabaseServiceClient } from "@/lib/supabase/server";
import type { LedgerAuthInput } from "@/lib/ledger/types";
import { fetchTexasSubAgentsLive, type TexasSubAgentsPayload } from "@/lib/texas/texas-live-sub-agents";
import { withAuthenticatedTexasClient, texasJsonResponse } from "@/lib/texas/with-authenticated-texas-client";
import { serverCacheGet, serverCacheSet } from "@/lib/texas/server-cache";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const runtime = "nodejs";
/** sub-agents fetches are slow (multiple Texas API calls) — allow up to 30s */
export const maxDuration = 30;

// 90 seconds — Railway single-instance keeps data fresh enough while saving
// expensive Puppeteer cold-starts. Users can force-refresh if needed.
const SUB_AGENTS_TTL_MS = 90_000;

interface Body extends LedgerAuthInput {
  ledgerDate?: string;
  /** Set to true to bypass server cache */
  forceRefresh?: boolean;
}

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Body;
  const ledgerDate = body.ledgerDate ?? todayIsoDate();
  const supabase = getSupabaseServiceClient();

  return withAuthenticatedTexasClient(supabase, body, async ({ user, client }) => {
    const cacheKey = `sub-agents:${user.id}:${ledgerDate}`;

    // Return cached response if available and not forced refresh
    if (!body.forceRefresh) {
      const cached = serverCacheGet<TexasSubAgentsPayload>(cacheKey);
      if (cached) {
        return texasJsonResponse({ ...cached, _cached: true }, 200);
      }
    }

    const payload = await fetchTexasSubAgentsLive(client, ledgerDate);

    serverCacheSet(cacheKey, payload, SUB_AGENTS_TTL_MS);

    return texasJsonResponse(payload, 200);
  });
}
