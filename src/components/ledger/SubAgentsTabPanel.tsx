"use client";

import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, Loader2, MessageCircle, Search, Users } from "lucide-react";
import { formatMoney } from "@/lib/utils/format";
import { ar } from "@/lib/i18n/ar";
import type {
  TexasSubAgentsPayload,
  TexasSubAgentRow,
} from "@/lib/texas/texas-live-sub-agents";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";

const ROLE_CFG: Record<string, { code: string; bg: string; text: string }> = {
  super_master: { code: "SM", bg: "bg-purple-500/25", text: "text-purple-300" },
  master: { code: "RM", bg: "bg-rose-500/25", text: "text-rose-300" },
  agent: { code: "AG", bg: "bg-sky-500/25", text: "text-sky-300" },
  player: { code: "PL", bg: "bg-emerald-500/25", text: "text-emerald-300" },
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

export const SUBAGENTS_COL_HEADERS = [
  { key: "agentName", label: "Agent Name", w: "min-w-[160px] flex-1" },
  { key: "alNihai", label: ar.alNihai, w: "w-[110px]" },
  { key: "tebat", label: ar.subAgentTebatMtd, w: "w-[72px]" },
  { key: "suhoubat", label: ar.subAgentSuhoubatMtd, w: "w-[72px]" },
  { key: "alFarq", label: ar.subAgentAlFarqMtd, w: "w-[64px]" },
  { key: "alHarq", label: ar.subAgentAlHarqMtd, w: "w-[64px]" },
  { key: "waselMenho", label: ar.subAgentWaselMenhoMtd, w: "w-[68px]" },
  { key: "waselEleih", label: ar.subAgentWaselEleihMtd, w: "w-[68px]" },
  { key: "baqiQadim", label: ar.subAgentBaqiQadim, w: "w-[68px]" },
  { key: "whatsapp", label: ar.subAgentWhatsappGroup, w: "w-[72px]" },
] as const;

export function SubAgentsTabPanel({
  data,
  isLoading,
  error,
  onRetry,
}: {
  data: TexasSubAgentsPayload | undefined;
  isLoading: boolean;
  error: Error | null;
  onRetry: () => void;
}) {
  const [query, setQuery] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

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
      <header className="border-b border-gold/15 bg-gradient-to-l from-gold/10 to-transparent px-4 py-3">
        <div className="mb-2 flex items-center gap-2">
          <Users className="h-5 w-5 text-gold" strokeWidth={1.5} />
          <div>
            <h2 className="text-base font-bold text-gold">{ar.subAgentsTitle}</h2>
            <p className="text-[10px] text-steel-500">{ar.subAgentsMtdSubtitle}</p>
          </div>
          {stats && (
            <span className="mr-auto rounded-full bg-obsidian/80 px-2 py-0.5 text-[9px] font-medium text-steel-400">
              {stats.active_agents} {ar.activeAgents}
            </span>
          )}
        </div>

        {stats ? (
          <div className="mt-2 grid grid-cols-3 gap-2 text-center">
            <MiniStat
              label={ar.subAgentAlHarqMtd}
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

      <div className="overflow-x-auto">
        <div className="min-w-[820px]">
          <div className="flex items-center border-b border-white/[0.08] bg-obsidian/60 px-2 py-2 text-[9px] font-semibold uppercase tracking-wider text-steel-500">
            {SUBAGENTS_COL_HEADERS.map((col) => (
              <div
                key={col.key}
                className={cn("shrink-0 px-1 text-center", col.w)}
              >
                {col.label}
              </div>
            ))}
          </div>

          <div className="max-h-[40rem] divide-y divide-white/[0.03] overflow-y-auto">
            {visibleAgents.length === 0 ? (
              <div className="px-4 py-12 text-center text-xs text-steel-500">
                {allAgents.length === 0 ? ar.noSubAgents : "لا نتائج للبحث"}
              </div>
            ) : (
              visibleAgents.map((agent, i) => (
                <AgentRowBlock
                  key={agent.user_id ?? agent.affiliateId}
                  agent={agent}
                  index={i}
                  expanded={expandedId === (agent.user_id ?? agent.affiliateId)}
                  onToggle={() =>
                    setExpandedId((cur) =>
                      cur === (agent.user_id ?? agent.affiliateId)
                        ? null
                        : (agent.user_id ?? agent.affiliateId)
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

function AgentRowBlock({
  agent,
  index,
  expanded,
  onToggle,
}: {
  agent: TexasSubAgentRow;
  index: number;
  expanded: boolean;
  onToggle: () => void;
}) {
  const badge = roleCfg(agent.texasRole);
  const m = agent.metrics;
  const alNihai = m.al_nihai;
  const isCredit = alNihai < 0;
  const hasLiveData = agent.has_live_texas_data !== false;
  const wa = agent.whatsapp;
  const comm = agent.commission;

  return (
    <div>
      <motion.div
        className={cn(
          "flex items-center px-2 py-1.5 transition-colors hover:bg-white/[0.02]",
          !hasLiveData && "opacity-70"
        )}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.01 * Math.min(index, 20) }}
      >
        <button
          type="button"
          onClick={onToggle}
          className="flex min-w-[160px] shrink-0 flex-1 items-center gap-1.5 px-1 text-right"
        >
          <ChevronDown
            className={cn(
              "h-3 w-3 shrink-0 text-steel-600 transition-transform",
              expanded && "rotate-180"
            )}
          />
          <span
            className={cn(
              "flex h-6 w-9 items-center justify-center rounded text-[9px] font-bold",
              badge.bg,
              badge.text
            )}
          >
            {badge.code}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[11px] font-bold text-foreground">
              {agent.username}
            </p>
            {!hasLiveData ? (
              <span className="text-[8px] text-steel-500">{ar.noLiveTexasData}</span>
            ) : null}
          </div>
        </button>

        <div className="w-[110px] shrink-0 px-1 text-center">
          <span
            className={cn(
              "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 font-mono text-[9px] font-semibold",
              isCredit
                ? "bg-emerald-500/10 text-emerald-400"
                : "bg-rose-500/10 text-rose-400"
            )}
          >
            {formatMoney(Math.abs(alNihai))}
            <span className="text-[8px]">{isCredit ? "له" : "عليه"}</span>
          </span>
        </div>

        <MetricCell w="w-[72px]" value={num(m.tebat)} />
        <MetricCell w="w-[72px]" value={num(m.suhoubat)} />
        <MetricCell w="w-[64px]" value={num(m.al_farq)} />
        <MetricCell
          w="w-[64px]"
          value={num(m.al_harq)}
          highlight={m.al_harq !== 0}
        />
        <MetricCell
          w="w-[68px]"
          value={num(m.wasel_menho)}
          tone={m.wasel_menho > 0 ? "amber" : "muted"}
        />
        <MetricCell
          w="w-[68px]"
          value={num(m.wasel_eleih)}
          tone={m.wasel_eleih > 0 ? "sky" : "muted"}
        />
        <MetricCell
          w="w-[68px]"
          value={num(m.baqi_qadim)}
          tone={m.baqi_qadim !== 0 ? "orange" : "muted"}
        />

        <div className="w-[72px] shrink-0 px-1 text-center">
          {wa?.group_exists ? (
            <span className="inline-flex items-center gap-0.5 text-[8px] text-emerald-400">
              <MessageCircle className="h-3 w-3" />
              {ar.subAgentWhatsappGroupOk}
            </span>
          ) : (
            <span className="text-[8px] text-rose-400">
              {ar.subAgentWhatsappGroupMissing}
            </span>
          )}
        </div>
      </motion.div>

      <AnimatePresence>
        {expanded ? (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-t border-white/[0.04] bg-obsidian/40 px-4 py-2"
          >
            <div className="grid grid-cols-2 gap-2 text-[10px] text-steel-400">
              <Detail label="Affiliate ID" value={agent.affiliateId} />
              {agent.user_id ? (
                <Detail label="User ID" value={agent.user_id.slice(0, 8) + "…"} />
              ) : null}
              {agent.mtd?.texas_strategy ? (
                <Detail
                  label="MTD source"
                  value={agent.mtd.texas_strategy}
                />
              ) : null}
              <Detail
                label={ar.subAgentWhatsappGroup}
                value={
                  wa?.group_exists
                    ? wa.group_name ?? ar.subAgentWhatsappGroupOk
                    : ar.subAgentWhatsappGroupMissing
                }
              />
              {!wa?.parent_whatsapp_verified ? (
                <Detail
                  label="واتساب الأب"
                  value={ar.subAgentWhatsappNotVerified}
                />
              ) : null}
              <Detail
                label={ar.finalBeforeCommission}
                value={
                  comm?.final_before_commission != null
                    ? formatMoney(comm.final_before_commission)
                    : ar.subAgentCommissionNone
                }
              />
              <Detail
                label={ar.finalAfterCommission}
                value={
                  comm?.final_after_commission != null
                    ? formatMoney(comm.final_after_commission)
                    : ar.subAgentCommissionNone
                }
              />
              <Detail
                label="عمولة الشهر"
                value={commissionLabel(comm)}
              />
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function commissionLabel(
  comm: TexasSubAgentRow["commission"]
): string {
  if (!comm || comm.status === "none") return ar.subAgentCommissionNone;
  if (comm.status === "pending_percent") return ar.subAgentCommissionPending;
  if (comm.status === "completed" && comm.percent != null) {
    const amt =
      comm.commission_amount != null
        ? ` · ${formatMoney(comm.commission_amount)}`
        : "";
    return `${comm.percent}%${amt}`;
  }
  return comm.status;
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-steel-600">{label}: </span>
      <span className="text-steel-300">{value}</span>
    </div>
  );
}

function MetricCell({
  w,
  value,
  highlight,
  tone,
}: {
  w: string;
  value: string;
  highlight?: boolean;
  tone?: "amber" | "sky" | "orange" | "muted";
}) {
  const toneClass =
    tone === "amber"
      ? "text-amber-400"
      : tone === "sky"
        ? "text-sky-400"
        : tone === "orange"
          ? "text-orange-400"
          : highlight
            ? "text-rose-400"
            : "text-steel-300";
  return (
    <div
      className={cn(
        "shrink-0 px-1 text-center font-mono text-[10px]",
        w,
        toneClass
      )}
    >
      {value}
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
