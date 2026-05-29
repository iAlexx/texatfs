"use client";

import { motion } from "framer-motion";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

export function PremiumCard({
  children,
  className,
  onClick,
  glow = "blue",
}: {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
  glow?: "blue" | "purple" | "pink" | "green" | "none";
}) {
  const glowClass =
    glow === "purple"
      ? "shadow-[0_0_32px_rgba(139,92,246,0.12)]"
      : glow === "pink"
        ? "shadow-[0_0_32px_rgba(236,72,153,0.1)]"
        : glow === "green"
          ? "shadow-[0_0_32px_rgba(34,197,94,0.12)]"
          : glow === "blue"
            ? "shadow-[0_0_32px_rgba(59,130,246,0.12)]"
            : "";

  const Comp = onClick ? motion.button : motion.div;

  return (
    <Comp
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={cn(
        "fintech-glass relative overflow-hidden rounded-2xl border border-white/[0.08] p-4 text-right backdrop-blur-xl",
        glowClass,
        onClick && "min-h-[44px] transition-transform active:scale-[0.98]",
        className
      )}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      whileTap={onClick ? { scale: 0.98 } : undefined}
    >
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/[0.04] via-transparent to-transparent" />
      <div className="relative z-10">{children}</div>
    </Comp>
  );
}
