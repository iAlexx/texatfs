"use client";

import { motion } from "framer-motion";

export function CircularProgress({
  percent,
  label,
  sublabel,
}: {
  percent: number;
  label: string;
  sublabel?: string;
}) {
  const r = 42;
  const c = 2 * Math.PI * r;
  const offset = c - (Math.min(100, Math.max(0, percent)) / 100) * c;

  return (
    <div className="flex flex-col items-center">
      <svg width="100" height="100" className="-rotate-90">
        <circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
          stroke="rgba(255,255,255,0.06)"
          strokeWidth="8"
        />
        <motion.circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
          stroke="#D4AF37"
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 1, ease: "easeOut" }}
        />
      </svg>
      <div className="-mt-[72px] flex h-[72px] w-[72px] flex-col items-center justify-center">
        <span className="text-lg font-bold text-gold">{Math.round(percent)}%</span>
        <span className="text-[9px] text-steel-500">{label}</span>
      </div>
      {sublabel && (
        <p className="mt-2 text-center text-xs text-steel-500">{sublabel}</p>
      )}
    </div>
  );
}
