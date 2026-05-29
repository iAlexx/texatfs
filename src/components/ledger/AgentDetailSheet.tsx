"use client";

import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import type { TexasSubAgentRow } from "@/lib/texas/texas-live-sub-agents";
import { ar } from "@/lib/i18n/ar";
import { formatMoney } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";

function MetricCard({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "positive" | "negative" | "amber" | "sky";
}) {
  const toneClass =
    tone === "positive"
      ? "text-emerald-400"
      : tone === "negative"
        ? "text-rose-400"
        : tone === "amber"
          ? "text-amber-400"
          : tone === "sky"
            ? "text-sky-400"
            : "text-steel-200";

  return (
    <div className="rounded-2xl border border-white/[0.06] bg-obsidian/60 p-3 backdrop-blur-md">
      <p className="text-[10px] text-steel-500">{label}</p>
      <p className={cn("mt-1 font-mono text-sm font-semibold tabular-nums", toneClass)}>
        {value}
      </p>
    </div>
  );
}

export function AgentDetailSheet({
  agent,
  open,
  onClose,
}: {
  agent: TexasSubAgentRow | null;
  open: boolean;
  onClose: () => void;
}) {
  const m = agent?.metrics;
  const alNihai = m?.al_nihai ?? 0;
  const isCredit = alNihai < 0;

  return (
    <AnimatePresence>
      {open && agent && m ? (
        <>
          <motion.button
            type="button"
            aria-label="إغلاق"
            className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            className="fixed inset-x-0 bottom-0 z-[70] mx-auto max-h-[88vh] max-w-md overflow-hidden rounded-t-3xl border border-violet-500/20 bg-gradient-to-b from-[#1a1028] to-obsidian shadow-[0_-8px_40px_rgba(139,92,246,0.15)]"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 320, damping: 32 }}
          >
            <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-4">
              <div>
                <p className="text-[10px] uppercase tracking-widest text-violet-400/80">
                  {ar.agentDetailsTitle}
                </p>
                <h3 className="text-lg font-bold text-foreground">{agent.username}</h3>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="rounded-full border border-white/10 p-2 text-steel-400 hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="overflow-y-auto px-5 py-4 pb-10">
              <div
                className={cn(
                  "mb-4 rounded-2xl border p-4 text-center",
                  isCredit
                    ? "border-emerald-500/30 bg-emerald-500/10"
                    : "border-rose-500/30 bg-rose-500/10"
                )}
              >
                <p className="text-xs text-steel-400">{ar.alNihai}</p>
                <p className="mt-1 font-mono text-2xl font-bold tabular-nums">
                  {formatMoney(Math.abs(alNihai))}
                </p>
                <p className="mt-1 text-xs">{isCredit ? "له ✅" : "عليه 🛑"}</p>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <MetricCard label={ar.tebat} value={formatMoney(m.tebat)} />
                <MetricCard label={ar.suhoubat} value={formatMoney(m.suhoubat)} />
                <MetricCard label={ar.alFarq} value={formatMoney(m.al_farq)} />
                <MetricCard
                  label={ar.alHarq}
                  value={formatMoney(m.al_harq)}
                  tone={m.al_harq !== 0 ? "negative" : "default"}
                />
                <MetricCard
                  label={ar.waselMenho}
                  value={formatMoney(m.wasel_menho)}
                  tone={m.wasel_menho > 0 ? "amber" : "default"}
                />
                <MetricCard
                  label={ar.waselEleih}
                  value={formatMoney(m.wasel_eleih)}
                  tone={m.wasel_eleih > 0 ? "sky" : "default"}
                />
                <MetricCard
                  label={ar.baqiQadim}
                  value={formatMoney(m.baqi_qadim)}
                  tone={m.baqi_qadim !== 0 ? "amber" : "default"}
                />
              </div>

              {agent.commission && agent.commission.status !== "none" ? (
                <div className="mt-4 rounded-2xl border border-violet-500/20 bg-violet-500/5 p-3 text-xs text-steel-400">
                  <p className="font-semibold text-violet-300">{ar.commissionSection}</p>
                  <p className="mt-1">
                    {ar.finalBeforeCommission}:{" "}
                    {agent.commission.final_before_commission != null
                      ? formatMoney(agent.commission.final_before_commission)
                      : "—"}
                  </p>
                  {agent.commission.final_after_commission != null ? (
                    <p>
                      {ar.finalAfterCommission}:{" "}
                      {formatMoney(agent.commission.final_after_commission)}
                    </p>
                  ) : null}
                </div>
              ) : null}

              {agent.metrics_source ? (
                <p className="mt-3 text-center text-[9px] text-steel-600">
                  {agent.metrics_source}
                </p>
              ) : null}
            </div>
          </motion.div>
        </>
      ) : null}
    </AnimatePresence>
  );
}
