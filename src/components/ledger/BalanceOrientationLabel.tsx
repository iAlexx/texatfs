"use client";

import { cn } from "@/lib/utils/cn";
import { formatMoney } from "@/lib/utils/format";
import { orientBalance } from "@/lib/accounting/balance-orientation";

interface BalanceOrientationLabelProps {
  value: number;
  /** Show formatted amount before the label (default true). */
  showAmount?: boolean;
  className?: string;
  amountClassName?: string;
  /** Larger typography for hero/final rows. */
  size?: "sm" | "md" | "lg";
}

export function BalanceOrientationLabel({
  value,
  showAmount = true,
  className,
  amountClassName,
  size = "md",
}: BalanceOrientationLabelProps) {
  const oriented = orientBalance(value);
  const isCredit = oriented.orientation === "credit";

  return (
    <span
      className={cn(
        "inline-flex flex-wrap items-center justify-end gap-1.5 font-mono tabular-nums",
        size === "lg" && "text-xl md:text-2xl",
        size === "md" && "text-base",
        size === "sm" && "text-xs",
        className
      )}
    >
      {showAmount ? (
        <span className={cn("text-foreground", amountClassName)}>
          {formatMoney(oriented.signedAmount)}
        </span>
      ) : null}
      <span
        className={cn(
          "rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wide",
          isCredit
            ? "bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/30"
            : "bg-rose-500/15 text-rose-400 ring-1 ring-rose-500/30"
        )}
      >
        {oriented.labelAr}
      </span>
    </span>
  );
}
