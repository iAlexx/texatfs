import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { sumTransfersAttributedToAffiliate } from "@/lib/texas/transfer-affiliate-attribution";
import type { AgentTransferRecord } from "@/lib/texas/types";

describe("sumTransfersAttributedToAffiliate", () => {
  const agentId = "2715065";

  it("sums deposit at toId and withdraw at fromId", () => {
    const records: AgentTransferRecord[] = [
      { type: "2", toId: agentId, fromId: "2715043", amount: "1000000" },
      { type: "3", fromId: agentId, toId: "2715043", amount: "500000" },
      { type: "2", toId: "999", fromId: "2715043", amount: "999" },
    ];

    const result = sumTransfersAttributedToAffiliate(records, agentId);
    assert.equal(result.totalDeposit, 1_000_000);
    assert.equal(result.totalWithdraw, 500_000);
    assert.equal(result.matchedDeposits, 1);
    assert.equal(result.matchedWithdraws, 1);
    assert.equal(result.skipped, 1);
  });

  it("matches row-level affiliateId when present", () => {
    const records: AgentTransferRecord[] = [
      { type: "2", affiliateId: agentId, amount: "2500000" },
    ];
    const result = sumTransfersAttributedToAffiliate(records, agentId);
    assert.equal(result.totalDeposit, 2_500_000);
  });
});
