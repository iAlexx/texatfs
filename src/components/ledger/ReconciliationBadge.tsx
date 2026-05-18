"use client";

import { motion } from "framer-motion";
import { CheckCircle2, AlertTriangle } from "lucide-react";
import { reconcileLedger } from "@/lib/finance/reconciliation";
import { formatMoney } from "@/lib/utils/format";
import { ar } from "@/lib/i18n/ar";
import type { DailyLedger } from "@/lib/supabase/database.types";

export function ReconciliationBadge({ ledger }: { ledger: DailyLedger }) {
  const result = reconcileLedger({
    tebat: ledger.tebat,
    suhoubat: ledger.suhoubat,
    wasel_menho: ledger.wasel_menho,
    wasel_eleih: ledger.wasel_eleih,
  });

  if (result.balanced) {
    return (
      <motion.div
        className="mb-4 flex items-center justify-center gap-2 rounded-xl border border-lime/30 bg-lime/10 px-4 py-2.5 text-sm text-lime"
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
      >
        <CheckCircle2 className="h-4 w-4" strokeWidth={1.5} />
        {ar.balanced}
      </motion.div>
    );
  }

  return (
    <motion.div
      className="mb-4 rounded-xl border border-accent-negative/40 bg-destructive/10 px-4 py-3 text-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      <div className="flex items-center gap-2 text-accent-negative">
        <AlertTriangle className="h-4 w-4 shrink-0" strokeWidth={1.5} />
        <span className="font-medium">{ar.unbalanced}</span>
      </div>
      <p className="mt-2 text-xs text-steel-400">
        الفرق:{" "}
        <span className="font-mono text-accent-negative">
          {formatMoney(result.difference)}
        </span>
      </p>
      {result.leakHint && (
        <p className="mt-1 text-xs text-steel-500">{result.leakHint}</p>
      )}
    </motion.div>
  );
}
