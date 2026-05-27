-- WhatsApp bot-managed group tracking flags + dispatch fast-path fields

ALTER TABLE public.whatsapp_agent_groups
  ADD COLUMN IF NOT EXISTS created_by_bot BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE public.whatsapp_agent_groups
  ADD COLUMN IF NOT EXISTS last_posted_ledger_date DATE;

ALTER TABLE public.whatsapp_agent_groups
  ADD COLUMN IF NOT EXISTS last_posted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS wag_created_by_bot_idx
  ON public.whatsapp_agent_groups(user_id, affiliate_id, created_by_bot)
  WHERE is_active = true;

