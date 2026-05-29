import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  isLastDayOfMonthInLedgerTz,
  resolveLedgerDate,
  resolveReportScreenshotMode,
} from "@/lib/cron/ledger-date";

describe("ledger-date", () => {
  it("resolves Damascus calendar date", () => {
    const date = resolveLedgerDate(new Date("2026-05-28T01:30:00.000Z"));
    assert.equal(date, "2026-05-28");
  });

  it("detects last day of month in ledger timezone", () => {
    const lastDay = new Date("2026-05-31T12:00:00.000Z");
    assert.equal(isLastDayOfMonthInLedgerTz(lastDay), true);

    const midMonth = new Date("2026-05-15T12:00:00.000Z");
    assert.equal(isLastDayOfMonthInLedgerTz(midMonth), false);
  });

  it("uses monthly screenshot mode only on last calendar day", () => {
    assert.equal(
      resolveReportScreenshotMode(new Date("2026-05-31T12:00:00.000Z")),
      "monthly"
    );
    assert.equal(
      resolveReportScreenshotMode(new Date("2026-05-15T12:00:00.000Z")),
      "daily"
    );
  });
});
