import type { SupabaseClient } from "@supabase/supabase-js";
import { canManageNetwork } from "@/lib/hierarchy/subtree-rules";
import type { LedgerAuthInput } from "@/lib/ledger/types";
import { LedgerAuthError, resolveLedgerUser } from "@/lib/ledger/resolve-user";
import { requireUserCredentials } from "@/lib/scraper/resolve-user-credentials";
import type { ResolvedUserCredentials } from "@/lib/scraper/resolve-user-credentials";
import type { AppUser } from "@/lib/supabase/database.types";
import { logUserScope, UserContextViolation } from "@/lib/security/user-context";
import {
  toTexasPlainObject,
  type TexasHttpClient,
} from "@/lib/texas/texas-http-client";

export class TexasLiveApiError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 401 | 402 | 403 | 500 = 500
  ) {
    super(message);
    this.name = "TexasLiveApiError";
  }
}

function safeErrorMessage(err: unknown): string {
  if (err instanceof TexasLiveApiError) return err.message;
  if (err instanceof LedgerAuthError) return err.message;
  if (err instanceof Error) return err.message;
  return "تعذر الاتصال بلوحة تكساس";
}

/** Next.js-safe JSON response — always a plain serializable object. */
export function texasJsonResponse(data: unknown, status = 200): Response {
  return Response.json(toTexasPlainObject(data), { status });
}

export async function withAuthenticatedTexasClient(
  supabase: SupabaseClient,
  auth: LedgerAuthInput,
  run: (ctx: {
    user: AppUser;
    client: TexasHttpClient;
    creds: ResolvedUserCredentials & { hasCredentials: true };
  }) => Promise<Response>
): Promise<Response> {
  try {
    const { user, subscriptionActive } = await resolveLedgerUser(auth);

    if (!subscriptionActive) {
      return texasJsonResponse(
        { error: "انتهى الاشتراك", subscription_active: false },
        402
      );
    }

    if (!canManageNetwork(user.role)) {
      throw new TexasLiveApiError("غير مصرح بعرض الوكلاء الفرعيين", 403);
    }

    const creds = await requireUserCredentials(supabase, user.id);
    logUserScope(
      {
        resolvedUserId: user.id,
        texasUsername: creds.texas_username ?? creds.username,
        texasAffiliateId: creds.texas_affiliate_id,
      },
      "withAuthenticatedTexasClient"
    );
    const { TexasSessionService } = await import(
      "@/lib/services/TexasSessionService"
    );
    const session = new TexasSessionService();
    const client = await session.getClient({
      username: creds.username,
      password: creds.password,
    });

    const response = await run({ user, client, creds });

    // Belt-and-suspenders: clone body through JSON if handler returned data
    if (response.headers.get("content-type")?.includes("application/json")) {
      try {
        const clone = response.clone();
        const raw = (await clone.json()) as unknown;
        return texasJsonResponse(raw, response.status);
      } catch {
        return response;
      }
    }

    return response;
  } catch (e) {
    if (e instanceof LedgerAuthError) {
      return texasJsonResponse({ error: e.message }, e.status);
    }
    if (e instanceof Error && e.message.includes("بيانات دخول تكساس")) {
      return texasJsonResponse(
        {
          error: e.message,
          empty_reason: "MISSING_CREDENTIALS",
        },
        401
      );
    }
    if (e instanceof TexasLiveApiError) {
      return texasJsonResponse({ error: e.message }, e.status);
    }
    if (e instanceof UserContextViolation) {
      console.error("[withAuthenticatedTexasClient] USER CONTEXT VIOLATION", e.message, e.details);
      return texasJsonResponse({ error: "تعارض في نطاق بيانات المستخدم" }, 500);
    }
    const message = safeErrorMessage(e);
    const isTexasAuth =
      message.includes("Texas sign-in failed") ||
      message.includes("sign-in failed");
    console.error("[withAuthenticatedTexasClient]", message, {
      texasAuthFailed: isTexasAuth,
    });
    return texasJsonResponse(
      {
        error: isTexasAuth
          ? "تعذر تسجيل الدخول إلى لوحة تكساس. افتح الملف الشخصي وأعد ربط حساب تكساس."
          : message,
        empty_reason: isTexasAuth ? "TEXAS_AUTH_FAILED" : undefined,
      },
      isTexasAuth ? 401 : 500
    );
  }
}
