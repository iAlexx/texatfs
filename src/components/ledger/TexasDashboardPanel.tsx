"use client";

import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { formatMoney } from "@/lib/utils/format";
import { ar } from "@/lib/i18n/ar";
import type { TexasPanelSnapshot } from "@/lib/supabase/database.types";

export function TexasDashboardPanel({
  panel,
}: {
  panel: TexasPanelSnapshot | null | undefined;
}) {
  if (!panel) return null;

  const hasGeneral = Boolean(panel.dashboard_general);
  const hasTxn =
    panel.transaction_cumulative &&
    (panel.transaction_cumulative.deposits !== 0 ||
      panel.transaction_cumulative.withdrawals !== 0);
  const hasDaily = Boolean(panel.daily_movement);

  if (!hasGeneral && !hasTxn && !hasDaily) return null;

  return (
    <motion.section
      className="glass-panel mb-4 overflow-hidden"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <header className="border-b border-white/[0.06] bg-obsidian/40 px-4 py-2.5">
        <p className="text-[10px] font-medium uppercase tracking-widest text-gold/70">
          {ar.texasPanelReference}
        </p>
      </header>

      {hasDaily && panel.daily_movement && (
        <PanelBlock title={ar.texasPanelDailyMovement}>
          <Row label={ar.tebat} value={panel.daily_movement.tebat} />
          <Row label={ar.suhoubat} value={panel.daily_movement.suhoubat} />
          <Row label={ar.alFarq} value={panel.daily_movement.al_farq} emphasis />
          <Row label={ar.alHarq} value={panel.daily_movement.al_harq} />
        </PanelBlock>
      )}

      {hasTxn && panel.transaction_cumulative && (
        <PanelBlock title={ar.texasPanelTransactionCumulative}>
          <Row
            label={ar.texasPanelTxnDeposits}
            value={panel.transaction_cumulative.deposits}
          />
          <Row
            label={ar.texasPanelTxnWithdrawals}
            value={panel.transaction_cumulative.withdrawals}
          />
        </PanelBlock>
      )}

      {hasGeneral && panel.dashboard_general && (
        <PanelBlock title={ar.texasPanelGeneralReport}>
          <Row
            label={ar.texasPanelGeneralDeposits}
            value={panel.dashboard_general.deposits}
          />
          <Row
            label={ar.texasPanelGeneralWithdrawal}
            value={panel.dashboard_general.withdrawal}
          />
          <Row
            label={ar.texasPanelDashboardNgr}
            value={panel.dashboard_general.ngr}
            emphasis
          />
          {panel.dashboard_general.commission !== undefined &&
            panel.dashboard_general.commission !== 0 && (
              <Row
                label={ar.texasPanelCommission}
                value={panel.dashboard_general.commission}
              />
            )}
        </PanelBlock>
      )}
    </motion.section>
  );
}

function PanelBlock({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="border-b border-white/[0.04] last:border-b-0">
      <p className="px-4 pt-3 text-[10px] text-steel-500">{title}</p>
      <table className="w-full text-sm">{children}</table>
    </div>
  );
}

function Row({
  label,
  value,
  emphasis,
}: {
  label: string;
  value: number;
  emphasis?: boolean;
}) {
  return (
    <tbody>
      <tr className="border-b border-white/[0.04]">
        <td className="px-4 py-2 text-steel-400">{label}</td>
        <td
          className={`px-4 py-2 text-left font-mono tabular-nums ${
            emphasis ? "text-gold/90" : "text-foreground"
          }`}
        >
          {formatMoney(value)}
        </td>
      </tr>
    </tbody>
  );
}
