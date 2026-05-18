"use client";

import { motion } from "framer-motion";
import { Sparkles } from "lucide-react";
import { AnimatedValue } from "@/components/ledger/AnimatedValue";
import { ar } from "@/lib/i18n/ar";

export function LuxuryBalanceCard({
  value,
  dateLabel,
}: {
  value: number;
  dateLabel: string;
}) {
  return (
    <motion.section
      className="luxury-balance-card mb-5"
      initial={{ opacity: 0, y: 16, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: "spring", stiffness: 120, damping: 18 }}
    >
      <div className="relative z-10 flex items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.2em] text-gold/80">
            <Sparkles className="h-3 w-3" strokeWidth={1.5} />
            {ar.brandEn}
          </p>
          <p className="mt-1 text-sm font-medium text-steel-400">{ar.finalBalance}</p>
          <p className="mt-0.5 text-xs text-steel-600">{dateLabel}</p>
        </div>
        <div className="rounded-full border border-gold/30 bg-gold/10 px-2 py-0.5 text-[9px] text-gold">
          NSP
        </div>
      </div>
      <motion.p
        className="relative z-10 mt-6 text-center text-3xl embossed-gold md:text-4xl"
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.15, type: "spring" }}
      >
        <AnimatedValue value={value} />
      </motion.p>
    </motion.section>
  );
}
