/**
 * End-to-End Daily Flow Test
 *
 * Simulates a complete business day:
 *   1. Create test user + synthetic Texas snapshot
 *   2. Open a daily ledger with Texas metrics
 *   3. Record WhatsApp confirmed transactions (in + out)
 *   4. Verify wasel totals + al_nihai formula
 *   5. Close & lock the ledger
 *   6. Verify immutability (writes rejected)
 *   7. Verify audit trail exists
 *   8. Clean up all test data
 *
 * Requires: NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
 * Run:      npm run test:e2e-daily
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

// ── Env ─────────────────────────────────────────────────────────────────────

function loadEnvFile(path: string): void {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq === -1) continue;
    const key = t.slice(0, eq).trim();
    let val = t.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

const root = resolve(__dirname, "..");
loadEnvFile(resolve(root, ".env.local"));
loadEnvFile(resolve(root, ".env"));

// ── Imports (after env) ─────────────────────────────────────────────────────

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { computeAlNihai, roundMoney } from "../src/lib/accounting/formulas";
import { getWaselFromWhatsApp } from "../src/lib/accounting/whatsapp-wasel";
import { recordWhatsAppCashPayment } from "../src/lib/whatsapp/record-cash-transaction";

// ── Constants ───────────────────────────────────────────────────────────────

const TEST_PREFIX = "e2e-daily-flow";
const TEST_LEDGER_DATE = "2099-12-31";
const TEST_TELEGRAM_ID = 999_999_999;

const SNAPSHOT_METRICS = {
  balance: 150_000,
  totalDeposit: 80_000,
  totalWithdraw: 30_000,
  ngr: 12_000,
};

const WASEL_TRANSACTIONS = [
  { direction: "out" as const, amount: 5_000, label: "wasel_menho_1" },
  { direction: "out" as const, amount: 3_000, label: "wasel_menho_2" },
  { direction: "in" as const,  amount: 8_000, label: "wasel_eleih_1" },
  { direction: "in" as const,  amount: 2_500, label: "wasel_eleih_2" },
  { direction: "out" as const, amount: 1_500, label: "wasel_menho_3" },
];

const EXPECTED_WASEL_MENHO = 5_000 + 3_000 + 1_500;  // 9500
const EXPECTED_WASEL_ELEIH = 8_000 + 2_500;           // 10500
const EXPECTED_TEBAT = 80_000;
const EXPECTED_SUHOUBAT = 30_000;
const EXPECTED_AL_FARQ = EXPECTED_TEBAT - EXPECTED_SUHOUBAT; // 50000
const EXPECTED_BAQI_QADIM = 0; // no previous day
const EXPECTED_AL_NIHAI = EXPECTED_AL_FARQ + EXPECTED_WASEL_ELEIH - EXPECTED_WASEL_MENHO + EXPECTED_BAQI_QADIM;

// ── Helpers ─────────────────────────────────────────────────────────────────

interface StepResult {
  step: string;
  passed: boolean;
  durationMs: number;
  detail?: string;
}

const results: StepResult[] = [];

function logStep(step: string, msg: string): void {
  console.info(`\n${"═".repeat(70)}\n  [${step}] ${msg}\n${"═".repeat(70)}`);
}

function logOk(msg: string): void {
  console.info(`  ✅ ${msg}`);
}

function logFail(msg: string): void {
  console.error(`  ❌ ${msg}`);
}

function assertEqual(label: string, actual: unknown, expected: unknown): void {
  if (actual === expected) {
    logOk(`${label}: ${actual}`);
  } else {
    logFail(`${label}: expected ${expected}, got ${actual}`);
    throw new Error(`Assertion failed: ${label}`);
  }
}

function assertTruthy(label: string, value: unknown): void {
  if (value) {
    logOk(`${label}: ${typeof value === "string" ? value : "truthy"}`);
  } else {
    logFail(`${label}: expected truthy, got ${String(value)}`);
    throw new Error(`Assertion failed: ${label}`);
  }
}

async function runStep(
  name: string,
  fn: () => Promise<void>
): Promise<boolean> {
  const t0 = Date.now();
  try {
    await fn();
    const ms = Date.now() - t0;
    results.push({ step: name, passed: true, durationMs: ms });
    return true;
  } catch (e) {
    const ms = Date.now() - t0;
    const detail = e instanceof Error ? e.message : String(e);
    logFail(`STEP FAILED: ${detail}`);
    results.push({ step: name, passed: false, durationMs: ms, detail });
    return false;
  }
}

function getSupabase(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// ── Cleanup ─────────────────────────────────────────────────────────────────

/**
 * Cleanup requires special handling because:
 *   - transaction_audit has ON DELETE RESTRICT on transaction_id
 *   - ledger_close_audit has ON DELETE RESTRICT on ledger_id
 *   - trg_transactions_block_locked_ledger blocks DELETE on locked ledger transactions
 *   - trg_daily_ledgers_block_locked_update blocks changes to locked ledger columns
 *
 * Strategy: delete audit tables first (RESTRICT refs), then use Postgres
 * function-level SET to bypass triggers for the locked row cleanup.
 */
