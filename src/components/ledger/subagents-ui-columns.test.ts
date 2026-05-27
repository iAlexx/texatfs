import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { SUBAGENTS_COL_HEADERS } from "@/components/ledger/SubAgentsTabPanel";

describe("SubAgentsTabPanel UI columns", () => {
  it("orders columns: Agent Name first, Al Nihai second", () => {
    assert.equal(SUBAGENTS_COL_HEADERS[0]?.key, "agentName");
    assert.equal(SUBAGENTS_COL_HEADERS[1]?.key, "alNihai");
  });

  it("does not show Role/Username columns anymore", () => {
    const keys = SUBAGENTS_COL_HEADERS.map((c) => String(c.key));
    assert.ok(!keys.includes("role"));
    assert.ok(!keys.includes("username"));
    assert.ok(!keys.includes("balance"));
  });
});

