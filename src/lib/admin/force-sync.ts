import type { SupabaseClient } from "@supabase/supabase-js";
import { DailyReportOrchestrator } from "@/lib/services/DailyReportOrchestrator";
import { SupabaseAccountingRepository } from "@/lib/accounting/SupabaseAccountingRepository";
import { resolveLedgerDate } from "@/lib/cron/ledger-date";
import { recordSyncLog } from "@/lib/finance/sync-log";
import { upsertDailyMetric } from "@/lib/finance/cumulative-vault";
import { runStableRegisteredUserSync } from "@/lib/scraper/stable-scraper-wrapper";

export async function forceSyncUser(
  supabase: SupabaseClient,
  userId: string
): Promise<{ ok: true; al_nihai: number } | { ok: false; error: string }> {
  const started = Date.now();
  const ledgerDate = resolveLedgerDate();

  const { data: user, error: userErr } = await supabase
    .from("users")
    .select("id, role, texas_affiliate_id, is_frozen, is_active")
    .eq("id", userId)
    .maybeSingle();

  if (userErr || !user) {
    return { ok: false, error: "المستخدم غير موجود" };
  }
  if (!user.is_active || user.is_frozen) {
    return { ok: false, error: "الحساب مجمّد أو معطّل" };
  }

  const repo = new SupabaseAccountingRepository(supabase);
  const orchestrator = new DailyReportOrchestrator(repo, supabase);

  try {
    const result = await runStableRegisteredUserSync(
      orchestrator,
      userId,
      ledgerDate,
      user.texas_affiliate_id,
      user.role === "player" ? "player" : "master"
    );

    if ("skipped" in result) {
      const msg = "الاشتراك منتهٍ أو غير فعّال";
      await recordSyncLog(supabase, {
        userId,
        status: "failed",
        errorMessage: msg,
        ledgerDate,
        durationMs: Date.now() - started,
      });
      return { ok: false, error: msg };
    }

    const alNihai = result.report.al_nihai;
    const { data: prevLedger } = await supabase
      .from("daily_ledgers")
      .select("al_nihai")
      .eq("user_id", userId)
      .lt("ledger_date", ledgerDate)
      .order("ledger_date", { ascending: false })
      .limit(1)
      .maybeSingle();

    await upsertDailyMetric(
      supabase,
      userId,
      ledgerDate,
      alNihai,
      prevLedger ? Number(prevLedger.al_nihai) : null
    );

    await recordSyncLog(supabase, {
      userId,
      status: "success",
      ledgerDate,
      durationMs: Date.now() - started,
    });

    return { ok: true, al_nihai: alNihai };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "خطأ غير معروف";
    await recordSyncLog(supabase, {
      userId,
      status: "failed",
      errorMessage: msg,
      ledgerDate,
      durationMs: Date.now() - started,
    });
    return { ok: false, error: msg };
  }
}
