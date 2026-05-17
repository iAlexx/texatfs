import { cn } from "@/lib/utils/cn";
import { formatMoney } from "@/lib/utils/format";

interface LedgerRowProps {
  labelAr: string;
  labelEn: string;
  value: number;
  variant?: "default" | "emphasis" | "final";
  signed?: boolean;
}

export function LedgerRow({
  labelAr,
  labelEn,
  value,
  variant = "default",
  signed = true,
}: LedgerRowProps) {
  const isNegative = signed && value < 0;

  return (
    <div
      className={cn(
        "grid grid-cols-[1fr_auto] items-center gap-4 border-b border-steel-border/60 px-4 py-3 last:border-b-0",
        variant === "final" && "bg-navy-700/50"
      )}
    >
      <RowLabels labelAr={labelAr} labelEn={labelEn} />
      <span
        className={cn(
          "value-metallic text-right text-base",
          variant === "final" && "text-xl font-medium",
          variant === "emphasis" && "text-accent-highlight",
          isNegative && "text-accent-negative",
          !isNegative &&
            signed &&
            value > 0 &&
            variant === "default" &&
            "text-accent-positive"
        )}
      >
        {formatMoney(value)}
      </span>
    </div>
  );
}

function RowLabels({ labelAr, labelEn }: { labelAr: string; labelEn: string }) {
  return (
    <div>
      <p className="label-ar font-medium leading-tight text-steel-400">{labelAr}</p>
      <p className="text-xs uppercase tracking-wider text-steel-600">{labelEn}</p>
    </div>
  );
}
