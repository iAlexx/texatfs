import { jsPDF } from "jspdf";
import type { DailyLedger } from "@/lib/supabase/database.types";
import { formatMoney } from "@/lib/utils/format";

export function buildLedgerStatementPdf(
  ledger: DailyLedger,
  userName: string
): Buffer {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const w = doc.internal.pageSize.getWidth();

  doc.setFillColor(13, 13, 13);
  doc.rect(0, 0, w, 40, "F");
  doc.setTextColor(212, 175, 55);
  doc.setFontSize(18);
  doc.text("TEXAS FUNDS", w / 2, 16, { align: "center" });
  doc.setFontSize(11);
  doc.setTextColor(200, 200, 200);
  doc.text("كشف حساب يومي رسمي", w / 2, 26, { align: "center" });
  doc.setFontSize(9);
  doc.text(userName, w / 2, 34, { align: "center" });

  let y = 50;
  doc.setTextColor(30, 30, 30);
  doc.setFontSize(10);
  doc.text(`التاريخ: ${ledger.ledger_date}`, 14, y);
  y += 10;

  const rows: [string, string][] = [
    ["تبات", formatMoney(ledger.tebat)],
    ["سحوبات", formatMoney(ledger.suhoubat)],
    ["الفرق", formatMoney(ledger.al_farq)],
    ["الحرق", formatMoney(ledger.al_harq)],
    ["واصل منه", formatMoney(ledger.wasel_menho)],
    ["واصل إليه", formatMoney(ledger.wasel_eleih)],
    ["باقي قديم", formatMoney(ledger.baqi_qadim)],
    ["النهائي", formatMoney(ledger.al_nihai)],
  ];

  doc.setFillColor(245, 245, 245);
  doc.rect(14, y, w - 28, 8, "F");
  doc.setFontSize(9);
  doc.setTextColor(100, 100, 100);
  doc.text("البند", 18, y + 5.5);
  doc.text("المبلغ", w - 18, y + 5.5, { align: "right" });
  y += 10;

  for (const [label, value] of rows) {
    doc.setTextColor(40, 40, 40);
    doc.text(label, 18, y);
    doc.setTextColor(212, 175, 55);
    doc.text(value, w - 18, y, { align: "right" });
    y += 7;
    doc.setDrawColor(230, 230, 230);
    doc.line(14, y - 2, w - 14, y - 2);
  }

  y += 8;
  doc.setFontSize(8);
  doc.setTextColor(120, 120, 120);
  doc.text("TEXAS FUNDS — Official Statement", w / 2, y, { align: "center" });

  const arrayBuffer = doc.output("arraybuffer");
  return Buffer.from(arrayBuffer);
}
