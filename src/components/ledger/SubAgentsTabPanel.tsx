"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { ChevronLeft, Mail, Search, Send, Users } from "lucide-react";
import { toast } from "sonner";
import { formatMoney } from "@/lib/utils/format";
import { ar } from "@/lib/i18n/ar";
import type { NetworkMember, NetworkPayload } from "@/lib/hierarchy/types";
import { useExportReport } from "@/hooks/use-tma-api";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";

function roleLabel(role: string): string {
  if (role === "master") return ar.roleMaster;
  if (role === "super_master") return ar.roleSuperMaster;
  return ar.rolePlayer;
}

export function SubAgentsTabPanel({
  network,
  onSelectAgent,
}: {
  network: NetworkPayload;
  onSelectAgent: (agentId: string, label: string) => void;
}) {
  const [query, setQuery] = useState("");
  const shareReport = useExportReport();
  const { members, ledger_date, stats } = network;

  const agents = useMemo(
    () => members.filter((m) => m.role === "player"),
    [members]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return agents;
    return agents.filter((m) => {
      const email = (m.texas_username ?? "").toLowerCase();
      const name = (m.display_name ?? "").toLowerCase();
      return email.includes(q) || name.includes(q);
    });
  }, [agents, query]);

  async function handleShare(agent: NetworkMember, e: React.MouseEvent) {
    e.stopPropagation();
    if (!agent.ledger) return;
    try {
      await shareReport.mutateAsync({
        agent_id: agent.id,
        ledgerDate: ledger_date,
      });
      toast.success(ar.shareReportSent);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : ar.exportFailed);
    }
  }

  return (
    <motion.section
      className="glass-panel-gold mb-4 overflow-hidden"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <header className="border-b border-gold/15 bg-gradient-to-l from-gold/10 to-transparent px-4 py-3">
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5 text-gold" strokeWidth={1.5} />
          <div>
            <h2 className="text-base font-bold text-gold">{ar.tabSubAgents}</h2>
            <p className="text-[10px] text-steel-500">{ar.subAgentsSubtitle}</p>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 text-center">
          <MiniStat label={ar.activeAgents} value={String(stats.active_agents)} />
          <MiniStat
            label={ar.totalNetworkBurnToday}
            value={formatMoney(stats.total_network_burn)}
          />
        </div>
        <div className="relative mt-3">
          <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-steel-500" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={ar.searchAgents}
            className="border-steel-border/80 bg-obsidian/60 pr-10 text-sm backdrop-blur-md"
          />
        </div>
      </header>

      <ul className="max-h-[28rem] divide-y divide-white/[0.04] overflow-y-auto">
        {filtered.map((agent, i) => (
          <motion.li
            key={agent.id}
            initial={{ opacity: 0, x: 8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.02 * i }}
          >
            <div className="px-3 py-3">
              <div className="flex items-start gap-2">
                <button
                  type="button"
                  onClick={() =>
                    onSelectAgent(
                      agent.id,
                      agent.display_name ?? agent.texas_username ?? "—"
                    )
                  }
                  className="min-w-0 flex-1 text-right"
                >
                  <p className="truncate text-sm font-medium text-foreground">
                    {agent.display_name ?? "—"}
                  </p>
                  <p className="mt-0.5 flex items-center justify-end gap-1 truncate font-mono text-xs text-lime">
                    <Mail className="h-3 w-3 shrink-0" />
                    {agent.texas_username ?? "—"}
                  </p>
                  <span className="mt-1 inline-block rounded-full bg-obsidian/80 px-2 py-0.5 text-[9px] text-steel-500">
                    {roleLabel(agent.role)}
                  </span>
                </button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="shrink-0 border-gold/30 px-2 text-gold"
                  disabled={!agent.ledger || shareReport.isPending}
                  onClick={(e) => void handleShare(agent, e)}
                >
                  <Send className="h-3.5 w-3.5" />
                </Button>
                <ChevronLeft className="mt-1 h-4 w-4 shrink-0 text-gold/40" />
              </div>

              {agent.ledger ? (
                <AgentLedgerMiniGrid ledger={agent.ledger} />
              ) : (
                <p className="mt-2 text-center text-[10px] text-steel-500">
                  {ar.noReportForDate}
                </p>
              )}
            </div>
          </motion.li>
        ))}
        {!filtered.length && (
          <li className="px-4 py-12 text-center text-xs text-steel-500">
            {agents.length === 0 ? ar.noSubAgents : "لا نتائج للبحث"}
          </li>
        )}
      </ul>
    </motion.section>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="glass-inner rounded-lg px-2 py-1.5">
      <p className="text-[9px] text-steel-500">{label}</p>
      <p className="font-mono text-xs font-semibold text-gold">{value}</p>
    </div>
  );
}

function AgentLedgerMiniGrid({
  ledger,
}: {
  ledger: NonNullable<NetworkMember["ledger"]>;
}) {
  const rows = [
    { label: ar.suhoubat, value: ledger.suhoubat },
    { label: ar.alFarq, value: ledger.al_farq },
    { label: ar.alHarq, value: ledger.al_harq },
    { label: ar.waselMenho, value: ledger.wasel_menho },
    { label: ar.waselEleih, value: ledger.wasel_eleih },
    { label: ar.baqiQadim, value: ledger.baqi_qadim },
    { label: ar.alNihai, value: ledger.al_nihai, highlight: true },
  ];

  return (
    <div className="mt-2 grid grid-cols-2 gap-1 rounded-lg border border-white/[0.05] bg-obsidian/40 p-2">
      {rows.map((row) => (
        <div key={row.label} className="flex justify-between gap-1 text-[10px]">
          <span className="text-steel-500">{row.label}</span>
          <span
            className={cn(
              "font-mono tabular-nums",
              row.highlight ? "font-semibold text-gold" : "text-steel-300"
            )}
          >
            {formatMoney(row.value)}
          </span>
        </div>
      ))}
    </div>
  );
}
