"use client";

import { useCallback, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronDown,
  Loader2,
  Search,
  Users,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { formatMoney } from "@/lib/utils/format";
import { ar } from "@/lib/i18n/ar";
import type { NetworkMember, NetworkPayload } from "@/lib/hierarchy/types";
import { useTelegram } from "@/components/providers/TelegramProvider";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";

/* ─── Role badge config (Agent Tree style: RM, AM, AG, PL) ─── */

const ROLE_BADGE: Record<string, { code: string; label: string; color: string }> = {
  super_master: {
    code: "SM",
    label: ar.roleSuperMaster,
    color: "bg-purple-500/20 text-purple-300 ring-purple-500/40",
  },
  master: {
    code: "RM",
    label: ar.roleMaster,
    color: "bg-amber-500/20 text-amber-300 ring-amber-500/40",
  },
  agent: {
    code: "AG",
    label: ar.roleAgent,
    color: "bg-sky-500/20 text-sky-300 ring-sky-500/40",
  },
  player: {
    code: "PL",
    label: ar.rolePlayer,
    color: "bg-slate-500/20 text-slate-400 ring-slate-500/40",
  },
};

function getRoleBadge(role: string) {
  return ROLE_BADGE[role] ?? ROLE_BADGE.agent!;
}

/* ─── Search helper ─── */

function matchesSearch(m: NetworkMember, q: string): boolean {
  const name = (m.display_name ?? "").toLowerCase();
  const username = (m.texas_username ?? "").toLowerCase();
  const affiliate = (m.texas_affiliate_id ?? "").toLowerCase();
  return name.includes(q) || username.includes(q) || affiliate.includes(q);
}

/* ─── Main Panel ─── */

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

  const toggleExpand = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

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
      {/* ── Header ── */}
      <header className="border-b border-gold/15 bg-gradient-to-l from-gold/10 to-transparent px-4 py-3">
        <div className="mb-2 flex items-center gap-2">
          <Users className="h-5 w-5 text-gold" strokeWidth={1.5} />
          <div>
            <h2 className="text-base font-bold text-gold">{ar.tabSubAgents}</h2>
            <p className="text-[10px] text-steel-500">{ar.subAgentsSubtitle}</p>
          </div>
        </div>

        {stats ? (
          <div className="mt-3 grid grid-cols-2 gap-2 text-center">
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
          </div>
        ) : null}

        {/* Search */}
        <div className="relative mt-3">
          <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-steel-500" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={ar.searchByNameOrId}
            className="border-steel-border/80 bg-obsidian/60 pr-10 text-sm backdrop-blur-md"
          />
        </div>
      </header>

      {/* ── Agent Tree ── */}
      <div className="max-h-[34rem] overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="px-4 py-12 text-center text-xs text-steel-500">
            {(data?.members.length ?? 0) === 0 ? ar.noSubAgents : "لا نتائج للبحث"}
          </div>
        ) : (
          <ul className="divide-y divide-white/[0.04]">
            {filtered.map((member, i) => (
              <AgentTreeNode
                key={member.id}
                member={member}
                index={i}
                depth={0}
                isExpanded={expanded.has(member.id)}
                expandedSet={expanded}
                onToggleExpand={toggleExpand}
                onSelect={onSelectAgent}
                ledgerDate={data?.ledger_date ?? ""}
              />
            ))}
          </ul>
        )}
      </div>
    </motion.section>
  );
}

/* ─── Agent Tree Node (recursive) ─── */

