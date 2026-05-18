import { roundMoney } from "@/lib/accounting/formulas";

export interface InsightInput {
  tebat: number;
  suhoubat: number;
  al_harq: number;
  al_nihai: number;
  avgHarq7?: number | null;
  avgSuhoubat7?: number | null;
}

/** Heuristic Arabic insight — no external LLM required */
export function generateArabicInsight(input: InsightInput): string {
  const { tebat, suhoubat, al_harq, al_nihai, avgHarq7, avgSuhoubat7 } = input;

  if (al_nihai < 0) {
    return "تنبيه: رصيدك النهائي سالب اليوم — راجع السحوبات والواصل فوراً.";
  }

  if (avgSuhoubat7 != null && avgSuhoubat7 > 0 && suhoubat > avgSuhoubat7 * 1.3) {
    const pct = Math.round(((suhoubat - avgSuhoubat7) / avgSuhoubat7) * 100);
    return `تنبيه: سحوباتك اليوم أعلى من المعتاد بنسبة ${pct}% — تابع الحركة عن كثب.`;
  }

  if (avgHarq7 != null && avgHarq7 > 0 && al_harq > avgHarq7 * 1.8) {
    return "تنبيه: حرق اليوم مرتفع جداً مقارنة بمتوسط الأسبوع — يُنصح بمراجعة الشبكة.";
  }

  if (tebat > suhoubat * 1.5 && al_nihai > 0) {
    return "أداؤك اليوم إيجابي — الإيداعات تتفوق على السحوبات، استمر!";
  }

  if (Math.abs(al_harq) < (avgHarq7 ?? al_harq) * 0.15 && al_nihai >= 0) {
    return "أداؤك اليوم مستقر جداً، استمر على هذا المنوال.";
  }

  if (suhoubat > tebat) {
    return "حركة اليوم تميل للسحب — راقب الرصيد النهائي خلال الساعات القادمة.";
  }

  return `ملخص اليوم: حرق ${roundMoney(al_harq)} | نهائي ${roundMoney(al_nihai)} — الأداء ضمن النطاق الطبيعي.`;
}
