"use client";

import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronDown,
  ChevronLeft,
  Loader2,
  Search,
  Users,
} from "lucide-react";
import { formatMoney } from "@/lib/utils/format";
import { ar } from "@/lib/i18n/ar";
import type { NetworkMember, NetworkPayload } from "@/lib/hierarchy/types";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { BalanceOrientationLabel } from "@/components/ledger/BalanceOrientationLabel";
import { cn } from "@/lib/utils/cn";

function roleLabel(role: string): string {
  if (role === "master" || role === "super_master") return ar.roleMaster;
  if (role === "agent") return ar.roleAgent;
  if (role === "player") return ar.rolePlayer;
  return ar.roleAgent;
}

function roleBadgeColor(role: string): string {
  if (role === "master" || role === "super_master")
    return "bg-gold/15 text-gold ring-1 ring-gold/30";
  if (role === "agent")
    return "bg-blue-500/15 text-blue-400 ring-1 ring-blue-500/30";
  return "bg-steel-600/15 text-steel-400 ring-1 ring-steel-600/30";
}

function matchesSearch(member: NetworkMember, q: string): boolean {
  const name = (member.display_name ?? "").toLowerCase();
  const username = (member.texas_username ?? "").toLowerCase();
  const affiliate = (member.texas_affiliate_id ?? "").toLowerCase();
  return name.includes(q) || username.includes(q) || affiliate.includes(q);
}

