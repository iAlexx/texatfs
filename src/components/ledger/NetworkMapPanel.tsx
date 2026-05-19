"use client";

import { useMemo, useState, type ReactNode } from "react";
import { motion } from "framer-motion";
import {
  ChevronLeft,
  Flame,
  Search,
  Send,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import { formatMoney } from "@/lib/utils/format";
import { ar } from "@/lib/i18n/ar";
import { filterMembersForSubAgentsTab } from "@/lib/hierarchy/subtree-rules";
import type { NetworkPayload, NetworkMember } from "@/lib/hierarchy/types";
import { useExportReport } from "@/hooks/use-tma-api";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";

function roleBadge(role: string): string {
  if (role === "master") return ar.roleMaster;
  if (role === "super_master") return ar.roleSuperMaster;
  if (role === "agent") return ar.roleAgent;
  return ar.rolePlayer;
}

export function NetworkMapPanel({
  network,
  onSelectAgent,
}: {
  network: NetworkPayload;
  onSelectAgent: (agentId: string, label: string) => void;
}) {
  const [query, setQuery] = useState("");
  const shareReport = useExportReport();
  const { stats, members, ledger_date, viewer_id, viewer_role } = network;

  const subAgents = useMemo(
    () => filterMembersForSubAgentsTab(viewer_role, members, viewer_id),
    [viewer_role, members, viewer_id]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return subAgents;
    return subAgents.filter((m) => {
      const email = (m.texas_username ?? "").toLowerCase();
      const name = (m.display_name ?? "").toLowerCase();
      const tg = m.telegram_id != null ? String(m.telegram_id) : "";
      return email.includes(q) || name.includes(q) || tg.includes(q);
    });
  }, [subAgents, query]);

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
      className="glass-panel-gold mb-5 overflow-hidden"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 260, damping: 28 }}
    >
      <header className="border-b border-gold/15 bg-gradient-to-l from-gold/10 to-transparent px-4 py-4">
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5 text-gold" strokeWidth={1.5} />
          <div>
            <h2 className="text-base font-bold text-gold">{ar.networkMap}</h2>
            <p className="text-[10px] text-steel-500">{ar.networkMapSubtitle}</p>
          </div>
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

      <div className="grid grid-cols-2 gap-2 p-3">
        <StatTile
          icon={<Users className="h-4 w-4 text-lime" />}
          label={ar.activeAgents}
          value={String(stats.active_agents)}
          accent="lime"
        />
        <StatTile
          icon={<Wallet className="h-4 w-4 text-gold" />}
          label={ar.combinedNetworkBalance}
          value={formatMoney(stats.combined_balance)}
          accent="gold"
        />
        <StatTile
          icon={<Flame className="h-4 w-4 text-accent-negative" />}
          label={ar.totalNetworkBurnToday}
          value={formatMoney(stats.total_network_burn)}
          accent="burn"
        />
        <StatTile
          icon={<TrendingUp className="h-4 w-4 text-gold" />}
          label={ar.highestBurnToday}
          value={
            stats.highest_burn_agent
              ? formatMoney(stats.highest_burn_agent.al_harq)
              : "—"
          }
          sub={stats.highest_burn_agent?.name}
          accent="gold"
        />
      </div>

      <ul className="max-h-72 divide-y divide-white/[0.04] overflow-y-auto">
        {filtered.map((agent, i) => (
          <motion.li
            key={agent.id}
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.02 * i }}
          >
            <div className="flex items-center gap-2 px-3 py-2.5">
              <button
                type="button"
                onClick={() =>
                  onSelectAgent(
                    agent.id,
                    agent.display_name ?? agent.texas_username ?? "—"
                  )
                }
                className="flex min-w-0 flex-1 items-center gap-2 text-right transition-opacity hover:opacity-90"
              >
                <div
                  className={cn(
                    "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-[10px] font-bold",
                    agent.role === "master"
                      ? "bg-gold/20 text-gold ring-1 ring-gold/40"
                      : "bg-lime/10 text-lime ring-1 ring-lime/30"
                  )}
                >
                  {agent.depth}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {agent.display_name ?? "—"}
                  </p>
                  <p className="truncate font-mono text-[10px] text-steel-600">
                    {agent.texas_username}
                  </p>
                  <span className="mt-0.5 inline-block rounded-full bg-obsidian/80 px-2 py-0.5 text-[9px] text-steel-500">
                    {roleBadge(agent.role)}
                  </span>
                </div>
                <div className="text-left">
                  <p className="font-mono text-xs text-accent-negative">
                    {agent.ledger ? formatMoney(agent.ledger.al_harq) : "—"}
                  </p>
                  <p className="font-mono text-[10px] text-gold/80">
                    {agent.ledger ? formatMoney(agent.ledger.al_nihai) : "—"}
                  </p>
                </div>
                <ChevronLeft className="h-4 w-4 shrink-0 text-gold/50" />
              </button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="shrink-0 border-gold/30 px-2 text-[10px] text-gold"
                disabled={!agent.ledger || shareReport.isPending}
                onClick={(e) => void handleShare(agent, e)}
              >
                <Send className="h-3 w-3" />
              </Button>
            </div>
          </motion.li>
        ))}
        {!filtered.length && (
          <li className="px-4 py-10 text-center text-xs text-steel-500">
            لا نتائج للبحث
          </li>
        )}
      </ul>
    </motion.section>
  );
}

function StatTile({
  icon,
  label,
  value,
  sub,
  accent,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  sub?: string;
  accent: "gold" | "lime" | "burn";
}) {
  return (
    <div className="glass-inner rounded-xl border border-white/[0.06] p-3">
      <div className="mb-1 flex items-center gap-1.5 text-[9px] uppercase tracking-wider text-steel-500">
        {icon}
        {label}
      </div>
      <p
        className={cn(
          "font-mono text-sm font-semibold tabular-nums",
          accent === "gold" && "text-gold",
          accent === "lime" && "text-lime",
          accent === "burn" && "text-accent-negative"
        )}
      >
        {value}
      </p>
      {sub ? (
        <p className="mt-0.5 truncate text-[9px] text-steel-600">{sub}</p>
      ) : null}
    </div>
  );
}
