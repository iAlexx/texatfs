"use client";

import { motion } from "framer-motion";
import { Send } from "lucide-react";
import { toast } from "sonner";
import { LedgerFlowChart } from "@/components/ledger/LedgerFlowChart";
import { LuxuryBalanceCard } from "@/components/ledger/LuxuryBalanceCard";
import { BankStatementGrid } from "@/components/ledger/BankStatementGrid";
import { ReconciliationBadge } from "@/components/ledger/ReconciliationBadge";
import { Button } from "@/components/ui/button";
import { ar } from "@/lib/i18n/ar";
import { resolvePerformanceSummary } from "@/lib/i18n/performance";
import { formatLedgerDate, formatMoney } from "@/lib/utils/format";
import type { DailyLedger, TexasPanelSnapshot } from "@/lib/supabase/database.types";
import { TexasDashboardPanel } from "@/components/ledger/TexasDashboardPanel";
import { useExportReport } from "@/hooks/use-tma-api";

export function ExecutiveLedgerReport({
  ledger,
  targetUserId,
  disableShare = false,
  viewMode = "monthly",
  monthlyCommission,
  texasPanel,
}: {
  ledger: DailyLedger;
  targetUserId?: string;
  /** Texas live sub-agent view has no Supabase user for PDF share */
  disableShare?: boolean;
  viewMode?: "daily" | "monthly";
  monthlyCommission?: {
    month_key: string;
    burn_amount: number;
    percent: number | null;
    commission_amount: number | null;
    final_before_commission: number;
    final_after_commission: number | null;
    status: string;
  };
  texasPanel?: TexasPanelSnapshot | null;
}) {
  const shareReport = useExportReport();
  const userId = targetUserId ?? ledger.user_id;

  const performance = resolvePerformanceSummary({
    al_harq: ledger.al_harq,
    al_nihai: ledger.al_nihai,
    discrepancy_flag: ledger.discrepancy_flag,
    tebat: ledger.tebat,
  });

  async function handleShare() {
    try {
      await shareReport.mutateAsync({
        agent_id: userId,
        ledgerDate: ledger.ledger_date,
      });
      toast.success(ar.shareReportSent);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : ar.exportFailed);
    }
  }

  return (
    <>
      {viewMode !== "daily" && (
        <motion.p
          className="mb-3 rounded-xl border border-gold/25 bg-gold/5 px-3 py-2 text-center text-[11px] text-gold/90"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          {ar.ledgerMtdBanner}
        </motion.p>
      )}

      <LuxuryBalanceCard
        value={ledger.al_nihai}
        dateLabel={formatLedgerDate(ledger.ledger_date)}
      />

      <motion.p
        className="mb-4 rounded-xl border border-gold/20 bg-gold/5 px-4 py-2 text-center text-sm text-gold/90"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
      >
        {performance}
      </motion.p>

      <ReconciliationBadge ledger={ledger} />
      <LedgerFlowChart ledger={ledger} />
      <BankStatementGrid ledger={ledger} />
      <TexasDashboardPanel panel={texasPanel} />

      {viewMode === "monthly" && monthlyCommission && (
        <motion.section
          className="mt-4 rounded-2xl border border-gold/20 bg-obsidian/40 p-4 text-[11px] text-steel-300"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <p className="mb-2 font-semibold text-gold">{ar.ledgerViewMonthly}</p>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <span className="text-steel-500">{ar.finalBeforeCommission}</span>
              <p className="font-mono text-sm">{formatMoney(monthlyCommission.final_before_commission)}</p>
            </div>
            <div>
              <span className="text-steel-500">{ar.finalAfterCommission}</span>
              <p className="font-mono text-sm">
                {monthlyCommission.final_after_commission != null
                  ? formatMoney(monthlyCommission.final_after_commission)
                  : "—"}
              </p>
            </div>
          </div>
          {monthlyCommission.percent != null && (
            <p className="mt-2 text-steel-500">
              نسبة حرق الشهر: {monthlyCommission.percent}%
            </p>
          )}
        </motion.section>
      )}

      {!disableShare ? (
        <motion.div className="mt-4" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          <Button
            variant="gold"
            className="w-full gap-2"
            disabled={shareReport.isPending}
            onClick={() => void handleShare()}
          >
            <Send className="h-4 w-4" strokeWidth={1.5} />
            {shareReport.isPending ? ar.loading : ar.shareReport}
          </Button>
          <p className="mt-2 text-center text-[10px] text-steel-500">
            {ar.shareReportHint}
          </p>
        </motion.div>
      ) : null}
    </>
  );
}
