/**
 * Isolated Texas sub-agent fetch for WhatsApp group spawning.
 *
 * Puppeteer sign-in runs inside a try/catch + timeout so Chromium OOM/SIGKILL
 * never propagates to registration or webhook DB flows.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireUserCredentials } from "@/lib/scraper/resolve-user-credentials";
import { TexasSessionService } from "@/lib/services/TexasSessionService";
import { fetchAllTexasChildren } from "@/lib/texas/fetch-texas-children";
import type { TexasChildRecord } from "@/lib/texas/types";

const TEXAS_FETCH_TIMEOUT_MS = 120_000;

export interface TexasChildrenFetchResult {
  ok: boolean;
  records: TexasChildRecord[];
  error?: string;
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`${label} timed out after ${ms}ms`)),
      ms
    );
    promise
      .then((v) => {
        clearTimeout(timer);
        resolve(v);
      })
      .catch((e) => {
        clearTimeout(timer);
        reject(e);
      });
  });
}

async function fetchTexasChildrenInner(
  supabase: SupabaseClient,
  userId: string
): Promise<TexasChildRecord[]> {
  const creds = await requireUserCredentials(supabase, userId);
  const session = new TexasSessionService();
  const token = await session.signIn({
    username: creds.username,
    password: creds.password,
  });
  const client = session.getClientFromToken(token);
  const result = await fetchAllTexasChildren(client);
  return result.records;
}

/**
 * Safe wrapper — never throws. Returns empty records on Puppeteer/OOM failure.
 */
export async function fetchTexasChildrenSafe(
  supabase: SupabaseClient,
  userId: string
): Promise<TexasChildrenFetchResult> {
  try {
    const records = await withTimeout(
      fetchTexasChildrenInner(supabase, userId),
      TEXAS_FETCH_TIMEOUT_MS,
      "Texas children fetch"
    );
    return { ok: true, records };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[whatsapp/texas-fetch] failed (non-fatal):", message);
    return { ok: false, records: [], error: message };
  }
}
