import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { handleWhatsAppOnboardingPrivate } from "@/lib/whatsapp/onboarding-handler";
import type { WhatsAppOnboardingUser } from "@/lib/whatsapp/onboarding-users";

function mockSupabaseForOnboarding(user: WhatsAppOnboardingUser | null) {
  const statusUpdates: string[] = [];

  const supabase = {
    from(table: string) {
      if (table !== "users") throw new Error(`unexpected ${table}`);
      return {
        select: () => ({
          eq: (_col: string, val: string) => ({
            maybeSingle: async () => {
              if (user && user.whatsapp_phone === val) {
                return { data: user, error: null };
              }
              return { data: null, error: null };
            },
          }),
        }),
        update: (payload: { onboarding_status?: string }) => {
          if (payload.onboarding_status) {
            statusUpdates.push(payload.onboarding_status);
          }
          return { eq: async () => ({ error: null }) };
        },
      };
    },
    statusUpdates,
  };

  return supabase as unknown as SupabaseClient & { statusUpdates: string[] };
}

describe("handleWhatsAppOnboardingPrivate", () => {
  it("ignores phone with no matching user", async () => {
    const supabase = mockSupabaseForOnboarding(null);
    const handled = await handleWhatsAppOnboardingPrivate(supabase, {
      eventType: "messages.received",
      chatId: "963900000001@s.whatsapp.net",
      senderPhone: "963900000001",
      text: "😎",
      messageId: "m1",
      quotedMessageId: null,
      timestamp: Date.now(),
    });
    assert.equal(handled, false);
    assert.equal(supabase.statusUpdates.length, 0);
  });

  it("verifies PENDING_EMOJI user on 😎 and schedules spawn", async () => {
    const supabase = mockSupabaseForOnboarding({
      id: "u1",
      whatsapp_phone: "963911111111",
      onboarding_status: "PENDING_EMOJI",
      display_name: "Test",
    });

    const handled = await handleWhatsAppOnboardingPrivate(supabase, {
      eventType: "messages.received",
      chatId: "963911111111@s.whatsapp.net",
      senderPhone: "963911111111",
      text: "😎",
      messageId: "m2",
      quotedMessageId: null,
      timestamp: Date.now(),
    });

    assert.equal(handled, true);
    assert.deepEqual(supabase.statusUpdates, ["VERIFIED_COMPLETED"]);
  });

  it("verifies on تفعيل", async () => {
    const supabase = mockSupabaseForOnboarding({
      id: "u2",
      whatsapp_phone: "963922222222",
      onboarding_status: "PENDING_EMOJI",
      display_name: "Test2",
    });

    const handled = await handleWhatsAppOnboardingPrivate(supabase, {
      eventType: "messages.received",
      chatId: "963922222222@s.whatsapp.net",
      senderPhone: "963922222222",
      text: "تفعيل",
      messageId: "m3",
      quotedMessageId: null,
      timestamp: Date.now(),
    });

    assert.equal(handled, true);
    assert.deepEqual(supabase.statusUpdates, ["VERIFIED_COMPLETED"]);
  });

  it("consumes wrong text without verifying", async () => {
    const supabase = mockSupabaseForOnboarding({
      id: "u3",
      whatsapp_phone: "963933333333",
      onboarding_status: "PENDING_EMOJI",
      display_name: "Test3",
    });

    const handled = await handleWhatsAppOnboardingPrivate(supabase, {
      eventType: "messages.received",
      chatId: "963933333333@s.whatsapp.net",
      senderPhone: "963933333333",
      text: "مرحبا",
      messageId: "m4",
      quotedMessageId: null,
      timestamp: Date.now(),
    });

    assert.equal(handled, true);
    assert.equal(supabase.statusUpdates.length, 0);
  });

  it("ignores already verified user", async () => {
    const supabase = mockSupabaseForOnboarding({
      id: "u4",
      whatsapp_phone: "963944444444",
      onboarding_status: "VERIFIED_COMPLETED",
      display_name: "Done",
    });

    const handled = await handleWhatsAppOnboardingPrivate(supabase, {
      eventType: "messages.received",
      chatId: "963944444444@s.whatsapp.net",
      senderPhone: "963944444444",
      text: "😎",
      messageId: "m5",
      quotedMessageId: null,
      timestamp: Date.now(),
    });

    assert.equal(handled, false);
    assert.equal(supabase.statusUpdates.length, 0);
  });
});
