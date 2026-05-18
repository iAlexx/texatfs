"use client";

import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { ChevronLeft, Flame, Users } from "lucide-react";
import { formatMoney } from "@/lib/utils/format";
import { ar } from "@/lib/i18n/ar";
import type { HierarchyPayload } from "@/lib/hierarchy/types";
import { cn } from "@/lib/utils/cn";

interface SubAgentsBreakdownProps {
  hierarchy: HierarchyPayload;
  onSelectAgent: (agentId: string) => void;
}

export function SubAgentsBreakdown({
  hierarchy,
  onSelectAgent,
}: SubAgentsBreakdownProps) {
  const { consolidated, sub_agents } = hierarchy;

  return (
    <motion.section
      className="glass-panel-gold mb-5 overflow-hidden"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 }}
    >
      <header className="border-b border-white/[0.06] px-4 py-3">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-gold" strokeWidth={1.5} />
          <div>
            <h2 className="text-sm font-semibold text-foreground">
              {ar.subAgentsTitle}
            </h2>
            <p className="text-[10px] text-steel-500">{ar.subAgentsSubtitle}</p>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-3 gap-px bg-steel-border/40 p-px">
        <ConsolidatedStat
          label={ar.consolidatedBurn}
          value={formatMoney(consolidated.total_burn)}
          icon={<Flame className="h-3.5 w-3.5 text-accent-negative" strokeWidth={1.5} />}
        />
        <ConsolidatedStat
          label={ar.consolidatedFinal}
          value={formatMoney(consolidated.total_al_nihai)}
        />
        <ConsolidatedStat
          label={ar.agentCount}
          value={String(consolidated.agent_count)}
        />
      </div>

      <ul className="max-h-56 divide-y divide-white/[0.04] overflow-y-auto">
        {sub_agents.map((agent, i) => (
          <motion.li
            key={agent.id}
            initial={{ opacity: 0, x: 8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.05 * i }}
          >
            <button
              type="button"
              onClick={() => onSelectAgent(agent.id)}
              className="flex w-full items-center gap-3 px-4 py-3 text-right transition-colors hover:bg-white/[0.04] active:scale-[0.99]"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">
                  {agent.display_name ?? agent.texas_username ?? "—"}
                </p>
                <p className="truncate font-mono text-[10px] text-steel-600">
                  {agent.texas_username}
                </p>
              </div>
              <div className="text-left">
                <p className="text-[10px] text-steel-500">{ar.agentBurn}</p>
                <p className="font-mono text-xs tabular-nums text-accent-negative">
                  {agent.ledger
                    ? formatMoney(agent.ledger.al_harq)
                    : "—"}
                </p>
              </div>
              <div className="text-left">
                <p className="text-[10px] text-steel-500">{ar.alNihai}</p>
                <p
                  className={cn(
                    "font-mono text-xs tabular-nums",
                    agent.ledger && agent.ledger.al_nihai >= 0
                      ? "text-gold"
                      : "text-accent-negative"
                  )}
                >
                  {agent.ledger
                    ? formatMoney(agent.ledger.al_nihai)
                    : "—"}
                </p>
              </div>
              <span
                className={cn(
                  "rounded px-1.5 py-0.5 text-[9px]",
                  agent.ledger?.status === "open"
                    ? "bg-emerald-900/40 text-emerald-400"
                    : "bg-steel-800 text-steel-500"
                )}
              >
                {agent.ledger?.status === "open"
                  ? ar.statusOpen
                  : agent.ledger
                    ? ar.statusClosed
                    : "—"}
              </span>
              <ChevronLeft
                className="h-4 w-4 shrink-0 text-steel-600"
                strokeWidth={1.5}
              />
            </button>
          </motion.li>
        ))}
      </ul>
    </motion.section>
  );
}

function ConsolidatedStat({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon?: ReactNode;
}) {
  return (
    <div className="bg-navy-900/80 px-3 py-3 text-center">
      <p className="mb-1 flex items-center justify-center gap-1 text-[9px] text-steel-500">
        {icon}
        {label}
      </p>
      <p className="font-mono text-xs tabular-nums text-gold/90">{value}</p>
    </div>
  );
}
