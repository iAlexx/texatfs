# TEXAS FUNDS calculate

Telegram Mini App and SaaS platform for Texas dashboard financial ledgers: API sync, double-entry accounting, and license-based Master onboarding.

## Stack

- Next.js 14 (App Router) + TypeScript
- Supabase (PostgreSQL, RLS)
- Railway (Docker + Chromium + Puppeteer)
- Texas agents API (`agents.texas4win.com`)

## Quick start (local)

```bash
cp .env.example .env.local
# Fill Supabase, Telegram, CREDENTIALS_ENCRYPTION_KEY, etc.

npm install
npm run dev
```

Telegram bot locally (two terminals):

```bash
npm run dev
npm run telegram:poll
```

Apply Supabase migrations in `supabase/migrations/` (see `supabase/README.md`).

## Deploy to Railway + GitHub

### 1. Push to GitHub

```bash
git add .
git commit -m "Prepare Railway production deployment"
git push origin main
```

Repo: `https://github.com/iAlexx/texatfs.git`

### 2. Create Railway project

1. [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub repo**
2. Select `texatfs` / `main`
3. Railway detects `Dockerfile` + `railway.toml` automatically

### 3. Railway variables

Copy from [`.env.railway.example`](.env.railway.example) into **Railway → Variables**.

| Variable | Required |
|----------|----------|
| `TELEGRAM_BOT_TOKEN` | Yes |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes |
| `CREDENTIALS_ENCRYPTION_KEY` | Yes (32+ bytes) |
| `TEXAS_HTTP_PROXY` | Strongly recommended |
| `TEXAS_API_BASE_URL` | Yes |
| `NEXT_PUBLIC_APP_URL` | Yes (your Railway URL) |
| `TELEGRAM_MINI_APP_URL` | Yes (`{URL}/ledger`) |
| `TELEGRAM_ADMIN_IDS` | Yes for `/genkey` |

Do **not** set `LOCAL_DEBUG` on Railway.

Recommended: `NODE_OPTIONS=--max-old-space-size=2048`, `TELEGRAM_WEBHOOK_ASYNC=true`

### 4. Service settings

- **Memory:** at least **2 GB** (Puppeteer)
- **Public networking:** generate domain → `https://xxx.up.railway.app`

### 5. After deploy

```bash
# Health (chromium + loader should be true)
curl https://YOUR-APP.up.railway.app/api/health

# Register Telegram webhook (from your laptop)
npm run telegram:webhook -- https://YOUR-APP.up.railway.app/api/telegram/webhook
npm run telegram:check

# Or
npm run railway:verify -- https://YOUR-APP.up.railway.app
```

Test onboarding with a **new** Telegram user (or unused license key).

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Local Next.js |
| `npm run telegram:poll` | Local Telegram → localhost (dev only) |
| `npm run telegram:webhook -- <url>` | Register production webhook |
| `npm run telegram:check` | Webhook status |
| `npm run probe:texas-browser` | Puppeteer smoke test |
| `npm run railway:verify -- <url>` | Post-deploy health check |

## Docs

- [Accounting engine](docs/accounting-engine.md)
- [Phase 5 licensing](docs/phase5-licensing.md)
- [Telegram bot](docs/telegram-bot.md)
