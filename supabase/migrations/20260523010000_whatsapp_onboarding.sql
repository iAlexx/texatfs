-- WhatsApp master onboarding: phone registration + emoji handshake state machine

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS whatsapp_phone TEXT,
  ADD COLUMN IF NOT EXISTS onboarding_status TEXT NOT NULL DEFAULT 'PENDING_REGISTRATION';

-- Backfill existing rows (ADD COLUMN ... DEFAULT only applies to new inserts on some PG versions)
UPDATE public.users
SET onboarding_status = 'PENDING_REGISTRATION'
WHERE onboarding_status IS NULL;

ALTER TABLE public.users
  DROP CONSTRAINT IF EXISTS users_onboarding_status_chk;

ALTER TABLE public.users
  ADD CONSTRAINT users_onboarding_status_chk
  CHECK (onboarding_status IN (
    'PENDING_REGISTRATION',
    'PENDING_EMOJI',
    'VERIFIED_COMPLETED'
  ));

CREATE UNIQUE INDEX IF NOT EXISTS users_whatsapp_phone_idx
  ON public.users (whatsapp_phone)
  WHERE whatsapp_phone IS NOT NULL;

-- Per-agent group invite links (chat.whatsapp.com/…)
ALTER TABLE whatsapp_agent_groups
  ADD COLUMN IF NOT EXISTS invite_link TEXT;
