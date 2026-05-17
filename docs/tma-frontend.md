# Telegram Mini App — Frontend Structure

## Routes

| Path | Component | Purpose |
|------|-----------|---------|
| `/` | redirect | → `/ledger` |
| `/ledger` | `DailyLedgerView` | Daily ledger dashboard |

## Component tree

```
app/layout.tsx          ← Telegram WebApp script + AppProviders
  └── ledger/page.tsx
        └── DailyLedgerView
              ├── useDailyLedgerRealtime()
              └── LedgerRow × 8 fields
```

## Data flow

1. `TelegramProvider` reads `window.Telegram.WebApp` (or `NEXT_PUBLIC_DEV_TELEGRAM_ID` in dev).
2. `POST /api/ledger/daily` validates initData → resolves `users.telegram_id` → returns open ledger.
3. `useDailyLedgerRealtime` subscribes to `postgres_changes` on `daily_ledgers` + 15s poll fallback.
4. Wasel updates from WhatsApp appear when DB trigger updates `wasel_*` / `al_nihai`.

## Run locally

```bash
cp .env.example .env.local
# Set NEXT_PUBLIC_SUPABASE_* , SUPABASE_SERVICE_ROLE_KEY , TELEGRAM_BOT_TOKEN
# NEXT_PUBLIC_DEV_TELEGRAM_ID=1000000002

npm run dev
```

Open `http://localhost:3000/ledger` (browser dev) or load via Telegram Bot Mini App URL.

## Design tokens

- Background: `navy-900` (#0a0e17)
- Panels: `navy-800` + `steel-border`
- Values: `font-mono` metallic (`accent-highlight`)
- Flat only — no gradients

## Realtime note

Full Realtime requires Supabase Auth linked to `public.users.auth_user_id`. Until then, polling (`NEXT_PUBLIC_LEDGER_POLL_MS`) keeps the UI in sync.
