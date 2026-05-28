-- WASender opt-out per user (STOP / إيقاف in private chat)
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS whatsapp_opt_out boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.users.whatsapp_opt_out IS
  'When true, skip non-essential WhatsApp outbound (prompts, hints). Cash confirmations still allowed.';