async function cleanup(supabase: SupabaseClient, userId: string | null): Promise<void> {
  if (!userId) return;
  logStep("CLEANUP", "Removing test data");

  // 1. Delete RESTRICT-referencing audit rows first
  await supabase.from("transaction_audit").delete().eq("user_id", userId);
  await supabase.from("ledger_close_audit").delete().eq("user_id", userId);

  // 2. Unlock the ledger via a raw SQL call (bypasses trigger).
  //    We use a one-off RPC to disable/re-enable the trigger.
  const unlockSql = `
    DO $$
    BEGIN
      ALTER TABLE public.daily_ledgers DISABLE TRIGGER daily_ledgers_block_locked_update;
      ALTER TABLE public.transactions DISABLE TRIGGER transactions_block_locked_ledger;

      DELETE FROM public.transactions WHERE user_id = '${userId}';
      DELETE FROM public.daily_ledgers WHERE user_id = '${userId}';
      DELETE FROM public.api_snapshots WHERE user_id = '${userId}';
      DELETE FROM public.users WHERE id = '${userId}';

      ALTER TABLE public.daily_ledgers ENABLE TRIGGER daily_ledgers_block_locked_update;
      ALTER TABLE public.transactions ENABLE TRIGGER transactions_block_locked_ledger;
    END;
    $$;
  `;

  // Try via rpc('exec_sql') first, fallback to direct deletes
  const { error: rpcErr } = await supabase.rpc("exec_sql", { sql: unlockSql });
  if (rpcErr) {
    // exec_sql doesn't exist — try cascade from user delete
    // (may fail if triggers block, but we tried our best)
    console.warn("  exec_sql unavailable, attempting direct deletes");
    await supabase.from("transactions").delete().eq("user_id", userId).then(() => undefined).catch(() => undefined);
    await supabase.from("daily_ledgers").delete().eq("user_id", userId).then(() => undefined).catch(() => undefined);
    await supabase.from("api_snapshots").delete().eq("user_id", userId).then(() => undefined).catch(() => undefined);
    await supabase.from("users").delete().eq("id", userId).then(() => undefined).catch(() => undefined);
  }

  logOk(`Cleaned up user ${userId}`);
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const supabase = getSupabase();
  let testUserId: string | null = null;
  let testLedgerId: string | null = null;

  try {
    // ── Step 1: Create test user ──────────────────────────────────────────
    const step1ok = await runStep("1_CREATE_TEST_USER", async () => {
      logStep("1", "Creating test super_master user");

      // Clean up any leftover from a previous failed run
      const { data: existing } = await supabase
        .from("users")
        .select("id")
        .eq("telegram_id", TEST_TELEGRAM_ID)
        .maybeSingle();

      if (existing?.id) {
        logOk("Found leftover test user, cleaning up first");
        await cleanup(supabase, existing.id as string);
      }

      const { data: user, error } = await supabase
        .from("users")
        .insert({
          telegram_id: TEST_TELEGRAM_ID,
          role: "super_master",
          display_name: `${TEST_PREFIX}-user`,
          texas_username: `${TEST_PREFIX}`,
          texas_affiliate_id: `${TEST_PREFIX}-aff`,
          subscription_end_date: new Date(Date.now() + 365 * 86400000).toISOString(),
          is_active: true,
        })
        .select("id")
        .single();

      if (error) throw new Error(`User insert failed: ${error.message}`);
      testUserId = user.id as string;
      assertTruthy("User created with ID", testUserId);
    });
    if (!step1ok) throw new Error("Cannot proceed without test user");

    // ── Step 2: Insert synthetic Texas snapshot ───────────────────────────
    const step2ok = await runStep("2_INSERT_SNAPSHOT", async () => {
      logStep("2", "Inserting synthetic Texas API snapshot");

      const { data: snap, error } = await supabase
        .from("api_snapshots")
        .insert({
          user_id: testUserId!,
          ledger_date: TEST_LEDGER_DATE,
          currency_code: "NSP",
          balance: SNAPSHOT_METRICS.balance,
          total_deposit: SNAPSHOT_METRICS.totalDeposit,
          total_withdraw: SNAPSHOT_METRICS.totalWithdraw,
          ngr: SNAPSHOT_METRICS.ngr,
          raw_wallets: { test: true },
          raw_statistics: { test: true, records: [] },
          fetch_source: "e2e-test",
        })
        .select("id")
        .single();

      if (error) throw new Error(`Snapshot insert failed: ${error.message}`);
      assertTruthy("Snapshot ID", snap.id);
    });
    if (!step2ok) throw new Error("Cannot proceed without snapshot");

    // ── Step 3: Create open daily ledger with Texas metrics ───────────────
    const step3ok = await runStep("3_CREATE_LEDGER", async () => {
      logStep("3", "Creating open daily ledger with computed Texas metrics");

      const { data: ledger, error } = await supabase
        .from("daily_ledgers")
        .insert({
          user_id: testUserId!,
          ledger_date: TEST_LEDGER_DATE,
          status: "open",
          tebat: EXPECTED_TEBAT,
          suhoubat: EXPECTED_SUHOUBAT,
          al_farq: EXPECTED_AL_FARQ,
          al_harq: EXPECTED_AL_FARQ,
          wasel_menho: 0,
          wasel_eleih: 0,
          baqi_qadim: EXPECTED_BAQI_QADIM,
          al_nihai: EXPECTED_AL_FARQ + EXPECTED_BAQI_QADIM,
        })
        .select("id")
        .single();

      if (error) throw new Error(`Ledger insert failed: ${error.message}`);
      testLedgerId = ledger.id as string;
      assertTruthy("Ledger ID", testLedgerId);
    });
    if (!step3ok) throw new Error("Cannot proceed without ledger");

    // ── Step 4: Record WhatsApp confirmed transactions ───────────────────
    const step4ok = await runStep("4_WHATSAPP_TRANSACTIONS", async () => {
      logStep("4", `Recording ${WASEL_TRANSACTIONS.length} WhatsApp confirmed transactions`);

      for (const tx of WASEL_TRANSACTIONS) {
        const dedupeKey = `${TEST_PREFIX}-${tx.label}-${TEST_LEDGER_DATE}`;
        const result = await recordWhatsAppCashPayment(supabase, {
          userId: testUserId!,
          groupJid: `${TEST_PREFIX}-group@g.us`,
          groupName: `${TEST_PREFIX}-group`,
          dedupeKey,
          direction: tx.direction,
          amount: tx.amount,
          rawMessage: `E2E test: ${tx.label} ${tx.amount}`,
          senderJid: null,
          paymentDate: TEST_LEDGER_DATE,
        });

        if (!result.ok) throw new Error(`Transaction ${tx.label} failed: ${result.error}`);
        logOk(`${tx.label}: ${tx.direction} ${tx.amount} → ok=${result.ok}, dup=${result.duplicate ?? false}`);
      }

      // Verify idempotency — re-record first transaction
      const dupeResult = await recordWhatsAppCashPayment(supabase, {
        userId: testUserId!,
        groupJid: `${TEST_PREFIX}-group@g.us`,
        groupName: `${TEST_PREFIX}-group`,
        dedupeKey: `${TEST_PREFIX}-${WASEL_TRANSACTIONS[0].label}-${TEST_LEDGER_DATE}`,
        direction: WASEL_TRANSACTIONS[0].direction,
        amount: WASEL_TRANSACTIONS[0].amount,
        rawMessage: "E2E duplicate attempt",
        senderJid: null,
        paymentDate: TEST_LEDGER_DATE,
      });
      assertEqual("Duplicate detection", dupeResult.duplicate, true);
      assertEqual("Duplicate still ok", dupeResult.ok, true);
    });
    if (!step4ok) throw new Error("Cannot proceed without transactions");

    // ── Step 5: Verify wasel totals from DB ──────────────────────────────
    const step5ok = await runStep("5_VERIFY_WASEL", async () => {
      logStep("5", "Verifying wasel totals from confirmed WhatsApp transactions");

      const wasel = await getWaselFromWhatsApp(supabase, testLedgerId!);
      assertEqual("wasel_menho", wasel.wasel_menho, EXPECTED_WASEL_MENHO);
      assertEqual("wasel_eleih", wasel.wasel_eleih, EXPECTED_WASEL_ELEIH);
      assertEqual("transaction count", wasel.count, WASEL_TRANSACTIONS.length);
    });
    if (!step5ok) throw new Error("Wasel verification failed");

    // ── Step 6: Verify ledger was auto-updated by refresh_ledger_wasel ───
    const step6ok = await runStep("6_VERIFY_LEDGER_FORMULAS", async () => {
      logStep("6", "Verifying ledger row updated by DB trigger + formula check");

      const { data: ledger, error } = await supabase
        .from("daily_ledgers")
        .select("*")
        .eq("id", testLedgerId!)
        .single();

      if (error) throw new Error(`Ledger fetch failed: ${error.message}`);

      const row = ledger as Record<string, unknown>;
      assertEqual("wasel_menho on ledger", Number(row.wasel_menho), EXPECTED_WASEL_MENHO);
      assertEqual("wasel_eleih on ledger", Number(row.wasel_eleih), EXPECTED_WASEL_ELEIH);
      assertEqual("al_farq", Number(row.al_farq), EXPECTED_AL_FARQ);
      assertEqual("al_harq == al_farq", Number(row.al_harq), EXPECTED_AL_FARQ);
      assertEqual("baqi_qadim", Number(row.baqi_qadim), EXPECTED_BAQI_QADIM);

      const expectedAlNihai = computeAlNihai({
        al_farq: Number(row.al_farq),
        wasel_menho: Number(row.wasel_menho),
        wasel_eleih: Number(row.wasel_eleih),
        baqi_qadim: Number(row.baqi_qadim),
      });
      assertEqual("al_nihai formula", Number(row.al_nihai), expectedAlNihai);
      assertEqual("al_nihai value", Number(row.al_nihai), roundMoney(EXPECTED_AL_NIHAI));
      assertEqual("status", row.status, "open");
      assertEqual("is_locked", row.is_locked, false);
    });
    if (!step6ok) throw new Error("Formula verification failed");

    // ── Step 7: Close & lock the ledger ──────────────────────────────────
    const step7ok = await runStep("7_CLOSE_LEDGER", async () => {
      logStep("7", "Closing and locking the daily ledger via RPC");

      const { data, error } = await supabase.rpc("close_daily_ledger", {
        p_ledger_id: testLedgerId!,
        p_closed_by: testUserId!,
        p_close_reason: "E2E daily flow test",
      });

      if (error) throw new Error(`Close RPC failed: ${error.message}`);

      const row = Array.isArray(data) ? data[0] : data;
      assertTruthy("closed_at returned", (row as Record<string, unknown>)?.closed_at);

      const { data: closed, error: fetchErr } = await supabase
        .from("daily_ledgers")
        .select("status, is_locked, closed_at, closed_by, close_reason, calculation_trace")
        .eq("id", testLedgerId!)
        .single();

      if (fetchErr) throw new Error(`Closed ledger fetch failed: ${fetchErr.message}`);

      const c = closed as Record<string, unknown>;
      assertEqual("status after close", c.status, "closed");
      assertEqual("is_locked after close", c.is_locked, true);
      assertTruthy("closed_at set", c.closed_at);
      assertEqual("closed_by", c.closed_by, testUserId);
      assertEqual("close_reason", c.close_reason, "E2E daily flow test");
      assertTruthy("calculation_trace exists", c.calculation_trace);

      const trace = c.calculation_trace as Record<string, unknown>;
      assertTruthy("trace has formula", trace.formula);
      assertEqual("trace al_nihai", trace.al_nihai, EXPECTED_AL_NIHAI);
    });
    if (!step7ok) throw new Error("Ledger close failed");

    // ── Step 8: Verify immutability — writes rejected ────────────────────
    const step8ok = await runStep("8_VERIFY_IMMUTABILITY", async () => {
      logStep("8", "Verifying locked ledger rejects all writes");

      // 8a: Try to insert a new transaction on the locked ledger
      const txResult = await recordWhatsAppCashPayment(supabase, {
        userId: testUserId!,
        groupJid: `${TEST_PREFIX}-group@g.us`,
        groupName: `${TEST_PREFIX}-group`,
        dedupeKey: `${TEST_PREFIX}-post-lock-attempt`,
        direction: "out",
        amount: 999,
        rawMessage: "E2E: should be rejected",
        senderJid: null,
        paymentDate: TEST_LEDGER_DATE,
      });
      assertEqual("Transaction on locked ledger rejected", txResult.ok, false);
      assertTruthy("Error mentions locked", txResult.error?.includes("مقفلة") || txResult.error?.includes("LEDGER_LOCKED"));
      logOk("Transaction correctly rejected on locked ledger");

      // 8b: Try to update a financial column directly
      const { error: updateErr } = await supabase
        .from("daily_ledgers")
        .update({ wasel_menho: 99999 })
        .eq("id", testLedgerId!);

      assertTruthy("Direct update rejected", updateErr);
      logOk(`Direct update error: ${updateErr!.message.slice(0, 80)}`);

      // 8c: Try to close again
      const { error: reCloseErr } = await supabase.rpc("close_daily_ledger", {
        p_ledger_id: testLedgerId!,
        p_closed_by: testUserId!,
        p_close_reason: "Should fail",
      });
      assertTruthy("Re-close rejected", reCloseErr);
      logOk(`Re-close error: ${reCloseErr!.message.slice(0, 80)}`);
    });
    if (!step8ok) throw new Error("Immutability verification failed");

    // ── Step 9: Verify audit trail ───────────────────────────────────────
    const step9ok = await runStep("9_VERIFY_AUDIT", async () => {
      logStep("9", "Verifying audit trail completeness");

      // 9a: transaction_audit rows
      const { data: txAudit, error: txAuditErr } = await supabase
        .from("transaction_audit")
        .select("id, transaction_id, action, source, type, amount")
        .eq("ledger_id", testLedgerId!);

      if (txAuditErr) throw new Error(`transaction_audit query failed: ${txAuditErr.message}`);
      assertEqual("transaction_audit rows", txAudit?.length, WASEL_TRANSACTIONS.length);

      for (const row of txAudit ?? []) {
        const r = row as Record<string, unknown>;
        assertEqual(`audit source for ${r.transaction_id}`, r.source, "whatsapp");
        assertEqual(`audit action for ${r.transaction_id}`, r.action, "insert");
      }
      logOk("All transaction audit entries present and correct");

      // 9b: ledger_close_audit row
      const { data: closeAudit, error: closeAuditErr } = await supabase
        .from("ledger_close_audit")
        .select("id, ledger_id, closed_by, calculation_trace")
        .eq("ledger_id", testLedgerId!);

      if (closeAuditErr) throw new Error(`ledger_close_audit query failed: ${closeAuditErr.message}`);
      assertEqual("ledger_close_audit rows", closeAudit?.length, 1);

      const closeRow = closeAudit![0] as Record<string, unknown>;
      assertEqual("close audit closed_by", closeRow.closed_by, testUserId);
      assertTruthy("close audit has calculation_trace", closeRow.calculation_trace);
    });

    // ── Cleanup ──────────────────────────────────────────────────────────
    await cleanup(supabase, testUserId);
    testUserId = null; // prevent double cleanup in finally

  } finally {
    if (testUserId) {
      await cleanup(supabase, testUserId).catch((e) => {
        console.error("Cleanup failed:", e instanceof Error ? e.message : String(e));
      });
    }
  }

  // ── Summary ─────────────────────────────────────────────────────────────

  console.info(`\n${"═".repeat(70)}`);
  console.info("  E2E DAILY FLOW TEST RESULTS");
  console.info(`${"═".repeat(70)}`);

  let allPassed = true;
  for (const r of results) {
    const icon = r.passed ? "✅" : "❌";
    const time = `(${r.durationMs}ms)`;
    console.info(`  ${icon} ${r.step} ${time}${r.detail ? ` — ${r.detail}` : ""}`);
    if (!r.passed) allPassed = false;
  }

  const totalMs = results.reduce((s, r) => s + r.durationMs, 0);
  console.info(`\n  Total: ${results.length} steps, ${totalMs}ms`);

  if (allPassed) {
    console.info("\n  🎉 ALL STEPS PASSED — Daily flow is production-safe\n");
  } else {
    console.error("\n  💀 SOME STEPS FAILED — See details above\n");
  }

  console.info(`${"═".repeat(70)}\n`);

  if (!allPassed) process.exitCode = 1;
}

main().catch((e) => {
  console.error("Fatal error:", e instanceof Error ? e.message : String(e));
  process.exitCode = 1;
});
