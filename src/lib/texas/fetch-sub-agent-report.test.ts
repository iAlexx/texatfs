import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  mapGeneralReportBag,
  parseSubAgentReportResponse,
} from "@/lib/texas/fetch-sub-agent-report";

describe("getSubAgentReport parsing", () => {
  it("parses flat General report object", () => {
    const parsed = parseSubAgentReportResponse({
      status: true,
      html: "",
      notification: [],
      result: {
        records: [
          {
            Deposits: "5,100,000.00",
            Withdrawal: "13,700,000.00",
            NGR: "-8,600,216.94",
            Commission: "-8,121.75",
            "Agent Id": "2715065",
          },
        ],
        totalRecordsCount: "1",
      },
    });

    assert.ok(parsed);
    assert.equal(parsed!.deposits, 5_100_000);
    assert.equal(parsed!.withdrawal, 13_700_000);
    assert.equal(parsed!.ngr, -8_600_216.94);
    assert.equal(parsed!.agentId, "2715065");
  });

  it("parses label/value rows", () => {
    const bag = mapGeneralReportBag({
      Deposits: 100,
      Withdrawal: 50,
      NGR: -25,
    });
    assert.equal(bag.deposits, 100);
    assert.equal(bag.withdrawal, 50);
    assert.equal(bag.ngr, -25);
  });
});
