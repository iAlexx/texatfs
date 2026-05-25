import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  classifyPuppeteerError,
  isRetryable,
  isAlertWorthy,
  PuppeteerClassifiedError,
  classifyAndWrap,
  type PuppeteerErrorType,
} from "@/lib/texas/puppeteer-errors";

// ── classifyPuppeteerError ──────────────────────────────────────────────────

describe("classifyPuppeteerError", () => {
  const cases: Array<[string, PuppeteerErrorType]> = [
    // Cloudflare
    ["Cloudflare did not clear within 120000ms (title=Just a moment)", "CLOUDFLARE_BLOCK"],
    ["title includes Just a moment", "CLOUDFLARE_BLOCK"],
    ["Attention Required! | Cloudflare", "CLOUDFLARE_BLOCK"],
    ["cf_challenge page detected", "CLOUDFLARE_BLOCK"],
    ["verify you are human", "CLOUDFLARE_BLOCK"],
    ["Blocked by Cloudflare WAF", "CLOUDFLARE_BLOCK"],
    // Detection
    ["Bot detection triggered", "DETECTION_RISK"],
    ["automation detected by server", "DETECTION_RISK"],
    ["CAPTCHA required to proceed", "DETECTION_RISK"],
    ["reCAPTCHA challenge appeared", "DETECTION_RISK"],
    // Login
    ["UI signIn rejected", "LOGIN_FAILED"],
    ["Login form not found after Cloudflare clearance", "LOGIN_FAILED"],
    ["Login inputs disappeared before fill", "LOGIN_FAILED"],
    ["Texas sign-in failed for user123", "LOGIN_FAILED"],
    ["Invalid credentials provided", "LOGIN_FAILED"],
    // Session crash
    ["Target closed", "SESSION_CRASHED"],
    ["Protocol error (Runtime.callFunctionOn)", "SESSION_CRASHED"],
    ["Browser closed unexpectedly", "SESSION_CRASHED"],
    ["Chromium crashed during navigation", "SESSION_CRASHED"],
    // Timeout
    ["Navigation timeout of 60000 ms exceeded", "TIMEOUT"],
    ["timed out waiting for selector", "TIMEOUT"],
    ["waitForResponse timed out", "TIMEOUT"],
    ["texas.syncUser timed out after 180000ms", "TIMEOUT"],
    // Network
    ["net::ERR_CONNECTION_REFUSED", "NETWORK_ERROR"],
    ["ECONNRESET connection reset", "NETWORK_ERROR"],
    ["ENOTFOUND agents.texas4win.com", "NETWORK_ERROR"],
    ["fetch failed: socket hang up", "NETWORK_ERROR"],
    ["DNS resolution failed for proxy", "NETWORK_ERROR"],
    ["Proxy error: EHOSTUNREACH", "NETWORK_ERROR"],
    // Unknown
    ["Something completely random happened", "UNKNOWN"],
    ["TypeError: Cannot read properties of undefined", "UNKNOWN"],
  ];

  for (const [input, expected] of cases) {
    it(`classifies "${input.slice(0, 50)}..." as ${expected}`, () => {
      assert.equal(classifyPuppeteerError(new Error(input)), expected);
    });
  }

  it("handles non-Error inputs", () => {
    assert.equal(classifyPuppeteerError("timeout reached"), "TIMEOUT");
    assert.equal(classifyPuppeteerError(42), "UNKNOWN");
    assert.equal(classifyPuppeteerError(null), "UNKNOWN");
  });
});

// ── isRetryable ─────────────────────────────────────────────────────────────

describe("isRetryable", () => {
  it("TIMEOUT is retryable", () => assert.equal(isRetryable("TIMEOUT"), true));
  it("NETWORK_ERROR is retryable", () => assert.equal(isRetryable("NETWORK_ERROR"), true));
  it("SESSION_CRASHED is retryable", () => assert.equal(isRetryable("SESSION_CRASHED"), true));
  it("UNKNOWN is retryable", () => assert.equal(isRetryable("UNKNOWN"), true));
  it("CLOUDFLARE_BLOCK is NOT retryable", () => assert.equal(isRetryable("CLOUDFLARE_BLOCK"), false));
  it("LOGIN_FAILED is NOT retryable", () => assert.equal(isRetryable("LOGIN_FAILED"), false));
  it("DETECTION_RISK is NOT retryable", () => assert.equal(isRetryable("DETECTION_RISK"), false));
});

// ── isAlertWorthy ───────────────────────────────────────────────────────────

describe("isAlertWorthy", () => {
  it("CLOUDFLARE_BLOCK triggers alert", () => assert.equal(isAlertWorthy("CLOUDFLARE_BLOCK"), true));
  it("DETECTION_RISK triggers alert", () => assert.equal(isAlertWorthy("DETECTION_RISK"), true));
  it("TIMEOUT does NOT trigger immediate alert", () => assert.equal(isAlertWorthy("TIMEOUT"), false));
  it("NETWORK_ERROR does NOT trigger immediate alert", () => assert.equal(isAlertWorthy("NETWORK_ERROR"), false));
  it("LOGIN_FAILED does NOT trigger immediate alert", () => assert.equal(isAlertWorthy("LOGIN_FAILED"), false));
});

// ── classifyAndWrap ─────────────────────────────────────────────────────────

describe("classifyAndWrap", () => {
  it("wraps Error with classification", () => {
    const original = new Error("Navigation timeout of 60000 ms exceeded");
    const wrapped = classifyAndWrap(original, { userId: "test" });

    assert.ok(wrapped instanceof PuppeteerClassifiedError);
    assert.equal(wrapped.errorType, "TIMEOUT");
    assert.equal(wrapped.retryable, true);
    assert.equal(wrapped.originalError, original);
    assert.deepEqual(wrapped.context, { userId: "test" });
  });

  it("wraps string with classification", () => {
    const wrapped = classifyAndWrap("ECONNREFUSED from proxy");
    assert.equal(wrapped.errorType, "NETWORK_ERROR");
    assert.equal(wrapped.retryable, true);
  });

  it("non-retryable errors have retryable=false", () => {
    const wrapped = classifyAndWrap(new Error("Cloudflare did not clear within 120000ms"));
    assert.equal(wrapped.errorType, "CLOUDFLARE_BLOCK");
    assert.equal(wrapped.retryable, false);
  });
});

// ── PuppeteerClassifiedError ────────────────────────────────────────────────

describe("PuppeteerClassifiedError", () => {
  it("has correct name and properties", () => {
    const err = new PuppeteerClassifiedError("test", "TIMEOUT");
    assert.equal(err.name, "PuppeteerClassifiedError");
    assert.equal(err.errorType, "TIMEOUT");
    assert.equal(err.retryable, true);
    assert.equal(err.message, "test");
  });

  it("instanceof Error works", () => {
    const err = new PuppeteerClassifiedError("test", "CLOUDFLARE_BLOCK");
    assert.ok(err instanceof Error);
    assert.ok(err instanceof PuppeteerClassifiedError);
  });
});
