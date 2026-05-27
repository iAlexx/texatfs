import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildParentAffiliateIndex,
  collectTexasChildrenForDbLink,
  filterTexasPortalDirectChildren,
  inferViewerAffiliateFromTexasTree,
  isTexasPortalDirectChild,
} from "@/lib/texas/texas-portal-hierarchy";
import type { TexasChildRecord } from "@/lib/texas/types";

const MASTER_AFF = "100";
const ALEX2001_AFF = "201";

function child(
  affiliateId: string,
  parent: string | undefined
): TexasChildRecord {
  return {
    affiliateId,
    username: `user-${affiliateId}`,
    ...(parent !== undefined ? { parent } : {}),
  };
}

describe("texas portal direct-child filter", () => {
  const tree = [
    child("101", MASTER_AFF), // direct under master
    child("201", MASTER_AFF), // alex2001
    child("202", ALEX2001_AFF), // alex2000 — grandchild
    child("203", ALEX2001_AFF), // alex889922
  ];

  it("master sees only rows with parent=master affiliate", () => {
    const direct = filterTexasPortalDirectChildren(tree, MASTER_AFF);
    const ids = direct.map((r) => r.affiliateId);
    assert.deepEqual(ids.sort(), ["101", "201"]);
    assert.ok(!ids.includes("202"));
    assert.ok(!ids.includes("203"));
  });

  it("alex2001 sees only their direct children", () => {
    const direct = filterTexasPortalDirectChildren(tree, ALEX2001_AFF);
    const ids = direct.map((r) => r.affiliateId);
    assert.deepEqual(ids.sort(), ["202", "203"]);
  });

  it("buildParentAffiliateIndex supports repair", () => {
    const idx = buildParentAffiliateIndex(tree);
    assert.equal(idx.get("202"), ALEX2001_AFF);
    assert.equal(idx.get("201"), MASTER_AFF);
  });

  it("fail-closed when parent field missing", () => {
    const noParent = [child("999", undefined)];
    assert.equal(isTexasPortalDirectChild(noParent[0]!, MASTER_AFF), false);
    assert.equal(filterTexasPortalDirectChildren(noParent, MASTER_AFF).length, 0);
  });

  it("collectTexasChildrenForDbLink includes new panel agents without parent", () => {
    const tree = [
      child("101", MASTER_AFF),
      child("999", undefined), // just created in panel
      child("202", ALEX2001_AFF), // grandchild — exclude
    ];
    const linkable = collectTexasChildrenForDbLink(tree, MASTER_AFF);
    const ids = linkable.map((r) => r.affiliateId);
    assert.ok(ids.includes("101"));
    assert.ok(ids.includes("999"));
    assert.ok(!ids.includes("202"));
  });

  it("collectTexasChildrenForDbLink without viewer affiliate excludes in-tree grandchildren", () => {
    const linkable = collectTexasChildrenForDbLink(tree, null);
    const ids = linkable.map((r) => r.affiliateId);
    assert.ok(ids.includes("101"));
    assert.ok(ids.includes("201"));
    assert.ok(!ids.includes("202"));
    assert.ok(!ids.includes("203"));
  });

  it("inferViewerAffiliateFromTexasTree picks master as most common parent", () => {
    const idx = buildParentAffiliateIndex(tree);
    assert.equal(inferViewerAffiliateFromTexasTree(idx), MASTER_AFF);
  });
});
