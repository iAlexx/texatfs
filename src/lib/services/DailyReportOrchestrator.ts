import { AccountingService } from "@/lib/accounting/AccountingService";
import type { AccountingRepository, DailyLedgerReport } from "@/lib/accounting/types";
import { coalesceLedgerSync } from "@/lib/accounting/ledger-sync-flight";
import { RegistrationService } from "@/lib/services/RegistrationService";
import {
  requireUserCredentials,
  toTexasSyncRole,
} from "@/lib/scraper/resolve-user-credentials";
import { TexasSyncService, type ChildSnapshot } from "@/lib/services/TexasSyncService";
import { SubscriptionService } from "@/lib/subscription/SubscriptionService";
import { SubscriptionExpiredError } from "@/lib/subscription/errors";
import { createLogger } from "@/lib/observability/logger";
import type { TexasSyncUserContext } from "@/lib/texas/types";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import { scheduleGroupSpawnJob } from "@/lib/whatsapp/group-spawn-job";

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

  /**
   * Persists per-child snapshots + ledgers extracted from the Master's sync.
   *
   * For each child:
   *  1. Look up existing user by texas_affiliate_id.
   *  2. If found but texas_affiliate_id is missing → update it.
   *  3. If not found → auto-create a minimal user (role=agent, parent=master).
   *  4. Insert snapshot + compute & persist daily ledger.
   */
  async syncChildrenFromMasterData(
    masterUserId: string,
    ledgerDate: string,
    childSnapshots: ChildSnapshot[]
  ): Promise<{
    attempted: number;
    persisted: number;
    created: number;
    updated: number;
    failed: string[];
  }> {
    if (!childSnapshots.length) {
      return { attempted: 0, persisted: 0, created: 0, updated: 0, failed: [] };
    }

    const createdTargets: Array<{
      affiliateId: string;
      displayName: string;
      username: string | null;
    }> = [];

    const affiliateIds = childSnapshots.map((c) => c.affiliateId);

    const { data: existingUsers, error } = await this.supabase
      .from("users")
      .select("id, texas_affiliate_id, parent_id")
      .in("texas_affiliate_id", affiliateIds);

    if (error) {
      log.error("failed to look up child users", { error: error.message });
      return {
        attempted: childSnapshots.length,
        persisted: 0,
        created: 0,
        updated: 0,
        failed: affiliateIds,
      };
    }

    const userByAffiliate = new Map(
      (existingUsers ?? [])
        .filter((u) => u.texas_affiliate_id)
        .map((u) => [u.texas_affiliate_id as string, u.id as string])
    );

    let persisted = 0;
    let created = 0;
    let updated = 0;
    const failed: string[] = [];

    for (const child of childSnapshots) {
      let childUserId = userByAffiliate.get(child.affiliateId);

      try {
        if (!childUserId) {
          childUserId = await this.ensureChildUser(
            masterUserId,
            child.affiliateId,
            child.username
          );
          created += 1;

          createdTargets.push({
            affiliateId: child.affiliateId,
            displayName: child.username?.trim() || `agent-${child.affiliateId}`,
            username: child.username ?? null,
          });
        }

        const snapshotInsert = await this.repository.insertSnapshot(
          childUserId,
          ledgerDate,
          child.snapshot,
          "master_derived"
        );

        await this.accounting.syncAndPersistDailyReport(
          childUserId,
          ledgerDate,
          child.snapshot,
          { closingSnapshotId: snapshotInsert.id }
        );

        persisted += 1;

        log.info("child ledger synced from master data", {
          masterUserId,
          childUserId,
          affiliateId: child.affiliateId,
          username: child.username,
          ngr: child.snapshot.ngr,
          balance: child.snapshot.balance,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        log.warn("child ledger sync failed", {
          affiliateId: child.affiliateId,
          childUserId,
          error: msg,
        });
        failed.push(child.affiliateId);
      }
    }

    log.info("children sync summary", {
      masterUserId,
      attempted: childSnapshots.length,
      persisted,
      created,
      updated,
      failedCount: failed.length,
      failedAffiliateIds: failed,
    });

    if (createdTargets.length) {
      const { data: masterRow } = await this.supabase
        .from("users")
        .select("whatsapp_phone")
        .eq("id", masterUserId)
        .maybeSingle();

      const masterPhoneDigits = masterRow?.whatsapp_phone ?? null;
      if (masterPhoneDigits) {
        scheduleGroupSpawnJob(
          this.supabase,
          masterUserId,
          masterPhoneDigits,
          createdTargets
        );
      } else {
        log.info("WhatsApp group auto-create skipped (missing whatsapp_phone)", {
          masterUserId,
          createdCount: createdTargets.length,
        });
      }
    }

    return { attempted: childSnapshots.length, persisted, created, updated, failed };
  }

  /**
   * Creates a minimal user record for a child discovered via the Master's
   * getSubAgentStatistics response. The child is not registered in Telegram —
   * this is a system-generated record so their ledger can be tracked.
   */
  private async ensureChildUser(
    masterUserId: string,
    affiliateId: string,
    username: string | null
  ): Promise<string> {
    const displayName = username ?? `agent-${affiliateId}`;

    const { data: inserted, error } = await this.supabase
      .from("users")
      .insert({
        role: "agent",
        parent_id: masterUserId,
        texas_affiliate_id: affiliateId,
        texas_username: username,
        display_name: displayName,
        registered_via: "master_sync",
        is_active: true,
      })
      .select("id")
      .single();

    if (error) {
      log.error("failed to auto-create child user", {
        masterUserId,
        affiliateId,
        username,
        code: error.code,
        message: error.message,
      });
      throw new Error(`auto-create child user failed: ${error.message}`);
    }

    log.info("auto-created child user from master sync", {
      childUserId: inserted.id,
      masterUserId,
      affiliateId,
      displayName,
    });

    return inserted.id;
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
