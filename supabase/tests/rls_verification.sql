-- =============================================================================
-- RLS verification (run in Supabase SQL Editor after migration + seed)
-- Requires three auth.users linked to seed public.users via auth_user_id
-- =============================================================================

-- 1) Link test auth users (replace UUIDs with real auth.users.id from Dashboard)
-- UPDATE public.users SET auth_user_id = '<auth-uuid-super>' WHERE id = 'a0000000-0000-4000-8000-000000000001';
-- UPDATE public.users SET auth_user_id = '<auth-uuid-master>'  WHERE id = 'a0000000-0000-4000-8000-000000000002';
-- UPDATE public.users SET auth_user_id = '<auth-uuid-player>'  WHERE id = 'a0000000-0000-4000-8000-000000000003';

-- 2) As each role (set JWT in SQL Editor "Run as user" or use client):
--    SuperMaster: SELECT count(*) FROM public.users;           -- expect 3
--    Master:      SELECT count(*) FROM public.users;           -- expect 2 (self + player)
--    Player:      SELECT count(*) FROM public.users;           -- expect 1 (self only)

-- 3) Service role insert snapshot (cron path)
-- INSERT INTO public.api_snapshots (
--   user_id, ledger_date, balance, total_deposit, total_withdraw, ngr,
--   raw_wallets, raw_statistics
-- ) VALUES (
--   'a0000000-0000-4000-8000-000000000002',
--   CURRENT_DATE, 10000, 5000, 2000, 150,
--   '{"balance":"10000"}'::jsonb,
--   '{}'::jsonb
-- );

-- 4) Transaction trigger updates Wasel + Al_Nihai
-- INSERT INTO public.transactions (
--   user_id, daily_ledger_id, type, source, amount, raw_message
-- ) VALUES (
--   'a0000000-0000-4000-8000-000000000002',
--   (SELECT id FROM public.daily_ledgers WHERE user_id = 'a0000000-0000-4000-8000-000000000002' AND ledger_date = CURRENT_DATE LIMIT 1),
--   'wasel_menho', 'whatsapp', 500, 'واصل منه 500 ✅'
-- );
-- SELECT wasel_menho, al_nihai FROM public.daily_ledgers WHERE user_id = 'a0000000-0000-4000-8000-000000000002' AND ledger_date = CURRENT_DATE;

-- 5) Daily close carry-forward
-- SELECT public.run_daily_close(CURRENT_DATE);
-- SELECT user_id, ledger_date, baqi_qadim, al_nihai, status
-- FROM public.daily_ledgers
-- WHERE user_id = 'a0000000-0000-4000-8000-000000000002'
-- ORDER BY ledger_date;
