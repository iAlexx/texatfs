import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mapSubAgentStatistics } from "@/lib/texas/statistics-mapper";
import { UserContextViolation } from "@/lib/security/user-context";
import type { SubAgentStatisticsResponse } from "@/lib/texas/types";

function mockResponse(
  records: Array<{ affiliateId: string; left?: string; right?: string }>
): SubAgentStatisticsResponse {
  return {
    status: true,
    html: "",
    notification: [],
    result: {
      records: records as unknown as SubAgentStatisticsResponse["result"]["records"],
      totalRecordsCount: String(records.length),
    },
  };
}

describe("mapSubAgentStatistics user isolation", () => {
  it("rejects master sync without texasAffiliateId", () => {
    const response = mockResponse([
      { affiliateId: "100", left: "5000", right: "2000" },
      { affiliateId: "200", left: "8000", right: "1000" },
    ]);

    assert.throws(
      () =>
        mapSubAgentStatistics({
          response,
          texasAffiliateId: null,
          userId: "user-a",
          role: "master",
        }),
      UserContextViolation
    );
  });

  it("rejects master sync when affiliateId is not in response", () => {
    const response = mockResponse([
      { affiliateId: "100", left: "5000", right: "2000" },
    ]);

    assert.throws(
      () =>
        mapSubAgentStatistics({
          response,
          texasAffiliateId: "999",
          userId: "user-a",
          role: "master",
        }),
      UserContextViolation
    );
  });

  it("returns only the matched affiliate row — never sums network", () => {
    const response = mockResponse([
      { affiliateId: "100", left: "5000", right: "2000" },
      { affiliateId: "200", left: "9000", right: "1000" },
    ]);

    const metrics = mapSubAgentStatistics({
      response,
      texasAffiliateId: "100",
      userId: "user-a",
      role: "master",
    });

    assert.equal(metrics.totalDeposit, 5000);
    assert.equal(metrics.totalWithdraw, 2000);
  });
});
