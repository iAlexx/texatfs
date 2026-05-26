-- ============================================================================
-- Restrict hierarchy visibility to DIRECT parent/child only.
--
-- Before: WITH RECURSIVE CTEs walked the full descendant tree.
-- After:  Users can only see themselves and their immediate children.
--
-- All existing RLS policies that call these functions inherit the new
-- restriction automatically — no policy rewrites needed.
-- ============================================================================

-- 1) can_view_user: used by 12+ RLS policies
CREATE OR REPLACE FUNCTION public.can_view_user(target_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = target_user_id
      AND (id = public.current_app_user_id()
           OR parent_id = public.current_app_user_id())
  );
$$;

COMMENT ON FUNCTION public.can_view_user(UUID) IS
  'Direct-only: returns true if target is the caller or a direct child of the caller.';

-- 2) can_view_user_for: parameterised version for service-role / close_daily_ledger
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
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = p_target_id
      AND (id = p_viewer_id OR parent_id = p_viewer_id)
  );
$$;

COMMENT ON FUNCTION public.can_view_user_for(UUID, UUID) IS
  'Direct-only: returns true if target is the viewer or a direct child of the viewer.';

-- 3) get_descendant_user_ids: returns direct children only (depth=1)
CREATE OR REPLACE FUNCTION public.get_descendant_user_ids(p_root_id UUID)
RETURNS TABLE (id UUID, depth INT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT u.id, 1 AS depth
  FROM public.users u
  WHERE u.parent_id = p_root_id;
$$;

COMMENT ON FUNCTION public.get_descendant_user_ids(UUID) IS
  'Restricted: returns direct children only (depth=1) for privacy.';
