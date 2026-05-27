-- Daily ledger dispatch to WhatsApp groups (idempotent dedup + retry audit)

CREATE TABLE IF NOT EXISTS public.whatsapp_ledger_dispatch_log (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id        TEXT NOT NULL,
  affiliate_id    TEXT,
  ledger_date     DATE NOT NULL,

  status          TEXT NOT NULL DEFAULT 'in_progress'
    CHECK (status IN ('in_progress', 'sent', 'failed')),
  attempt_count   INTEGER NOT NULL DEFAULT 0,
  last_error      TEXT,

  message_id      TEXT,
  sent_at          TIMESTAMPTZ,
  last_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (group_id, ledger_date)
);

CREATE INDEX IF NOT EXISTS wl_dlog_ledger_idx
  ON public.whatsapp_ledger_dispatch_log(ledger_date DESC);

CREATE INDEX IF NOT EXISTS wl_dlog_group_idx
  ON public.whatsapp_ledger_dispatch_log(group_id);

-- RLS
ALTER TABLE public.whatsapp_ledger_dispatch_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY wl_dlog_service_all ON public.whatsapp_ledger_dispatch_log
  FOR ALL TO service_role
  USING (TRUE)
  WITH CHECK (TRUE);

-- updated_at trigger (re-uses existing set_updated_at() if present)
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS wl_dlog_updated_at ON public.whatsapp_ledger_dispatch_log;
CREATE TRIGGER wl_dlog_updated_at
  BEFORE UPDATE ON public.whatsapp_ledger_dispatch_log
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

