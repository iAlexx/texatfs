"use client";

import { motion } from "framer-motion";
import { ar } from "@/lib/i18n/ar";

export function SubscriptionExpiredOverlay({
  subscriptionEndDate,
}: {
  subscriptionEndDate?: string | null;
}) {
  const formatted = subscriptionEndDate
    ? new Date(subscriptionEndDate).toLocaleDateString("ar-SY", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : null;

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/95 px-6 backdrop-blur-md"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      <motion.div
        className="glass-panel-gold max-w-sm p-6 text-center"
        initial={{ scale: 0.92, y: 12 }}
        animate={{ scale: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 200, damping: 22 }}
      >
        <p className="text-xs uppercase tracking-widest text-gold/80">
          {ar.brandEn}
        </p>
        <h2 className="mt-2 text-xl font-semibold text-accent-negative">
          {ar.subscriptionExpiredTitle}
        </h2>
        <p className="mt-3 text-sm text-steel-400" dir="rtl">
          {ar.subscriptionExpiredBody}
        </p>
        {formatted && (
          <p className="mt-2 font-mono text-xs text-steel-600">
            انتهى في: {formatted}
          </p>
        )}
        <p className="mt-4 text-xs text-steel-600">{ar.subscriptionExpiredHint}</p>
      </motion.div>
    </motion.div>
  );
}
