import { ar } from "@/lib/i18n/ar";
import { reconcileLedger } from "@/lib/finance/reconciliation";
import { resolvePerformanceSummary } from "@/lib/i18n/performance";
import { formatLedgerDate, formatMoney } from "@/lib/utils/format";
import type { ReportRenderData } from "@/lib/report/types";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function gridCell(label: string, value: string, opts?: { hero?: boolean }): string {
  return `
    <div class="grid-cell ${opts?.hero ? "grid-cell-hero" : ""}">
      <span class="cell-label">${escapeHtml(label)}</span>
      <span class="cell-value">${escapeHtml(value)}</span>
    </div>`;
}

export function renderReportHtml(data: ReportRenderData): string {
  const { ledger, user } = data;
  const displayName =
    user.display_name ?? user.texas_username ?? ar.brandEn;
  const dateLabel = formatLedgerDate(ledger.ledger_date);
  const performance = resolvePerformanceSummary({
    al_harq: ledger.al_harq,
    al_nihai: ledger.al_nihai,
    discrepancy_flag: ledger.discrepancy_flag,
    tebat: ledger.tebat,
  });
  const statusAr =
    ledger.status === "open" ? ar.statusOpen : ar.statusClosed;
  const reconciliation = reconcileLedger({
    tebat: ledger.tebat,
    suhoubat: ledger.suhoubat,
    wasel_menho: ledger.wasel_menho,
    wasel_eleih: ledger.wasel_eleih,
  });
  const reconciliationLabel = reconciliation.balanced
    ? ar.balanced
    : ar.unbalanced;

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=480, initial-scale=1" />
  <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800&display=swap" rel="stylesheet" />
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: "Cairo", sans-serif;
      background: #050506;
      color: #e8ecf1;
      min-height: 100vh;
      display: flex;
      justify-content: center;
      padding: 28px 16px;
    }
    .frame {
      width: 440px;
      position: relative;
      border-radius: 20px;
      overflow: hidden;
      border: 1px solid rgba(201,162,39,0.28);
      box-shadow: 0 0 80px rgba(201,162,39,0.15), 0 24px 64px rgba(0,0,0,0.7);
    }
    .watermark {
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 72px;
      font-weight: 800;
      letter-spacing: 0.08em;
      color: rgba(201,162,39,0.04);
      transform: rotate(-18deg);
      pointer-events: none;
      user-select: none;
    }
    .inner {
      position: relative;
      z-index: 1;
      background: linear-gradient(165deg, rgba(28,32,40,0.95) 0%, rgba(8,8,10,0.98) 50%, rgba(20,16,10,0.96) 100%);
      backdrop-filter: blur(12px);
    }
    .header {
      padding: 24px 22px 18px;
      border-bottom: 1px solid rgba(255,255,255,0.06);
    }
    .brand-row {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
    }
    .brand {
      font-size: 11px;
      letter-spacing: 0.28em;
      color: #c9a227;
      font-weight: 700;
    }
    .badge {
      font-size: 10px;
      padding: 4px 10px;
      border-radius: 6px;
      border: 1px solid rgba(61,154,111,0.45);
      color: #3d9a6f;
    }
    .title { font-size: 22px; font-weight: 700; margin-top: 8px; color: #f0f2f5; }
    .date { font-size: 13px; color: #7d8b9a; margin-top: 4px; }
    .user { font-size: 12px; color: #9aa8b8; margin-top: 10px; }
    .performance {
      margin: 16px 18px 0;
      padding: 12px 14px;
      border-radius: 12px;
      background: rgba(201,162,39,0.08);
      border: 1px solid rgba(201,162,39,0.22);
      font-size: 13px;
      font-weight: 600;
      color: #e8d48a;
      text-align: center;
    }
    .reconcile {
      margin: 10px 18px 0;
      padding: 10px 12px;
      border-radius: 10px;
      font-size: 12px;
      font-weight: 700;
      text-align: center;
    }
    .reconcile-ok {
      background: rgba(184,255,60,0.1);
      border: 1px solid rgba(184,255,60,0.35);
      color: #b8ff3c;
    }
    .reconcile-bad {
      background: rgba(196,92,92,0.12);
      border: 1px solid rgba(196,92,92,0.4);
      color: #e8a0a0;
    }
    .hero-balance {
      margin: 20px 18px;
      padding: 28px 20px;
      border-radius: 16px;
      text-align: center;
      background: linear-gradient(145deg, #1a1a1e 0%, #08080a 40%, #16120c 100%);
      border: 1px solid rgba(201,162,39,0.4);
      box-shadow: 0 0 60px rgba(201,162,39,0.25), inset 0 1px 0 rgba(255,255,255,0.1);
    }
    .hero-label { font-size: 12px; color: #9aa8b8; margin-bottom: 8px; }
    .hero-value {
      font-size: 42px;
      font-weight: 800;
      line-height: 1.1;
      color: #f0d878;
      text-shadow: 0 0 32px rgba(201,162,39,0.65), 0 2px 0 rgba(0,0,0,0.8);
    }
    .grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
      padding: 0 18px 20px;
    }
    .grid-cell {
      padding: 14px 12px;
      border-radius: 12px;
      background: rgba(255,255,255,0.03);
      border: 1px solid rgba(255,255,255,0.06);
    }
    .grid-cell-hero { grid-column: 1 / -1; }
    .cell-label { display: block; font-size: 11px; color: #7d8b9a; margin-bottom: 6px; }
    .cell-value {
      display: block;
      font-size: 15px;
      font-weight: 700;
      font-variant-numeric: tabular-nums;
      color: #e8ecf1;
      direction: ltr;
      text-align: left;
    }
    .grid-cell-hero .cell-value { font-size: 18px; color: #c9a227; }
    .alert {
      margin: 0 18px 16px;
      padding: 10px 12px;
      border-radius: 10px;
      border: 1px solid rgba(196,92,92,0.45);
      background: rgba(196,92,92,0.12);
      color: #e8a0a0;
      font-size: 12px;
    }
    .footer {
      padding: 14px;
      text-align: center;
      font-size: 10px;
      color: #5c6b7a;
      border-top: 1px solid rgba(255,255,255,0.05);
    }
  </style>
</head>
<body>
  <article class="frame" data-report-root data-report-ready="true">
    <div class="watermark">TEXAS FUNDS</div>
    <div class="inner">
      <header class="header">
        <div class="brand-row">
          <span class="brand">TEXAS FUNDS</span>
          <span class="badge">${escapeHtml(statusAr)}</span>
        </div>
        <h1 class="title">${escapeHtml(ar.dailyLedger)}</h1>
        <p class="date">${escapeHtml(dateLabel)}</p>
        <p class="user">${escapeHtml(displayName)}</p>
      </header>
      <p class="performance">${escapeHtml(performance)}</p>
      <p class="reconcile ${reconciliation.balanced ? "reconcile-ok" : "reconcile-bad"}">${escapeHtml(reconciliationLabel)}</p>
      ${
        ledger.discrepancy_flag
          ? `<p class="alert">${escapeHtml(ar.discrepancyAlert)}</p>`
          : ""
      }
      <section class="hero-balance">
        <p class="hero-label">${escapeHtml(ar.finalBalance)}</p>
        <p class="hero-value">${escapeHtml(formatMoney(ledger.al_nihai))}</p>
        <p class="hero-label" style="margin-top:14px">${escapeHtml(ar.alHarq)}</p>
        <p class="hero-value" style="font-size:28px;color:#c45c5c">${escapeHtml(formatMoney(ledger.al_harq))}</p>
      </section>
      <section class="grid">
        ${gridCell(ar.tebat, formatMoney(ledger.tebat))}
        ${gridCell(ar.suhoubat, formatMoney(ledger.suhoubat))}
        ${gridCell(ar.alFarq, formatMoney(ledger.al_farq))}
        ${gridCell(ar.alHarq, formatMoney(ledger.al_harq))}
        ${gridCell(ar.waselMenho, formatMoney(ledger.wasel_menho))}
        ${gridCell(ar.waselEleih, formatMoney(ledger.wasel_eleih))}
        ${gridCell(ar.baqiQadim, formatMoney(ledger.baqi_qadim))}
      </section>
      <footer class="footer">${escapeHtml(ar.dailySummary)} · TEXAS FUNDS calculate</footer>
    </div>
  </article>
</body>
</html>`;
}
