import { ar } from "@/lib/i18n/ar";

export interface PerformanceInput {
  al_harq: number;
  al_nihai: number;
  discrepancy_flag: boolean;
  tebat?: number;
}

const HIGH_BURN_THRESHOLD = 5000;

/** ملخص أداء قصير للتقرير والواجهة. */
export function resolvePerformanceSummary(input: PerformanceInput): string {
  if (input.discrepancy_flag) {
    return ar.performanceDiscrepancy;
  }
  if (input.al_harq >= HIGH_BURN_THRESHOLD) {
    return ar.performanceHighBurn;
  }
  if (input.al_nihai > 0 && input.tebat !== undefined && input.tebat > 0) {
    return ar.performancePositive;
  }
  return ar.performanceStable;
}
