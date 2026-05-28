import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { normalizeTexasLogin } from "@/lib/auth/texas-login";

describe("normalizeTexasLogin", () => {
  it("lowercases and trims", () => {
    assert.equal(
      normalizeTexasLogin("  Alitest@Regional.Nsp  "),
      "alitest@regional.nsp"
    );
  });

  it("matches stored vs input casing", () => {
    const stored = normalizeTexasLogin("alitest@regional.nsp");
    const input = normalizeTexasLogin("Alitest@regional.nsp");
    assert.equal(stored, input);
  });
});
