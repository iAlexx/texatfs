"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { ChevronLeft, Loader2, Mail, Search, Users } from "lucide-react";
import { formatMoney } from "@/lib/utils/format";
import { ar } from "@/lib/i18n/ar";
import type {
  TexasSubAgentRow,
  TexasSubAgentsPayload,
} from "@/lib/texas/texas-live-sub-agents";
import type { TexasLiveLedgerMetrics } from "@/lib/texas/texas-live-ledger";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";

function roleLabel(texasRole: string): string {
  if (texasRole === "master" || texasRole === "super_master")
    return ar.roleMaster;
  if (texasRole === "agent") return ar.roleAgent;
  if (texasRole === "player") return ar.rolePlayer;
  return ar.roleAgent;
}

function matchesSearch(agent: TexasSubAgentRow, q: string): boolean {
  const email = agent.email.toLowerCase();
  const name = agent.username.toLowerCase();
  const id = agent.affiliateId.toLowerCase();
  return email.includes(q) || name.includes(q) || id.includes(q);
}

export function SubAgentsTabPanel({
  data,
  isLoading,
  error,
  onRetry,
  onSelectAgent,
}: {
  data: TexasSubAgentsPayload | undefined;
  isLoading: boolean;
  error: Error | null;
  onRetry: () => void;
  onSelectAgent: (affiliateId: string, label: string, currency: string) => void;
}) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const agents = data?.agents ?? [];
    const q = query.trim().toLowerCase();
    if (!q) return agents;
    return agents.filter((m) => matchesSearch(m, q));
  }, [data?.agents, query]);

  if (isLoading && !data) {
    return (
      <motion.section
        className="glass-panel-gold mb-4 px-4 py-14 text-center"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
      >
        <Loader2 className="mx-auto h-6 w-6 animate-spin text-gold" />
        <p className="mt-3 text-sm text-steel-400">{ar.loadingSubAgents}</p>
      </motion.section>
    );
  }

  if (error && !data) {
    return (
      <motion.section
        className="glass-panel-gold mb-4 px-4 py-10 text-center"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
      >
        <p className="text-sm text-accent-negative">
          {error.message || ar.errorGeneric}
        </p>
        <Button
          type="button"
          variant="outline"
          className="mt-4 border-gold/30 text-gold"
          onClick={onRetry}
        >
          {ar.retry}
        </Button>
      </motion.section>
    );
  }

  const stats = data?.stats;

  return (
    <motion.section
      className="glass-panel-gold mb-4 overflow-hidden"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <header className="border-b border-gold/15 bg-gradient-to-l from-gold/10 to-transparent px-4 py-3">
        <motion.div
          className="mb-2 flex items-center gap-2"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <Users className="h-5 w-5 text-gold" strokeWidth={1.5} />
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <h2 className="text-base font-bold text-gold">{ar.tabSubAgents}</h2>
            <p className="text-[10px] text-steel-500">{ar.texasAgentsSource}</p>
          </motion.div>
        </motion.div>
        {stats ? (
          <motion.div className="mt-3 grid grid-cols-2 gap-2 text-center">
            <MiniStat label={ar.activeAgents} value={String(stats.active_agents)} />
            <MiniStat
              label={ar.totalNetworkBurnToday}
              value={formatMoney(stats.total_network_burn)}
            />
            <MiniStat
              label={ar.combinedNetworkBalance}
              value={formatMoney(stats.combined_balance)}
            />
            <MiniStat
              label={ar.highestBurnToday}
              value={
                stats.highest_burn_agent
                  ? formatMoney(stats.highest_burn_agent.al_harq)
                  : "—"
              }
            />
          </motion.div>
        ) : null}
        <motion.div
          className="relative mt-3"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-steel-500" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={ar.searchAgents}
            className="border-steel-border/80 bg-obsidian/60 pr-10 text-sm backdrop-blur-md"
          />
        </motion.div>
      </header>

      <ul className="max-h-[28rem] divide-y divide-white/[0.04] overflow-y-auto">
        {filtered.map((agent, i) => (
          <motion.li
            key={agent.affiliateId}
            initial={{ opacity: 0, x: 8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.02 * i }}
          >
            <div className="px-3 py-3">
              <button
                type="button"
                onClick={() =>
                  onSelectAgent(
                    agent.affiliateId,
                    agent.username,
                    agent.mainCurrency
                  )
                }
                className="w-full text-right"
              >
                <div className="flex items-start gap-2">
                  <motion.div
                    className="min-w-0 flex-1"
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                  >
                    <p className="truncate text-sm font-medium text-foreground">
                      {agent.username}
                    </p>
                    <p className="mt-0.5 flex items-center justify-end gap-1 truncate font-mono text-xs text-lime underline decoration-lime/40 underline-offset-2">
                      <Mail className="h-3 w-3 shrink-0" />
                      {agent.email}
                    </p>
                    <span className="mt-1 inline-block rounded-full bg-obsidian/80 px-2 py-0.5 text-[9px] text-steel-500">
                      {roleLabel(agent.texasRole)} · ID {agent.affiliateId}
                    </span>
                  </motion.div>
                  <ChevronLeft className="mt-1 h-4 w-4 shrink-0 text-gold/40" />
                </div>
                <AgentLedgerMiniGrid metrics={agent.metrics} />
              </button>
            </div>
          </motion.li>
        ))}
        {!filtered.length && (
          <li className="px-4 py-12 text-center text-xs text-steel-500">
            {(data?.agents.length ?? 0) === 0
              ? ar.noSubAgents
              : "لا نتائج للبحث"}
          </li>
        )}
      </ul>
    </motion.section>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <motion.div className="glass-inner rounded-lg px-2 py-1.5">
      <p className="text-[9px] text-steel-500">{label}</p>
      <p className="font-mono text-xs font-semibold text-gold">{value}</p>
    </motion.div>
  );
}

function AgentLedgerMiniGrid({ metrics }: { metrics: TexasLiveLedgerMetrics }) {
  const rows = [
    { label: ar.suhoubat, value: metrics.suhoubat },
    { label: ar.alFarq, value: metrics.al_farq },
    { label: ar.alHarq, value: metrics.al_harq },
    { label: ar.waselMenho, value: metrics.wasel_menho },
    { label: ar.waselEleih, value: metrics.wasel_eleih },
    { label: ar.baqiQadim, value: metrics.baqi_qadim },
    { label: ar.alNihai, value: metrics.al_nihai, highlight: true },
  ];

  return (
    <div className="mt-2 grid grid-cols-2 gap-1 rounded-lg border border-white/[0.05] bg-obsidian/40 p-2">
      {rows.map((row) => (
        <motion.div
          key={row.label}
          className="flex justify-between gap-1 text-[10px]"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <span className="text-steel-500">{row.label}</span>
          <span
            className={cn(
              "font-mono tabular-nums",
              row.highlight ? "font-semibold text-gold" : "text-steel-300"
            )}
          >
            {formatMoney(row.value)}
          </span>
        </motion.div>
      ))}
    </div>
  );
}
