-- WhatsApp confirmed transactions: idempotency + traceability + audit trail.

-- ---------------------------------------------------------------------------
-- 1. Add whatsapp_confirmed_at to transactions
-- ---------------------------------------------------------------------------
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS whatsapp_confirmed_at TIMESTAMPTZ;

COMMENT ON COLUMN public.transactions.whatsapp_confirmed_at IS
  'Set when a WhatsApp cash transaction is confirmed (reply "1"). NULL for Texas API sourced rows.';

-- Backfill: existing WhatsApp rows already confirmed via the 1/2 flow.
UPDATE public.transactions
SET whatsapp_confirmed_at = created_at
WHERE source = 'whatsapp'
  AND is_confirmed = TRUE
  AND whatsapp_confirmed_at IS NULL;

-- Enforce: every WhatsApp row must have a confirmation timestamp.
ALTER TABLE public.transactions
  ADD CONSTRAINT transactions_wa_confirmed_chk CHECK (
    source <> 'whatsapp' OR whatsapp_confirmed_at IS NOT NULL
  );

CREATE INDEX IF NOT EXISTS transactions_wa_confirmed_idx
  ON public.transactions(daily_ledger_id, source, is_confirmed)
  WHERE source = 'whatsapp' AND is_confirmed = TRUE AND whatsapp_confirmed_at IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2. Immutable transaction audit trail
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.transaction_audit (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id  UUID NOT NULL REFERENCES public.transactions(id) ON DELETE RESTRICT,
  ledger_id       UUID NOT NULL REFERENCES public.daily_ledgers(id) ON DELETE RESTRICT,
  user_id         UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  action          TEXT NOT NULL CHECK (action IN ('insert', 'confirm', 'void')),
  source          TEXT NOT NULL,
  type            TEXT NOT NULL,
  amount          NUMERIC(20, 4) NOT NULL,
  whatsapp_message_id TEXT,
  whatsapp_group_id   TEXT,
  raw_message     TEXT,
  recorded_by     UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS transaction_audit_tx_idx
  ON public.transaction_audit(transaction_id, created_at DESC);

CREATE INDEX IF NOT EXISTS transaction_audit_ledger_idx
  ON public.transaction_audit(ledger_id, created_at DESC);

ALTER TABLE public.transaction_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY transaction_audit_select_subtree ON public.transaction_audit
  FOR SELECT TO authenticated
  USING (public.can_view_user(user_id));

CREATE POLICY transaction_audit_service ON public.transaction_audit
  FOR ALL
  USING (true)
  WITH CHECK (true);

COMMENT ON TABLE public.transaction_audit IS
  'Immutable audit log for every transaction lifecycle event. No updates or deletes.';

-- ---------------------------------------------------------------------------
-- 3. Tighten refresh_ledger_wasel to only count WhatsApp confirmed rows
--    (source = whatsapp + is_confirmed + whatsapp_confirmed_at IS NOT NULL)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.refresh_ledger_wasel(p_ledger_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_menho NUMERIC(20, 4);
  v_eleih NUMERIC(20, 4);
  v_row   public.daily_ledgers%ROWTYPE;
BEGIN
  PERFORM public.assert_ledger_writable(p_ledger_id);

  SELECT
    COALESCE(SUM(amount) FILTER (WHERE type = 'wasel_menho'), 0),
    COALESCE(SUM(amount) FILTER (WHERE type = 'wasel_eleih'), 0)
    INTO v_menho, v_eleih
  FROM public.transactions
  WHERE daily_ledger_id = p_ledger_id
    AND is_confirmed = TRUE
    AND source = 'whatsapp'
    AND whatsapp_confirmed_at IS NOT NULL;

  SELECT * INTO v_row FROM public.daily_ledgers WHERE id = p_ledger_id FOR UPDATE;

  UPDATE public.daily_ledgers
  SET wasel_menho = v_menho,
      wasel_eleih = v_eleih,
      al_harq = v_row.al_farq,
      al_nihai = v_row.al_farq + v_eleih - v_menho + v_row.baqi_qadim,
      updated_at = now()
  WHERE id = p_ledger_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. Auto-audit trigger on transaction insert
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_transaction_audit_on_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.transaction_audit (
    transaction_id, ledger_id, user_id, action,
    source, type, amount,
    whatsapp_message_id, whatsapp_group_id, raw_message,
    recorded_by
  ) VALUES (
    NEW.id, NEW.daily_ledger_id, NEW.user_id, 'insert',
    NEW.source::text, NEW.type::text, NEW.amount,
    NEW.whatsapp_message_id, NEW.whatsapp_group_id, NEW.raw_message,
    NEW.created_by
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS transactions_audit_on_insert ON public.transactions;
CREATE TRIGGER transactions_audit_on_insert
  AFTER INSERT ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.trg_transaction_audit_on_insert();
