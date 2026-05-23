-- Cross-instance webhook idempotency (Telegram update_id, WhatsApp messageId).
CREATE TABLE IF NOT EXISTS public.webhook_dedup (
  source     TEXT NOT NULL CHECK (source IN ('telegram', 'whatsapp')),
  event_key  TEXT NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (source, event_key)
);

CREATE INDEX IF NOT EXISTS webhook_dedup_received_idx
  ON public.webhook_dedup (received_at DESC);

ALTER TABLE public.webhook_dedup ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS webhook_dedup_service ON public.webhook_dedup;
CREATE POLICY webhook_dedup_service ON public.webhook_dedup
  FOR ALL
  USING (true)
  WITH CHECK (true);

COMMENT ON TABLE public.webhook_dedup IS
  'Idempotency keys for webhook delivery retries. Detection only — no business data.';
