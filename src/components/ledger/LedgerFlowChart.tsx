"use client";

import { motion } from "framer-motion";
import {
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ar } from "@/lib/i18n/ar";
import type { DailyLedger } from "@/lib/supabase/database.types";

const COLORS = ["#c9a227", "#7d8b9a", "#c45c5c"];

export function LedgerFlowChart({ ledger }: { ledger: DailyLedger }) {
  const data = [
    { name: ar.chartDeposits, value: Math.abs(ledger.tebat) },
    { name: ar.chartWithdrawals, value: Math.abs(ledger.suhoubat) },
    { name: ar.chartBurn, value: Math.abs(ledger.al_harq) },
  ];

  return (
    <motion.section
      className="glass-panel mb-4 p-4"
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      transition={{ delay: 0.2, duration: 0.4 }}
    >
      <p className="mb-3 text-xs font-medium text-steel-500">توزيع الحركة</p>
      <div className="h-36 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
            <XAxis
              dataKey="name"
              tick={{ fill: "#7d8b9a", fontSize: 10 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fill: "#5c6b7a", fontSize: 9 }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              contentStyle={{
                background: "rgba(10,10,12,0.92)",
                border: "1px solid rgba(201,162,39,0.25)",
                borderRadius: 8,
                fontSize: 12,
              }}
              cursor={{ fill: "rgba(201,162,39,0.08)" }}
            />
            <Bar dataKey="value" radius={[6, 6, 0, 0]} animationDuration={800}>
              {data.map((_, i) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </motion.section>
  );
}
