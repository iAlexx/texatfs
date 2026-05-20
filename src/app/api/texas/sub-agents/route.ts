import { getSupabaseServiceClient } from "@/lib/supabase/server";
import type { LedgerAuthInput } from "@/lib/ledger/types";
import { fetchTexasSubAgentsLive, type TexasSubAgentsPayload } from "@/lib/texas/texas-live-sub-agents";
import { withAuthenticatedTexasClient } from "@/lib/texas/with-authenticated-texas-client";
import { serverCacheGet, serverCacheSet } from "@/lib/texas/server-cache";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const runtime = "nodejs";
/** sub-agents fetches are slow (multiple Texas API calls) — allow up to 30s */
export const maxDuration = 30;

const SUB_AGENTS_TTL_MS = 30_000; // 30 seconds — balance changes must appear quickly

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
        return Response.json({ ...cached, _cached: true }, { status: 200 });
      }
    }

    const payload = await fetchTexasSubAgentsLive(client, ledgerDate);

    serverCacheSet(cacheKey, payload, SUB_AGENTS_TTL_MS);

    return Response.json(payload, { status: 200 });
  });
}
