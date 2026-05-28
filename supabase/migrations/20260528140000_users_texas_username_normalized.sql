-- Normalize texas_username for case-insensitive re-login after logout

UPDATE public.users
SET texas_username = lower(trim(texas_username))
WHERE texas_username IS NOT NULL
  AND texas_username <> lower(trim(texas_username));

CREATE UNIQUE INDEX IF NOT EXISTS users_texas_username_lower_uniq
  ON public.users (lower(texas_username))
  WHERE texas_username IS NOT NULL;
