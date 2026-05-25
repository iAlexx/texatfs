import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mapSubAgentStatistics } from "@/lib/texas/statistics-mapper";
import type { SubAgentStatisticsResponse } from "@/lib/texas/types";

/** Build a response with standard financial fields (real production shape). */
function mockResponse(
  records: Array<{
    affiliateId: string;
    totalDeposit?: string;
    totalWithdraw?: string;
    ngr?: string;
  }>,
  total?: { totalDeposit?: string; totalWithdraw?: string; ngr?: string }
): SubAgentStatisticsResponse {
  return {
    status: true,
    html: "",
    notification: [],
    result: {
      records: records as unknown as SubAgentStatisticsResponse["result"]["records"],
      totalRecordsCount: String(records.length),
      total: total as SubAgentStatisticsResponse["result"]["total"],
    },
  };
}

/** Build a response with tree-grid-only fields (left/right, NO standard keys). */
function mockTreeGridResponse(
  records: Array<{
    affiliateId: string;
    left?: string;
    right?: string;
    creditLine?: string;
  }>
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
  it("falls back to summing all records when texasAffiliateId is missing", () => {
    const response = mockResponse([
      { affiliateId: "100", totalDeposit: "5000", totalWithdraw: "2000", ngr: "-300" },
      { affiliateId: "200", totalDeposit: "8000", totalWithdraw: "1000", ngr: "-100" },
    ]);

    const metrics = mapSubAgentStatistics({
      response,
      texasAffiliateId: null,
      userId: "user-a",
      role: "master",
    });

    assert.equal(metrics.totalDeposit, 13000);
    assert.equal(metrics.totalWithdraw, 3000);
    assert.equal(metrics.ngr, -400);
  });

  it("falls back to summing all records when affiliateId is not in response", () => {
    const response = mockResponse([
      { affiliateId: "100", totalDeposit: "5000", totalWithdraw: "2000", ngr: "-300" },
    ]);

    const metrics = mapSubAgentStatistics({
      response,
      texasAffiliateId: "999",
      userId: "user-a",
      role: "master",
    });

    assert.equal(metrics.totalDeposit, 5000);
    assert.equal(metrics.totalWithdraw, 2000);
    assert.equal(metrics.ngr, -300);
  });

  it("returns only the matched affiliate row — never sums network", () => {
    const response = mockResponse([
      { affiliateId: "100", totalDeposit: "125000", totalWithdraw: "98000", ngr: "-4200" },
      { affiliateId: "200", totalDeposit: "15000", totalWithdraw: "12000", ngr: "-800" },
    ]);

    const metrics = mapSubAgentStatistics({
      response,
      texasAffiliateId: "100",
      userId: "user-a",
      role: "master",
    });

    assert.equal(metrics.totalDeposit, 125000);
    assert.equal(metrics.totalWithdraw, 98000);
    assert.equal(metrics.ngr, -4200);
  });
});

describe("mapSubAgentStatistics standard financial fields", () => {
  it("extracts totalDeposit, totalWithdraw, ngr from standard per-row fields", () => {
    const response = mockResponse([
      { affiliateId: "100", totalDeposit: "80000.00", totalWithdraw: "30000.00", ngr: "-5000.00" },
    ]);

    const metrics = mapSubAgentStatistics({
      response,
      texasAffiliateId: "100",
      userId: "user-b",
      role: "master",
    });

    assert.equal(metrics.totalDeposit, 80000);
    assert.equal(metrics.totalWithdraw, 30000);
    assert.equal(metrics.ngr, -5000);
  });

  it("super_master uses result.total footer when available", () => {
    const response = mockResponse(
      [
        { affiliateId: "100", totalDeposit: "80000", totalWithdraw: "30000", ngr: "-3000" },
        { affiliateId: "200", totalDeposit: "60000", totalWithdraw: "40000", ngr: "-2000" },
      ],
      { totalDeposit: "140000", totalWithdraw: "70000", ngr: "-5000" }
    );

    const metrics = mapSubAgentStatistics({
      response,
      texasAffiliateId: null,
      userId: "super-user",
      role: "super_master",
    });

    assert.equal(metrics.totalDeposit, 140000);
    assert.equal(metrics.totalWithdraw, 70000);
    assert.equal(metrics.ngr, -5000);
  });

  it("super_master sums records when no footer", () => {
    const response = mockResponse([
      { affiliateId: "100", totalDeposit: "50000", totalWithdraw: "20000", ngr: "-1000" },
      { affiliateId: "200", totalDeposit: "30000", totalWithdraw: "15000", ngr: "-500" },
    ]);

    const metrics = mapSubAgentStatistics({
      response,
      texasAffiliateId: null,
      userId: "super-user",
      role: "super_master",
    });

    assert.equal(metrics.totalDeposit, 80000);
    assert.equal(metrics.totalWithdraw, 35000);
    assert.equal(metrics.ngr, -1500);
  });
});

describe("mapSubAgentStatistics tree-grid fallback", () => {
  it("uses left/right as totalDeposit/totalWithdraw when standard keys are absent", () => {
    const response = mockTreeGridResponse([
      { affiliateId: "100", left: "5000", right: "2000" },
    ]);

    const metrics = mapSubAgentStatistics({
      response,
      texasAffiliateId: "100",
      userId: "user-c",
      role: "master",
    });

    assert.equal(metrics.totalDeposit, 5000);
    assert.equal(metrics.totalWithdraw, 2000);
  });

  it("prefers standard fields over left/right when both exist on row", () => {
    const records = [
      {
        affiliateId: "100",
        totalDeposit: "80000",
        totalWithdraw: "30000",
        ngr: "-5000",
        left: "999",
        right: "888",
      },
    ];

    const response: SubAgentStatisticsResponse = {
      status: true,
      html: "",
      notification: [],
      result: {
        records: records as unknown as SubAgentStatisticsResponse["result"]["records"],
        totalRecordsCount: "1",
      },
    };

    const metrics = mapSubAgentStatistics({
      response,
      texasAffiliateId: "100",
      userId: "user-d",
      role: "master",
    });

    assert.equal(metrics.totalDeposit, 80000, "should use totalDeposit, not left");
    assert.equal(metrics.totalWithdraw, 30000, "should use totalWithdraw, not right");
    assert.equal(metrics.ngr, -5000);
  });
});

describe("mapSubAgentStatistics handles comma-formatted numbers", () => {
  it("strips commas from numeric strings", () => {
    const response = mockResponse([
      { affiliateId: "100", totalDeposit: "1,250,000.00", totalWithdraw: "980,000.00", ngr: "-42,000.00" },
    ]);

    const metrics = mapSubAgentStatistics({
      response,
      texasAffiliateId: "100",
      userId: "user-e",
      role: "master",
    });

    assert.equal(metrics.totalDeposit, 1250000);
    assert.equal(metrics.totalWithdraw, 980000);
    assert.equal(metrics.ngr, -42000);
  });
});
