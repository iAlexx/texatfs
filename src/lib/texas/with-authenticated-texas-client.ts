import type { AxiosInstance } from "axios";
import type { SupabaseClient } from "@supabase/supabase-js";
import { TexasSessionService } from "@/lib/services/TexasSessionService";
import { canManageNetwork } from "@/lib/hierarchy/subtree-rules";
import type { LedgerAuthInput } from "@/lib/ledger/types";
import { LedgerAuthError, resolveLedgerUser } from "@/lib/ledger/resolve-user";
import { requireUserCredentials } from "@/lib/scraper/resolve-user-credentials";
import type { AppUser } from "@/lib/supabase/database.types";

export class TexasLiveApiError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 401 | 402 | 403 | 500 = 500
  ) {
    super(message);
    this.name = "TexasLiveApiError";
  }
}

export async function withAuthenticatedTexasClient(
  supabase: SupabaseClient,
  auth: LedgerAuthInput,
  run: (ctx: { user: AppUser; client: AxiosInstance }) => Promise<Response>
): Promise<Response> {
  try {
    const { user, subscriptionActive } = await resolveLedgerUser(auth);

    if (!subscriptionActive) {
      return Response.json(
        { error: "انتهى الاشتراك", subscription_active: false },
        { status: 402 }
      );
    }

    if (!canManageNetwork(user.role)) {
      throw new TexasLiveApiError("غير مصرح بعرض الوكلاء الفرعيين", 403);
    }

    const creds = await requireUserCredentials(supabase, user.id);
    const session = new TexasSessionService();
    const client = await session.getClient({
      username: creds.username,
      password: creds.password,
    });

    return await run({ user, client });
  } catch (e) {
    if (e instanceof LedgerAuthError) {
      return Response.json({ error: e.message }, { status: e.status });
    }
    if (e instanceof TexasLiveApiError) {
      return Response.json({ error: e.message }, { status: e.status });
    }
    const message =
      e instanceof Error ? e.message : "تعذر الاتصال بلوحة تكساس";
    console.error("[withAuthenticatedTexasClient]", message);
    return Response.json({ error: message }, { status: 500 });
  }
}
