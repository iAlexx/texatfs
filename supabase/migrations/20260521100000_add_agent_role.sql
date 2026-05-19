-- Add `agent` tier to hierarchy (Super-Master → Master → Agent → Player)

DO $$
BEGIN
  ALTER TYPE public.user_role ADD VALUE 'agent';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON TYPE public.user_role IS
  'super_master | master | agent | player — recursive subtree via parent_id';
