"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { TmaBottomNav } from "@/components/tma/TmaBottomNav";
import { OnboardingGuide } from "@/components/tma/OnboardingGuide";

const slide = {
  initial: { opacity: 0, x: 24 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -24 },
};

export function TmaShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <motion.div className="executive-bg min-h-screen pb-28">
      <OnboardingGuide />
      <AnimatePresence mode="wait">
        <motion.main
          key={pathname}
          className="mx-auto max-w-md"
          {...slide}
          transition={{ type: "spring", stiffness: 280, damping: 28 }}
        >
          {children}
        </motion.main>
      </AnimatePresence>
      <TmaBottomNav />
    </motion.div>
  );
}
