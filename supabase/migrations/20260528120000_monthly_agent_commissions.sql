-- Monthly burn commission prompts and responses (per parent + agent + closed month)

CREATE TABLE IF NOT EXISTS monthly_agent_commissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  agent_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  affiliate_id TEXT NOT NULL,
  group_id TEXT,
  month_key TEXT NOT NULL,
  burn_amount NUMERIC(18, 4) NOT NULL DEFAULT 0,
  percent NUMERIC(6, 2),
  commission_amount NUMERIC(18, 4),
  final_before_commission NUMERIC(18, 4) NOT NULL DEFAULT 0,
  final_after_commission NUMERIC(18, 4),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'completed', 'expired', 'failed')),
  requested_at TIMESTAMPTZ,
  response_received_at TIMESTAMPTZ,
  prompt_message_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (parent_user_id, affiliate_id, month_key)
);

CREATE INDEX IF NOT EXISTS idx_monthly_agent_commissions_month_key
  ON monthly_agent_commissions (month_key);

CREATE INDEX IF NOT EXISTS idx_monthly_agent_commissions_parent
  ON monthly_agent_commissions (parent_user_id);

CREATE INDEX IF NOT EXISTS idx_monthly_agent_commissions_affiliate
  ON monthly_agent_commissions (affiliate_id);

CREATE INDEX IF NOT EXISTS idx_monthly_agent_commissions_status
  ON monthly_agent_commissions (status);

CREATE INDEX IF NOT EXISTS idx_monthly_agent_commissions_group
  ON monthly_agent_commissions (group_id)
  WHERE group_id IS NOT NULL;

DROP TRIGGER IF EXISTS monthly_agent_commissions_updated_at ON public.monthly_agent_commissions;
CREATE TRIGGER monthly_agent_commissions_updated_at
  BEFORE UPDATE ON monthly_agent_commissions
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();
