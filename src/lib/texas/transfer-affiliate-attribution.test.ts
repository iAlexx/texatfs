import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { AgentTransferRecord } from "@/lib/texas/types";
import {
  sumTransfersAttributedToAffiliate,
  transferMatchesAffiliateForDeposit,
  transferMatchesAffiliateForWithdraw,
} from "@/lib/texas/transfer-affiliate-attribution";

describe("sumTransfersAttributedToAffiliate", () => {
  const agentId = "2715065";
  const masterId = "2715043";

  it("sums deposit at toId and withdraw at fromId", () => {
    const records: AgentTransferRecord[] = [
      { type: "2", toId: agentId, fromId: masterId, amount: "1000000" },
      { type: "3", fromId: agentId, toId: masterId, amount: "500000" },
      { type: "2", toId: "999", fromId: masterId, amount: "999" },
    ];

    const result = sumTransfersAttributedToAffiliate(records, agentId);
    assert.equal(result.totalDeposit, 1_000_000);
    assert.equal(result.totalWithdraw, 500_000);
    assert.equal(result.matchedDeposits, 1);
    assert.equal(result.matchedWithdraws, 1);
    assert.equal(result.skipped, 1);
  });

  it("does NOT count deposit at fromId (master sender)", () => {
    const records: AgentTransferRecord[] = [
      { type: "2", fromId: agentId, toId: masterId, amount: "750000" },
    ];
    const result = sumTransfersAttributedToAffiliate(records, agentId);
    assert.equal(result.totalDeposit, 0);
    assert.equal(result.skipped, 1);
  });

  it("does NOT count withdraw at toId (master receiver)", () => {
    const records: AgentTransferRecord[] = [
      { type: "3", toId: agentId, fromId: masterId, amount: "250000" },
    ];
    const result = sumTransfersAttributedToAffiliate(records, agentId);
    assert.equal(result.totalWithdraw, 0);
    assert.equal(result.skipped, 1);
  });

  it("matches row-level affiliateId when present", () => {
    const records: AgentTransferRecord[] = [
      { type: "2", affiliateId: agentId, amount: "2500000" },
    ];
    const result = sumTransfersAttributedToAffiliate(records, agentId);
    assert.equal(result.totalDeposit, 2_500_000);
  });

  it("matches agentId field on record", () => {
    const records: AgentTransferRecord[] = [
      { type: "3", agentId: agentId, amount: "100" },
    ];
    const result = sumTransfersAttributedToAffiliate(records, agentId);
    assert.equal(result.totalWithdraw, 100);
  });

  it("ignores unrelated grandchild record", () => {
    const records: AgentTransferRecord[] = [
      { type: "2", toId: "999888", fromId: masterId, amount: "5000000" },
    ];
    const result = sumTransfersAttributedToAffiliate(records, agentId);
    assert.equal(result.totalDeposit, 0);
    assert.equal(result.skipped, 1);
  });

  it("does not double-count duplicate record id", () => {
    const records: AgentTransferRecord[] = [
      { id: "tx-1", type: "2", toId: agentId, amount: "1000" },
      { id: "tx-1", type: "2", toId: agentId, amount: "1000" },
    ];
    const result = sumTransfersAttributedToAffiliate(records, agentId);
    assert.equal(result.totalDeposit, 1000);
    assert.equal(result.duplicateSkipped, 1);
  });

  it("deposit master -> child via toId", () => {
    assert.ok(
      transferMatchesAffiliateForDeposit(
        { type: "2", toId: agentId, fromId: masterId, amount: "1" },
        agentId
      )
    );
  });

  it("withdraw child -> master via fromId", () => {
    assert.ok(
      transferMatchesAffiliateForWithdraw(
        { type: "3", fromId: agentId, toId: masterId, amount: "1" },
        agentId
      )
    );
  });
});
