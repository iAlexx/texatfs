-- Telegram bot registration FSM (serverless-safe state)
CREATE TABLE public.telegram_onboarding_sessions (
  telegram_id              BIGINT PRIMARY KEY,
  step                     TEXT NOT NULL CHECK (step IN ('email', 'password', 'license')),
  texas_email_encrypted    TEXT,
  texas_password_encrypted TEXT,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER telegram_onboarding_sessions_set_updated_at
  BEFORE UPDATE ON public.telegram_onboarding_sessions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.telegram_onboarding_sessions ENABLE ROW LEVEL SECURITY;

GRANT ALL ON public.telegram_onboarding_sessions TO service_role;
