-- Add permanent invite link storage to telegram_tracking_groups.
-- This stores the t.me/+XXXX link so it survives page refreshes.
ALTER TABLE telegram_tracking_groups
  ADD COLUMN IF NOT EXISTS invite_link TEXT;
