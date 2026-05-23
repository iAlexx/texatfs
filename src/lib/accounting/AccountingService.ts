import {
  computeDeterministicLedger,
  type DeterministicLedgerResult,
} from "@/lib/accounting/ledger-engine";
import { createLogger } from "@/lib/observability/logger";
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
 * Deterministic pipeline (fixed order):
 *  1. Texas API snapshot → tebat, suhoubat, al_farq, al_harq
 *  2. Confirmed WhatsApp transactions → wasel_menho, wasel_eleih
 *  3. Previous closed day → baqi_qadim
 *  4. al_nihai = al_farq + wasel_eleih − wasel_menho + baqi_qadim
 */
export class AccountingService {
  private readonly log = createLogger("accounting/service");

  constructor(private readonly repository?: AccountingRepository) {}

  /**
   * Pure calculation — uses wasel values already present on the open ledger row.
   */
  generateDailyReport(input: GenerateDailyReportInput): DailyLedgerReport {
    return this.computeFromInput(input).report;
  }

  private computeFromInput(
    input: GenerateDailyReportInput
  ): DeterministicLedgerResult {
    return computeDeterministicLedger({
      userId: input.userId,
      ledgerDate: input.ledgerDate,
      currentSnapshot: input.currentSnapshot,
      previousSnapshot: input.previousSnapshot,
      wasel: {
        wasel_menho: input.existingLedger?.wasel_menho ?? 0,
        wasel_eleih: input.existingLedger?.wasel_eleih ?? 0,
      },
      previousDayAlNihai: input.previousDayLedger?.al_nihai ?? null,
    });
  }

  /**
   * Loads sources in strict order, computes report, persists to daily_ledgers.
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

    // Step 1 — Texas baseline snapshot (previous business day or earlier).
    const previousSnapshot = await this.repository.getPreviousSnapshot(
      userId,
      ledgerDate
    );

    // Step 2 — Confirmed WhatsApp transactions only (never inferred).
    const wasel = await this.repository.sumConfirmedWasel(userId, ledgerDate);

    // Step 3 — Previous day closing balance.
    const previousDayLedger = await this.repository.getLedgerByDate(
      userId,
      priorDate,
      "closed"
    );

    const existingLedger = await this.repository.getOpenLedger(userId, ledgerDate);

    const { report, integrity, discrepancyDetail } = computeDeterministicLedger({
      userId,
      ledgerDate,
      currentSnapshot,
      previousSnapshot,
      wasel,
      previousDayAlNihai: previousDayLedger?.al_nihai ?? null,
    });

    if (!integrity.ok) {
      this.log.warn("ledger integrity issue", {
        userId,
        ledgerDate,
        codes: integrity.issues.map((i) => i.code),
      });
    }

    await this.repository.upsertOpenLedger({
      userId,
      ledgerDate,
      ...pickMetrics(report),
      openingSnapshotId: options?.openingSnapshotId,
      closingSnapshotId: options?.closingSnapshotId,
      previousLedgerId:
        previousDayLedger?.id ?? existingLedger?.previous_ledger_id ?? undefined,
      discrepancyFlag: !integrity.ok,
      discrepancyDetail,
    });

    return report;
  }

  async resolveOpeningBalance(
    userId: string,
    ledgerDate: string
  ): Promise<number> {
    if (!this.repository) {
      throw new Error("AccountingRepository is required for resolveOpeningBalance");
    }

    const prior = await this.repository.getPreviousClosedLedger(userId, ledgerDate);
    return prior?.al_nihai ?? 0;
  }

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
