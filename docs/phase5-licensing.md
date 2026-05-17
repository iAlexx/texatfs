# Phase 5: Subscription & License Management

## Migration

Apply [`supabase/migrations/20260517120000_phase5_subscription_licensing.sql`](../supabase/migrations/20260517120000_phase5_subscription_licensing.sql) after Phase 1.

## Tables

### `license_keys`

| Column | Type | Notes |
|--------|------|--------|
| `key` | TEXT PK | Unique key, e.g. `TEXAS-A1B2-C3D4-E5F6` |
| `duration_months` | ENUM `1`,`3`,`6`,`12` | Subscription length |
| `is_used` | BOOLEAN | Default `false` |
| `used_by_id` | UUID → `users` | Set on redemption |
| `used_at` | TIMESTAMPTZ | Set on redemption |
| `created_by` | UUID → `users` | Optional admin |
| `created_at` | TIMESTAMPTZ | |

### `users` (new columns)

| Column | Type | Notes |
|--------|------|--------|
| `subscription_end_date` | TIMESTAMPTZ | Required for licensed Masters |
| `texas_email_encrypted` | TEXT | App-layer AES-256-GCM (base64) |
| `texas_password_encrypted` | TEXT | App-layer AES-256-GCM (base64) |
| `license_key_id` | TEXT → `license_keys` | Redeemed key |
| `registered_via` | TEXT | `seed` \| `telegram_bot` \| `admin` |

### Hierarchy change

Licensed **Masters** are tenant roots: `role = master` and `parent_id IS NULL` is now allowed.

## SQL functions

| Function | Purpose |
|----------|---------|
| `is_subscription_active(user_id)` | `super_master` always true; else `subscription_end_date > now()` |
| `redeem_license_key(key, user_id)` | Marks key used + sets `subscription_end_date` |
| `generate_license_key(duration, created_by, notes)` | Admin key generation |

## Admin: generate keys (SQL Editor / service role)

```sql
SELECT public.generate_license_key('12'::public.license_duration_months, NULL, 'Annual plan');
```

## Environment (Phase 5 app layer — next step)

```env
CREDENTIALS_ENCRYPTION_KEY=   # 32-byte base64 or hex for AES-256-GCM
TELEGRAM_ADMIN_IDS=123456789  # comma-separated Telegram user IDs
```

Texas credentials are **encrypted in the application** before insert; the database stores ciphertext only.

## RLS

- `license_keys`: users see only their own redeemed key; admin/bot uses `service_role`.
- `api_snapshots`, `daily_ledgers`, `transactions`: restrictive policies require `is_subscription_active()`.

## Next implementation steps

1. `CredentialVault` — encrypt/decrypt Texas email/password.
2. Telegram bot registration FSM (email → password → license key).
3. Subscription guard in `DailyReportOrchestrator` + TMA expired screen.
4. `/api/admin/generate-license` or bot `/genkey` for admin Telegram IDs.
