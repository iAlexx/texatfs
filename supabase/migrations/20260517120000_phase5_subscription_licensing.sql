-- =============================================================================
-- TEXAS FUNDS calculate — Phase 5: Subscription & License Management (SaaS)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- License duration enum (1, 3, 6, 12 months)
-- ---------------------------------------------------------------------------
CREATE TYPE public.license_duration_months AS ENUM ('1', '3', '6', '12');

-- ---------------------------------------------------------------------------
-- license_keys — admin-issued keys for Master self-registration
-- ---------------------------------------------------------------------------
CREATE TABLE public.license_keys (
  key               TEXT PRIMARY KEY,
  duration_months   public.license_duration_months NOT NULL,
  is_used           BOOLEAN NOT NULL DEFAULT FALSE,
  used_by_id        UUID REFERENCES public.users(id) ON DELETE SET NULL,
  used_at           TIMESTAMPTZ,
  created_by        UUID REFERENCES public.users(id) ON DELETE SET NULL,
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT license_keys_used_consistency_chk CHECK (
    (is_used = FALSE AND used_by_id IS NULL AND used_at IS NULL)
    OR (is_used = TRUE AND used_by_id IS NOT NULL AND used_at IS NOT NULL)
  )
);

CREATE INDEX license_keys_is_used_idx ON public.license_keys(is_used);
CREATE INDEX license_keys_used_by_id_idx ON public.license_keys(used_by_id);

-- ---------------------------------------------------------------------------
-- users — SaaS subscription + encrypted Texas credentials
-- ---------------------------------------------------------------------------
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS subscription_end_date TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS texas_email_encrypted TEXT,
  ADD COLUMN IF NOT EXISTS texas_password_encrypted TEXT,
  ADD COLUMN IF NOT EXISTS license_key_id TEXT REFERENCES public.license_keys(key) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS registered_via TEXT NOT NULL DEFAULT 'seed';

ALTER TABLE public.users
  DROP CONSTRAINT IF EXISTS users_parent_role_chk;

ALTER TABLE public.users
  ADD CONSTRAINT users_parent_role_chk CHECK (
    (role = 'super_master' AND parent_id IS NULL)
    OR (role = 'master' AND parent_id IS NULL)
    OR (role = 'master' AND parent_id IS NOT NULL)
    OR (role = 'player' AND parent_id IS NOT NULL)
  );

COMMENT ON COLUMN public.users.texas_email_encrypted IS
  'AES-256-GCM ciphertext (base64) — encrypt in app with CREDENTIALS_ENCRYPTION_KEY before insert.';
COMMENT ON COLUMN public.users.texas_password_encrypted IS
  'AES-256-GCM ciphertext (base64) — never store plaintext; decrypt only in secure server context.';
COMMENT ON COLUMN public.users.subscription_end_date IS
  'Masters must have active subscription for sync/TMA; super_master exempt.';
COMMENT ON COLUMN public.users.registered_via IS
  'seed | telegram_bot | admin';

CREATE INDEX users_subscription_end_date_idx
  ON public.users(subscription_end_date)
  WHERE subscription_end_date IS NOT NULL;

CREATE INDEX users_license_key_id_idx ON public.users(license_key_id);

-- Masters registered via license must have subscription + credentials
ALTER TABLE public.users
  ADD CONSTRAINT users_licensed_master_chk CHECK (
    role <> 'master'
    OR registered_via <> 'telegram_bot'
    OR (
      subscription_end_date IS NOT NULL
      AND texas_email_encrypted IS NOT NULL
      AND texas_password_encrypted IS NOT NULL
      AND license_key_id IS NOT NULL
    )
  );

-- ---------------------------------------------------------------------------
-- Helpers: subscription status
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.license_duration_to_interval(
  p_duration public.license_duration_months
)
RETURNS INTERVAL
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_duration
    WHEN '1' THEN INTERVAL '1 month'
    WHEN '3' THEN INTERVAL '3 months'
    WHEN '6' THEN INTERVAL '6 months'
    WHEN '12' THEN INTERVAL '12 months'
  END;
$$;

CREATE OR REPLACE FUNCTION public.subscription_end_from_duration(
  p_duration public.license_duration_months,
  p_start TIMESTAMPTZ DEFAULT now()
)
RETURNS TIMESTAMPTZ
LANGUAGE sql
STABLE
AS $$
  SELECT p_start + public.license_duration_to_interval(p_duration);
$$;

