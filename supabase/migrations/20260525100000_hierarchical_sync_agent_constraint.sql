-- Allow 'agent' role in users_parent_role_chk (was missing after add_agent_role migration)
ALTER TABLE public.users
  DROP CONSTRAINT IF EXISTS users_parent_role_chk;

ALTER TABLE public.users
  ADD CONSTRAINT users_parent_role_chk CHECK (
    (role = 'super_master' AND parent_id IS NULL)
    OR (role = 'master' AND parent_id IS NULL)
    OR (role = 'master' AND parent_id IS NOT NULL)
    OR (role = 'agent' AND parent_id IS NOT NULL)
    OR (role = 'player' AND parent_id IS NOT NULL)
  );
