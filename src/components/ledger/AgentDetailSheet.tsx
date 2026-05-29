"use client";

import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, X } from "lucide-react";
import { useState } from "react";
import type { TexasSubAgentRow } from "@/lib/texas/texas-live-sub-agents";
import { MetricGrid, StatusPill } from "@/components/ui/premium";
import { ar, metricsSourceLabel } from "@/lib/i18n/ar";
import { formatMoney } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";

export function AgentDetailSheet({
  agent,
  open,
  onClose,
}: {
  agent: TexasSubAgentRow | null;
  open: boolean;
  onClose: () => void;
}) {
  const [debugOpen, setDebugOpen] = useState(false);
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
            className="fixed inset-x-0 bottom-0 z-[70] mx-auto max-h-[88vh] max-w-md overflow-hidden rounded-t-3xl border border-violet-500/25 bg-gradient-to-b from-[#141824] to-[#0B0B0F] shadow-[0_-8px_48px_rgba(139,92,246,0.2)]"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 320, damping: 32 }}
          >
            <div className="mx-auto mt-3 h-1 w-10 rounded-full bg-white/20" />

            <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-4">
              <div>
                <p className="text-[10px] uppercase tracking-widest text-violet-400/80">
                  {ar.agentDetailsTitle}
                </p>
                <h3 className="text-lg font-bold text-white">{agent.username}</h3>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {agent.whatsapp?.group_exists ? (
                    <StatusPill label={ar.subAgentWhatsappGroupOk} tone="success" />
                  ) : (
                    <StatusPill label={ar.subAgentWhatsappGroupMissing} tone="warning" />
                  )}
                  {agent.commission?.status === "pending_percent" ? (
                    <StatusPill label={ar.subAgentCommissionPending} tone="info" />
                  ) : null}
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="min-h-[44px] min-w-[44px] rounded-full border border-white/10 p-2 text-steel-400 hover:text-white"
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
                <p className="mt-1 font-mono text-2xl font-bold tabular-nums text-white">
                  {formatMoney(Math.abs(alNihai))}
                </p>
                <p className="mt-1 text-xs">{isCredit ? "له ✅" : "عليه 🛑"}</p>
              </div>

              <MetricGrid
                items={[
                  { label: ar.tebat, value: formatMoney(m.tebat) },
                  { label: ar.suhoubat, value: formatMoney(m.suhoubat) },
                  { label: ar.alFarq, value: formatMoney(m.al_farq) },
                  {
                    label: ar.alHarq,
                    value: formatMoney(m.al_harq),
                    tone: m.al_harq !== 0 ? "negative" : "default",
                  },
                  {
                    label: ar.waselMenho,
                    value: formatMoney(m.wasel_menho),
                    tone: m.wasel_menho > 0 ? "amber" : "default",
                  },
                  {
                    label: ar.waselEleih,
                    value: formatMoney(m.wasel_eleih),
                    tone: m.wasel_eleih > 0 ? "sky" : "default",
                  },
                  {
                    label: ar.baqiQadim,
                    value: formatMoney(m.baqi_qadim),
                    tone: m.baqi_qadim !== 0 ? "amber" : "default",
                  },
                ]}
              />

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
                <p className="mt-4 text-center text-[10px] text-steel-500">
                  {metricsSourceLabel(agent.metrics_source)}
                </p>
              ) : null}

              <button
                type="button"
                className="mt-4 flex w-full min-h-[44px] items-center justify-between rounded-xl border border-white/[0.06] px-3 py-2 text-[10px] text-steel-600"
                onClick={() => setDebugOpen((v) => !v)}
              >
                {ar.waTechDetails}
                <ChevronDown
                  className={cn("h-3.5 w-3.5", debugOpen && "rotate-180")}
                />
              </button>
              {debugOpen ? (
                <div className="mt-2 rounded-xl bg-black/40 p-3 font-mono text-[9px] text-steel-600">
                  <p>id: {agent.user_id ?? agent.affiliateId}</p>
                  <p>source: {agent.metrics_source ?? "—"}</p>
                </div>
              ) : null}
            </div>
          </motion.div>
        </>
      ) : null}
    </AnimatePresence>
  );
}
