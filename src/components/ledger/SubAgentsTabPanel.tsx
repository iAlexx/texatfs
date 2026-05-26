"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { ChevronLeft, Loader2, Search, Users } from "lucide-react";
import { formatMoney } from "@/lib/utils/format";
import { ar } from "@/lib/i18n/ar";
import type {
  TexasSubAgentsPayload,
  TexasSubAgentRow,
} from "@/lib/texas/texas-live-sub-agents";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";

/* ─── Role badge ─── */

const ROLE_CFG: Record<string, { code: string; bg: string; text: string }> = {
  super_master: { code: "SM", bg: "bg-purple-500/25", text: "text-purple-300" },
  master:       { code: "RM", bg: "bg-rose-500/25",   text: "text-rose-300" },
  agent:        { code: "AG", bg: "bg-sky-500/25",    text: "text-sky-300" },
  player:       { code: "PL", bg: "bg-emerald-500/25", text: "text-emerald-300" },
};

function roleCfg(role: string) {
  return ROLE_CFG[role] ?? ROLE_CFG.agent!;
}

function matchesSearch(agent: TexasSubAgentRow, q: string): boolean {
  return (
    agent.username.toLowerCase().includes(q) ||
    agent.email.toLowerCase().includes(q) ||
    agent.affiliateId.toLowerCase().includes(q)
  );
}

function num(v: number | undefined | null): string {
  if (v == null || v === 0) return "0.00";
  return formatMoney(v);
}

/* ─── Columns ─── */

const COL_HEADERS = [
  { key: "role",       label: "Role",            w: "w-[48px]" },
  { key: "username",   label: "Username",        w: "min-w-[110px] flex-1" },
  { key: "balance",    label: ar.sectionBalance,  w: "w-[82px]" },
  { key: "tebat",      label: ar.tebat,          w: "w-[78px]" },
  { key: "suhoubat",   label: ar.suhoubat,       w: "w-[78px]" },
  { key: "alFarq",     label: ar.alFarq,         w: "w-[72px]" },
  { key: "alHarq",     label: ar.alHarq,         w: "w-[72px]" },
  { key: "waselMenho", label: ar.waselMenho,     w: "w-[78px]" },
  { key: "waselEleih", label: ar.waselEleih,     w: "w-[78px]" },
  { key: "baqiQadim",  label: ar.baqiQadim,      w: "w-[78px]" },
  { key: "alNihai",    label: ar.alNihai,        w: "w-[130px]" },
] as const;

/* ─── Main Panel ─── */

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

  const allAgents = data?.agents ?? [];
  const searchQ = query.trim().toLowerCase();

  const visibleAgents = useMemo(() => {
    if (!searchQ) return allAgents;
    return allAgents.filter((a) => matchesSearch(a, searchQ));
  }, [allAgents, searchQ]);

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
            <h2 className="text-base font-bold text-gold">{ar.subAgentsTitle}</h2>
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
        <div className="min-w-[920px]">
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
            {visibleAgents.length === 0 ? (
              <div className="px-4 py-12 text-center text-xs text-steel-500">
                {allAgents.length === 0 ? ar.noSubAgents : "لا نتائج للبحث"}
              </div>
            ) : (
              visibleAgents.map((agent, i) => (
                <AgentRow
                  key={agent.affiliateId}
                  agent={agent}
                  index={i}
                  hasLiveData={!agent.affiliateId.startsWith("db:")}
                  onSelect={() =>
                    onSelectAgent(agent.affiliateId, agent.username, agent.mainCurrency)
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

function AgentRow({
  agent,
  index,
  hasLiveData,
  onSelect,
}: {
  agent: TexasSubAgentRow;
  index: number;
  hasLiveData: boolean;
  onSelect: () => void;
}) {
  const badge = roleCfg(agent.texasRole);
  const m = agent.metrics;
  const alNihai = m.al_nihai;
  const isCredit = alNihai < 0;

  return (
    <motion.div
      className={cn(
        "flex items-center px-2 py-1.5 transition-colors hover:bg-white/[0.02]",
        !hasLiveData && "opacity-60"
      )}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 0.01 * Math.min(index, 20) }}
    >
      {/* Role */}
      <div className="flex w-[52px] shrink-0 items-center justify-center px-1.5">
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

      {/* Username */}
      <button
        type="button"
        onClick={hasLiveData ? onSelect : undefined}
        disabled={!hasLiveData}
        className={cn(
          "flex min-w-[120px] flex-1 shrink-0 items-center gap-1 px-1.5 text-right",
          !hasLiveData && "cursor-default"
        )}
      >
        <div className="min-w-0">
          <p className="truncate text-[11px] font-medium text-foreground">
            {agent.username}
          </p>
          {agent.email !== agent.username && (
            <p className="truncate text-[9px] text-steel-600">{agent.email}</p>
          )}
        </div>
        <ChevronLeft className="h-3 w-3 shrink-0 text-steel-700" strokeWidth={1.5} />
      </button>

      {/* الرصيد */}
      <div
        className={cn(
          "w-[82px] shrink-0 px-1.5 text-center font-mono text-[11px] font-semibold",
          agent.balance > 0 ? "text-gold" : "text-steel-500"
        )}
      >
        {num(agent.balance)}
      </div>

      {/* التعبئات */}
      <div className="w-[78px] shrink-0 px-1.5 text-center font-mono text-[11px] text-steel-300">
        {num(m.tebat)}
      </div>

      {/* سحوبات */}
      <div className="w-[78px] shrink-0 px-1.5 text-center font-mono text-[11px] text-steel-300">
        {num(m.suhoubat)}
      </div>

      {/* الفرق */}
      <div className="w-[72px] shrink-0 px-1.5 text-center font-mono text-[11px] text-steel-300">
        {num(m.al_farq)}
      </div>

      {/* الحرق */}
      <div
        className={cn(
          "w-[72px] shrink-0 px-1.5 text-center font-mono text-[11px]",
          m.al_harq !== 0 ? "text-rose-400" : "text-steel-500"
        )}
      >
        {num(m.al_harq)}
      </div>

      {/* واصل منه */}
      <div
        className={cn(
          "w-[78px] shrink-0 px-1.5 text-center font-mono text-[11px]",
          m.wasel_menho > 0 ? "text-amber-400" : "text-steel-600"
        )}
      >
        {num(m.wasel_menho)}
      </div>

      {/* واصل إليه */}
      <div
        className={cn(
          "w-[78px] shrink-0 px-1.5 text-center font-mono text-[11px]",
          m.wasel_eleih > 0 ? "text-sky-400" : "text-steel-600"
        )}
      >
        {num(m.wasel_eleih)}
      </div>

      {/* باقي قديم */}
      <div
        className={cn(
          "w-[78px] shrink-0 px-1.5 text-center font-mono text-[11px]",
          m.baqi_qadim !== 0 ? "text-orange-400" : "text-steel-600"
        )}
      >
        {num(m.baqi_qadim)}
      </div>

      {/* النهائي */}
      <div className="w-[130px] shrink-0 px-1.5 text-center">
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