export function SubAgentsTabPanel({
  data,
  isLoading,
  error,
  onRetry,
  onSelectAgent,
}: {
  data: NetworkPayload | undefined;
  isLoading: boolean;
  error: Error | null;
  onRetry: () => void;
  onSelectAgent: (userId: string, label: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const filtered = useMemo(() => {
    const members = data?.members ?? [];
    const q = query.trim().toLowerCase();
    if (!q) return members;
    return members.filter((m) => matchesSearch(m, q));
  }, [data?.members, query]);

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

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
      {/* Header */}
      <header className="border-b border-gold/15 bg-gradient-to-l from-gold/10 to-transparent px-4 py-3">
        <motion.div
          className="mb-2 flex items-center gap-2"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <Users className="h-5 w-5 text-gold" strokeWidth={1.5} />
          <div>
            <h2 className="text-base font-bold text-gold">{ar.tabSubAgents}</h2>
            <p className="text-[10px] text-steel-500">{ar.subAgentsSubtitle}</p>
          </div>
        </motion.div>

        {/* Network stats */}
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

        {/* Search */}
        <motion.div
          className="relative mt-3"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-steel-500" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={ar.searchByNameOrId}
            className="border-steel-border/80 bg-obsidian/60 pr-10 text-sm backdrop-blur-md"
          />
        </motion.div>
      </header>

      {/* Agent list */}
      <ul className="max-h-[32rem] divide-y divide-white/[0.04] overflow-y-auto">
        {filtered.map((member, i) => (
          <AgentCard
            key={member.id}
            member={member}
            index={i}
            isExpanded={expanded.has(member.id)}
            onToggleExpand={() => toggleExpand(member.id)}
            onSelect={() =>
              onSelectAgent(
                member.id,
                member.display_name ?? member.texas_username ?? "وكيل"
              )
            }
          />
        ))}
        {!filtered.length && (
          <li className="px-4 py-12 text-center text-xs text-steel-500">
            {(data?.members.length ?? 0) === 0
              ? ar.noSubAgents
              : "لا نتائج للبحث"}
          </li>
        )}
      </ul>
    </motion.section>
  );
}

function AgentCard({
  member,
  index,
  isExpanded,
  onToggleExpand,
  onSelect,
}: {
  member: NetworkMember;
  index: number;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onSelect: () => void;
}) {
  const ledger = member.ledger;
  const hasChildren = (member.direct_children_count ?? 0) > 0;

  return (
    <motion.li
      initial={{ opacity: 0, x: 8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: 0.02 * Math.min(index, 15) }}
    >
      <div className="px-3 py-3">
        {/* Top row: name, role badge, navigate chevron */}
        <button
          type="button"
          onClick={onSelect}
          className="w-full text-right"
        >
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground">
                {member.display_name ?? member.texas_username ?? "—"}
              </p>
              {member.texas_username && member.display_name && (
                <p className="mt-0.5 truncate font-mono text-[10px] text-steel-500">
                  {member.texas_username}
                </p>
              )}
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                <span
                  className={cn(
                    "inline-block rounded-full px-2 py-0.5 text-[9px] font-semibold",
                    roleBadgeColor(member.role)
                  )}
                >
                  {roleLabel(member.role)}
                </span>
                {member.texas_affiliate_id && (
                  <span className="rounded-full bg-obsidian/80 px-2 py-0.5 text-[9px] text-steel-500">
                    ID {member.texas_affiliate_id}
                  </span>
                )}
                {hasChildren && (
                  <span className="flex items-center gap-0.5 rounded-full bg-obsidian/80 px-2 py-0.5 text-[9px] text-steel-500">
                    <Users className="h-2.5 w-2.5" strokeWidth={1.5} />
                    {member.direct_children_count} {ar.directPlayers}
                  </span>
                )}
              </div>
            </div>

            {/* Right side: al_nihai orientation */}
            <div className="flex shrink-0 items-center gap-1">
              {ledger ? (
                <BalanceOrientationLabel value={ledger.al_nihai} size="sm" />
              ) : (
                <span className="text-[10px] text-steel-600">
                  {ar.noLedgerData}
                </span>
              )}
              <ChevronLeft className="h-4 w-4 shrink-0 text-gold/40" />
            </div>
          </div>
        </button>

        {/* Ledger mini-grid */}
        {ledger ? (
          <LedgerMiniGrid ledger={ledger} />
        ) : (
          <div className="mt-2 rounded-lg border border-white/[0.05] bg-obsidian/40 px-3 py-2 text-center text-[10px] text-steel-600">
            {ar.noLedgerData}
          </div>
        )}

        {/* Expand children button */}
        {hasChildren && (
          <button
            type="button"
            onClick={onToggleExpand}
            className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-white/[0.06] bg-obsidian/30 px-3 py-1.5 text-[10px] text-steel-400 transition-colors hover:border-gold/20 hover:text-gold"
          >
            <ChevronDown
              className={cn(
                "h-3 w-3 transition-transform",
                isExpanded && "rotate-180"
              )}
              strokeWidth={1.5}
            />
            {isExpanded ? ar.collapseChildren : ar.expandChildren}
            <span className="font-mono text-steel-500">
              ({member.direct_children_count})
            </span>
          </button>
        )}

        {/* Expanded children placeholder */}
        <AnimatePresence>
          {isExpanded && hasChildren && (
            <ChildrenSubList parentId={member.id} />
          )}
        </AnimatePresence>
      </div>
    </motion.li>
  );
}

function ChildrenSubList({ parentId: _parentId }: { parentId: string }) {
  return (
    <motion.div
      className="mt-2 rounded-lg border border-white/[0.04] bg-obsidian/20 px-2 py-3 text-center text-[10px] text-steel-500"
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
    >
      <Users className="mx-auto mb-1 h-4 w-4 text-steel-600" strokeWidth={1.5} />
      اضغط على الوكيل لعرض تفاصيل حسابه وتابعيه
    </motion.div>
  );
}

function LedgerMiniGrid({
  ledger,
}: {
  ledger: NonNullable<NetworkMember["ledger"]>;
}) {
  const rows: {
    label: string;
    value: number;
    highlight?: boolean;
    dimIfZero?: boolean;
    oriented?: boolean;
  }[] = [
    { label: ar.tebat, value: ledger.tebat, dimIfZero: true },
    { label: ar.suhoubat, value: ledger.suhoubat, dimIfZero: true },
    { label: ar.alFarq, value: ledger.al_farq },
    { label: ar.alHarq, value: ledger.al_harq, dimIfZero: true },
    { label: ar.baqiQadim, value: ledger.baqi_qadim, oriented: true },
    { label: ar.alNihai, value: ledger.al_nihai, highlight: true, oriented: true },
  ];

  return (
    <div className="mt-2 grid grid-cols-2 gap-1 rounded-lg border border-white/[0.05] bg-obsidian/40 p-2">
      {rows.map((row) => {
        const isZero = row.value === 0;
        return (
          <div key={row.label} className="flex justify-between gap-1 text-[10px]">
            <span className="text-steel-500">{row.label}</span>
            {row.oriented && !isZero ? (
              <BalanceOrientationLabel value={row.value} size="sm" />
            ) : (
              <span
                className={cn(
                  "font-mono tabular-nums",
                  row.highlight
                    ? "font-semibold text-gold"
                    : isZero && row.dimIfZero
                      ? "text-steel-600"
                      : "text-steel-300"
                )}
              >
                {isZero && row.dimIfZero ? "—" : formatMoney(row.value)}
              </span>
            )}
          </div>
        );
      })}
    </div>
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
