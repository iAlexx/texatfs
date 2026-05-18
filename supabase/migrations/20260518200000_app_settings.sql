-- App-wide settings (hero announcements, etc.)
CREATE TABLE IF NOT EXISTS public.app_settings (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL DEFAULT '',
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

-- Service role only (API routes use service client)
CREATE POLICY app_settings_service ON public.app_settings
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

INSERT INTO public.app_settings (key, value)
VALUES ('hero_announcement', 'مرحباً بك في تكساس فاندز — منصة السجل اليومي الفاخرة.')
ON CONFLICT (key) DO NOTHING;
