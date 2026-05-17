const formatter = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatMoney(value: number, currency = "NSP"): string {
  return `${formatter.format(value)} ${currency}`;
}

export function formatLedgerDate(isoDate: string): string {
  const d = new Date(`${isoDate}T12:00:00`);
  return d.toLocaleDateString("ar-SY", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}
