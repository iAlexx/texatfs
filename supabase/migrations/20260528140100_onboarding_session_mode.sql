-- Onboarding: explicit new vs existing account mode

ALTER TABLE public.telegram_onboarding_sessions
  ADD COLUMN IF NOT EXISTS onboarding_mode TEXT
    CHECK (onboarding_mode IS NULL OR onboarding_mode IN ('existing', 'new'));

ALTER TABLE public.telegram_onboarding_sessions
  DROP CONSTRAINT IF EXISTS telegram_onboarding_sessions_step_check;

ALTER TABLE public.telegram_onboarding_sessions
  ADD CONSTRAINT telegram_onboarding_sessions_step_check
  CHECK (
    step IN (
      'choose_mode',
      'email',
      'password',
      'license',
      'renewal_license'
    )
  );
