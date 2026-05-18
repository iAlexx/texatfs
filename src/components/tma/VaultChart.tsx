"use client";

import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatMoney } from "@/lib/utils/format";
import { ar } from "@/lib/i18n/ar";

export function VaultChart({
  series,
  days7,
  days30,
}: {
  series: { date: string; cumulative_net: number }[];
  days7: number;
  days30: number;
}) {
  const data = series.map((p) => ({
    date: p.date.slice(5),
    value: p.cumulative_net,
  }));

  return (
    <section className="glass-inner mt-4 rounded-2xl border border-gold/15 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gold">{ar.vaultTitle}</h3>
        <div className="flex gap-3 text-[10px]">
          <span className="text-steel-500">
            7د:{" "}
            <span className={days7 >= 0 ? "text-lime" : "text-accent-negative"}>
              {formatMoney(days7)}
            </span>
          </span>
          <span className="text-steel-500">
            30د:{" "}
            <span className={days30 >= 0 ? "text-lime" : "text-accent-negative"}>
              {formatMoney(days30)}
            </span>
          </span>
        </div>
      </div>
      <div className="h-36 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data}>
            <defs>
              <linearGradient id="vaultGold" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#D4AF37" stopOpacity={0.45} />
                <stop offset="100%" stopColor="#D4AF37" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="date" tick={{ fontSize: 9, fill: "#7d8b9a" }} />
            <YAxis hide />
            <Tooltip
              contentStyle={{
                background: "#0D0D0D",
                border: "1px solid rgba(212,175,55,0.3)",
                borderRadius: 8,
                fontSize: 11,
              }}
              formatter={(v) => formatMoney(Number(v))}
            />
            <Area
              type="monotone"
              dataKey="value"
              stroke="#D4AF37"
              strokeWidth={2}
              fill="url(#vaultGold)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
