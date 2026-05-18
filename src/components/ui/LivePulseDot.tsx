"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils/cn";

export function LivePulseDot({ live }: { live: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[10px] text-steel-500">
      <span className="relative flex h-2 w-2">
        {live && (
          <motion.span
            className="absolute inline-flex h-full w-full rounded-full bg-lime opacity-75"
            animate={{ scale: [1, 1.8, 1], opacity: [0.7, 0, 0.7] }}
            transition={{ repeat: Infinity, duration: 1.6 }}
          />
        )}
        <span
          className={cn(
            "relative inline-flex h-2 w-2 rounded-full",
            live ? "bg-lime" : "bg-steel-600"
          )}
        />
      </span>
      {live ? "متصل" : "غير متزامن"}
    </span>
  );
}
