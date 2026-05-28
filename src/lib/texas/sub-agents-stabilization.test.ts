import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  resolveSubAgentsEmptyReason,
  messageForSubAgentsEmptyReason,
} from "@/lib/texas/sub-agents-empty-reason";

describe("resolveSubAgentsEmptyReason", () => {
  it("returns null when agents exist", () => {
    assert.equal(
      resolveSubAgentsEmptyReason({
        texasRowsTotal: 5,
        texasChildrenInPortal: 5,
        linkableForDb: 2,
        linkCreated: 0,
        linkSkipped: 0,
        dbDirectChildrenRaw: 2,
        excludedViewerSelf: 0,
        afterSelfFilter: 2,
        directChildrenReturned: 2,
        matchedEnriched: 1,
        stubCount: 1,
        droppedTexasRows: 3,
      }),
      null
    );
  });

  it("detects SELF_FILTER_REMOVED_ALL", () => {
    assert.equal(
      resolveSubAgentsEmptyReason({
        texasRowsTotal: 3,
        texasChildrenInPortal: 3,
        linkableForDb: 1,
        linkCreated: 0,
        linkSkipped: 0,
        dbDirectChildrenRaw: 2,
        excludedViewerSelf: 2,
        afterSelfFilter: 0,
        directChildrenReturned: 0,
        matchedEnriched: 0,
        stubCount: 0,
        droppedTexasRows: 0,
      }),
      "SELF_FILTER_REMOVED_ALL"
    );
  });

  it("detects DB_LINK_FAILED when Texas has linkable but DB empty", () => {
    assert.equal(
      resolveSubAgentsEmptyReason({
        texasRowsTotal: 4,
        texasChildrenInPortal: 4,
        linkableForDb: 3,
        linkCreated: 0,
        linkSkipped: 3,
        dbDirectChildrenRaw: 0,
        excludedViewerSelf: 0,
        afterSelfFilter: 0,
        directChildrenReturned: 0,
        matchedEnriched: 0,
        stubCount: 0,
        droppedTexasRows: 0,
      }),
      "DB_LINK_FAILED"
    );
  });

  it("provides Arabic message for each reason", () => {
    const msg = messageForSubAgentsEmptyReason("MISSING_CREDENTIALS");
    assert.ok(msg.includes("تكساس"));
  });
});

describe("logout disabled by default", () => {
  it("route returns 410 unless ENABLE_AUTH_LOGOUT=true", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(
      join(here, "..", "..", "app", "api", "auth", "logout", "route.ts"),
      "utf8"
    );
    assert.match(src, /ENABLE_AUTH_LOGOUT/);
    assert.match(src, /410/);
  });

  it("ProfilePage does not call useLogout", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(
      join(here, "..", "..", "components", "tma", "ProfilePage.tsx"),
      "utf8"
    );
    assert.doesNotMatch(src, /useLogout/);
    assert.doesNotMatch(src, /تسجيل الخروج/);
  });
});

describe("ledger viewMode defaults to daily", () => {
  it("use-ledger-api defaults viewMode to daily", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(
      join(here, "..", "..", "hooks", "use-ledger-api.ts"),
      "utf8"
    );
    assert.match(src, /viewMode \?\? "daily"/);
    assert.doesNotMatch(src, /viewMode \?\? "monthly"/);
  });
});
