-- Align Al_Harq with Al_Farq and keep Wasel-driven Al_Nihai in sync.

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

-- Backfill existing rows where burn diverged from net delta.
UPDATE public.daily_ledgers
SET al_harq = al_farq
WHERE al_harq IS DISTINCT FROM al_farq;
