-- HangHut Public API: API Keys Table
-- Allows partners to authenticate via API keys for server-to-server integration

CREATE TABLE IF NOT EXISTS api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  key_prefix varchar(12) NOT NULL,       -- visible in dashboard, e.g. "hh_live_abc1"
  key_hash text NOT NULL,                 -- sha256 hash of full key
  name varchar(100) DEFAULT 'Default',    -- user-friendly label
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  last_used_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_api_keys_prefix ON api_keys(key_prefix);
CREATE INDEX IF NOT EXISTS idx_api_keys_partner ON api_keys(partner_id);

-- RLS: only service role can access this table (API middleware uses admin client)
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
