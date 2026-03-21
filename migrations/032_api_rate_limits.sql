-- HangHut API Rate Limiting (PostgreSQL sliding window)
-- 100 requests per minute per API key

CREATE TABLE IF NOT EXISTS api_rate_limits (
  key_prefix varchar(12) PRIMARY KEY,
  request_count int NOT NULL DEFAULT 0,
  window_start timestamptz NOT NULL DEFAULT now()
);

-- Rate limit check function with advisory lock to prevent race conditions
CREATE OR REPLACE FUNCTION check_rate_limit(
  p_key_prefix varchar,
  p_max_requests int DEFAULT 100,
  p_window_seconds int DEFAULT 60
)
RETURNS boolean
LANGUAGE plpgsql
AS $$
DECLARE
  v_allowed boolean;
  v_lock_id bigint;
BEGIN
  -- Generate a stable lock ID from the key prefix
  v_lock_id := hashtext(p_key_prefix);
  
  -- Acquire advisory lock (blocks concurrent checks for same key)
  PERFORM pg_advisory_xact_lock(v_lock_id);
  
  -- Upsert: reset window if expired, otherwise increment
  INSERT INTO api_rate_limits (key_prefix, request_count, window_start)
  VALUES (p_key_prefix, 1, now())
  ON CONFLICT (key_prefix) DO UPDATE SET
    request_count = CASE
      -- Window expired: reset counter
      WHEN api_rate_limits.window_start + (p_window_seconds || ' seconds')::interval < now()
        THEN 1
      -- Window active: increment
      ELSE api_rate_limits.request_count + 1
    END,
    window_start = CASE
      WHEN api_rate_limits.window_start + (p_window_seconds || ' seconds')::interval < now()
        THEN now()
      ELSE api_rate_limits.window_start
    END;
  
  -- Check if under limit
  SELECT request_count <= p_max_requests INTO v_allowed
  FROM api_rate_limits
  WHERE key_prefix = p_key_prefix;
  
  RETURN COALESCE(v_allowed, true);
END;
$$;

-- Cleanup old entries (run periodically or via cron)
CREATE OR REPLACE FUNCTION cleanup_rate_limits()
RETURNS void
LANGUAGE sql
AS $$
  DELETE FROM api_rate_limits
  WHERE window_start < now() - interval '5 minutes';
$$;
