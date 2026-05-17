-- =============================================================================
-- TEXAS FUNDS calculate — Phase 1 Foundation
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
CREATE TYPE public.user_role AS ENUM ('super_master', 'master', 'player');

CREATE TYPE public.ledger_status AS ENUM ('open', 'closed');

CREATE TYPE public.transaction_type AS ENUM (
  'wasel_menho',
  'wasel_eleih',
  'manual_adjustment'
);

CREATE TYPE public.transaction_source AS ENUM (
  'whatsapp',
  'manual',
  'system',
  'api'
);

-- ---------------------------------------------------------------------------
-- users (hierarchy + Telegram + Texas agent mapping)
-- ---------------------------------------------------------------------------
CREATE TABLE public.users (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id    UUID UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,
  telegram_id     BIGINT UNIQUE,
  role            public.user_role NOT NULL,
  parent_id       UUID REFERENCES public.users(id) ON DELETE RESTRICT,
  texas_username  TEXT,
  texas_affiliate_id TEXT,
  display_name    TEXT,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT users_parent_role_chk CHECK (
    (role = 'super_master' AND parent_id IS NULL)
    OR (role IN ('master', 'player') AND parent_id IS NOT NULL)
  ),
  CONSTRAINT users_super_master_parent_chk CHECK (
    role <> 'super_master' OR parent_id IS NULL
  )
);

CREATE INDEX users_parent_id_idx ON public.users(parent_id);
CREATE INDEX users_role_idx ON public.users(role);
CREATE INDEX users_texas_affiliate_id_idx ON public.users(texas_affiliate_id);

-- ---------------------------------------------------------------------------
-- api_snapshots (cron-fetched Texas API dumps)
-- ---------------------------------------------------------------------------
CREATE TABLE public.api_snapshots (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  ledger_date       DATE NOT NULL,
  captured_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  currency_code     TEXT NOT NULL DEFAULT 'NSP',

  balance           NUMERIC(20, 4) NOT NULL,
  total_deposit     NUMERIC(20, 4) NOT NULL,
  total_withdraw    NUMERIC(20, 4) NOT NULL,
  ngr               NUMERIC(20, 4) NOT NULL,

  raw_wallets       JSONB NOT NULL DEFAULT '{}',
  raw_statistics    JSONB NOT NULL DEFAULT '{}',

  previous_snapshot_id UUID REFERENCES public.api_snapshots(id) ON DELETE SET NULL,
  fetch_source        TEXT NOT NULL DEFAULT 'cron',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT api_snapshots_nonneg_chk CHECK (
    balance >= 0 AND total_deposit >= 0 AND total_withdraw >= 0
  )
);

CREATE INDEX api_snapshots_user_date_idx
  ON public.api_snapshots(user_id, ledger_date DESC, captured_at DESC);

CREATE UNIQUE INDEX api_snapshots_user_capture_uniq
  ON public.api_snapshots(user_id, captured_at);

-- ---------------------------------------------------------------------------
-- daily_ledgers (Accounting Engine output per user per business day)
-- ---------------------------------------------------------------------------
CREATE TABLE public.daily_ledgers (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  ledger_date       DATE NOT NULL,
  status            public.ledger_status NOT NULL DEFAULT 'open',

  tebat             NUMERIC(20, 4) NOT NULL DEFAULT 0,
  suhoubat          NUMERIC(20, 4) NOT NULL DEFAULT 0,
  al_farq           NUMERIC(20, 4) NOT NULL DEFAULT 0,
  al_harq           NUMERIC(20, 4) NOT NULL DEFAULT 0,

  wasel_menho       NUMERIC(20, 4) NOT NULL DEFAULT 0,
  wasel_eleih       NUMERIC(20, 4) NOT NULL DEFAULT 0,

  baqi_qadim        NUMERIC(20, 4) NOT NULL DEFAULT 0,
  al_nihai          NUMERIC(20, 4) NOT NULL DEFAULT 0,

  children_rollup_al_nihai NUMERIC(20, 4),
  discrepancy_flag  BOOLEAN NOT NULL DEFAULT FALSE,
  discrepancy_detail JSONB NOT NULL DEFAULT '{}',

  opening_snapshot_id UUID REFERENCES public.api_snapshots(id) ON DELETE SET NULL,
  closing_snapshot_id UUID REFERENCES public.api_snapshots(id) ON DELETE SET NULL,
  previous_ledger_id  UUID REFERENCES public.daily_ledgers(id) ON DELETE SET NULL,

  closed_at         TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT daily_ledgers_user_date_uniq UNIQUE (user_id, ledger_date),
  CONSTRAINT daily_ledgers_al_nihai_formula_chk CHECK (
    al_nihai = (al_farq + wasel_eleih - wasel_menho + baqi_qadim)
  )
);

CREATE INDEX daily_ledgers_date_status_idx
  ON public.daily_ledgers(ledger_date, status);

-- ---------------------------------------------------------------------------
-- transactions (WhatsApp, manual, system)
-- ---------------------------------------------------------------------------
CREATE TABLE public.transactions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  daily_ledger_id   UUID NOT NULL REFERENCES public.daily_ledgers(id) ON DELETE CASCADE,
  type              public.transaction_type NOT NULL,
  source            public.transaction_source NOT NULL,
  amount            NUMERIC(20, 4) NOT NULL,
  currency_code     TEXT NOT NULL DEFAULT 'NSP',

  raw_message       TEXT,
  whatsapp_group_id TEXT,
  whatsapp_message_id TEXT,
  parsed_direction  TEXT,
  is_confirmed      BOOLEAN NOT NULL DEFAULT TRUE,

  created_by        UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT transactions_amount_positive_chk CHECK (amount > 0)
);

