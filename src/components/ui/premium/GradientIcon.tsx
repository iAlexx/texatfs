"use client";

import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils/cn";

export function GradientIcon({
  icon: Icon,
  variant = "blue",
  className,
}: {
  icon: LucideIcon;
  variant?: "blue" | "purple" | "pink" | "green";
  className?: string;
}) {
  const bg =
    variant === "purple"
      ? "from-violet-600/40 to-blue-600/30"
      : variant === "pink"
        ? "from-pink-600/40 to-violet-600/30"
        : variant === "green"
          ? "from-emerald-600/40 to-teal-600/30"
          : "from-blue-600/40 to-violet-600/30";

  return (
    <div
      className={cn(
        "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ring-1 ring-white/10",
        bg,
        className
      )}
    >
      <Icon className="h-5 w-5 text-white/90" strokeWidth={1.75} />
    </div>
  );
}
