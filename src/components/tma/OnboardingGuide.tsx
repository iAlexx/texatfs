"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, X } from "lucide-react";
import { Button } from "@/components/ui/button";

const STORAGE_KEY = "tma_onboarding_v1_done";

const steps = [
  {
    title: "مرحباً في تكساس فاندز",
    body: "منصتك المالية لإدارة السجل اليومي وشبكة الوكلاء من مكان واحد.",
  },
  {
    title: "الصفحة الرئيسية",
    body: "تابع اشتراكك وتقييم أدائك وآخر إعلانات المنصة.",
  },
  {
    title: "سجل المحاسبة",
    body: "عرض تفصيلي للحركة المالية، البحث عن الوكلاء، وتصدير التقارير إلى تيليغرام.",
  },
  {
    title: "حسابك",
    body: "رتبتك، تاريخ الاشتراك، وتفعيل مفاتيح الترخيص الجديدة.",
  },
] as const;

export function OnboardingGuide() {
  const [open, setOpen] = useState(() => {
    if (typeof window === "undefined") return false;
    return !localStorage.getItem(STORAGE_KEY);
  });
  const [step, setStep] = useState(0);

  function finish() {
    localStorage.setItem(STORAGE_KEY, "1");
    setOpen(false);
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[100] flex items-end justify-center bg-black/70 p-4 backdrop-blur-md"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            className="glass-hero w-full max-w-md rounded-3xl p-6"
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
          >
            <div className="mb-4 flex items-start justify-between">
              <p className="text-xs text-gold/70">
                {step + 1} / {steps.length}
              </p>
              <button type="button" onClick={finish} className="text-steel-500">
                <X className="h-5 w-5" />
              </button>
            </div>
            <h2 className="text-xl font-bold text-foreground">
              {steps[step]?.title}
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-steel-400">
              {steps[step]?.body}
            </p>
            <div className="mt-6 flex gap-2">
              {step < steps.length - 1 ? (
                <Button
                  variant="gold"
                  className="flex-1"
                  onClick={() => setStep((s) => s + 1)}
                >
                  التالي
                  <ChevronLeft className="h-4 w-4" />
                </Button>
              ) : (
                <Button variant="gold" className="flex-1" onClick={finish}>
                  ابدأ الآن
                </Button>
              )}
              {step > 0 && (
                <Button variant="outline" onClick={() => setStep((s) => s - 1)}>
                  رجوع
                </Button>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
