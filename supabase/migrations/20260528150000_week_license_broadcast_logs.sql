-- Week license duration + broadcast logs

ALTER TYPE public.license_duration_months ADD VALUE IF NOT EXISTS 'week';

CREATE OR REPLACE FUNCTION public.license_duration_to_interval(
  p_duration public.license_duration_months
)
RETURNS INTERVAL
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_duration
    WHEN 'week' THEN INTERVAL '7 days'
    WHEN '1' THEN INTERVAL '1 month'
    WHEN '3' THEN INTERVAL '3 months'
    WHEN '6' THEN INTERVAL '6 months'
    WHEN '12' THEN INTERVAL '12 months'
  END;
$$;

CREATE TABLE IF NOT EXISTS public.broadcast_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_telegram_id BIGINT NOT NULL,
  message_preview TEXT NOT NULL,
  recipient_filter TEXT NOT NULL DEFAULT 'all_masters',
  total_recipients INT NOT NULL DEFAULT 0,
  sent_count INT NOT NULL DEFAULT 0,
  failed_count INT NOT NULL DEFAULT 0,
  skipped_count INT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'in_progress'
    CHECK (status IN ('in_progress', 'completed', 'failed')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_broadcast_logs_started_at
  ON public.broadcast_logs (started_at DESC);

CREATE INDEX IF NOT EXISTS idx_broadcast_logs_admin
  ON public.broadcast_logs (admin_telegram_id);
