import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { registerWhatsAppPhone } from "@/lib/whatsapp/register-phone-service";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..", "..", "..");

function readSrc(rel: string): string {
  return readFileSync(join(repoRoot, "src", rel), "utf8");
}

describe("register-phone must not initiate outbound DM", () => {
  it("register-phone route does not import sendWhatsAppMessage", () => {
    const src = readSrc("app/api/whatsapp/register-phone/route.ts");
    assert.doesNotMatch(src, /sendWhatsAppMessage/);
    assert.doesNotMatch(src, /sendWelcomeDm/);
  });

  it("register-phone-service does not import whatsapp client", () => {
    const src = readSrc("lib/whatsapp/register-phone-service.ts");
    assert.doesNotMatch(src, /sendWhatsAppMessage/);
    assert.doesNotMatch(src, /@\/lib\/whatsapp\/client/);
  });
});

describe("registerWhatsAppPhone", () => {
  it("returns PENDING_EMOJI and bot config without sending messages", async () => {
    const updates: Record<string, unknown>[] = [];
    const supabase = {
      from(table: string) {
        if (table !== "users") throw new Error(`unexpected table ${table}`);
        return {
          select: () => ({
            eq: () => ({
              neq: () => ({
                maybeSingle: async () => ({ data: null, error: null }),
              }),
            }),
          }),
          update: (payload: Record<string, unknown>) => {
            updates.push(payload);
            return {
              eq: async () => ({ error: null }),
            };
          },
        };
      },
    } as unknown as SupabaseClient;

    const prevBot = process.env.WHATSAPP_BOT_NUMBER;
    process.env.WHATSAPP_BOT_NUMBER = "963988899474";

    try {
      const result = await registerWhatsAppPhone(supabase, {
        userId: "user-1",
        phone: "988899474",
        countryCode: "963",
      });

      assert.equal(result.onboardingStatus, "PENDING_EMOJI");
      assert.equal(result.success, true);
      assert.ok(result.instructionText.includes("😎"));
      assert.equal(result.botNumberConfigured, true);
      assert.ok(result.whatsappActivationUrl?.includes("wa.me/963988899474"));
      assert.equal(updates[0]?.whatsapp_phone, "963988899474");
      assert.equal(updates[0]?.onboarding_status, "PENDING_EMOJI");
    } finally {
      if (prevBot === undefined) delete process.env.WHATSAPP_BOT_NUMBER;
      else process.env.WHATSAPP_BOT_NUMBER = prevBot;
    }
  });
});
