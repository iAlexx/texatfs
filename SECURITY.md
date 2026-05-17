# Security

## Telegram bot token

If a bot token was shared in chat, logs, or git history:

1. Open [@BotFather](https://t.me/BotFather) → `/revoke` or regenerate the token.
2. Set the new value only in deployment secrets (`8692697296:AAEJAE_Q7pOlEP-noDjZ8vx5qnkMTwMOlP8` in Vercel / Supabase Edge secrets).
3. Never commit tokens to SQL, migrations, seed files, or the repository.

## Environment variables

Use [`.env.example`](.env.example) as the template. Copy to `.env.local` locally. Production values belong in Vercel and Supabase project settings only.

## Database access

- **Authenticated users:** RLS enforces subtree visibility via `can_view_user()`.
- **Cron / WhatsApp webhooks:** Use `SUPABASE_SERVICE_ROLE_KEY` server-side only; never expose to the Telegram Mini App client.
