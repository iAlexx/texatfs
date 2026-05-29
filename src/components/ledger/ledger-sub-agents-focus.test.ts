import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseGenkeyArgs, licenseDurationLabel } from "@/lib/telegram/admin";

function readSrc(rel: string): string {
  return readFileSync(
    join(process.cwd(), "src", rel.replace(/^src\//, "")),
    "utf8"
  );
}

describe("premium sub-agents UI", () => {
  it("DailyLedgerView uses card dashboard not table or history tabs", () => {
    const src = readSrc("components/ledger/DailyLedgerView.tsx");
    assert.ok(src.includes("SubAgentsDashboard"));
    assert.ok(!src.includes("LedgerHistoryNav"));
    assert.ok(!src.includes("LedgerTabBar"));
    assert.ok(!src.includes("SubAgentsTabPanel"));
    assert.ok(!src.includes('activeTab === "history"'));
    assert.ok(!src.includes("ExecutiveLedgerReport"));
  });

  it("SubAgentsDashboard uses cards not table columns", () => {
    const src = readSrc("components/ledger/SubAgentsDashboard.tsx");
    assert.ok(src.includes("AgentCard"));
    assert.ok(src.includes("AgentDetailSheet"));
    assert.ok(!src.includes("SUBAGENTS_COL_HEADERS"));
    assert.ok(!src.includes("MiniStat"));
    assert.ok(src.includes("agentsHeroTitle"));
  });

  it("AgentDetailSheet shows metrics only in sheet", () => {
    const src = readSrc("components/ledger/AgentDetailSheet.tsx");
    assert.ok(src.includes("MetricCard"));
    assert.ok(src.includes("ar.tebat"));
    assert.ok(src.includes("ar.alNihai"));
  });
});

describe("genkey week duration", () => {
  it("parses week aliases", () => {
    assert.equal(parseGenkeyArgs("/genkey week"), "week");
    assert.equal(parseGenkeyArgs("/genkey 1w"), "week");
    assert.equal(parseGenkeyArgs("/genkey 7d"), "week");
    assert.equal(parseGenkeyArgs("/genkey 12"), "12");
  });

  it("labels week in Arabic", () => {
    assert.equal(licenseDurationLabel("week"), "أسبوع");
  });
});

describe("Arabic tebat label", () => {
  it("ar.tebat is تعبئات not تبات", () => {
    const src = readSrc("lib/i18n/ar.ts");
    assert.ok(src.includes('tebat: "تعبئات"'));
    assert.ok(!src.includes('tebat: "تبات"'));
  });
});
