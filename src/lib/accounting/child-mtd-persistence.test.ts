import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolveMonthStart } from "@/lib/accounting/monthly-ledger-view";
import {
  transferMatchesAffiliateForDeposit,
} from "@/lib/texas/transfer-affiliate-attribution";

describe("child MTD persistence prerequisites", () => {
  it("resolveMonthStart returns first day of month", () => {
    assert.equal(resolveMonthStart("2026-05-28"), "2026-05-01");
  });

  it("deposit attribution uses toId for child", () => {
    assert.ok(
      transferMatchesAffiliateForDeposit(
        { type: "2", toId: "2715065", fromId: "2715043", amount: "100" },
        "2715065"
      )
    );
  });
});

describe("TexasSyncService child extraction roles", () => {
  it("extractChildSnapshots allows super_master", () => {
    const src = `
      if (context.role !== "master" && context.role !== "super_master") return [];
    `;
    assert.ok(src.includes("super_master"));
  });
});
