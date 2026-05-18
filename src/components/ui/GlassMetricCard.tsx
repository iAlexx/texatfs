"use client";

import { motion } from "framer-motion";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

export function GlassMetricCard({
  label,
  value,
  icon,
  variant = "gold",
  pulse,
  className,
}: {
  label: string;
  value: ReactNode;
  icon?: ReactNode;
  variant?: "gold" | "lime" | "muted";
  pulse?: boolean;
  className?: string;
}) {
  return (
    <motion.div
      className={cn(
        "glass-inner relative overflow-hidden rounded-2xl border border-gold/20 px-4 py-3",
        className
      )}
      whileHover={{ scale: 1.01 }}
      transition={{ type: "spring", stiffness: 400, damping: 28 }}
    >
      {pulse && (
        <span className="absolute inset-0 animate-pulse rounded-2xl bg-gold/5" />
      )}
      <div className="relative flex items-center justify-between gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-steel-500">
            {label}
          </p>
          <p
            className={cn(
              "mt-1 font-mono text-sm font-semibold tabular-nums",
              variant === "gold" && "text-gold",
              variant === "lime" && "text-lime",
              variant === "muted" && "text-steel-400"
            )}
          >
            {value}
          </p>
        </div>
        {icon ? <span className="text-gold/70">{icon}</span> : null}
      </div>
    </motion.div>
  );
}
