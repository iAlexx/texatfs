"use client";

import { useMemo, useState, type ReactNode } from "react";
import { motion } from "framer-motion";
import { ChevronLeft, Download, Flame, Search, Users } from "lucide-react";
import { toast } from "sonner";
import { formatMoney } from "@/lib/utils/format";
import { ar } from "@/lib/i18n/ar";
import type { HierarchyPayload } from "@/lib/hierarchy/types";
import { useExportReport } from "@/hooks/use-tma-api";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface SubAgentsBreakdownProps {
  hierarchy: HierarchyPayload;
  onSelectAgent: (agentId: string) => void;
  ledgerDate: string;
}

export function SubAgentsBreakdown({
  hierarchy,
  onSelectAgent,
  ledgerDate,
}: SubAgentsBreakdownProps) {
  const { consolidated, sub_agents } = hierarchy;
  const [query, setQuery] = useState("");
  const exportReport = useExportReport();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sub_agents;
    return sub_agents.filter((a) => {
      const email = (a.texas_username ?? "").toLowerCase();
      const name = (a.display_name ?? "").toLowerCase();
      return email.includes(q) || name.includes(q);
    });
  }, [sub_agents, query]);

  async function handleExport(agentId: string, e: React.MouseEvent) {
    e.stopPropagation();
    try {
      await exportReport.mutateAsync({ targetUserId: agentId, ledgerDate });
      toast.success(ar.exportSent);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : ar.exportFailed);
    }
  }

  return (
    <motion.section
      className="glass-panel-gold mb-5 overflow-hidden"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <header className="border-b border-white/[0.06] px-4 py-3">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-gold" strokeWidth={1.5} />
          <div>
            <h2 className="text-sm font-semibold">{ar.subAgentsTitle}</h2>
            <p className="text-[10px] text-steel-500">{ar.subAgentsSubtitle}</p>
          </div>
        </div>
        <div className="relative mt-3">
          <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-steel-500" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={ar.searchAgents}
            className="border-steel-border bg-obsidian/40 pr-10 text-sm"
          />
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

      <ul className="max-h-64 divide-y divide-white/[0.04] overflow-y-auto">
        {filtered.map((agent, i) => (
          <motion.li
            key={agent.id}
            initial={{ opacity: 0, x: 8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.03 * i }}
          >
            <div className="flex items-center gap-2 px-3 py-2">
              <button
                type="button"
                onClick={() => onSelectAgent(agent.id)}
                className="flex min-w-0 flex-1 items-center gap-2 text-right hover:opacity-90"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {agent.display_name ?? "—"}
                  </p>
                  <p className="truncate font-mono text-[10px] text-steel-600">
                    {agent.texas_username}
                  </p>
                </div>
                <div className="text-left">
                  <p className="font-mono text-xs text-accent-negative">
                    {agent.ledger ? formatMoney(agent.ledger.al_harq) : "—"}
                  </p>
                  <p className="font-mono text-[10px] text-gold/80">
                    {agent.ledger ? formatMoney(agent.ledger.al_nihai) : "—"}
                  </p>
                </div>
                <ChevronLeft className="h-4 w-4 shrink-0 text-steel-600" strokeWidth={1.5} />
              </button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="shrink-0 border-gold/30 px-2 text-[10px] text-gold"
                disabled={!agent.ledger || exportReport.isPending}
                onClick={(e) => void handleExport(agent.id, e)}
              >
                <Download className="h-3 w-3" />
                {ar.exportReport}
              </Button>
            </div>
          </motion.li>
        ))}
        {!filtered.length && (
          <li className="px-4 py-8 text-center text-xs text-steel-500">
            لا نتائج للبحث
          </li>
        )}
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
    <div className="bg-obsidian/80 px-3 py-3 text-center">
      <p className="mb-1 flex items-center justify-center gap-1 text-[9px] text-steel-500">
        {icon}
        {label}
      </p>
      <p className="font-mono text-xs tabular-nums text-gold/90">{value}</p>
    </div>
  );
}
