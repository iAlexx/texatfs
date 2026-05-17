import {
  assertAlNihaiFormula,
  buildLedgerMetrics,
  resolveBaqiQadim,
  snapshotToTotals,
} from "@/lib/accounting/formulas";
import type {
  AccountingRepository,
  DailyLedgerReport,
  GenerateDailyReportInput,
  PersistLedgerPayload,
} from "@/lib/accounting/types";
import type { NormalizedTexasSnapshot } from "@/lib/texas/types";

function previousBusinessDate(isoDate: string): string {
  const d = new Date(`${isoDate}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Accounting & Ledger Engine for TEXAS FUNDS calculate.
 *
 * Core formulas (daily_ledgers):
 * - Tebat     = Δ Total Deposits
 * - Suhoubat  = Δ Total Withdrawals
 * - Al_Farq   = Tebat − Suhoubat
 * - Al_Harq   = Δ NGR (burn) from Texas API
 * - Baqi_Qadim = previous day's Al_Nihai
 * - Al_Nihai  = Al_Farq + Wasel_Eleih − Wasel_Menho + Baqi_Qadim
 *
 * Wasel_Menho / Wasel_Eleih are sourced from confirmed transactions (DB trigger)
 * and passed in via the open ledger row when persisting.
 */
export class AccountingService {
  constructor(private readonly repository?: AccountingRepository) {}

  /**
   * Pure calculation — no database I/O.
   */
  generateDailyReport(input: GenerateDailyReportInput): DailyLedgerReport {
    const current = snapshotToTotals(input.currentSnapshot);
    const previous = input.previousSnapshot
      ? snapshotToTotals(input.previousSnapshot)
      : null;

    const baqi_qadim = resolveBaqiQadim({
      previousDayAlNihai: input.previousDayLedger?.al_nihai,
      existingBaqiQadim: input.existingLedger?.baqi_qadim,
    });

    const wasel_menho = input.existingLedger?.wasel_menho ?? 0;
    const wasel_eleih = input.existingLedger?.wasel_eleih ?? 0;

    const metrics = buildLedgerMetrics({
      current,
      previous,
      wasel_menho,
      wasel_eleih,
      baqi_qadim,
    });

    assertAlNihaiFormula(metrics);

    return {
      ...metrics,
      userId: input.userId,
      ledgerDate: input.ledgerDate,
      currencyCode: input.currentSnapshot.currencyCode,
      currentSnapshot: current,
      previousSnapshot: previous,
      balanceFromApi: input.currentSnapshot.balance,
      computedAt: new Date().toISOString(),
    };
  }

  /**
   * Loads snapshots + prior ledger from repository, computes report, persists to daily_ledgers.
   */
  async syncAndPersistDailyReport(
    userId: string,
    ledgerDate: string,
    currentSnapshot: NormalizedTexasSnapshot,
    options?: {
      openingSnapshotId?: string;
      closingSnapshotId?: string;
    }
  ): Promise<DailyLedgerReport> {
    if (!this.repository) {
      throw new Error("AccountingRepository is required for syncAndPersistDailyReport");
    }

    const priorDate = AccountingService.previousLedgerDate(ledgerDate);

    const [existingLedger, previousDayLedger, previousSnapshot] =
      await Promise.all([
        this.repository.getOpenLedger(userId, ledgerDate),
        this.repository.getLedgerByDate(userId, priorDate, "closed"),
        this.repository.getPreviousSnapshot(userId, ledgerDate),
      ]);

    const report = this.generateDailyReport({
      userId,
      ledgerDate,
      currentSnapshot,
      previousSnapshot,
      existingLedger,
      previousDayLedger,
    });

    await this.repository.upsertOpenLedger({
      userId,
      ledgerDate,
      ...pickMetrics(report),
      openingSnapshotId: options?.openingSnapshotId,
      closingSnapshotId: options?.closingSnapshotId,
      previousLedgerId:
        previousDayLedger?.id ?? existingLedger?.previous_ledger_id ?? undefined,
    });

    return report;
  }

  /**
   * Resolves Baqi_Qadim for a new business day from the last closed Al_Nihai.
   * Mirrors `run_daily_close` in Postgres — callable before cron close.
   */
  async resolveOpeningBalance(
    userId: string,
    ledgerDate: string
  ): Promise<number> {
    if (!this.repository) {
      throw new Error("AccountingRepository is required for resolveOpeningBalance");
    }

    const prior = await this.repository.getPreviousClosedLedger(userId, ledgerDate);
    return resolveBaqiQadim({ previousDayAlNihai: prior?.al_nihai ?? null });
  }

  /**
   * Batch: generate reports for all users with snapshots on a given date.
   */
  async generateReportsForDate(
    entries: Array<{
      userId: string;
      currentSnapshot: NormalizedTexasSnapshot;
      previousSnapshot?: NormalizedTexasSnapshot | null;
      existingLedger?: GenerateDailyReportInput["existingLedger"];
      previousDayLedger?: GenerateDailyReportInput["previousDayLedger"];
    }>,
    ledgerDate: string
  ): Promise<DailyLedgerReport[]> {
    return entries.map((entry) =>
      this.generateDailyReport({
        userId: entry.userId,
        ledgerDate,
        currentSnapshot: entry.currentSnapshot,
        previousSnapshot: entry.previousSnapshot ?? null,
        existingLedger: entry.existingLedger ?? null,
        previousDayLedger: entry.previousDayLedger ?? null,
      })
    );
  }

  /** Utility for cron: date string for yesterday relative to ledgerDate */
  static previousLedgerDate(ledgerDate: string): string {
    return previousBusinessDate(ledgerDate);
  }
}

function pickMetrics(
  report: DailyLedgerReport
): Omit<PersistLedgerPayload, "userId" | "ledgerDate"> {
  return {
    tebat: report.tebat,
    suhoubat: report.suhoubat,
    al_farq: report.al_farq,
    al_harq: report.al_harq,
    wasel_menho: report.wasel_menho,
    wasel_eleih: report.wasel_eleih,
    baqi_qadim: report.baqi_qadim,
    al_nihai: report.al_nihai,
  };
}