function AgentTreeNode({
  member,
  index,
  depth,
  isExpanded,
  expandedSet,
  onToggleExpand,
  onSelect,
  ledgerDate,
}: {
  member: NetworkMember;
  index: number;
  depth: number;
  isExpanded: boolean;
  expandedSet: Set<string>;
  onToggleExpand: (id: string) => void;
  onSelect: (userId: string, label: string) => void;
  ledgerDate: string;
}) {
  const badge = getRoleBadge(member.role);
  const ledger = member.ledger;
  const snap = member.snapshot;
  const hasChildren = (member.direct_children_count ?? 0) > 0;
  const alNihai = ledger?.al_nihai ?? 0;
  const isCredit = alNihai >= 0;

  return (
    <motion.li
      initial={{ opacity: 0, x: 6 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: depth === 0 ? 0.02 * Math.min(index, 12) : 0.01 * index }}
      className="list-none"
    >
      <div
        className={cn(
          "transition-colors hover:bg-white/[0.02]",
          depth > 0 && "border-r-2 border-gold/10"
        )}
        style={{ paddingRight: `${depth * 16 + 12}px`, paddingLeft: "12px" }}
      >
        {/* Row 1: Badge + Name + Expand + al_nihai orientation */}
        <div className="flex items-center gap-2 py-2.5">
          {/* Role badge */}
          <span
            className={cn(
              "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[10px] font-bold ring-1",
              badge.color
            )}
          >
            {badge.code}
          </span>

          {/* Name block */}
          <button
            type="button"
            onClick={() =>
              onSelect(
                member.id,
                member.display_name ?? member.texas_username ?? "وكيل"
              )
            }
            className="min-w-0 flex-1 text-right"
          >
            <p className="truncate text-sm font-semibold text-foreground">
              {member.display_name ?? member.texas_username ?? "—"}
            </p>
            {member.texas_username && (
              <p className="truncate font-mono text-[10px] text-steel-500">
                {member.texas_username}
              </p>
            )}
          </button>

          {/* Children count pill */}
          {hasChildren && (
            <span className="flex items-center gap-0.5 rounded-full bg-obsidian/80 px-1.5 py-0.5 text-[9px] font-medium text-steel-400">
              <Users className="h-2.5 w-2.5" strokeWidth={1.5} />
              {member.direct_children_count}
            </span>
          )}

          {/* al_nihai orientation label */}
          {ledger ? (
            <span
              className={cn(
                "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold",
                isCredit
                  ? "bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/30"
                  : "bg-rose-500/15 text-rose-400 ring-1 ring-rose-500/30"
              )}
            >
              {formatMoney(Math.abs(alNihai))}{" "}
              {isCredit ? "له ✅" : "عليه 🛑"}
            </span>
          ) : (
            <span className="shrink-0 text-[10px] text-steel-600">
              {ar.noLedgerData}
            </span>
          )}

          {/* Expand toggle */}
          {hasChildren && (
            <button
              type="button"
              onClick={() => onToggleExpand(member.id)}
              className="shrink-0 rounded-md p-1 text-steel-500 transition-colors hover:bg-white/[0.06] hover:text-gold"
            >
              <ChevronDown
                className={cn(
                  "h-4 w-4 transition-transform duration-200",
                  isExpanded && "rotate-180"
                )}
                strokeWidth={1.5}
              />
            </button>
          )}
        </div>

        {/* Row 2: Balance + Deposit/Withdraw from snapshot */}
        {snap ? (
          <div className="flex gap-3 pb-1 text-[10px]">
            <MetricChip label={ar.sectionBalance} value={formatMoney(snap.balance)} accent />
            <MetricChip label={ar.tebat} value={formatMoney(snap.total_deposit)} />
            <MetricChip label={ar.suhoubat} value={formatMoney(snap.total_withdraw)} />
          </div>
        ) : null}

        {/* Row 3: Ledger metrics */}
        {ledger ? (
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 pb-2 text-[10px]">
            <LedgerMetric label={ar.alFarq} value={ledger.al_farq} />
            <LedgerMetric label={ar.alHarq} value={ledger.al_harq} warn />
            <LedgerMetric label={ar.baqiQadim} value={ledger.baqi_qadim} />
            <LedgerMetric
              label={ar.alNihai}
              value={ledger.al_nihai}
              highlight
            />
          </div>
        ) : null}
      </div>

      {/* Expanded children (lazy-loaded) */}
      <AnimatePresence>
        {isExpanded && hasChildren && (
          <ChildrenSubTree
            parentId={member.id}
            depth={depth + 1}
            expandedSet={expandedSet}
            onToggleExpand={onToggleExpand}
            onSelect={onSelect}
            ledgerDate={ledgerDate}
          />
        )}
      </AnimatePresence>
    </motion.li>
  );
}

