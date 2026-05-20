-- WhatsApp automation: instances, groups, cash payments
-- Evolution API multi-device (one instance per super_master/master)

-- ─── whatsapp_instances ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS whatsapp_instances (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  instance_name    TEXT        NOT NULL UNIQUE,
  status           TEXT        NOT NULL DEFAULT 'disconnected'
                               CHECK (status IN ('creating','connecting','connected','disconnected','error')),
  phone_number     TEXT,
  connected_at     TIMESTAMPTZ,
  last_seen_at     TIMESTAMPTZ,
  error_message    TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id)
);

CREATE INDEX IF NOT EXISTS whatsapp_instances_user_id_idx ON whatsapp_instances(user_id);
CREATE INDEX IF NOT EXISTS whatsapp_instances_status_idx  ON whatsapp_instances(status);

-- ─── whatsapp_groups ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS whatsapp_groups (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id           UUID        NOT NULL REFERENCES whatsapp_instances(id) ON DELETE CASCADE,
  user_id               UUID        NOT NULL REFERENCES users(id),
  group_jid             TEXT        NOT NULL,
  group_name            TEXT        NOT NULL,
  is_fire_group         BOOLEAN     NOT NULL DEFAULT FALSE,
  last_report_sent_at   TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (instance_id, group_jid)
);

CREATE INDEX IF NOT EXISTS whatsapp_groups_instance_id_idx  ON whatsapp_groups(instance_id);
CREATE INDEX IF NOT EXISTS whatsapp_groups_user_id_idx      ON whatsapp_groups(user_id);
CREATE INDEX IF NOT EXISTS whatsapp_groups_is_fire_idx      ON whatsapp_groups(is_fire_group) WHERE is_fire_group = TRUE;

-- ─── cash_payments ───────────────────────────────────────────────────────────
-- Stores 💰 (in) and 📤 (out) messages from WhatsApp groups
CREATE TABLE IF NOT EXISTS cash_payments (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID        NOT NULL REFERENCES users(id),
  group_jid     TEXT        NOT NULL,
  group_name    TEXT,
  message_id    TEXT        NOT NULL UNIQUE,
  direction     TEXT        NOT NULL CHECK (direction IN ('in', 'out')),
  amount        NUMERIC(14, 4) NOT NULL CHECK (amount > 0),
  raw_message   TEXT,
  sender_jid    TEXT,
  payment_date  DATE        NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS cash_payments_user_id_idx       ON cash_payments(user_id);
CREATE INDEX IF NOT EXISTS cash_payments_payment_date_idx  ON cash_payments(payment_date);
CREATE INDEX IF NOT EXISTS cash_payments_group_jid_idx     ON cash_payments(group_jid);

-- ─── RLS ─────────────────────────────────────────────────────────────────────
ALTER TABLE whatsapp_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_groups    ENABLE ROW LEVEL SECURITY;
ALTER TABLE cash_payments      ENABLE ROW LEVEL SECURITY;

-- Service role bypasses RLS (used by API routes)
CREATE POLICY "service_all_instances" ON whatsapp_instances
  FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);

CREATE POLICY "service_all_groups" ON whatsapp_groups
  FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);

CREATE POLICY "service_all_cash_payments" ON cash_payments
  FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);

-- updated_at triggers
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS whatsapp_instances_updated_at ON whatsapp_instances;
CREATE TRIGGER whatsapp_instances_updated_at
  BEFORE UPDATE ON whatsapp_instances
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS whatsapp_groups_updated_at ON whatsapp_groups;
CREATE TRIGGER whatsapp_groups_updated_at
  BEFORE UPDATE ON whatsapp_groups
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
