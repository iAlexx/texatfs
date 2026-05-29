import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mapSubAgentStatistics } from "@/lib/texas/statistics-mapper";
import type { SubAgentStatisticsResponse } from "@/lib/texas/types";

function mockResponse(
  records: Array<Record<string, unknown>>
): SubAgentStatisticsResponse {
  return {
    status: true,
    html: "",
    notification: [],
    result: {
      records: records as SubAgentStatisticsResponse["result"]["records"],
      totalRecordsCount: String(records.length),
    },
  };
}

describe("mapSubAgentStatistics", () => {
  it("returns zero financial placeholders (Transaction + General APIs own totals)", () => {
    const response = mockResponse([
      {
        affiliateId: "100",
        totalDeposit: "5000",
        totalWithdraw: "2000",
        ngr: "-300",
      },
      {
        affiliateId: "200",
        left: "9000",
        right: "1000",
      },
    ]);

    const metrics = mapSubAgentStatistics({
      response,
      texasAffiliateId: "100",
      userId: "user-a",
      role: "master",
    });

    assert.equal(metrics.totalDeposit, 0);
    assert.equal(metrics.totalWithdraw, 0);
    assert.equal(metrics.ngr, 0);
  });
});
