-- Phase 7: Multi-tier hierarchy access (Super-Master → Master → Agent/Player)

-- Parameterized subtree check for service-role API routes (no auth.uid() session)
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

-- All descendant user ids (excluding root) for network queries
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

COMMENT ON FUNCTION public.can_view_user_for IS
  'Phase 7: API-layer hierarchy check — viewer may access self or any user in their subtree.';
