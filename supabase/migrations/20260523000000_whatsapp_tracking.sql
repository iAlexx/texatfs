-- ─────────────────────────────────────────────────────────────────────────────
-- Centralized WhatsApp Tracking System
-- Single WhatsApp number (gateway) maps groups → sub-agents.
-- Cash payments are confirmed via 1/2 reply state machine.
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── whatsapp_agent_groups ───────────────────────────────────────────────────
-- One row per (master, sub-agent, WhatsApp group).
-- The WhatsApp gateway groupId (e.g. "120363023948721938@g.us") is unique.
CREATE TABLE IF NOT EXISTS whatsapp_agent_groups (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  affiliate_id  TEXT        NOT NULL,
  email         TEXT        NOT NULL,
  group_id      TEXT        NOT NULL UNIQUE,
  group_name    TEXT,
  is_active     BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, affiliate_id)
);

CREATE INDEX IF NOT EXISTS wag_user_id_idx    ON whatsapp_agent_groups(user_id);
CREATE INDEX IF NOT EXISTS wag_group_id_idx   ON whatsapp_agent_groups(group_id);
CREATE INDEX IF NOT EXISTS wag_email_idx      ON whatsapp_agent_groups(LOWER(email));

-- ─── whatsapp_pending_confirmations ──────────────────────────────────────────
-- Stores the in-flight ✅/🛑 trigger awaiting a 1/2 reply.
-- TTL is enforced at the application layer (15 minutes).
CREATE TABLE IF NOT EXISTS whatsapp_pending_confirmations (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  group_id          TEXT        NOT NULL,
  trigger_msg_id    TEXT        NOT NULL,
  confirm_msg_id    TEXT        NOT NULL UNIQUE,
  affiliate_id      TEXT        NOT NULL,
  email             TEXT        NOT NULL,
  direction         TEXT        NOT NULL CHECK (direction IN ('in', 'out')),
  amount            NUMERIC(14, 4) NOT NULL CHECK (amount > 0),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS wpc_confirm_msg_idx ON whatsapp_pending_confirmations(confirm_msg_id);
CREATE INDEX IF NOT EXISTS wpc_group_idx       ON whatsapp_pending_confirmations(group_id);
CREATE INDEX IF NOT EXISTS wpc_created_at_idx  ON whatsapp_pending_confirmations(created_at);

-- ─── RLS ─────────────────────────────────────────────────────────────────────
ALTER TABLE whatsapp_agent_groups          ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_pending_confirmations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_all_wag" ON whatsapp_agent_groups
  FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);

CREATE POLICY "service_all_wpc" ON whatsapp_pending_confirmations
  FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);

-- ─── updated_at trigger (re-uses existing set_updated_at()) ─────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS wag_updated_at ON whatsapp_agent_groups;
CREATE TRIGGER wag_updated_at
  BEFORE UPDATE ON whatsapp_agent_groups
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
