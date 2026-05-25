-- Daily ledger close & lock: immutable financial rows after close.

ALTER TABLE public.daily_ledgers
  ADD COLUMN IF NOT EXISTS closed_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS close_reason TEXT,
  ADD COLUMN IF NOT EXISTS is_locked BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS calculation_trace JSONB NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.daily_ledgers.closed_by IS
  'App user (public.users.id) who closed the ledger.';
COMMENT ON COLUMN public.daily_ledgers.is_locked IS
  'When true, all financial columns are immutable.';
COMMENT ON COLUMN public.daily_ledgers.calculation_trace IS
  'Snapshot of formula inputs at close time (audit).';

-- Existing closed rows from cron / manual close are locked retroactively.
UPDATE public.daily_ledgers
SET is_locked = TRUE
WHERE status = 'closed' AND closed_at IS NOT NULL AND is_locked = FALSE;

-- ---------------------------------------------------------------------------
-- Close audit trail (immutable)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ledger_close_audit (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ledger_id       UUID NOT NULL REFERENCES public.daily_ledgers(id) ON DELETE RESTRICT,
  user_id         UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  closed_by       UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  close_reason    TEXT,
  previous_snapshot JSONB NOT NULL,
  calculation_trace JSONB NOT NULL,
  closed_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ledger_close_audit_ledger_idx
  ON public.ledger_close_audit(ledger_id, closed_at DESC);

ALTER TABLE public.ledger_close_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ledger_close_audit_select_subtree ON public.ledger_close_audit;
CREATE POLICY ledger_close_audit_select_subtree ON public.ledger_close_audit
  FOR SELECT TO authenticated
  USING (public.can_view_user(user_id));

DROP POLICY IF EXISTS ledger_close_audit_service ON public.ledger_close_audit;
CREATE POLICY ledger_close_audit_service ON public.ledger_close_audit
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- Block writes to locked ledgers (financial columns + wasel refresh)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.assert_ledger_writable(p_ledger_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_locked BOOLEAN;
BEGIN
  SELECT is_locked INTO v_locked
  FROM public.daily_ledgers
  WHERE id = p_ledger_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'LEDGER_NOT_FOUND';
  END IF;

  IF v_locked THEN
    RAISE EXCEPTION 'LEDGER_LOCKED';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_daily_ledgers_block_locked_update()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.is_locked THEN
    IF NEW.tebat IS DISTINCT FROM OLD.tebat
      OR NEW.suhoubat IS DISTINCT FROM OLD.suhoubat
      OR NEW.al_farq IS DISTINCT FROM OLD.al_farq
      OR NEW.al_harq IS DISTINCT FROM OLD.al_harq
      OR NEW.wasel_menho IS DISTINCT FROM OLD.wasel_menho
      OR NEW.wasel_eleih IS DISTINCT FROM OLD.wasel_eleih
      OR NEW.baqi_qadim IS DISTINCT FROM OLD.baqi_qadim
      OR NEW.al_nihai IS DISTINCT FROM OLD.al_nihai
      OR NEW.status IS DISTINCT FROM OLD.status
      OR NEW.is_locked IS DISTINCT FROM OLD.is_locked
    THEN
      RAISE EXCEPTION 'LEDGER_LOCKED';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS daily_ledgers_block_locked_update ON public.daily_ledgers;
CREATE TRIGGER daily_ledgers_block_locked_update
  BEFORE UPDATE ON public.daily_ledgers
  FOR EACH ROW EXECUTE FUNCTION public.trg_daily_ledgers_block_locked_update();

CREATE OR REPLACE FUNCTION public.trg_transactions_block_locked_ledger()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.assert_ledger_writable(
    COALESCE(NEW.daily_ledger_id, OLD.daily_ledger_id)
  );
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS transactions_block_locked_ledger ON public.transactions;
CREATE TRIGGER transactions_block_locked_ledger
  BEFORE INSERT OR UPDATE OR DELETE ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.trg_transactions_block_locked_ledger();

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

  SELECT COALESCE(SUM(amount) FILTER (WHERE type = 'wasel_menho'), 0),
         COALESCE(SUM(amount) FILTER (WHERE type = 'wasel_eleih'), 0)
    INTO v_menho, v_eleih
  FROM public.transactions
  WHERE daily_ledger_id = p_ledger_id
    AND is_confirmed = TRUE;

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
-- Atomic close (single transaction)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.close_daily_ledger(
  p_ledger_id UUID,
  p_closed_by UUID,
  p_close_reason TEXT DEFAULT NULL
)
RETURNS public.daily_ledgers
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.daily_ledgers%ROWTYPE;
  v_expected NUMERIC(20, 4);
  v_trace JSONB;
  v_prev JSONB;
BEGIN
  SELECT * INTO v_row
  FROM public.daily_ledgers
  WHERE id = p_ledger_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'LEDGER_NOT_FOUND';
  END IF;

  IF NOT public.can_view_user_for(p_closed_by, v_row.user_id) THEN
    RAISE EXCEPTION 'LEDGER_ACCESS_DENIED';
  END IF;

  IF v_row.is_locked OR v_row.status = 'closed' OR v_row.closed_at IS NOT NULL THEN
    RAISE EXCEPTION 'LEDGER_ALREADY_CLOSED';
  END IF;

  v_expected := v_row.al_farq + v_row.wasel_eleih - v_row.wasel_menho + v_row.baqi_qadim;
  IF round(v_row.al_nihai::numeric, 4) <> round(v_expected::numeric, 4) THEN
    RAISE EXCEPTION 'LEDGER_FORMULA_MISMATCH';
  END IF;

  v_trace := jsonb_build_object(
    'tebat', v_row.tebat,
    'suhoubat', v_row.suhoubat,
    'al_farq', v_row.al_farq,
    'al_harq', v_row.al_harq,
    'wasel_menho', v_row.wasel_menho,
    'wasel_eleih', v_row.wasel_eleih,
    'baqi_qadim', v_row.baqi_qadim,
    'al_nihai', v_row.al_nihai,
    'formula', 'al_farq + wasel_eleih - wasel_menho + baqi_qadim',
    'closed_at', now()
  );

  v_prev := jsonb_build_object(
    'tebat', v_row.tebat,
    'suhoubat', v_row.suhoubat,
    'al_farq', v_row.al_farq,
    'al_harq', v_row.al_harq,
    'wasel_menho', v_row.wasel_menho,
    'wasel_eleih', v_row.wasel_eleih,
    'baqi_qadim', v_row.baqi_qadim,
    'al_nihai', v_row.al_nihai,
    'status', v_row.status,
    'discrepancy_flag', v_row.discrepancy_flag
  );

  UPDATE public.daily_ledgers
  SET status = 'closed',
      closed_at = now(),
      closed_by = p_closed_by,
      close_reason = p_close_reason,
      is_locked = TRUE,
      calculation_trace = v_trace,
      updated_at = now()
  WHERE id = p_ledger_id
  RETURNING * INTO v_row;

  INSERT INTO public.ledger_close_audit (
    ledger_id,
    user_id,
    closed_by,
    close_reason,
    previous_snapshot,
    calculation_trace
  ) VALUES (
    p_ledger_id,
    v_row.user_id,
    p_closed_by,
    p_close_reason,
    v_prev,
    v_trace
  );

  RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.close_daily_ledger(UUID, UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.assert_ledger_writable(UUID) TO service_role;

-- Cron bulk close also locks rows
CREATE OR REPLACE FUNCTION public.run_daily_close(p_ledger_date DATE)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT id, user_id, al_nihai
    FROM public.daily_ledgers
    WHERE ledger_date = p_ledger_date
      AND status = 'open'
      AND is_locked = FALSE
  LOOP
    UPDATE public.daily_ledgers
    SET status = 'closed',
        closed_at = now(),
        is_locked = TRUE,
        updated_at = now()
    WHERE id = r.id;

    INSERT INTO public.daily_ledgers (
      user_id,
      ledger_date,
      baqi_qadim,
      al_nihai,
      status,
      previous_ledger_id
    )
    VALUES (
      r.user_id,
      p_ledger_date + 1,
      r.al_nihai,
      r.al_nihai,
      'open',
      r.id
    )
    ON CONFLICT (user_id, ledger_date)
    DO UPDATE SET
      baqi_qadim = EXCLUDED.baqi_qadim,
      al_nihai = EXCLUDED.al_nihai,
      previous_ledger_id = EXCLUDED.previous_ledger_id,
      updated_at = now();
  END LOOP;
END;
$$;

-- RLS: no updates on locked ledgers
DROP POLICY IF EXISTS daily_ledgers_update_open_own_subtree ON public.daily_ledgers;
CREATE POLICY daily_ledgers_update_open_unlocked_subtree ON public.daily_ledgers
  FOR UPDATE TO authenticated
  USING (
    public.can_view_user(user_id)
    AND status = 'open'
    AND is_locked = FALSE
  )
  WITH CHECK (
    public.can_view_user(user_id)
    AND status = 'open'
    AND is_locked = FALSE
  );

DROP POLICY IF EXISTS daily_ledgers_update_subscribed ON public.daily_ledgers;
CREATE POLICY daily_ledgers_update_subscribed ON public.daily_ledgers
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = daily_ledgers.user_id
        AND u.is_active = TRUE
    )
    AND status = 'open'
    AND is_locked = FALSE
  )
  WITH CHECK (
    status = 'open'
    AND is_locked = FALSE
  );
