"use client";

import { motion } from "framer-motion";
import { formatMoney } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";
import type { DailyLedger } from "@/lib/supabase/database.types";

interface Row {
  label: string;
  value: number;
  emphasis?: boolean;
  final?: boolean;
}

export function BankStatementGrid({ ledger }: { ledger: DailyLedger }) {
  const movement: Row[] = [
    { label: "تبات", value: ledger.tebat },
    { label: "سحوبات", value: ledger.suhoubat },
    { label: "الفرق", value: ledger.al_farq, emphasis: true },
    { label: "الحرق", value: ledger.al_harq },
    { label: "واصل منه", value: ledger.wasel_menho },
    { label: "واصل إليه", value: ledger.wasel_eleih },
  ];

  const balance: Row[] = [
    { label: "باقي قديم", value: ledger.baqi_qadim },
    { label: "النهائي", value: ledger.al_nihai, final: true },
  ];

  return (
    <motion.section
      className="glass-panel-gold mb-4 overflow-hidden"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <StatementBlock title="حركة تكساس والواصل" rows={movement} />
      <div className="h-px bg-gradient-to-r from-transparent via-gold/30 to-transparent" />
      <StatementBlock title="الرصيد" rows={balance} />
    </motion.section>
  );
}

function StatementBlock({ title, rows }: { title: string; rows: Row[] }) {
  return (
    <div>
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
              <td
                className={cn(
                  "px-4 py-2.5 text-left font-mono tabular-nums",
                  row.final && "text-lg font-bold text-gold embossed-gold",
                  row.emphasis && !row.final && "text-gold/90",
                  !row.final && !row.emphasis && "text-foreground"
                )}
              >
                {formatMoney(row.value)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
