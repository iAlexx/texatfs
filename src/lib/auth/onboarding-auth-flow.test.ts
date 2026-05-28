import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  parseOnboardingModeChoice,
  resolveLicenseStepAction,
  resolvePostPasswordAction,
} from "@/lib/auth/onboarding-auth-flow";

describe("resolvePostPasswordAction", () => {
  it("active account after logout: relink without license", () => {
    const a = resolvePostPasswordAction({
      mode: "existing",
      accountExists: true,
      accountTelegramId: null,
      currentTelegramId: 111,
      subscriptionActive: true,
    });
    assert.equal(a.kind, "relink_active");
  });

  it("expired account: ask renewal license", () => {
    const a = resolvePostPasswordAction({
      mode: "existing",
      accountExists: true,
      accountTelegramId: null,
      currentTelegramId: 111,
      subscriptionActive: false,
    });
    assert.equal(a.kind, "relink_expired");
  });

  it("linked to other telegram: deny", () => {
    const a = resolvePostPasswordAction({
      mode: "existing",
      accountExists: true,
      accountTelegramId: 999,
      currentTelegramId: 111,
      subscriptionActive: true,
    });
    assert.equal(a.kind, "deny_other_telegram");
  });

  it("existing mode but no account: deny", () => {
    const a = resolvePostPasswordAction({
      mode: "existing",
      accountExists: false,
      accountTelegramId: null,
      currentTelegramId: 111,
      subscriptionActive: false,
    });
    assert.equal(a.kind, "deny_use_existing");
  });

  it("new mode no account: register", () => {
    const a = resolvePostPasswordAction({
      mode: "new",
      accountExists: false,
      accountTelegramId: null,
      currentTelegramId: 111,
      subscriptionActive: false,
    });
    assert.equal(a.kind, "register_new");
  });
});

describe("resolveLicenseStepAction", () => {
  it("active relink at license step", () => {
    const a = resolveLicenseStepAction({
      mode: "existing",
      accountExists: true,
      accountTelegramId: null,
      currentTelegramId: 1,
      subscriptionActive: true,
    });
    assert.equal(a.kind, "relink_active");
  });

  it("expired needs renewal key", () => {
    const a = resolveLicenseStepAction({
      mode: "existing",
      accountExists: true,
      accountTelegramId: null,
      currentTelegramId: 1,
      subscriptionActive: false,
    });
    assert.equal(a.kind, "relink_with_renewal");
  });
});

describe("parseOnboardingModeChoice", () => {
  it("parses Arabic and numeric choices", () => {
    assert.equal(parseOnboardingModeChoice("1"), "existing");
    assert.equal(parseOnboardingModeChoice("تسجيل الدخول"), "existing");
    assert.equal(parseOnboardingModeChoice("2"), "new");
    assert.equal(parseOnboardingModeChoice("إنشاء حساب"), "new");
    assert.equal(parseOnboardingModeChoice("???"), null);
  });
});
