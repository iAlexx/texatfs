"use client";

import { motion } from "framer-motion";
import { LedgerFlowChart } from "@/components/ledger/LedgerFlowChart";
import { LedgerRow } from "@/components/ledger/LedgerRow";
import { LuxuryBalanceCard } from "@/components/ledger/LuxuryBalanceCard";
import { ar } from "@/lib/i18n/ar";
import { resolvePerformanceSummary } from "@/lib/i18n/performance";
import { formatLedgerDate } from "@/lib/utils/format";
import type { DailyLedger } from "@/lib/supabase/database.types";

const sectionMotion = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
};

/** واصل مدمج داخل حركة تكساس والرصيد — بدون قسم واتساب منفصل */
export function ExecutiveLedgerReport({ ledger }: { ledger: DailyLedger }) {
  const performance = resolvePerformanceSummary({
    al_harq: ledger.al_harq,
    al_nihai: ledger.al_nihai,
    discrepancy_flag: ledger.discrepancy_flag,
    tebat: ledger.tebat,
  });

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
        transition={{ delay: 0.12 }}
      >
        {performance}
      </motion.p>

      <LedgerFlowChart ledger={ledger} />

      {ledger.discrepancy_flag && (
        <motion.div
          className="mb-4 rounded-xl border border-accent-negative/40 bg-destructive/10 px-4 py-2 text-sm text-accent-negative"
          {...sectionMotion}
        >
          {ar.discrepancyAlert}
        </motion.div>
      )}

      <motion.section className="glass-panel mb-4 overflow-hidden" {...sectionMotion}>
        <header className="border-b border-white/[0.06] px-4 py-3">
          <p className="text-xs font-medium tracking-wide text-steel-500">
            {ar.sectionMovement}
          </p>
        </header>
        <LedgerRow labelAr={ar.tebat} labelEn="Tebat" value={ledger.tebat} />
        <LedgerRow labelAr={ar.suhoubat} labelEn="Suhoubat" value={ledger.suhoubat} />
        <LedgerRow
          labelAr={ar.alFarq}
          labelEn="Al-Farq"
          value={ledger.al_farq}
          variant="emphasis"
        />
        <LedgerRow labelAr={ar.alHarq} labelEn="Al-Harq" value={ledger.al_harq} />
        <LedgerRow
          labelAr={ar.waselMenho}
          labelEn="Wasel Menho"
          value={ledger.wasel_menho}
          signed={false}
        />
        <LedgerRow
          labelAr={ar.waselEleih}
          labelEn="Wasel Eleih"
          value={ledger.wasel_eleih}
          signed={false}
        />
      </motion.section>

      <motion.section
        className="glass-panel overflow-hidden"
        {...sectionMotion}
        transition={{ delay: 0.05 }}
      >
        <header className="border-b border-white/[0.06] px-4 py-3">
          <p className="text-xs font-medium tracking-wide text-steel-500">
            {ar.sectionBalance}
          </p>
        </header>
        <LedgerRow
          labelAr={ar.baqiQadim}
          labelEn="Baqi Qadim"
          value={ledger.baqi_qadim}
          signed={false}
        />
        <LedgerRow
          labelAr={ar.alNihai}
          labelEn="Al-Nihai"
          value={ledger.al_nihai}
          variant="final"
          signed={false}
        />
      </motion.section>
    </>
  );
}
