import { NextResponse } from "next/server";
import {
  LedgerAuthError,
  resolveLedgerUserIdOnly,
} from "@/lib/ledger/resolve-user";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import { createLogger } from "@/lib/observability/logger";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const log = createLogger("auth/logout");

/**
 * Detach Telegram from the paid account without deleting subscription, license,
 * ledgers, or WhatsApp group mappings.
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    const { userId } = await resolveLedgerUserIdOnly(body);
    const supabase = getSupabaseServiceClient();

    const { data: before, error: readErr } = await supabase
      .from("users")
      .select(
        "id, telegram_id, subscription_end_date, license_key_id, role"
      )
      .eq("id", userId)
      .single();

    if (readErr) throw readErr;

    const { error: updErr } = await supabase
      .from("users")
      .update({ telegram_id: null })
      .eq("id", userId);

    if (updErr) throw updErr;

    if (before?.telegram_id != null) {
      await supabase
        .from("telegram_onboarding_sessions")
        .delete()
        .eq("telegram_id", before.telegram_id);
    }

    log.info("telegram session detached", {
      userId,
      hadTelegramId: before?.telegram_id != null,
      subscriptionEnd: before?.subscription_end_date,
      licenseKeyId: before?.license_key_id,
    });

    return NextResponse.json({
      ok: true,
      message: "تم تسجيل الخروج. الاشتراك والبيانات محفوظة على الحساب.",
      subscription_end_date: before?.subscription_end_date ?? null,
      license_key_id: before?.license_key_id ?? null,
    });
  } catch (err) {
    if (err instanceof LedgerAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    const msg = err instanceof Error ? err.message : "Server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
