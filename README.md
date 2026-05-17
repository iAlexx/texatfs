# TEXAS FUNDS calculate

Telegram Mini App and SaaS platform for Texas dashboard financial ledgers: API sync, double-entry accounting, WhatsApp confirmations, and license-based Master onboarding.

## Stack

- Next.js 14 (App Router) + TypeScript
- Supabase (PostgreSQL, RLS, Realtime)
- Vercel deployment
- Texas dashboard API integration

## Quick start

```bash
cp .env.example .env.local
# Fill in Supabase, Telegram, Texas API, CREDENTIALS_ENCRYPTION_KEY

npm install
npm run dev
```

Apply Supabase migrations in `supabase/migrations/` (see `supabase/README.md`).

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Local Next.js dev server |
| `npm run build` | Production build |
| `npm run live:texas-sync` | Live Texas API smoke test |
| `npm run telegram:webhook -- <url>` | Register Telegram webhook |

## Docs

- [Accounting engine](docs/accounting-engine.md)
- [Phase 5 licensing](docs/phase5-licensing.md)
- [Telegram bot](docs/telegram-bot.md)
- [TMA frontend](docs/tma-frontend.md)
