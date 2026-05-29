"use client";

import { cn } from "@/lib/utils/cn";

export function StatusPill({
  label,
  tone = "neutral",
}: {
  label: string;
  tone?: "success" | "warning" | "danger" | "info" | "neutral";
}) {
  const toneClass =
    tone === "success"
      ? "bg-emerald-500/15 text-emerald-400 ring-emerald-500/30"
      : tone === "warning"
        ? "bg-amber-500/15 text-amber-400 ring-amber-500/30"
        : tone === "danger"
          ? "bg-red-500/15 text-red-400 ring-red-500/30"
          : tone === "info"
            ? "bg-blue-500/15 text-blue-400 ring-blue-500/30"
            : "bg-white/5 text-steel-400 ring-white/10";

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-medium ring-1",
        toneClass
      )}
    >
      {label}
    </span>
  );
}
