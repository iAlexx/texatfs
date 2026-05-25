"use client";

import { useCallback, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { ChevronDown, ChevronLeft, Loader2, Search, Users } from "lucide-react";
import { formatMoney } from "@/lib/utils/format";
import { ar } from "@/lib/i18n/ar";
import type { NetworkMember, NetworkPayload } from "@/lib/hierarchy/types";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";

/* ─── Role badge (Agent Tree style) ─── */

const ROLE_CFG: Record<string, { code: string; bg: string; text: string }> = {
  super_master: { code: "SM", bg: "bg-purple-500/25", text: "text-purple-300" },
  master:       { code: "RM", bg: "bg-rose-500/25",   text: "text-rose-300" },
  agent:        { code: "AG", bg: "bg-sky-500/25",    text: "text-sky-300" },
  player:       { code: "PL", bg: "bg-emerald-500/25", text: "text-emerald-300" },
};

function roleCfg(role: string) {
  return ROLE_CFG[role] ?? ROLE_CFG.agent!;
}

/* ─── Tree helpers ─── */

function buildChildrenMap(members: NetworkMember[], viewerId: string) {
  const map = new Map<string, NetworkMember[]>();
  for (const m of members) {
    const pid = m.parent_id ?? viewerId;
    const list = map.get(pid);
    if (list) list.push(m);
    else map.set(pid, [m]);
  }
  return map;
}

function flattenVisibleRows(
  parentId: string,
  childrenMap: Map<string, NetworkMember[]>,
  expanded: Set<string>,
  depth: number,
  searchActive: boolean
): Array<{ member: NetworkMember; depth: number }> {
  const children = childrenMap.get(parentId);
  if (!children) return [];

  const rows: Array<{ member: NetworkMember; depth: number }> = [];
  for (const m of children) {
    rows.push({ member: m, depth });
    if (searchActive || expanded.has(m.id)) {
      rows.push(...flattenVisibleRows(m.id, childrenMap, expanded, depth + 1, searchActive));
    }
  }
  return rows;
}

function matchesSearch(m: NetworkMember, q: string): boolean {
  const name = (m.display_name ?? "").toLowerCase();
  const user = (m.texas_username ?? "").toLowerCase();
  const aff = (m.texas_affiliate_id ?? "").toLowerCase();
  return name.includes(q) || user.includes(q) || aff.includes(q);
}

function num(v: number | undefined | null): string {
  if (v == null || v === 0) return "0.00";
  return formatMoney(v);
}

/* ─── Columns ─── */

const COL_HEADERS = [
  { key: "role",     label: "Role",         w: "w-[52px]"  },
  { key: "username", label: "Username",      w: "min-w-[120px] flex-1" },
  { key: "players",  label: ar.directPlayers, w: "w-[60px]" },
  { key: "balance",  label: ar.sectionBalance, w: "w-[90px]" },
  { key: "tebat",    label: ar.tebat,        w: "w-[90px]" },
  { key: "suhoubat", label: ar.suhoubat,     w: "w-[90px]" },
  { key: "alHarq",   label: ar.alHarq,       w: "w-[90px]" },
  { key: "alNihai",  label: ar.alNihai,      w: "w-[130px]" },
] as const;

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

  const viewerId = data?.viewer_id ?? "";
  const allMembers = data?.members ?? [];
  const searchQ = query.trim().toLowerCase();
  const searchActive = searchQ.length > 0;

  const childrenMap = useMemo(
    () => buildChildrenMap(allMembers, viewerId),
    [allMembers, viewerId]
  );

  const visibleRows = useMemo(() => {
    if (searchActive) {
      return allMembers
        .filter((m) => matchesSearch(m, searchQ))
        .map((m) => ({ member: m, depth: 0 }));
    }
    return flattenVisibleRows(viewerId, childrenMap, expanded, 0, false);
  }, [viewerId, childrenMap, expanded, searchActive, searchQ, allMembers]);

  const toggleExpand = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  /* ── Loading / Error states ── */

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
            <h2 className="text-base font-bold text-gold">Agent Tree</h2>
            <p className="text-[10px] text-steel-500">{ar.subAgentsSubtitle}</p>
          </div>
          {stats && (
            <span className="mr-auto rounded-full bg-obsidian/80 px-2 py-0.5 text-[9px] font-medium text-steel-400">
              {stats.active_agents} {ar.activeAgents}
            </span>
          )}
        </div>

        {stats ? (
          <div className="mt-2 grid grid-cols-3 gap-2 text-center">
            <MiniStat label={ar.totalNetworkBurnToday} value={formatMoney(stats.total_network_burn)} />
            <MiniStat label={ar.combinedNetworkBalance} value={formatMoney(stats.combined_balance)} />
            <MiniStat
              label={ar.highestBurnToday}
              value={stats.highest_burn_agent ? formatMoney(stats.highest_burn_agent.al_harq) : "—"}
            />
          </div>
        ) : null}

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

      {/* ── Table ── */}
      <div className="overflow-x-auto">
        <div className="min-w-[700px]">
          {/* Table header */}
          <div className="flex items-center border-b border-white/[0.08] bg-obsidian/60 px-2 py-2 text-[10px] font-semibold uppercase tracking-wider text-steel-500">
            {COL_HEADERS.map((col) => (
              <div key={col.key} className={cn("shrink-0 px-1.5 text-center", col.w)}>
                {col.label}
              </div>
            ))}
          </div>

          {/* Table body */}
          <div className="max-h-[36rem] divide-y divide-white/[0.03] overflow-y-auto">
            {visibleRows.length === 0 ? (
              <div className="px-4 py-12 text-center text-xs text-steel-500">
                {allMembers.length === 0 ? ar.noSubAgents : "لا نتائج للبحث"}
              </div>
            ) : (
              visibleRows.map(({ member, depth }, i) => (
                <TreeRow
                  key={member.id}
                  member={member}
                  depth={depth}
                  index={i}
                  isExpanded={expanded.has(member.id)}
                  onToggle={() => toggleExpand(member.id)}
                  onSelect={() =>
                    onSelectAgent(
                      member.id,
                      member.display_name ?? member.texas_username ?? "وكيل"
                    )
                  }
                />
              ))
            )}
          </div>
        </div>
      </div>
    </motion.section>
  );
}

