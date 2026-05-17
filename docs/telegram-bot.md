# Telegram Bot — Registration & Admin

## Webhook

```bash
npm run telegram:webhook -- https://YOUR_DOMAIN/api/telegram/webhook
```

Set `TELEGRAM_WEBHOOK_SECRET` to match the `secret_token` sent to Telegram.

## User flow

1. `/start` — begins onboarding (or welcome back if registered)
2. Texas email
3. Texas password (encrypted in `telegram_onboarding_sessions`)
4. License key → validates Texas login → `redeem_license_key` → creates `users` + `daily_ledgers`

## Admin

Only Telegram IDs in `TELEGRAM_ADMIN_IDS`:

```
/genkey 12
/genkey 3
```

Calls `generate_license_key` in Postgres.

## Required env

```env
TELEGRAM_BOT_TOKEN=
TELEGRAM_ADMIN_IDS=
CREDENTIALS_ENCRYPTION_KEY=
TEXAS_API_BASE_URL=
```

## Migrations

Apply Phase 5 + onboarding session migration:

- `20260517120000_phase5_subscription_licensing.sql`
- `20260517130000_telegram_onboarding_sessions.sql`
