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
import { formatLedgerDate } from "@/lib/utils/format";
import type { DailyLedger } from "@/lib/supabase/database.types";
import { useExportReport } from "@/hooks/use-tma-api";

export function ExecutiveLedgerReport({
  ledger,
  targetUserId,
}: {
  ledger: DailyLedger;
  targetUserId?: string;
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
        targetUserId: userId,
        ledgerDate: ledger.ledger_date,
      });
      toast.success(ar.shareReportSent);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : ar.exportFailed);
    }
  }

  return (
    <>
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
    </>
  );
}
