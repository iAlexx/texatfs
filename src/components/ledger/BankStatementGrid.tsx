"use client";

import { motion } from "framer-motion";
import { formatMoney } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";
import { BalanceOrientationLabel } from "@/components/ledger/BalanceOrientationLabel";
import { ar } from "@/lib/i18n/ar";
import type { DailyLedger } from "@/lib/supabase/database.types";

interface Row {
  label: string;
  value: number;
  emphasis?: boolean;
  final?: boolean;
  /** Show له / عليه orientation badge */
  oriented?: boolean;
  source?: "texas" | "whatsapp";
}

export function BankStatementGrid({ ledger }: { ledger: DailyLedger }) {
  const texasMovement: Row[] = [
    { label: ar.tebat, value: ledger.tebat, source: "texas" },
    { label: ar.suhoubat, value: ledger.suhoubat, source: "texas" },
    { label: ar.alFarq, value: ledger.al_farq, emphasis: true, source: "texas" },
    { label: ar.alHarq, value: ledger.al_harq, source: "texas" },
  ];

  const whatsappWasel: Row[] = [
    { label: ar.waselMenho, value: ledger.wasel_menho, source: "whatsapp" },
    { label: ar.waselEleih, value: ledger.wasel_eleih, source: "whatsapp" },
  ];

  const balance: Row[] = [
    { label: ar.baqiQadim, value: ledger.baqi_qadim, oriented: true },
    { label: ar.alNihai, value: ledger.al_nihai, final: true, oriented: true },
  ];

  return (
    <motion.section
      className="glass-panel-gold mb-4 overflow-hidden"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <StatementBlock title={ar.sectionTexas} rows={texasMovement} />
      <motion.div
        className="h-px bg-gradient-to-r from-transparent via-gold/30 to-transparent"
        layout
      />
      <StatementBlock title={ar.sectionWasel} rows={whatsappWasel} />
      <motion.div
        className="h-px bg-gradient-to-r from-transparent via-gold/30 to-transparent"
        layout
      />
      <StatementBlock title={ar.sectionBalance} rows={balance} />
    </motion.section>
  );
}

function StatementBlock({ title, rows }: { title: string; rows: Row[] }) {
  return (
    <motion.div layout>
      <header className="border-b border-white/[0.06] bg-obsidian/40 px-4 py-2.5">
        <p className="text-[10px] font-medium uppercase tracking-widest text-gold/70">
          {title}
        </p>
      </header>
      <table className="w-full text-sm">
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={row.label}
              className={cn(
                "border-b border-white/[0.04]",
                i % 2 === 0 ? "bg-white/[0.02]" : "bg-transparent"
              )}
            >
              <td className="px-4 py-2.5 text-steel-400">{row.label}</td>
              <td className="px-4 py-2.5 text-left">
                {row.oriented ? (
                  <BalanceOrientationLabel
                    value={row.value}
                    size={row.final ? "lg" : "sm"}
                    amountClassName={
                      row.final ? "text-lg font-bold text-gold embossed-gold" : undefined
                    }
                  />
                ) : (
                  <span
                    className={cn(
                      "font-mono tabular-nums",
                      row.final && "text-lg font-bold text-gold embossed-gold",
                      row.emphasis && !row.final && "text-gold/90",
                      !row.final && !row.emphasis && "text-foreground"
                    )}
                  >
                    {formatMoney(row.value)}
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </motion.div>
  );
}
