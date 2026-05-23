"use client";

import { motion } from "framer-motion";
import { LedgerRow } from "@/components/ledger/LedgerRow";
import { BalanceOrientationLabel } from "@/components/ledger/BalanceOrientationLabel";
import { ar } from "@/lib/i18n/ar";
import type { DailyLedger } from "@/lib/supabase/database.types";

export function LedgerReportBody({ ledger }: { ledger: DailyLedger }) {
  return (
    <>
      {ledger.discrepancy_flag && (
        <div className="mb-4 rounded-md border border-accent-negative/40 bg-destructive/10 px-4 py-2 text-sm text-accent-negative">
          {ar.discrepancyAlert}
        </div>
      )}

      <section className="panel-brushed-steel">
        <header className="panel-brushed-steel-header">
          <p className="text-xs uppercase tracking-widest text-steel-500">
            {ar.sectionTexas}
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
      </section>

      <section className="panel-brushed-steel mt-4">
        <header className="panel-brushed-steel-header">
          <p className="text-xs uppercase tracking-widest text-steel-500">
            {ar.sectionWasel}
          </p>
        </header>
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
      </section>

      <section className="panel-brushed-steel mt-4">
        <header className="panel-brushed-steel-header">
          <p className="text-xs uppercase tracking-widest text-steel-500">
            {ar.sectionBalance}
          </p>
        </header>
        <OrientedLedgerRow labelAr={ar.baqiQadim} labelEn="Baqi Qadim" value={ledger.baqi_qadim} />
        <OrientedLedgerRow
          labelAr={ar.alNihai}
          labelEn="Al-Nihai"
          value={ledger.al_nihai}
          variant="final"
        />
      </section>
    </>
  );
}

function OrientedLedgerRow({
  labelAr,
  labelEn,
  value,
  variant = "default",
}: {
  labelAr: string;
  labelEn: string;
  value: number;
  variant?: "default" | "final";
}) {
  return (
    <motion.div
      layout
      className={
        variant === "final"
          ? "grid grid-cols-[1fr_auto] items-center gap-4 border-t border-gold/20 bg-navy-700/40 px-4 py-3"
          : "grid grid-cols-[1fr_auto] items-center gap-4 border-b border-steel-border/50 px-4 py-3 last:border-b-0"
      }
    >
      <div>
        <p className="label-ar font-medium leading-tight text-steel-400">{labelAr}</p>
        <p className="text-xs uppercase tracking-wider text-steel-600">{labelEn}</p>
      </div>
      <BalanceOrientationLabel
        value={value}
        size={variant === "final" ? "lg" : "sm"}
        amountClassName={variant === "final" ? "text-xl font-semibold text-gold" : undefined}
      />
    </motion.div>
  );
}
