import { getSupabaseServiceClient } from "@/lib/supabase/server";
import type { LedgerAuthInput } from "@/lib/ledger/types";
import { fetchTexasSubAgentsLive, type TexasSubAgentsPayload } from "@/lib/texas/texas-live-sub-agents";
import { withAuthenticatedTexasClient, texasJsonResponse } from "@/lib/texas/with-authenticated-texas-client";
import { serverCacheGet, serverCacheSet } from "@/lib/texas/server-cache";
import {
  assertCacheScope,
  stampCacheScope,
} from "@/lib/texas/texas-data-scope";
import type { UserScopeContext } from "@/lib/security/user-context";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const runtime = "nodejs";
/** sub-agents fetches are slow (multiple Texas API calls) — allow up to 30s */
export const maxDuration = 30;

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

  return withAuthenticatedTexasClient(supabase, body, async ({ user, client, creds }) => {
    const cacheKey = `sub-agents:${user.id}:${ledgerDate}`;

    if (!body.forceRefresh) {
      const cached = serverCacheGet<
        TexasSubAgentsPayload & { _scope?: UserScopeContext }
      >(cacheKey, user.id);
      if (cached) {
        assertCacheScope(cached, user.id, cacheKey);
        const { _scope: _ignored, ...payload } = cached;
        return texasJsonResponse({ ...payload, _cached: true }, 200);
      }
    }

    const payload = await fetchTexasSubAgentsLive(client, ledgerDate);
    const scoped = stampCacheScope(payload, {
      resolvedUserId: user.id,
      texasUsername: creds.texas_username ?? creds.username,
      texasAffiliateId: creds.texas_affiliate_id,
      cacheKey,
    });

    serverCacheSet(cacheKey, user.id, scoped, SUB_AGENTS_TTL_MS);

    return texasJsonResponse(payload, 200);
  });
}
