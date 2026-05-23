import { AccountingService } from "@/lib/accounting/AccountingService";
import type { AccountingRepository, DailyLedgerReport } from "@/lib/accounting/types";
import { coalesceLedgerSync } from "@/lib/accounting/ledger-sync-flight";
import { RegistrationService } from "@/lib/services/RegistrationService";
import {
  requireUserCredentials,
  toTexasSyncRole,
} from "@/lib/scraper/resolve-user-credentials";
import { TexasSyncService } from "@/lib/services/TexasSyncService";
import { SubscriptionService } from "@/lib/subscription/SubscriptionService";
import { SubscriptionExpiredError } from "@/lib/subscription/errors";
import { createLogger } from "@/lib/observability/logger";
import type { TexasSyncUserContext } from "@/lib/texas/types";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseServiceClient } from "@/lib/supabase/server";

export interface DailyReportOrchestratorResult {
  sync: Awaited<ReturnType<TexasSyncService["syncUser"]>>;
  report: DailyLedgerReport;
}

export interface DailyReportSkipped {
  skipped: true;
  reason: "SUBSCRIPTION_EXPIRED";
  userId: string;
}

const log = createLogger("orchestrator/daily-report");

/**
 * End-to-end: Texas API poll → snapshot → deterministic ledger → persist.
 * One in-flight run per userId + ledgerDate (process + DB lock).
 */
export class DailyReportOrchestrator {
  private readonly texasSync = new TexasSyncService();
  private readonly accounting: AccountingService;
  private readonly repository: AccountingRepository;
  private readonly subscription: SubscriptionService;
  private readonly registration: RegistrationService;
  private readonly supabase: SupabaseClient;

  constructor(
    repository: AccountingRepository,
    supabase: SupabaseClient = getSupabaseServiceClient()
  ) {
    this.supabase = supabase;
    this.repository = repository;
    this.accounting = new AccountingService(repository);
    this.subscription = new SubscriptionService(supabase);
    this.registration = new RegistrationService(supabase);
  }

  async runForUser(
    context: TexasSyncUserContext,
    ledgerDate: string,
    options?: {
      openingSnapshotId?: string;
      closingSnapshotId?: string;
      skipSubscriptionCheck?: boolean;
    }
  ): Promise<DailyReportOrchestratorResult> {
    return coalesceLedgerSync(context.userId, ledgerDate, () =>
      this.runForUserOnce(context, ledgerDate, options)
    );
  }

  private async runForUserOnce(
    context: TexasSyncUserContext,
    ledgerDate: string,
    options?: {
      openingSnapshotId?: string;
      closingSnapshotId?: string;
      skipSubscriptionCheck?: boolean;
    }
  ): Promise<DailyReportOrchestratorResult> {
    if (!options?.skipSubscriptionCheck) {
      await this.subscription.assertActive(context.userId);
    }

    const lockAcquired = await this.waitForSyncLock(context.userId, ledgerDate);
    if (!lockAcquired) {
      log.warn("sync lock timeout — peer still running", {
        userId: context.userId,
        ledgerDate,
      });
      throw new Error(
        `Ledger sync lock timeout for ${context.userId} on ${ledgerDate}`
      );
    }

    try {
      const sync = await this.texasSync.syncUser(context);

      const inserted = await this.repository.insertSnapshot(
        context.userId,
        ledgerDate,
        sync.snapshot,
        "cron"
      );
      const closingSnapshotId = options?.closingSnapshotId ?? inserted.id;

      const report = await this.accounting.syncAndPersistDailyReport(
        context.userId,
        ledgerDate,
        sync.snapshot,
        { ...options, closingSnapshotId }
      );

      return { sync, report };
    } finally {
      await this.repository.releaseSyncLock(context.userId, ledgerDate);
    }
  }

  async runForRegisteredUser(
    userId: string,
    ledgerDate: string,
    texasAffiliateId: string | null,
    role: TexasSyncUserContext["role"] = "master"
  ): Promise<DailyReportOrchestratorResult | DailyReportSkipped> {
    const active = await this.subscription.isActive(userId);
    if (!active) {
      return { skipped: true, reason: "SUBSCRIPTION_EXPIRED", userId };
    }

    const creds = await requireUserCredentials(this.supabase, userId);
    const syncRole = toTexasSyncRole(creds.role);

    return this.runForUser(
      {
        userId,
        texasAffiliateId: texasAffiliateId ?? creds.texas_affiliate_id,
        texasUsername: creds.texas_username ?? creds.username,
        role: syncRole,
        credentials: {
          username: creds.username,
          password: creds.password,
        },
      },
      ledgerDate,
      { skipSubscriptionCheck: true }
    );
  }

  async runForUserOrSkip(
    context: TexasSyncUserContext,
    ledgerDate: string,
    options?: { openingSnapshotId?: string; closingSnapshotId?: string }
  ): Promise<DailyReportOrchestratorResult | DailyReportSkipped> {
    const active = await this.subscription.isActive(context.userId);
    if (!active) {
      return {
        skipped: true,
        reason: "SUBSCRIPTION_EXPIRED",
        userId: context.userId,
      };
    }

    try {
      return await this.runForUser(context, ledgerDate, {
        ...options,
        skipSubscriptionCheck: true,
      });
    } catch (e) {
      if (e instanceof SubscriptionExpiredError) {
        return {
          skipped: true,
          reason: "SUBSCRIPTION_EXPIRED",
          userId: context.userId,
        };
      }
      throw e;
    }
  }

  /** Cross-instance lock — poll until peer releases or TTL prunes stale row. */
  private async waitForSyncLock(
    userId: string,
    ledgerDate: string,
    maxWaitMs = 120_000
  ): Promise<boolean> {
    const deadline = Date.now() + maxWaitMs;
    while (Date.now() < deadline) {
      if (await this.repository.tryAcquireSyncLock(userId, ledgerDate)) {
        return true;
      }
      await new Promise((r) => setTimeout(r, 2000));
    }
    return false;
  }
}