CREATE UNIQUE INDEX transactions_whatsapp_dedup_idx
  ON public.transactions(whatsapp_message_id)
  WHERE whatsapp_message_id IS NOT NULL;

CREATE INDEX transactions_ledger_idx ON public.transactions(daily_ledger_id);

-- ---------------------------------------------------------------------------
-- whatsapp_inbound_log (idempotency + audit before transaction insert)
-- ---------------------------------------------------------------------------
CREATE TABLE public.whatsapp_inbound_log (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  whatsapp_message_id TEXT NOT NULL UNIQUE,
  whatsapp_group_id   TEXT,
  raw_body            TEXT NOT NULL,
  matched             BOOLEAN NOT NULL DEFAULT FALSE,
  parsed_type         public.transaction_type,
  parsed_amount       NUMERIC(20, 4),
  assigned_user_id    UUID REFERENCES public.users(id) ON DELETE SET NULL,
  transaction_id      UUID REFERENCES public.transactions(id) ON DELETE SET NULL,
  received_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- daily_close_runs (cron audit trail)
-- ---------------------------------------------------------------------------
CREATE TABLE public.daily_close_runs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ledger_date   DATE NOT NULL,
  timezone      TEXT NOT NULL DEFAULT 'Asia/Damascus',
  started_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at   TIMESTAMPTZ,
  success       BOOLEAN,
  error_detail  JSONB NOT NULL DEFAULT '{}'
);

-- ---------------------------------------------------------------------------
-- Helpers: updated_at, visibility, ledger math
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER users_set_updated_at
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER daily_ledgers_set_updated_at
  BEFORE UPDATE ON public.daily_ledgers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.current_app_user_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT u.id
  FROM public.users u
  WHERE u.auth_user_id = auth.uid()
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.can_view_user(target_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH RECURSIVE subtree AS (
    SELECT id FROM public.users WHERE id = public.current_app_user_id()
    UNION ALL
    SELECT u.id
    FROM public.users u
    INNER JOIN subtree s ON u.parent_id = s.id
  )
  SELECT EXISTS (
    SELECT 1 FROM subtree WHERE id = target_user_id
  );
$$;

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
      al_nihai = v_row.al_farq + v_eleih - v_menho + v_row.baqi_qadim,
      updated_at = now()
  WHERE id = p_ledger_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_transactions_refresh_ledger()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.refresh_ledger_wasel(COALESCE(NEW.daily_ledger_id, OLD.daily_ledger_id));
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER transactions_refresh_ledger
  AFTER INSERT OR UPDATE OR DELETE ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.trg_transactions_refresh_ledger();

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
  LOOP
    UPDATE public.daily_ledgers
    SET status = 'closed', closed_at = now(), updated_at = now()
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

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_ledgers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_inbound_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_close_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY users_select_subtree ON public.users
  FOR SELECT TO authenticated
  USING (public.can_view_user(id));

CREATE POLICY users_update_self ON public.users
  FOR UPDATE TO authenticated
  USING (id = public.current_app_user_id())
  WITH CHECK (id = public.current_app_user_id());

CREATE POLICY api_snapshots_select_subtree ON public.api_snapshots
  FOR SELECT TO authenticated
  USING (public.can_view_user(user_id));

CREATE POLICY daily_ledgers_select_subtree ON public.daily_ledgers
  FOR SELECT TO authenticated
  USING (public.can_view_user(user_id));

CREATE POLICY daily_ledgers_update_open_own_subtree ON public.daily_ledgers
  FOR UPDATE TO authenticated
  USING (public.can_view_user(user_id) AND status = 'open')
  WITH CHECK (public.can_view_user(user_id) AND status = 'open');

CREATE POLICY transactions_select_subtree ON public.transactions
  FOR SELECT TO authenticated
  USING (public.can_view_user(user_id));

CREATE POLICY transactions_insert_subtree ON public.transactions
  FOR INSERT TO authenticated
  WITH CHECK (
    public.can_view_user(user_id)
    AND EXISTS (
      SELECT 1 FROM public.daily_ledgers dl
      WHERE dl.id = daily_ledger_id
        AND dl.user_id = transactions.user_id
        AND dl.status = 'open'
    )
  );

CREATE POLICY whatsapp_log_select_subtree ON public.whatsapp_inbound_log
  FOR SELECT TO authenticated
  USING (
    assigned_user_id IS NULL
    OR public.can_view_user(assigned_user_id)
  );

CREATE POLICY daily_close_runs_select ON public.daily_close_runs
  FOR SELECT TO authenticated
  USING (TRUE);

-- ---------------------------------------------------------------------------
-- Realtime (ledger + transactions for TMA dashboard)
-- ---------------------------------------------------------------------------
ALTER PUBLICATION supabase_realtime ADD TABLE public.daily_ledgers;
ALTER PUBLICATION supabase_realtime ADD TABLE public.transactions;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
GRANT USAGE ON SCHEMA public TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT EXECUTE ON FUNCTION public.refresh_ledger_wasel(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.run_daily_close(DATE) TO service_role;
GRANT EXECUTE ON FUNCTION public.current_app_user_id() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_view_user(UUID) TO authenticated, service_role;
