"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  ChevronLeft,
  Loader2,
  RefreshCw,
  Search,
  Sparkles,
  Users,
} from "lucide-react";
import { AgentDetailSheet } from "@/components/ledger/AgentDetailSheet";
import { LivePulseDot } from "@/components/ui/LivePulseDot";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { PremiumCard, StatusPill } from "@/components/ui/premium";
import { ar } from "@/lib/i18n/ar";
import type {
  TexasSubAgentsPayload,
  TexasSubAgentRow,
} from "@/lib/texas/texas-live-sub-agents";
import { cn } from "@/lib/utils/cn";

function matchesSearch(agent: TexasSubAgentRow, q: string): boolean {
  return (
    agent.username.toLowerCase().includes(q) ||
    agent.email.toLowerCase().includes(q) ||
    agent.affiliateId.toLowerCase().includes(q)
  );
}

const ROLE_LABEL: Record<string, string> = {
  master: "RM",
  agent: "AG",
  player: "PL",
  super_master: "SM",
};

export function SubAgentsDashboard({
  data,
  isLoading,
  error,
  onRetry,
  onRefresh,
  refreshing,
}: {
  data: TexasSubAgentsPayload | undefined;
  isLoading: boolean;
  error: Error | null;
  onRetry: () => void;
  onRefresh?: () => void;
  refreshing?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<TexasSubAgentRow | null>(null);

  const agents = data?.agents ?? [];
  const searchQ = query.trim().toLowerCase();

  const visible = useMemo(() => {
    if (!searchQ) return agents;
    return agents.filter((a) => matchesSearch(a, searchQ));
  }, [agents, searchQ]);

  if (isLoading && !data) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-steel-500">
        <Loader2 className="h-7 w-7 animate-spin text-violet-400" />
        <p className="mt-3 text-sm">{ar.loadingSubAgents}</p>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="rounded-2xl border border-rose-500/20 bg-rose-500/5 px-4 py-10 text-center">
        <p className="text-sm text-rose-300">{error.message || ar.errorGeneric}</p>
        <Button type="button" variant="outline" className="mt-4" onClick={onRetry}>
          {ar.retry}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-4">
      <motion.section
        className="fintech-hero relative overflow-hidden rounded-3xl p-5"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="pointer-events-none absolute -left-8 -top-8 h-32 w-32 rounded-full bg-violet-600/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-6 -right-6 h-24 w-24 rounded-full bg-pink-600/15 blur-2xl" />

        <div className="relative flex items-start justify-between gap-3">
          <div>
            <div className="mb-2 flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-violet-400" />
              <span className="text-[10px] uppercase tracking-[0.2em] text-violet-400/90">
                {ar.brandEn}
              </span>
            </div>
            <h2 className="text-2xl font-bold text-white">{ar.agentsHeroTitle}</h2>
            <p className="mt-1 text-sm text-steel-400">{ar.agentsHeroSubtitle}</p>
          </div>
          {onRefresh ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="min-h-[44px] min-w-[44px] shrink-0 text-steel-400 hover:text-violet-300"
              onClick={onRefresh}
              disabled={refreshing}
            >
              <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
            </Button>
          ) : null}
        </div>

        <div className="relative mt-4 flex items-center gap-2 text-xs text-steel-500">
          <Users className="h-3.5 w-3.5" />
          <span>
            {agents.length} {ar.activeAgents}
          </span>
        </div>
      </motion.section>

      <div className="relative">
        <Search className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-steel-500" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={ar.searchAgentsPlaceholder}
          className="h-12 rounded-2xl border-white/[0.08] bg-[#0B0B0F]/80 pr-11 text-sm backdrop-blur-md placeholder:text-steel-600"
        />
      </div>

      <div className="space-y-3">
        {visible.length === 0 ? (
          <PremiumCard className="py-14 text-center text-sm text-steel-500">
            {agents.length === 0 ? ar.noSubAgents : ar.noSearchResults}
          </PremiumCard>
        ) : (
          visible.map((agent, i) => (
            <AgentCard
              key={agent.user_id ?? agent.affiliateId}
              agent={agent}
              index={i}
              onOpen={() => setSelected(agent)}
            />
          ))
        )}
      </div>

      <AgentDetailSheet
        agent={selected}
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
      />
    </div>
  );
}

function AgentCard({
  agent,
  index,
  onOpen,
}: {
  agent: TexasSubAgentRow;
  index: number;
  onOpen: () => void;
}) {
  const hasLive = agent.has_live_texas_data !== false;
  const wa = agent.whatsapp;
  const roleCode = ROLE_LABEL[agent.texasRole] ?? "AG";

  return (
    <motion.button
      type="button"
      onClick={onOpen}
      className="fintech-glass w-full min-h-[44px] rounded-2xl border border-white/[0.07] p-4 text-right transition-colors hover:border-violet-500/30 hover:shadow-[0_0_24px_rgba(139,92,246,0.12)]"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.03 * Math.min(index, 12) }}
      whileTap={{ scale: 0.98 }}
    >
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600/30 via-violet-600/30 to-pink-600/20 text-xs font-bold text-white ring-1 ring-violet-500/30">
          {roleCode}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-base font-semibold text-white">
              {agent.username}
            </p>
            {hasLive ? <LivePulseDot live /> : null}
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {wa?.group_exists ? (
              <StatusPill label={ar.subAgentWhatsappGroupOk} tone="success" />
            ) : (
              <StatusPill label={ar.subAgentWhatsappGroupMissing} tone="warning" />
            )}
            {!hasLive ? (
              <StatusPill label={ar.noLiveTexasData} tone="warning" />
            ) : null}
            {agent.commission?.status === "pending_percent" ? (
              <StatusPill label={ar.subAgentCommissionPending} tone="info" />
            ) : null}
          </div>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1">
          <span className="text-[10px] text-violet-400/90">{ar.viewDetails}</span>
          <ChevronLeft className="h-4 w-4 text-steel-600" />
        </div>
      </div>
    </motion.button>
  );
}
