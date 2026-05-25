-- Add target_affiliate_id to transactions for hierarchical WhatsApp tracking.
-- Stores the Texas affiliateId of the person a payment is directed to/from.

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS target_affiliate_id TEXT;

COMMENT ON COLUMN public.transactions.target_affiliate_id IS
  'Texas affiliateId of the target person for this transaction (from whatsapp_agent_groups mapping).';

CREATE INDEX IF NOT EXISTS transactions_target_affiliate_idx
  ON public.transactions(target_affiliate_id)
  WHERE target_affiliate_id IS NOT NULL;
