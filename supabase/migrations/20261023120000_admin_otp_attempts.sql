-- Give admin OTP codes a failure counter.
--
-- THE GAP
--
-- sendOtpCode() capped *sending* at 3 codes per 15 minutes, and that cap was
-- mistaken for rate limiting. Nothing capped *guessing*. verifyOtpCode() matched
-- on the hash inside the WHERE clause, so a wrong code simply returned no row —
-- there was no attempt to record and no counter to record it in. Six digits is
-- 1,000,000 combinations against a five-minute window, and a Next.js server
-- action is an ordinary POST endpoint that can be scripted, so the live code was
-- brute-forcible inside its own lifetime.
--
-- The same request also supplied the user id it was verifying against, from a
-- cookie that client JS could write, which made the endpoint an oracle against
-- any account rather than only the caller's. That half is fixed in application
-- code (src/lib/admin/otp-actions.ts now derives the user from the session and
-- takes no user id); this column is the other half.
--
-- WHAT THIS CHANGES
--
-- One additive column. verifyOtpCode() now reads the live row, compares the hash
-- in constant time, and on a mismatch increments `attempts` — burning the code at
-- 5. Five leaves room for a mistyped digit and nothing resembling a search.
--
-- NOT NULL with a DEFAULT is a metadata-only change in Postgres 11+, so this does
-- not rewrite the table and does not take a long lock. admin_otp_codes holds only
-- short-lived codes for 5 admin accounts, so the row count is negligible either
-- way.
--
-- COMPATIBILITY
--
-- Safe to apply in either order, deliberately. Applying it before the code ships
-- is harmless: the old code never referenced this column and the default keeps
-- every existing row valid. Shipping the code first is also survivable, because
-- verifyOtpCode selects `*` rather than naming `attempts` — PostgREST fails the
-- whole query on an unknown column, and naming it would have turned a missing
-- migration into an admin lockout. With `*` the field is merely absent and
-- `record.attempts ?? 0` takes over, so the limit goes unenforced until this
-- lands but nobody loses access.
--
-- Applying this first is still preferred: it is the only ordering in which the
-- brute-force window is never open.
--
-- ROLLBACK
--
--   ALTER TABLE public.admin_otp_codes DROP COLUMN attempts;
--
-- Dropping it re-opens the brute-force window, so roll back the application code
-- at the same time.

ALTER TABLE public.admin_otp_codes
    ADD COLUMN IF NOT EXISTS attempts smallint NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.admin_otp_codes.attempts IS
    'Wrong guesses against this code. verifyOtpCode burns the code at 5.';
