import { getSupabaseServiceClient } from "@/lib/supabase/server";
import type { LedgerAuthInput } from "@/lib/ledger/types";
import { fetchTexasSubAgentsLive } from "@/lib/texas/texas-live-sub-agents";
import { withAuthenticatedTexasClient } from "@/lib/texas/with-authenticated-texas-client";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const runtime = "nodejs";

interface Body extends LedgerAuthInput {
  ledgerDate?: string;
}

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Body;
  const ledgerDate = body.ledgerDate ?? todayIsoDate();
  const supabase = getSupabaseServiceClient();

  return withAuthenticatedTexasClient(supabase, body, async ({ client }) => {
    const payload = await fetchTexasSubAgentsLive(client, ledgerDate);
    return Response.json(payload, { status: 200 });
  });
}
