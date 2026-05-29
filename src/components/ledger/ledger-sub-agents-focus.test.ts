import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function readSrc(rel: string): string {
  return readFileSync(
    join(process.cwd(), "src", rel.replace(/^src\//, "")),
    "utf8"
  );
}

describe("ledger UI sub-agents focus", () => {
  it("DailyLedgerView does not render حسابي tab or account panel", () => {
    const src = readSrc("components/ledger/DailyLedgerView.tsx");
    assert.ok(!src.includes('activeTab === "account"'));
    assert.ok(!src.includes("tabMyAccount"));
    assert.ok(!src.includes("ExecutiveLedgerReport"));
    assert.ok(src.includes('useState<LedgerTabId>("agents")'));
    assert.ok(src.includes("hideAccountTab"));
    assert.ok(src.includes("agentsOnly"));
  });

  it("LedgerTabBar hides حسابي when hideAccountTab or agentsOnly", () => {
    const src = readSrc("components/ledger/LedgerTabBar.tsx");
    assert.ok(src.includes("hideAccountTab"));
    assert.ok(src.includes("agentsOnly"));
    assert.ok(src.includes("ar.tabMyAccount"));
    assert.ok(src.includes("!hideAccountTab && !agentsOnly"));
  });

  it("SubAgentsTabPanel shows MTD column labels", () => {
    const src = readSrc("components/ledger/SubAgentsTabPanel.tsx");
    assert.ok(src.includes("subAgentTebatMtd"));
    assert.ok(!src.includes("onSelectAgent"));
  });
});
