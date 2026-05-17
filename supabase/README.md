# Supabase — Phase 1

## Apply migration

### Option A: Supabase Dashboard (recommended if CLI not installed)

1. Create a project at [supabase.com](https://supabase.com).
2. Open **SQL Editor** → **New query**.
3. Paste contents of [`migrations/20260517000000_phase1_foundation.sql`](migrations/20260517000000_phase1_foundation.sql) → **Run**.
4. Paste contents of [`seed.sql`](seed.sql) for dev hierarchy → **Run**.
5. Run checks in [`tests/rls_verification.sql`](tests/rls_verification.sql).

### Option B: Supabase CLI

```bash
npm i -g supabase
supabase login
supabase link --project-ref <your-project-ref>
supabase db push
supabase db seed
```

### Option C: `psql` + direct URL

```powershell
$env:DATABASE_URL = "<direct-connection-string>"
.\scripts\apply-migration.ps1
```

## Schema overview

| Table | Purpose |
|-------|---------|
| `users` | Hierarchy: super_master → master → player |
| `api_snapshots` | Texas API wallet + statistics dumps |
| `daily_ledgers` | Daily accounting (Tebat, Wasel, Al_Nihai, …) |
| `transactions` | WhatsApp / manual events; triggers update Wasel |
| `whatsapp_inbound_log` | Message deduplication |
| `daily_close_runs` | Cron audit |

## RLS

- Authenticated users see their **subtree** (`can_view_user()`).
- Cron and webhooks use **service role** (bypasses RLS).
