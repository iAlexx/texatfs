"use client";

import { cn } from "@/lib/utils/cn";

export function MetricGrid({
  items,
}: {
  items: Array<{
    label: string;
    value: string;
    tone?: "default" | "positive" | "negative" | "amber" | "sky";
  }>;
}) {
  return (
    <div className="grid grid-cols-2 gap-2.5">
      {items.map((item) => (
        <div
          key={item.label}
          className="rounded-2xl border border-white/[0.06] bg-[#141824]/80 p-3 backdrop-blur-md"
        >
          <p className="text-[10px] text-steel-500">{item.label}</p>
          <p
            className={cn(
              "mt-1 font-mono text-sm font-semibold tabular-nums",
              item.tone === "positive"
                ? "text-emerald-400"
                : item.tone === "negative"
                  ? "text-red-400"
                  : item.tone === "amber"
                    ? "text-amber-400"
                    : item.tone === "sky"
                      ? "text-sky-400"
                      : "text-steel-100"
            )}
          >
            {item.value}
          </p>
        </div>
      ))}
    </div>
  );
}
