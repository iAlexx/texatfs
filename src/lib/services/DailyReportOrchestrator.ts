import { AccountingService } from "@/lib/accounting/AccountingService";
import type { AccountingRepository, DailyLedgerReport } from "@/lib/accounting/types";
import { RegistrationService } from "@/lib/services/RegistrationService";
import { TexasSyncService } from "@/lib/services/TexasSyncService";
import { SubscriptionService } from "@/lib/subscription/SubscriptionService";
import { SubscriptionExpiredError } from "@/lib/subscription/errors";
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

/**
 * End-to-end: Texas API poll → normalized snapshot → accounting ledger report → persist.
 */
export class DailyReportOrchestrator {
  private readonly texasSync = new TexasSyncService();
  private readonly accounting: AccountingService;
  private readonly subscription: SubscriptionService;
  private readonly registration: RegistrationService;

  constructor(
    repository: AccountingRepository,
    supabase: SupabaseClient = getSupabaseServiceClient()
  ) {
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
    if (!options?.skipSubscriptionCheck) {
      await this.subscription.assertActive(context.userId);
    }

    const sync = await this.texasSync.syncUser(context);
    const report = await this.accounting.syncAndPersistDailyReport(
      context.userId,
      ledgerDate,
      sync.snapshot,
      options
    );
    return { sync, report };
  }

  /**
   * Load encrypted Texas credentials from DB and run sync for a registered Master.
   */
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

    const credentials = await this.registration.loadTexasCredentials(userId);

    return this.runForUser(
      {
        userId,
        texasAffiliateId,
        role,
        credentials,
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
}
