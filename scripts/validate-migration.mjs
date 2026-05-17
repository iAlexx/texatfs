import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const sql = readFileSync(
  join(root, "supabase/migrations/20260517000000_phase1_foundation.sql"),
  "utf8"
);

const files = [
  "supabase/migrations/20260517000000_phase1_foundation.sql",
  "supabase/migrations/20260517120000_phase5_subscription_licensing.sql",
];

const phase1 = [
  "CREATE TYPE public.user_role",
  "CREATE TABLE public.users",
  "CREATE TABLE public.api_snapshots",
  "CREATE TABLE public.daily_ledgers",
  "CREATE TABLE public.transactions",
  "FUNCTION public.can_view_user",
  "FUNCTION public.run_daily_close",
  "ENABLE ROW LEVEL SECURITY",
  "ALTER PUBLICATION supabase_realtime ADD TABLE public.daily_ledgers",
];

const phase5 = [
  "CREATE TABLE public.license_keys",
  "subscription_end_date",
  "texas_email_encrypted",
  "generate_license_key",
  "is_subscription_active",
];

let failed = false;
for (const file of files) {
  const sql = readFileSync(join(root, file), "utf8");
  const checks = file.includes("phase5") ? phase5 : phase1;
  const missing = checks.filter((s) => !sql.includes(s));
  if (missing.length) {
    console.error(`${file} validation failed. Missing:`, missing);
    failed = true;
  } else {
    console.log(`${file}: ${checks.length} checks passed`);
  }
}
if (failed) process.exit(1);