/* ─── Lazy-loaded children sub-tree ─── */

function ChildrenSubTree({
  parentId,
  depth,
  expandedSet,
  onToggleExpand,
  onSelect,
  ledgerDate,
}: {
  parentId: string;
  depth: number;
  expandedSet: Set<string>;
  onToggleExpand: (id: string) => void;
  onSelect: (userId: string, label: string) => void;
  ledgerDate: string;
}) {
  const { initData, telegramUserId } = useTelegram();

  const { data, isLoading, error } = useQuery({
    queryKey: ["network-children", parentId, ledgerDate, telegramUserId],
    queryFn: async () => {
      const res = await fetch("/api/ledger/get-children", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          initData,
          telegramUserId: telegramUserId ?? undefined,
          parentId,
          ledgerDate,
        }),
      });
      const json = (await res.json()) as { members?: NetworkMember[]; error?: string };
      if (!res.ok) throw new Error(json.error ?? "Failed to load children");
      return json.members ?? [];
    },
    staleTime: 60_000,
    gcTime: 5 * 60_000,
  });

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.2 }}
      className="overflow-hidden"
    >
      {isLoading && (
        <div
          className="flex items-center gap-2 py-3 text-[10px] text-steel-500"
          style={{ paddingRight: `${(depth) * 16 + 12}px`, paddingLeft: "12px" }}
        >
          <Loader2 className="h-3.5 w-3.5 animate-spin text-gold" />
          جاري التحميل…
        </div>
      )}
      {error && (
        <div
          className="py-2 text-[10px] text-accent-negative"
          style={{ paddingRight: `${(depth) * 16 + 12}px`, paddingLeft: "12px" }}
        >
          {error instanceof Error ? error.message : ar.errorGeneric}
        </div>
      )}
      {data && data.length > 0 && (
        <ul className="divide-y divide-white/[0.03]">
          {data.map((child, i) => (
            <AgentTreeNode
              key={child.id}
              member={child}
              index={i}
              depth={depth}
              isExpanded={expandedSet.has(child.id)}
              expandedSet={expandedSet}
              onToggleExpand={onToggleExpand}
              onSelect={onSelect}
              ledgerDate={ledgerDate}
            />
          ))}
        </ul>
      )}
      {data && data.length === 0 && (
        <div
          className="py-2 text-[10px] text-steel-600"
          style={{ paddingRight: `${(depth) * 16 + 12}px`, paddingLeft: "12px" }}
        >
          لا يوجد تابعون
        </div>
      )}
    </motion.div>
  );
}

/* ─── Small helpers ─── */

function MetricChip({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <span className="flex items-center gap-1">
      <span className="text-steel-600">{label}:</span>
      <span
        className={cn(
          "font-mono tabular-nums",
          accent ? "font-medium text-gold" : "text-steel-300"
        )}
      >
        {value}
      </span>
    </span>
  );
}

function LedgerMetric({
  label,
  value,
  highlight,
  warn,
}: {
  label: string;
  value: number;
  highlight?: boolean;
  warn?: boolean;
}) {
  const isZero = value === 0;
  return (
    <span className="flex items-center gap-1">
      <span className="text-steel-600">{label}:</span>
      <span
        className={cn(
          "font-mono tabular-nums",
          highlight
            ? "font-semibold text-gold"
            : warn && !isZero
              ? "text-rose-400"
              : isZero
                ? "text-steel-600"
                : "text-steel-300"
        )}
      >
        {isZero ? "—" : formatMoney(value)}
      </span>
    </span>
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
