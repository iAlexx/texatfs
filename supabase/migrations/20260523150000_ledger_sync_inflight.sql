-- Cross-instance ledger sync lock (one active sync per user + business date).
CREATE TABLE IF NOT EXISTS public.ledger_sync_inflight (
  user_id     UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  ledger_date DATE NOT NULL,
  started_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, ledger_date)
);

CREATE INDEX IF NOT EXISTS ledger_sync_inflight_started_idx
  ON public.ledger_sync_inflight (started_at DESC);

ALTER TABLE public.ledger_sync_inflight ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ledger_sync_inflight_service ON public.ledger_sync_inflight;
CREATE POLICY ledger_sync_inflight_service ON public.ledger_sync_inflight
  FOR ALL
  USING (true)
  WITH CHECK (true);

COMMENT ON TABLE public.ledger_sync_inflight IS
  'Short-lived lock — prevents concurrent Texas ledger sync for same user/date.';
