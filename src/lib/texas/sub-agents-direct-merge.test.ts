import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  auditDirectChildVisibility,
  filterOutViewerSelfChildren,
  isDirectChildViewerSelf,
  mergeDirectChildrenWithTexas,
  type DirectChildDbRow,
  type ViewerIdentity,
} from "@/lib/texas/sub-agents-direct-merge";
import type { TexasSubAgentsPayload } from "@/lib/texas/texas-live-sub-agents";

const ZERO = {
  tebat: 0,
  suhoubat: 0,
  al_farq: 0,
  al_harq: 0,
  wasel_menho: 0,
  wasel_eleih: 0,
  baqi_qadim: 0,
  al_nihai: 0,
};

function texasAgent(
  affiliateId: string,
  username: string,
  al_harq = 100
) {
  return {
    affiliateId,
    username,
    email: `${username}@test`,
    texasRole: "agent",
    mainCurrency: "NSP",
    balance: 5000,
    metrics: { ...ZERO, al_harq, al_farq: al_harq, al_nihai: al_harq },
    has_live_texas_data: true as const,
  };
}

function emptyTexasPayload(agents: ReturnType<typeof texasAgent>[]): TexasSubAgentsPayload {
  return {
    ledger_date: "2026-05-26",
    fetched_at: "2026-05-26T00:00:00.000Z",
    agents,
    stats: {
      active_agents: agents.length,
      total_network_burn: 0,
      combined_balance: 0,
      highest_burn_agent: null,
    },
  };
}

describe("filterOutViewerSelfChildren", () => {
  const viewer: ViewerIdentity = {
    userId: "master-1",
    texasAffiliateId: "aff-master",
    texasUsername: "master@test",
    displayName: "Master Name",
    email: "master@test",
  };

  it("drops row matching viewer user id", () => {
    const self: DirectChildDbRow = {
      id: "master-1",
      texas_affiliate_id: "aff-other",
      display_name: "Ghost",
      texas_username: "ghost@test",
      role: "agent",
      is_active: true,
    };
    assert.equal(isDirectChildViewerSelf(self, viewer), true);
    assert.equal(filterOutViewerSelfChildren([self], viewer).length, 0);
  });

  it("drops row matching viewer texas affiliate id", () => {
    const self: DirectChildDbRow = {
      id: "dup-user",
      texas_affiliate_id: "aff-master",
      display_name: "Dup",
      texas_username: "dup@test",
      role: "agent",
      is_active: true,
    };
    assert.equal(filterOutViewerSelfChildren([self], viewer).length, 0);
  });

  it("drops row matching viewer texas username", () => {
    const self: DirectChildDbRow = {
      id: "dup-user-2",
      texas_affiliate_id: "aff-x",
      display_name: null,
      texas_username: "master@test",
      role: "agent",
      is_active: true,
    };
    assert.equal(filterOutViewerSelfChildren([self], viewer).length, 0);
  });

  it("keeps unrelated direct children", () => {
    const child: DirectChildDbRow = {
      id: "child-1",
      texas_affiliate_id: "aff-child",
      display_name: "Child",
      texas_username: "child@test",
      role: "agent",
      is_active: true,
    };
    assert.equal(filterOutViewerSelfChildren([child], viewer).length, 1);
  });
});

