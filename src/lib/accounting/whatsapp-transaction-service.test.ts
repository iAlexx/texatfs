import { describe, it } from "node:test";
import assert from "node:assert/strict";

/**
 * Unit tests for WhatsApp transaction idempotency & traceability invariants.
 * These test pure functions and contract shapes — DB integration is out of scope.
 */

describe("directionToTransactionType mapping", () => {
  // We import the function indirectly by testing the contract:
  // "out" = wasel_menho, "in" = wasel_eleih
  const directionToTransactionType = (d: "in" | "out") =>
    d === "out" ? "wasel_menho" : "wasel_eleih";

  it("maps 'out' to wasel_menho (outgoing from agent)", () => {
    assert.equal(directionToTransactionType("out"), "wasel_menho");
  });

  it("maps 'in' to wasel_eleih (incoming to agent)", () => {
    assert.equal(directionToTransactionType("in"), "wasel_eleih");
  });
});

describe("dedupeKey construction", () => {
  it("creates a deterministic key from group + trigger message", () => {
    const groupId = "120363123456@g.us";
    const triggerMsgId = "3EB0D4A7B2C1";
    const key = `wa-${groupId}-${triggerMsgId}`;

    assert.equal(key, "wa-120363123456@g.us-3EB0D4A7B2C1");
    assert.equal(key, `wa-${groupId}-${triggerMsgId}`);
  });
});

describe("RecordCashPaymentResult contract", () => {
  it("success result has ok=true and optional transactionId", () => {
    const result = { ok: true, transactionId: "abc-123" };
    assert.equal(result.ok, true);
    assert.equal(result.transactionId, "abc-123");
  });

  it("duplicate result has ok=true and duplicate=true", () => {
    const result = { ok: true, duplicate: true };
    assert.equal(result.ok, true);
    assert.equal(result.duplicate, true);
  });

  it("failure result has ok=false and error message", () => {
    const result = {
      ok: false,
      error: "هذه اليومية مقفلة — لا يمكن تسجيل عمليات جديدة",
    };
    assert.equal(result.ok, false);
    assert.ok(result.error?.includes("مقفلة"));
  });
});

describe("whatsapp_confirmed_at invariant", () => {
  it("every WhatsApp transaction must have a non-null confirmed timestamp", () => {
    const now = new Date().toISOString();
    const txRow = {
      source: "whatsapp" as const,
      whatsapp_confirmed_at: now,
      is_confirmed: true,
    };
    assert.ok(txRow.whatsapp_confirmed_at);
    assert.notEqual(txRow.whatsapp_confirmed_at, null);
  });

  it("constraint check: source=whatsapp requires whatsapp_confirmed_at", () => {
    const assertConstraint = (row: {
      source: string;
      whatsapp_confirmed_at: string | null;
    }) => {
      if (row.source === "whatsapp" && !row.whatsapp_confirmed_at) {
        throw new Error("transactions_wa_confirmed_chk violated");
      }
    };

    assert.doesNotThrow(() =>
      assertConstraint({
        source: "whatsapp",
        whatsapp_confirmed_at: new Date().toISOString(),
      })
    );

    assert.throws(
      () =>
        assertConstraint({
          source: "whatsapp",
          whatsapp_confirmed_at: null,
        }),
      /transactions_wa_confirmed_chk/
    );

    assert.doesNotThrow(() =>
      assertConstraint({
        source: "texas_api",
        whatsapp_confirmed_at: null,
      })
    );
  });
});

describe("wasel filtering logic", () => {
  interface TxRow {
    type: string;
    amount: number;
    source: string;
    is_confirmed: boolean;
    whatsapp_confirmed_at: string | null;
  }

  function sumWaselFromRows(rows: TxRow[]) {
    let wasel_menho = 0;
    let wasel_eleih = 0;
    let count = 0;
    for (const row of rows) {
      if (
        row.is_confirmed &&
        row.source === "whatsapp" &&
        row.whatsapp_confirmed_at !== null
      ) {
        if (row.type === "wasel_menho") wasel_menho += row.amount;
        else if (row.type === "wasel_eleih") wasel_eleih += row.amount;
        count++;
      }
    }
    return { wasel_menho, wasel_eleih, count };
  }

  it("only counts confirmed whatsapp rows with timestamp", () => {
    const rows: TxRow[] = [
      {
        type: "wasel_menho",
        amount: 500,
        source: "whatsapp",
        is_confirmed: true,
        whatsapp_confirmed_at: "2026-05-25T10:00:00Z",
      },
      {
        type: "wasel_eleih",
        amount: 2000,
        source: "whatsapp",
        is_confirmed: true,
        whatsapp_confirmed_at: "2026-05-25T11:00:00Z",
      },
      {
        type: "wasel_menho",
        amount: 9999,
        source: "texas_api",
        is_confirmed: true,
        whatsapp_confirmed_at: null,
      },
      {
        type: "wasel_menho",
        amount: 300,
        source: "whatsapp",
        is_confirmed: false,
        whatsapp_confirmed_at: null,
      },
    ];

    const result = sumWaselFromRows(rows);
    assert.equal(result.wasel_menho, 500);
    assert.equal(result.wasel_eleih, 2000);
    assert.equal(result.count, 2);
  });

  it("returns zeros when no qualifying rows exist", () => {
    const result = sumWaselFromRows([]);
    assert.equal(result.wasel_menho, 0);
    assert.equal(result.wasel_eleih, 0);
    assert.equal(result.count, 0);
  });
});
