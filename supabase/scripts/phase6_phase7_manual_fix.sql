-- Run in Supabase SQL Editor if Phase 6 failed partway through.
-- Safe to re-run: uses IF NOT EXISTS / DROP IF EXISTS.

-- ── Phase 6 remainder (skip if already applied) ─────────────────────────────

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS is_frozen BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS referral_code TEXT,
  ADD COLUMN IF NOT EXISTS referred_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS referral_reward_days INT NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX IF NOT EXISTS users_referral_code_uq
  ON public.users (referral_code)
  WHERE referral_code IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.cumulative_metrics (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  metric_date     DATE NOT NULL,
  net_profit      NUMERIC(18, 4) NOT NULL DEFAULT 0,
  cumulative_net  NUMERIC(18, 4) NOT NULL DEFAULT 0,
  al_nihai        NUMERIC(18, 4) NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, metric_date)
);

CREATE INDEX IF NOT EXISTS cumulative_metrics_user_date_idx
  ON public.cumulative_metrics (user_id, metric_date DESC);

ALTER TABLE public.cumulative_metrics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cumulative_metrics_service ON public.cumulative_metrics;
CREATE POLICY cumulative_metrics_service ON public.cumulative_metrics
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.sync_logs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID REFERENCES public.users(id) ON DELETE SET NULL,
  status        TEXT NOT NULL CHECK (status IN ('success', 'failed')),
  error_message TEXT,
  ledger_date   DATE,
  duration_ms   INT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sync_logs_created_idx
  ON public.sync_logs (created_at DESC);

CREATE INDEX IF NOT EXISTS sync_logs_user_idx
  ON public.sync_logs (user_id, created_at DESC);

ALTER TABLE public.sync_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sync_logs_service ON public.sync_logs;
CREATE POLICY sync_logs_service ON public.sync_logs
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.is_subscription_active(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role TEXT;
  v_end DATE;
  v_frozen BOOLEAN;
  v_active BOOLEAN;
BEGIN
  SELECT role, subscription_end_date, is_frozen, is_active
  INTO v_role, v_end, v_frozen, v_active
  FROM public.users
  WHERE id = p_user_id;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF NOT v_active OR v_frozen THEN
    RETURN false;
  END IF;

  IF v_role = 'super_master' THEN
    RETURN true;
  END IF;

  IF v_end IS NULL THEN
    RETURN false;
  END IF;

  RETURN v_end >= CURRENT_DATE;
END;
$$;

UPDATE public.users
SET referral_code = upper(substr(replace(id::text, '-', ''), 1, 8))
WHERE referral_code IS NULL AND role = 'master';

-- ── Phase 7 ─────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.can_view_user_for(
  p_viewer_id UUID,
  p_target_id UUID
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH RECURSIVE subtree AS (
    SELECT id FROM public.users WHERE id = p_viewer_id
    UNION ALL
    SELECT u.id
    FROM public.users u
    INNER JOIN subtree s ON u.parent_id = s.id
  )
  SELECT EXISTS (
    SELECT 1 FROM subtree WHERE id = p_target_id
  );
$$;

CREATE OR REPLACE FUNCTION public.get_descendant_user_ids(p_root_id UUID)
RETURNS TABLE (id UUID, depth INT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH RECURSIVE tree AS (
    SELECT u.id, 1 AS depth
    FROM public.users u
    WHERE u.parent_id = p_root_id
    UNION ALL
    SELECT u.id, t.depth + 1
    FROM public.users u
    INNER JOIN tree t ON u.parent_id = t.id
  )
  SELECT tree.id, tree.depth FROM tree;
$$;

GRANT EXECUTE ON FUNCTION public.can_view_user_for(UUID, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_descendant_user_ids(UUID) TO authenticated, service_role;
