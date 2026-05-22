import { formatMoney } from "@/lib/utils/format";

export interface TelegramReportData {
  ownerName: string;
  agentLabel: string;    // Sub-agent username / email
  ledgerDate: string;
  texasBalance: number;
  totalDeposit: number;
  totalWithdraw: number;
  ngr: number;
  cashIn: number;
  cashOut: number;
  finalBalance: number;
  generatedAt: string;
}

function esc(s: string | number): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function cell(label: string, value: string, accent?: string): string {
  const colorStyle = accent ? `color:${accent};` : "";
  return `
  <div class="cell">
    <span class="cell-label">${esc(label)}</span>
    <span class="cell-value" style="${colorStyle}">${esc(value)}</span>
  </div>`;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("ar-SY", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      timeZone: "Asia/Damascus",
    });
  } catch {
    return iso;
  }
}

export function renderTelegramReportHtml(data: TelegramReportData): string {
  const dateLabel = formatDate(data.ledgerDate);
  const cashNet = data.cashIn - data.cashOut;
  const cashNetLabel = cashNet >= 0 ? `+${formatMoney(cashNet)}` : formatMoney(cashNet);
  const cashNetColor = cashNet >= 0 ? "#b8ff3c" : "#e8a0a0";
  const finalColor = data.finalBalance >= 0 ? "#f0d878" : "#e8a0a0";

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=480,initial-scale=1"/>
<link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800&display=swap" rel="stylesheet"/>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{
  font-family:"Cairo",sans-serif;
  background:#050506;
  color:#e8ecf1;
  display:flex;
  justify-content:center;
  padding:24px 14px;
}
.frame{
  width:440px;
  border-radius:20px;
  overflow:hidden;
  border:1px solid rgba(201,162,39,.28);
  box-shadow:0 0 80px rgba(201,162,39,.15),0 24px 64px rgba(0,0,0,.7);
  position:relative;
}
.wm{
  position:absolute;inset:0;
  display:flex;align-items:center;justify-content:center;
  font-size:68px;font-weight:800;letter-spacing:.08em;
  color:rgba(201,162,39,.04);transform:rotate(-18deg);
  pointer-events:none;user-select:none;
}
.inner{
  position:relative;z-index:1;
  background:linear-gradient(165deg,rgba(28,32,40,.95) 0%,rgba(8,8,10,.98) 50%,rgba(20,16,10,.96) 100%);
}
.hdr{padding:22px 20px 16px;border-bottom:1px solid rgba(255,255,255,.06)}
.brand-row{display:flex;justify-content:space-between;align-items:flex-start}
.brand{font-size:11px;letter-spacing:.28em;color:#c9a227;font-weight:700}
.tg-badge{
  font-size:10px;padding:3px 9px;border-radius:6px;
  border:1px solid rgba(38,155,255,.45);color:#279eff;
}
.title{font-size:21px;font-weight:700;margin-top:7px;color:#f0f2f5}
.date{font-size:12px;color:#7d8b9a;margin-top:3px}
.owner{font-size:12px;color:#9aa8b8;margin-top:4px}
.agent{font-size:13px;color:#c9a227;font-weight:600;margin-top:4px}

.hero{
  margin:18px 18px 0;padding:24px 18px;border-radius:16px;text-align:center;
  background:linear-gradient(145deg,#1a1a1e 0%,#08080a 40%,#16120c 100%);
  border:1px solid rgba(201,162,39,.4);
  box-shadow:0 0 60px rgba(201,162,39,.25),inset 0 1px 0 rgba(255,255,255,.1);
}
.hero-label{font-size:11px;color:#9aa8b8;margin-bottom:6px}
.hero-value{
  font-size:40px;font-weight:800;line-height:1.1;
  text-shadow:0 0 32px rgba(201,162,39,.65),0 2px 0 rgba(0,0,0,.8);
}

.section-title{
  font-size:10px;letter-spacing:.2em;color:#c9a227;font-weight:700;
  padding:12px 20px 4px;text-transform:uppercase;
}
.divider{height:1px;background:linear-gradient(to right,transparent,rgba(201,162,39,.2),transparent);margin:0 18px}

.grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;padding:10px 18px 16px}
.cell{
  padding:12px 10px;border-radius:11px;
  background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.06);
}
.cell-label{display:block;font-size:10px;color:#7d8b9a;margin-bottom:5px}
.cell-value{
  display:block;font-size:14px;font-weight:700;
  font-variant-numeric:tabular-nums;direction:ltr;text-align:left;color:#e8ecf1;
}

.cash-section{
  margin:4px 18px 16px;padding:14px;border-radius:13px;
  background:rgba(184,255,60,.06);border:1px solid rgba(184,255,60,.2);
}
.cash-title{font-size:10px;color:#b8ff3c;font-weight:700;letter-spacing:.15em;margin-bottom:10px}
.cash-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.cash-in{padding:10px;border-radius:9px;background:rgba(184,255,60,.08);border:1px solid rgba(184,255,60,.3);}
.cash-out{padding:10px;border-radius:9px;background:rgba(196,92,92,.08);border:1px solid rgba(196,92,92,.3);}
.cash-label{font-size:9px;color:#9aa8b8;margin-bottom:4px}
.cash-value{font-size:13px;font-weight:700;font-variant-numeric:tabular-nums;direction:ltr;text-align:left}
.net-row{
  margin-top:10px;padding:8px 10px;border-radius:9px;
  background:rgba(255,255,255,.04);display:flex;justify-content:space-between;align-items:center;
}
.net-label{font-size:10px;color:#9aa8b8}
.net-value{font-size:14px;font-weight:700;font-variant-numeric:tabular-nums;direction:ltr}

.footer{
  padding:12px;text-align:center;font-size:10px;color:#5c6b7a;
  border-top:1px solid rgba(255,255,255,.05);
}
</style>
</head>
<body>
<article class="frame" data-report-root data-report-ready="true">
  <div class="wm">TEXAS</div>
  <div class="inner">
    <header class="hdr">
      <div class="brand-row">
        <span class="brand">TEXAS FUNDS</span>
        <span class="tg-badge">Telegram 📊</span>
      </div>
      <h1 class="title">التقرير اليومي</h1>
      <p class="date">${esc(dateLabel)}</p>
      <p class="owner">${esc(data.ownerName)}</p>
      <p class="agent">👤 ${esc(data.agentLabel)}</p>
    </header>

    <section class="hero">
      <p class="hero-label">الرصيد النهائي</p>
      <p class="hero-value" style="color:${finalColor}">${esc(formatMoney(data.finalBalance))}</p>
      <p class="hero-label" style="margin-top:12px">= رصيد تكساس + كاش صافي</p>
    </section>

    <p class="section-title">بيانات تكساس</p>
    <div class="divider"></div>
    <div class="grid">
      ${cell("إيداعات (تبات)", formatMoney(data.totalDeposit))}
      ${cell("سحوبات", formatMoney(data.totalWithdraw))}
      ${cell("الحرق (NGR)", formatMoney(data.ngr), "#c45c5c")}
      ${cell("رصيد تكساس", formatMoney(data.texasBalance), "#f0d878")}
    </div>

    <p class="section-title">المدفوعات النقدية</p>
    <div class="divider"></div>
    <div class="cash-section">
      <p class="cash-title">💰 كاش اليوم</p>
      <div class="cash-grid">
        <div class="cash-in">
          <p class="cash-label">وصل منك 💰</p>
          <p class="cash-value" style="color:#b8ff3c">${esc(formatMoney(data.cashIn))}</p>
        </div>
        <div class="cash-out">
          <p class="cash-label">واصل الك 📤</p>
          <p class="cash-value" style="color:#e8a0a0">${esc(formatMoney(data.cashOut))}</p>
        </div>
      </div>
      <div class="net-row">
        <span class="net-label">صافي الكاش</span>
        <span class="net-value" style="color:${cashNetColor}">${esc(cashNetLabel)}</span>
      </div>
    </div>

    <footer class="footer">
      TEXAS FUNDS · تم الإنشاء ${esc(new Date(data.generatedAt).toLocaleTimeString("ar-SY", { timeZone: "Asia/Damascus", hour: "2-digit", minute: "2-digit" }))}
    </footer>
  </div>
</article>
</body>
</html>`;
}
