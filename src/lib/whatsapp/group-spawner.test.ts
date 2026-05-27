import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildBotGroupName,
  decideGroupSpawnAction,
} from "@/lib/whatsapp/group-spawner";

describe("whatsapp/group-spawner helpers", () => {
  it("buildBotGroupName prefixes with ⚜️ ", () => {
    assert.equal(buildBotGroupName("Ali"), "⚜️ Ali");
  });

  it("decideGroupSpawnAction: active mapping skips creation", () => {
    const decision = decideGroupSpawnAction({
      is_active: true,
      group_id: "123-0@g.us",
    });
    assert.equal(decision.kind, "skip-active");
  });

  it("decideGroupSpawnAction: pending lock skips creation", () => {
    const decision = decideGroupSpawnAction({
      is_active: false,
      group_id: "pending:some-user:some-affiliate:1",
    });
    assert.equal(decision.kind, "skip-inprogress");
  });

  it("decideGroupSpawnAction: inactive non-pending activates existing", () => {
    const decision = decideGroupSpawnAction({
      is_active: false,
      group_id: "123-0@g.us",
    });
    assert.equal(decision.kind, "activate-existing");
  });

  it("decideGroupSpawnAction: missing row creates new", () => {
    const decision = decideGroupSpawnAction(null);
    assert.equal(decision.kind, "create-new");
  });
});

