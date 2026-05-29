import type { TexasHttpClient } from "@/lib/texas/texas-http-client";
import { computeAlFarq } from "@/lib/accounting/formulas";
import { fetchAgentTransfers, probeTransferServerFilters } from "@/lib/texas/fetch-agent-transfers";
import { fetchSubAgentGeneralReport } from "@/lib/texas/fetch-sub-agent-report";
import { createLogger } from "@/lib/observability/logger";
import type { TexasDashboardGeneral } from "@/lib/texas/types";

const log = createLogger("texas/panel-diagnostics");

export interface TexasPanelDiagnosticsInput {
  client: TexasHttpClient;
  affiliateId: string;
  username?: string | null;
  ledgerDate?: string;
}

export interface TexasPanelDiagnosticsResult {
  affiliateId: string;
  username: string | null;
  ledgerDate: string | null;
  transaction: {
    totalDeposit: number;
    totalWithdraw: number;
    transactionCount: number;
    matchedDeposits: number;
    matchedWithdraws: number;
    skipped: number;
    pagesFetched: number;
  };
  generalReport: TexasDashboardGeneral | null;
  computedAlFarqFromTransactions: number;
  filterProbe: Awaited<ReturnType<typeof probeTransferServerFilters>>;
  notes: string[];
}

/**
 * Compare Transaction (getAgentsTransfers) vs General (getSubAgentReport) for one agent.
 * Use for Mohammad55-style validation against dashboard screenshots.
 */
export async function runTexasPanelDiagnostics(
  input: TexasPanelDiagnosticsInput
): Promise<TexasPanelDiagnosticsResult> {
  const affiliateId = input.affiliateId.trim();
  const notes: string[] = [
    "tebat/suhoubat in bot ledger = daily delta from transaction cumulative totals",
    "al_harq in bot = al_farq (tebat − suhoubat); NOT replaced by dashboard NGR",
    "dashboard NGR stored separately as panel reference (api_snapshots.ngr)",
  ];

  const [transferResult, generalReport, filterProbe] = await Promise.all([
    fetchAgentTransfers(input.client, {
      affiliateId,
      paginate: true,
      probeServerFilters: true,
    }),
    fetchSubAgentGeneralReport(input.client, {
      affiliateId,
      username: input.username ?? undefined,
    }),
    probeTransferServerFilters(input.client, affiliateId),
  ]);

  const attr = transferResult.attribution;
  const computedAlFarq = computeAlFarq(
    transferResult.totals.totalDeposit,
    transferResult.totals.totalWithdraw
  );

  const result: TexasPanelDiagnosticsResult = {
    affiliateId,
    username: input.username ?? null,
    ledgerDate: input.ledgerDate ?? null,
    transaction: {
      totalDeposit: transferResult.totals.totalDeposit,
      totalWithdraw: transferResult.totals.totalWithdraw,
      transactionCount: transferResult.totals.transactionCount,
      matchedDeposits: attr?.matchedDeposits ?? 0,
      matchedWithdraws: attr?.matchedWithdraws ?? 0,
      skipped: attr?.skipped ?? 0,
      pagesFetched: transferResult.pagesFetched,
    },
    generalReport,
    computedAlFarqFromTransactions: computedAlFarq,
    filterProbe,
    notes,
  };

  log.info("panel diagnostics", {
    affiliateId,
    username: input.username,
    transactionDeposits: result.transaction.totalDeposit,
    transactionWithdrawals: result.transaction.totalWithdraw,
    generalDeposits: generalReport?.deposits,
    generalWithdrawal: generalReport?.withdrawal,
    generalNgr: generalReport?.ngr,
    computedAlFarq,
    filterProbe: filterProbe.map((p) => ({
      key: p.key,
      records: p.recordCount,
    })),
  });

  return result;
}
