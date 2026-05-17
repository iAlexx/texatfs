import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { CredentialVault } from "@/lib/security/CredentialVault";

describe("CredentialVault", () => {
  it("round-trips plaintext", () => {
    process.env.CREDENTIALS_ENCRYPTION_KEY =
      "test-secret-key-for-unit-tests-only-32b";
    const vault = new CredentialVault();
    const encrypted = vault.encrypt("user@texas.nsp");
    assert.notEqual(encrypted, "user@texas.nsp");
    assert.equal(vault.decrypt(encrypted), "user@texas.nsp");
  });
});
