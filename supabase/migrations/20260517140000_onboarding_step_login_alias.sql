-- Allow 'login' as alias for step 1 (code may use email or login)
ALTER TABLE public.telegram_onboarding_sessions
  DROP CONSTRAINT IF EXISTS telegram_onboarding_sessions_step_check;

ALTER TABLE public.telegram_onboarding_sessions
  ADD CONSTRAINT telegram_onboarding_sessions_step_check
  CHECK (step IN ('email', 'login', 'password', 'license'));