describe("mergeDirectChildrenWithTexas — A -> B -> C, D stub", () => {
  const viewerA = "user-a";
  const childB: DirectChildDbRow = {
    id: "user-b",
    texas_affiliate_id: "aff-b",
    display_name: "Agent B",
    texas_username: "b@test",
    role: "agent",
    is_active: true,
  };
  const childD: DirectChildDbRow = {
    id: "user-d",
    texas_affiliate_id: null,
    display_name: "Agent D",
    texas_username: "d@test",
    role: "agent",
    is_active: true,
  };

  const texasPayload = emptyTexasPayload([
    texasAgent("aff-b", "Agent B", 200),
    texasAgent("aff-c", "Grandchild C", 999), // must be dropped for viewer A
  ]);

  it("viewer A sees B and D only, not C", () => {
    const { agents, diagnostics } = mergeDirectChildrenWithTexas(
      [childB, childD],
      texasPayload
    );

    assert.equal(agents.length, 2);
    assert.equal(diagnostics.dbDirectChildren, 2);
    assert.equal(diagnostics.matchedEnriched, 1);
    assert.equal(diagnostics.stubCount, 1);
    assert.equal(diagnostics.droppedTexasRows, 1);

    const ids = agents.map((a) => a.affiliateId);
    assert.ok(ids.includes("aff-b"));
    assert.ok(ids.includes("db:user-d"));
    assert.ok(!ids.includes("aff-c"));

    const b = agents.find((a) => a.affiliateId === "aff-b")!;
    assert.equal(b.has_live_texas_data, true);
    assert.equal(b.metrics.al_harq, 200);

    const d = agents.find((a) => a.affiliateId === "db:user-d")!;
    assert.equal(d.has_live_texas_data, false);
    assert.equal(d.username, "Agent D");
  });

  it("viewer B sees C only", () => {
    const childC: DirectChildDbRow = {
      id: "user-c",
      texas_affiliate_id: "aff-c",
      display_name: "Agent C",
      texas_username: "c@test",
      role: "player",
      is_active: true,
    };

    const { agents, diagnostics } = mergeDirectChildrenWithTexas(
      [childC],
      texasPayload
    );

    assert.equal(agents.length, 1);
    assert.equal(agents[0]!.affiliateId, "aff-c");
    assert.equal(agents[0]!.has_live_texas_data, true);
    assert.equal(diagnostics.droppedTexasRows, 1);
  });

  it("audit explains stub vs enriched", () => {
    const audit = auditDirectChildVisibility(viewerA, [childB, childD], texasPayload);
    assert.equal(audit.length, 2);

    const bAudit = audit.find((r) => r.user_id === "user-b")!;
    assert.equal(bAudit.included, true);
    assert.equal(bAudit.has_live_texas_data, true);

    const dAudit = audit.find((r) => r.user_id === "user-d")!;
    assert.equal(dAudit.included, true);
    assert.equal(dAudit.has_live_texas_data, false);
    assert.match(dAudit.reason, /stub.*no texas_affiliate_id/i);
  });
});

describe("mergeDirectChildrenWithTexas — enrich from full Texas index", () => {
  it("enriches DB direct child via affiliateId even when not in portal-direct filter", () => {
    const dbChild = {
      id: "user-b",
      texas_affiliate_id: "aff-b",
      display_name: "Agent B",
      texas_username: "b@test",
      role: "agent",
      is_active: true,
    };

    const texasPayload = emptyTexasPayload([
      texasAgent("aff-b", "Agent B", 500),
      texasAgent("aff-c", "Grandchild C", 999),
    ]);

    const { agents, diagnostics } = mergeDirectChildrenWithTexas(
      [dbChild],
      texasPayload
    );

    assert.equal(agents.length, 1);
    assert.equal(agents[0]!.has_live_texas_data, true);
    assert.equal(agents[0]!.metrics.al_harq, 500);
    assert.equal(diagnostics.matchedEnriched, 1);
    assert.equal(diagnostics.droppedTexasRows, 1);
  });
});

describe("mergeDirectChildrenWithTexas — why 5 Texas rows but 1 visible", () => {
  it("only DB direct children appear even when Texas returns 5", () => {
    const dbOne: DirectChildDbRow = {
      id: "only-child",
      texas_affiliate_id: "aff-1",
      display_name: "Only Direct",
      texas_username: null,
      role: "agent",
      is_active: true,
    };

    const texasFive = emptyTexasPayload(
      ["aff-1", "aff-2", "aff-3", "aff-4", "aff-5"].map((id, i) =>
        texasAgent(id, `Texas ${i}`, 10 * (i + 1))
      )
    );

    const { agents, diagnostics } = mergeDirectChildrenWithTexas([dbOne], texasFive);

    assert.equal(agents.length, 1);
    assert.equal(diagnostics.texasRowsTotal, 5);
    assert.equal(diagnostics.droppedTexasRows, 4);
    assert.equal(agents[0]!.affiliateId, "aff-1");
  });
});
