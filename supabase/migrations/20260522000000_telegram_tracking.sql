-- Telegram Forum Topics Tracking System
-- One group per master (supergroup with Topics/Forum mode enabled).
-- One topic per sub-agent inside that group.

-- ─── telegram_tracking_groups ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS telegram_tracking_groups (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  chat_id          BIGINT      NOT NULL,
  chat_title       TEXT        NOT NULL,
  is_active        BOOLEAN     NOT NULL DEFAULT TRUE,
  topics_created_at TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id),
  UNIQUE (chat_id)
);

CREATE INDEX IF NOT EXISTS tg_groups_user_id_idx ON telegram_tracking_groups(user_id);
CREATE INDEX IF NOT EXISTS tg_groups_is_active_idx ON telegram_tracking_groups(is_active) WHERE is_active = TRUE;

-- ─── telegram_agent_topics ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS telegram_agent_topics (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id     UUID        NOT NULL REFERENCES telegram_tracking_groups(id) ON DELETE CASCADE,
  affiliate_id TEXT        NOT NULL,
  username     TEXT        NOT NULL,
  topic_id     BIGINT      NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (group_id, affiliate_id)
);

CREATE INDEX IF NOT EXISTS tg_topics_group_id_idx    ON telegram_agent_topics(group_id);
CREATE INDEX IF NOT EXISTS tg_topics_affiliate_idx   ON telegram_agent_topics(affiliate_id);

-- ─── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE telegram_tracking_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE telegram_agent_topics    ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_all_tg_groups" ON telegram_tracking_groups
  FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);

CREATE POLICY "service_all_tg_topics" ON telegram_agent_topics
  FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);

-- ─── updated_at trigger ───────────────────────────────────────────────────────
-- Reuse set_updated_at() if it already exists (created by whatsapp migration).
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS tg_groups_updated_at ON telegram_tracking_groups;
CREATE TRIGGER tg_groups_updated_at
  BEFORE UPDATE ON telegram_tracking_groups
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