CREATE OR REPLACE FUNCTION public.is_subscription_active(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN u.role = 'super_master' THEN TRUE
    WHEN u.subscription_end_date IS NULL THEN FALSE
    ELSE u.subscription_end_date > now()
  END
  FROM public.users u
  WHERE u.id = p_user_id;
$$;

CREATE OR REPLACE FUNCTION public.current_user_subscription_active()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_subscription_active(public.current_app_user_id());
$$;

-- ---------------------------------------------------------------------------
-- Atomically redeem a license key (called by Telegram bot / service role)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.redeem_license_key(
  p_key TEXT,
  p_user_id UUID
)
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_duration public.license_duration_months;
  v_end TIMESTAMPTZ;
BEGIN
  SELECT duration_months
    INTO v_duration
  FROM public.license_keys
  WHERE key = p_key
    AND is_used = FALSE
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'LICENSE_KEY_INVALID_OR_USED';
  END IF;

  v_end := public.subscription_end_from_duration(v_duration, now());

  UPDATE public.license_keys
  SET is_used = TRUE,
      used_by_id = p_user_id,
      used_at = now()
  WHERE key = p_key;

  UPDATE public.users
  SET subscription_end_date = v_end,
      license_key_id = p_key,
      updated_at = now()
  WHERE id = p_user_id;

  RETURN v_end;
END;
$$;

-- ---------------------------------------------------------------------------
-- Admin: generate a new license key (service role / bot admin command)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.generate_license_key(
  p_duration_months public.license_duration_months,
  p_created_by UUID DEFAULT NULL,
  p_notes TEXT DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key TEXT;
  v_attempts INT := 0;
BEGIN
  LOOP
    v_attempts := v_attempts + 1;
    IF v_attempts > 10 THEN
      RAISE EXCEPTION 'LICENSE_KEY_GENERATION_FAILED';
    END IF;

    v_key := 'TEXAS-' ||
      upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 4)) || '-' ||
      upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 4)) || '-' ||
      upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 4));

    BEGIN
      INSERT INTO public.license_keys (key, duration_months, created_by, notes)
      VALUES (v_key, p_duration_months, p_created_by, p_notes);
      RETURN v_key;
    EXCEPTION WHEN unique_violation THEN
      CONTINUE;
    END;
  END LOOP;
END;
$$;

-- ---------------------------------------------------------------------------
-- Row Level Security — license_keys
-- ---------------------------------------------------------------------------
ALTER TABLE public.license_keys ENABLE ROW LEVEL SECURITY;

-- Authenticated users may only see the key they redeemed (if any)
CREATE POLICY license_keys_select_own ON public.license_keys
  FOR SELECT TO authenticated
  USING (
    used_by_id = public.current_app_user_id()
  );

-- No insert/update/delete for authenticated — bot/cron uses service_role

-- ---------------------------------------------------------------------------
-- Tighten sync-related tables: require active subscription (except super_master)
-- ---------------------------------------------------------------------------
CREATE POLICY api_snapshots_select_subscribed ON public.api_snapshots
  AS RESTRICTIVE
  FOR SELECT TO authenticated
  USING (public.is_subscription_active(user_id));

CREATE POLICY daily_ledgers_select_subscribed ON public.daily_ledgers
  AS RESTRICTIVE
  FOR SELECT TO authenticated
  USING (public.is_subscription_active(user_id));

CREATE POLICY daily_ledgers_update_subscribed ON public.daily_ledgers
  AS RESTRICTIVE
  FOR UPDATE TO authenticated
  USING (
    public.can_view_user(user_id)
    AND status = 'open'
    AND public.is_subscription_active(user_id)
  )
  WITH CHECK (
    public.can_view_user(user_id)
    AND status = 'open'
    AND public.is_subscription_active(user_id)
  );

CREATE POLICY transactions_select_subscribed ON public.transactions
  AS RESTRICTIVE
  FOR SELECT TO authenticated
  USING (public.is_subscription_active(user_id));

CREATE POLICY transactions_insert_subscribed ON public.transactions
  AS RESTRICTIVE
  FOR INSERT TO authenticated
  WITH CHECK (
    public.can_view_user(user_id)
    AND public.is_subscription_active(user_id)
    AND EXISTS (
      SELECT 1 FROM public.daily_ledgers dl
      WHERE dl.id = daily_ledger_id
        AND dl.user_id = transactions.user_id
        AND dl.status = 'open'
    )
  );

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
GRANT SELECT ON public.license_keys TO authenticated;
GRANT ALL ON public.license_keys TO service_role;

GRANT EXECUTE ON FUNCTION public.is_subscription_active(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.current_user_subscription_active() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.subscription_end_from_duration(public.license_duration_months, TIMESTAMPTZ) TO service_role;
GRANT EXECUTE ON FUNCTION public.redeem_license_key(TEXT, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.generate_license_key(public.license_duration_months, UUID, TEXT) TO service_role;
