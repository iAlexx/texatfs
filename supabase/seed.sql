-- =============================================================================
-- TEXAS FUNDS calculate — Development seed (hierarchy + open ledgers)
-- Run after Phase 1 migration. Replace placeholder IDs with real values.
-- =============================================================================

-- Fixed UUIDs for reproducible local testing / RLS scripts
-- SuperMaster -> Master -> Player

INSERT INTO public.users (
  id,
  telegram_id,
  role,
  parent_id,
  texas_username,
  texas_affiliate_id,
  display_name
) VALUES
  (
    'a0000000-0000-4000-8000-000000000001',
    1000000001,
    'super_master',
    NULL,
    'supermaster@texas.nsp',
    '2600001',
    'Super Master (seed)'
  ),
  (
    'a0000000-0000-4000-8000-000000000002',
    1000000002,
    'master',
    'a0000000-0000-4000-8000-000000000001',
    'master@agent.nsp',
    '2633181',
    'Master (seed)'
  ),
  (
    'a0000000-0000-4000-8000-000000000003',
    1000000003,
    'player',
    'a0000000-0000-4000-8000-000000000002',
    'player@dashboard.test',
    '375997748',
    'Player (seed)'
  )
ON CONFLICT (id) DO NOTHING;

-- Open ledger for today (Asia/Damascus business date via CURRENT_DATE in DB TZ)
INSERT INTO public.daily_ledgers (user_id, ledger_date, status, baqi_qadim, al_nihai)
SELECT
  u.id,
  CURRENT_DATE,
  'open',
  0,
  0
FROM public.users u
ON CONFLICT (user_id, ledger_date) DO NOTHING;
