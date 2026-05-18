import { roundMoney } from "@/lib/accounting/formulas";

export interface ReconciliationResult {
  balanced: boolean;
  texasSide: number;
  waselSide: number;
  difference: number;
  leakHint: string | null;
}

/** Compare texas movement (tebat+suhoubat) vs wasel totals */
export function reconcileLedger(parts: {
  tebat: number;
  suhoubat: number;
  wasel_menho: number;
  wasel_eleih: number;
}): ReconciliationResult {
  const texasSide = roundMoney(parts.tebat + parts.suhoubat);
  const waselSide = roundMoney(parts.wasel_menho + parts.wasel_eleih);
  const difference = roundMoney(texasSide - waselSide);
  const balanced = Math.abs(difference) < 0.01;

  let leakHint: string | null = null;
  if (!balanced) {
    if (difference > 0) {
      leakHint = "حركة تكساس أعلى من واصل — راجع إيداعات/سحوبات غير مسجّلة في واتساب";
    } else {
      leakHint = "واصل أعلى من تكساس — راجع رسائل واتساب غير مطابقة للحركة";
    }
  }

  return { balanced, texasSide, waselSide, difference, leakHint };
}
