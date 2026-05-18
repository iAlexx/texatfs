/** Business date (YYYY-MM-DD) in LEDGER_TIMEZONE (default Asia/Damascus). */
export function resolveLedgerDate(now = new Date()): string {
  const tz = process.env.LEDGER_TIMEZONE?.trim() || "Asia/Damascus";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);

  const y = parts.find((p) => p.type === "year")?.value;
  const m = parts.find((p) => p.type === "month")?.value;
  const d = parts.find((p) => p.type === "day")?.value;

  if (y && m && d) return `${y}-${m}-${d}`;
  return now.toISOString().slice(0, 10);
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
