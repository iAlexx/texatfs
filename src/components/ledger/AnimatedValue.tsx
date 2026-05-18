"use client";

import { useEffect } from "react";
import { motion, useSpring, useTransform } from "framer-motion";
import { formatMoney } from "@/lib/utils/format";

export function AnimatedValue({
  value,
  className,
  currency = "NSP",
}: {
  value: number;
  className?: string;
  currency?: string;
}) {
  const spring = useSpring(0, { stiffness: 90, damping: 22 });
  const display = useTransform(spring, (v) => formatMoney(v, currency));

  useEffect(() => {
    spring.set(value);
  }, [value, spring]);

  return <motion.span className={className}>{display}</motion.span>;
}
