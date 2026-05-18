"use client";

import { motion } from "framer-motion";
import { CalendarDays } from "lucide-react";
import type { LedgerHistoryEntry } from "@/lib/ledger/types";
import { formatLedgerDate, formatMoney } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";
import { todayIsoDate } from "@/hooks/use-ledger-api";
import { ar } from "@/lib/i18n/ar";

interface LedgerHistoryNavProps {
  selectedDate: string;
  onSelectDate: (date: string) => void;
  history: LedgerHistoryEntry[];
  isLoading?: boolean;
}

export function LedgerHistoryNav({
  selectedDate,
  onSelectDate,
  history,
  isLoading,
}: LedgerHistoryNavProps) {
  const today = todayIsoDate();
  const hasToday = history.some((h) => h.ledger_date === today);

  return (
    <motion.section
      className="glass-panel mb-4 overflow-hidden"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <header className="flex items-center justify-between gap-2 border-b border-white/[0.06] px-4 py-3">
        <div className="flex items-center gap-2 text-steel-400">
          <CalendarDays className="h-4 w-4 text-gold" strokeWidth={1.5} />
          <span className="text-xs font-medium tracking-wide">{ar.ledgerHistory}</span>
        </div>
      </header>

      <div className="p-3">
        <div className="mb-3 flex items-center gap-2">
          <motion.button
            type="button"
            onClick={() => onSelectDate(today)}
            whileTap={{ scale: 0.97 }}
            className={cn(
              "history-chip flex-1 text-center",
              selectedDate === today && "history-chip-active gold-glow-ring"
            )}
          >
            <span className="block text-sm font-medium text-foreground">{ar.today}</span>
          </motion.button>
          <label className="history-chip flex flex-1 flex-col gap-1 border-dashed">
            <span className="text-[10px] text-steel-500">{ar.pickDate}</span>
            <input
              type="date"
              value={selectedDate}
              max={today}
              onChange={(e) => {
                if (e.target.value) onSelectDate(e.target.value);
              }}
              className="w-full border-0 bg-transparent p-0 font-mono text-xs text-gold focus:outline-none"
            />
          </label>
        </div>

        <div className="steel-divider mb-3" />

        {isLoading ? (
          <p className="py-4 text-center text-xs text-steel-500">{ar.loading}</p>
        ) : history.length === 0 && !hasToday ? (
          <p className="py-4 text-center text-xs text-steel-500">{ar.noHistory}</p>
        ) : (
          <div
            className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            dir="rtl"
          >
            {history.map((entry, i) => (
              <HistoryChip
                key={entry.ledger_date}
                entry={entry}
                active={entry.ledger_date === selectedDate}
                onSelect={() => onSelectDate(entry.ledger_date)}
                delay={i * 0.03}
              />
            ))}
          </div>
        )}

        {selectedDate !== today && (
          <p className="mt-3 text-center text-xs text-steel-500">
            {formatLedgerDate(selectedDate)}
          </p>
        )}
      </div>
    </motion.section>
  );
}

function HistoryChip({
  entry,
  active,
  onSelect,
  delay,
}: {
  entry: LedgerHistoryEntry;
  active: boolean;
  onSelect: () => void;
  delay: number;
}) {
  const d = new Date(`${entry.ledger_date}T12:00:00`);
  const day = d.toLocaleDateString("ar-SY", { day: "numeric", month: "short" });
  const weekday = d.toLocaleDateString("ar-SY", { weekday: "short" });

  return (
    <motion.button
      type="button"
      onClick={onSelect}
      whileTap={{ scale: 0.96 }}
      initial={{ opacity: 0, x: 6 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay }}
      className={cn(
        "history-chip min-w-[5.5rem]",
        active && "history-chip-active gold-glow-ring"
      )}
    >
      <span className="block text-[10px] text-steel-500">{weekday}</span>
      <span className="block text-sm font-medium text-foreground">{day}</span>
      <span
        className={cn(
          "mt-1 block font-mono text-[10px] tabular-nums",
          entry.al_nihai < 0 ? "text-accent-negative" : "text-gold/90"
        )}
      >
        {formatMoney(entry.al_nihai)}
      </span>
      {entry.discrepancy_flag ? (
        <span className="mt-1 block text-[9px] text-accent-negative">⚠ فرق</span>
      ) : null}
    </motion.button>
  );
}