/* ─── Table Row ─── */

function TreeRow({
  member,
  depth,
  index,
  isExpanded,
  onToggle,
  onSelect,
}: {
  member: NetworkMember;
  depth: number;
  index: number;
  isExpanded: boolean;
  onToggle: () => void;
  onSelect: () => void;
}) {
  const badge = roleCfg(member.role);
  const ledger = member.ledger;
  const snap = member.snapshot;
  const hasChildren = (member.direct_children_count ?? 0) > 0;
  const alNihai = ledger?.al_nihai ?? 0;
  const isCredit = alNihai >= 0;

  return (
    <motion.div
      className="flex items-center px-2 py-1.5 transition-colors hover:bg-white/[0.02]"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 0.01 * Math.min(index, 20) }}
    >
      {/* Role */}
      <div className="flex w-[52px] shrink-0 items-center justify-center px-1.5">
        <div style={{ paddingRight: `${depth * 14}px` }} className="flex items-center gap-1">
          {hasChildren ? (
            <button
              type="button"
              onClick={onToggle}
              className="shrink-0 rounded p-0.5 text-steel-500 transition-colors hover:text-gold"
            >
              <ChevronDown
                className={cn("h-3.5 w-3.5 transition-transform", isExpanded && "rotate-180")}
                strokeWidth={2}
              />
            </button>
          ) : (
            <span className="w-[18px]" />
          )}
          <span
            className={cn(
              "flex h-6 w-8 items-center justify-center rounded text-[10px] font-bold",
              badge.bg,
              badge.text
            )}
          >
            {badge.code}
          </span>
        </div>
      </div>

      {/* Username */}
      <button
        type="button"
        onClick={onSelect}
        className="flex min-w-[120px] flex-1 shrink-0 items-center gap-1 px-1.5 text-right"
      >
        <div className="min-w-0">
          <p className="truncate text-[11px] font-medium text-foreground">
            {member.texas_username ?? member.display_name ?? "—"}
          </p>
        </div>
        <ChevronLeft className="h-3 w-3 shrink-0 text-steel-700" strokeWidth={1.5} />
      </button>

      {/* Direct Players */}
      <div className="w-[60px] shrink-0 px-1.5 text-center font-mono text-[11px] text-steel-400">
        {hasChildren ? member.direct_children_count : "—"}
      </div>

      {/* Balance */}
      <div className="w-[90px] shrink-0 px-1.5 text-center font-mono text-[11px] text-gold/80">
        {snap ? num(snap.balance) : "—"}
      </div>

      {/* تبات */}
      <div className="w-[90px] shrink-0 px-1.5 text-center font-mono text-[11px] text-steel-300">
        {ledger ? num(ledger.tebat) : "—"}
      </div>

      {/* سحوبات */}
      <div className="w-[90px] shrink-0 px-1.5 text-center font-mono text-[11px] text-steel-300">
        {ledger ? num(ledger.suhoubat) : "—"}
      </div>

      {/* الحرق */}
      <div
        className={cn(
          "w-[90px] shrink-0 px-1.5 text-center font-mono text-[11px]",
          ledger && ledger.al_harq !== 0 ? "text-rose-400" : "text-steel-500"
        )}
      >
        {ledger ? num(ledger.al_harq) : "—"}
      </div>

      {/* النهائي */}
      <div className="w-[130px] shrink-0 px-1.5 text-center">
        {ledger ? (
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-mono text-[10px] font-semibold",
              isCredit
                ? "bg-emerald-500/10 text-emerald-400"
                : "bg-rose-500/10 text-rose-400"
            )}
          >
            {formatMoney(Math.abs(alNihai))}
            <span className="text-[9px]">{isCredit ? "له ✅" : "عليه 🛑"}</span>
          </span>
        ) : (
          <span className="text-[10px] text-steel-600">{ar.noLedgerData}</span>
        )}
      </div>
    </motion.div>
  );
}

/* ─── Helpers ─── */

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="glass-inner rounded-lg px-2 py-1.5">
      <p className="text-[9px] text-steel-500">{label}</p>
      <p className="font-mono text-xs font-semibold text-gold">{value}</p>
    </div>
  );
}
