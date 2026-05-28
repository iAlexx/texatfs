"use client";

import { motion } from "framer-motion";
import { ar } from "@/lib/i18n/ar";
import { cn } from "@/lib/utils/cn";

export type LedgerTabId = "account" | "agents" | "history";

export function LedgerTabBar({
  active,
  onChange,
  showAgentsTab,
  hideAccountTab = false,
}: {
  active: LedgerTabId;
  onChange: (tab: LedgerTabId) => void;
  showAgentsTab: boolean;
  /** Hide "حسابي" when master workflow focuses on sub-agents (account still reachable via agent drill-down / history). */
  hideAccountTab?: boolean;
}) {
  const tabs: { id: LedgerTabId; label: string }[] = [
    ...(!hideAccountTab ? [{ id: "account" as const, label: ar.tabMyAccount }] : []),
    ...(showAgentsTab
      ? [{ id: "agents" as const, label: ar.tabSubAgents }]
      : []),
    { id: "history", label: ar.tabLedgerHistory },
  ];

  return (
    <div className="mb-4 flex gap-1 rounded-xl border border-white/[0.06] bg-obsidian/60 p-1 backdrop-blur-md">
      {tabs.map((tab) => {
        const isActive = active === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            className={cn(
              "relative flex-1 rounded-lg px-2 py-2.5 text-center text-[11px] font-medium transition-colors",
              isActive ? "text-obsidian" : "text-steel-400 hover:text-gold/80"
            )}
          >
            {isActive && (
              <motion.span
                layoutId="ledger-tab-pill"
                className="absolute inset-0 rounded-lg bg-gradient-to-l from-gold to-gold/80 shadow-[0_0_12px_rgba(212,175,55,0.35)]"
                transition={{ type: "spring", stiffness: 380, damping: 30 }}
              />
            )}
            <span className="relative z-10">{tab.label}</span>
          </button>
        );
      })}
    </div>
  );
}

