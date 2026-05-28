import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { CredentialVault } from "@/lib/security/CredentialVault";
import { resolveUserCredentials } from "@/lib/scraper/resolve-user-credentials";
import { RegistrationService } from "@/lib/services/RegistrationService";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..", "..", "..");

describe("logout preserves Texas credentials", () => {
  it("logout route only clears telegram_id", () => {
    const src = readFileSync(
      join(repoRoot, "src/app/api/auth/logout/route.ts"),
      "utf8"
    );
    assert.match(src, /telegram_id:\s*null/);
    assert.doesNotMatch(src, /texas_email_encrypted:\s*null/);
    assert.doesNotMatch(src, /texas_password_encrypted:\s*null/);
  });
});

describe("relink saves encrypted credentials", () => {
  it("relinkTelegramToExistingAccount updates credential columns", () => {
    const src = readFileSync(
      join(repoRoot, "src/lib/services/RegistrationService.ts"),
      "utf8"
    );
    const relinkBlock = src.slice(
      src.indexOf("async relinkTelegramToExistingAccount"),
      src.indexOf("async completeRegistration")
    );
    assert.match(relinkBlock, /encryptTexasCredentials/);
    assert.match(relinkBlock, /\.\.\.texasCreds/);
    assert.match(relinkBlock, /verifyStoredTexasCredentials/);
    assert.match(relinkBlock, /Texas credentials re-saved for mini-app/);
  });
});

describe("repairTexasCredentialsForUser", () => {
  it("stores encrypted fields and requireUserCredentials succeeds", async () => {
    process.env.CREDENTIALS_ENCRYPTION_KEY =
      "test-secret-key-for-unit-tests-only-32b";
    const vault = new CredentialVault();
    const userId = "repair-user-1";
    let stored: Record<string, unknown> = {
      id: userId,
      role: "master",
      texas_username: "agent1",
      texas_affiliate_id: null,
      texas_email_encrypted: null,
      texas_password_encrypted: null,
      is_active: false,
    };

    const supabase = {
      rpc: async (name: string) => {
        if (name === "is_subscription_active") {
          return { data: true, error: null };
        }
        throw new Error(`unexpected rpc ${name}`);
      },
      from(table: string) {
        if (table !== "users") throw new Error(`unexpected ${table}`);
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: stored, error: null }),
            }),
          }),
          update: (payload: Record<string, unknown>) => {
            stored = { ...stored, ...payload };
            return { eq: async () => ({ error: null }) };
          },
        };
      },
    } as unknown as SupabaseClient;

    const registration = new RegistrationService(supabase);
    const verifySpy = { called: false };
    registration.verifyTexasCredentials = async () => {
      verifySpy.called = true;
    };

    await registration.repairTexasCredentialsForUser(
      userId,
      "Agent1",
      "secret-pass"
    );

    assert.equal(verifySpy.called, true);
    assert.ok(stored.texas_email_encrypted);
    assert.ok(stored.texas_password_encrypted);
    assert.equal(stored.is_active, true);

    const creds = await resolveUserCredentials(supabase, userId);
    assert.equal(creds.hasCredentials, true);
    assert.equal(creds.username, "agent1");
    assert.equal(creds.password, "secret-pass");
  });
});
