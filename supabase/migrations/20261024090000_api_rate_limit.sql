-- Make the documented API rate limit real.
--
-- THE GAP
--
-- The public docs have always promised "100 requests per minute" and shown a 429
-- example. Nothing enforced it. `check_rate_limit` was never created
-- (to_regprocedure returns null), `api_rate_limits` has 0 rows, and the caller
-- read `if (allowed === false)` — which the `null` from a failed RPC never
-- satisfies. The call was removed from api-middleware.ts as dead weight, with a
-- comment describing the correct shape. This migration builds that shape.
--
-- WHY NOT JUST RE-ADD THE OLD CALL
--
-- The old table is keyed on `key_prefix`. A prefix is 12 characters — "hh_live_"
-- plus 4 hex — so there are only 65,536 of them. Anyone could enumerate prefixes
-- and exhaust a real partner's quota without ever holding a valid key. The limit
-- must attach to a key that has already been proven genuine, which means
-- validation and metering have to happen in the same place.
--
-- Doing both in one SECURITY DEFINER function also keeps the request at ONE
-- round trip. A Vercel function to Supabase hop measures ~150ms; splitting
-- validation and metering would put that back on every authenticated request,
-- which is what the previous cleanup removed.
--
-- A NOTE ON THE PREFIX INDEX
--
-- idx_api_keys_prefix is not unique, so two keys could in principle share a
-- prefix and the old `.maybeSingle()` would throw rather than authenticate. With
-- 65,536 possible prefixes a collision is a birthday problem, not a remote one.
-- This function orders by created_at and takes the first hash match, so a
-- collision degrades to "the right key still works" instead of a 500.

-- A NEW table rather than a rewrite of the old one.
--
-- The legacy `api_rate_limits` is keyed on key_prefix and cannot be re-keyed
-- without dropping a column, so the obvious move was DROP + CREATE. That makes
-- this file a destructive migration over a table name that is still referenced
-- by the old advisor output and by anyone's muscle memory -- for a table that
-- has never held a row. Not worth it. The legacy table is left untouched and
-- empty; a companion migration removes it, so that nothing in THIS file is
-- destructive.
--
-- ON DELETE CASCADE means revoking a key clears its window rather than
-- stranding a row that can never be matched again.
CREATE TABLE IF NOT EXISTS public.api_key_rate_limits (
    api_key_id    uuid PRIMARY KEY REFERENCES public.api_keys(id) ON DELETE CASCADE,
    window_start  timestamptz NOT NULL DEFAULT now(),
    request_count integer     NOT NULL DEFAULT 0
);

COMMENT ON TABLE public.api_key_rate_limits IS
    'Fixed 60s window per API key. Written only by authenticate_api_key().';

ALTER TABLE public.api_key_rate_limits ENABLE ROW LEVEL SECURITY;
-- No policies: service_role bypasses RLS and is the only legitimate writer.
-- anon and authenticated must never see another partner's request volume.
REVOKE ALL ON TABLE public.api_key_rate_limits FROM PUBLIC, anon, authenticated;

/**
 * Validate an API key and consume one unit of its rate budget, atomically.
 *
 * Returns exactly one row. `outcome` is the authorization verdict:
 *   'ok'            — authenticated, budget consumed
 *   'invalid'       — no such prefix, or the hash does not match
 *   'revoked'       — key exists but is_active = false
 *   'rate_limited'  — valid key, budget exhausted for this window
 *
 * 'invalid' deliberately covers both "no prefix" and "wrong hash" so the caller
 * cannot use the response to learn that a prefix exists.
 */
CREATE OR REPLACE FUNCTION public.authenticate_api_key(
    p_prefix text,
    p_hash   text,
    p_limit  integer DEFAULT 100
)
RETURNS TABLE (
    partner_id uuid,
    api_key_id uuid,
    outcome    text,
    remaining  integer,
    reset_at   timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_key    record;
    v_count  integer;
    v_window timestamptz;
BEGIN
    -- First hash match wins; see the prefix-collision note above.
    SELECT k.id, k.partner_id, k.is_active
      INTO v_key
      FROM public.api_keys k
     WHERE k.key_prefix = p_prefix
       AND k.key_hash   = p_hash
     ORDER BY k.created_at
     LIMIT 1;

    IF v_key.id IS NULL THEN
        RETURN QUERY SELECT NULL::uuid, NULL::uuid, 'invalid'::text, 0, NULL::timestamptz;
        RETURN;
    END IF;

    IF NOT v_key.is_active THEN
        RETURN QUERY SELECT v_key.partner_id, v_key.id, 'revoked'::text, 0, NULL::timestamptz;
        RETURN;
    END IF;

    -- One statement so concurrent requests cannot both read the same count and
    -- both decide they are under the limit. The CASE arms read the EXISTING row,
    -- which is what rolls the window over instead of accumulating forever.
    -- ON CONFLICT names the CONSTRAINT, not the column. `api_key_id` is also a
    -- RETURNS TABLE output variable, and as a bare conflict target PL/pgSQL
    -- cannot tell the two apart -- it raises 42702, and only on the valid-key
    -- path, so an 'invalid' smoke test sails straight past it. A constraint
    -- name cannot collide with a variable. The alias `rl` does the same job in
    -- the SET and RETURNING clauses.
    INSERT INTO public.api_key_rate_limits AS rl (api_key_id, window_start, request_count)
    VALUES (v_key.id, now(), 1)
    ON CONFLICT ON CONSTRAINT api_key_rate_limits_pkey DO UPDATE
       SET window_start = CASE
               WHEN rl.window_start < now() - interval '1 minute'
               THEN now() ELSE rl.window_start END,
           request_count = CASE
               WHEN rl.window_start < now() - interval '1 minute'
               THEN 1 ELSE rl.request_count + 1 END
    RETURNING rl.request_count, rl.window_start
         INTO v_count, v_window;

    -- last_used_at rides along instead of costing a second fire-and-forget write.
    UPDATE public.api_keys SET last_used_at = now() WHERE id = v_key.id;

    IF v_count > p_limit THEN
        RETURN QUERY SELECT v_key.partner_id, v_key.id, 'rate_limited'::text,
                            0, v_window + interval '1 minute';
        RETURN;
    END IF;

    RETURN QUERY SELECT v_key.partner_id, v_key.id, 'ok'::text,
                        p_limit - v_count, v_window + interval '1 minute';
END;
$$;

-- Only the server may call this. It takes a key hash and reports whether it is
-- genuine, so an anon caller holding it could test hashes directly.
REVOKE ALL ON FUNCTION public.authenticate_api_key(text, text, integer)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.authenticate_api_key(text, text, integer)
    TO service_role;

-- ROLLBACK
--
--   DROP FUNCTION IF EXISTS public.authenticate_api_key(text, text, integer);
--
-- Leave the table; it is inert without the function. Roll the application code
-- back at the same time — api-middleware.ts falls back to the direct key lookup
-- if the RPC is missing, so a rollback degrades to today's behaviour (no limit)
-- rather than locking every API caller out.

-- APPLIED TO PROD 2026-10-24. Verified against a real key at p_limit = 3:
-- ok, ok, remaining 0, then rate_limited; a wrong hash returns 'invalid'.
-- Run inside a transaction and rolled back, so no counter was left behind.
