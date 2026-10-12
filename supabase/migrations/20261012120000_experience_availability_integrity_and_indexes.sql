-- ─────────────────────────────────────────────────────────────────────────────
-- Experiences: integrity + access paths, ahead of the availability engine.
--
-- WHY NOW. Experiences are moving from hand-entered dates to generated ones
-- (a recurrence rule plus a rolling-horizon job). Everything below is a
-- PRECONDITION for that generator, not a tidy-up:
--
--   * a horizon job re-runs — cron overlap, a retry, a manual backfill — so a
--     slot needs a natural key, or each re-run silently doubles the calendar
--     and capacity splits across the copies;
--   * a generated calendar is tens of rows per listing per quarter instead of
--     the SIX rows that exist in total today, so the hot paths need real
--     indexes before the volume arrives, not after.
--
-- CROSS-CHECKED AGAINST PROD before writing (2026-10-12):
--   experience_schedules .......... 6 rows
--     duplicate (table_id, start_time) ... 0
--     current_guests > max_guests ........ 0
--     current_guests < 0 ................. 0
--     end_time <= start_time ............. 0
--     status IS NULL ..................... 0
--     current_guests IS NULL ............. 0
--     user triggers ...................... 0
--   index / constraint name collisions ... 0
--   writers of current_guests ............ reserve_experience,
--                                          decrement_experience_guests,
--                                          create_manual_experience_booking
--     — all three already enforce capacity and COALESCE current_guests to 0,
--       so the new CHECK is a safety net and changes no existing behaviour.
--
-- LOCKING. Every statement here touches a 6-row table, so all of it is
-- effectively instant. CREATE INDEX (non-CONCURRENTLY) does take a lock that
-- blocks writes to experience_schedules for its duration — on six rows that is
-- microseconds, and CONCURRENTLY is deliberately NOT used because it cannot run
-- inside a transaction block and would stop this file running as one script.
-- Safe to paste and run whole.
-- ─────────────────────────────────────────────────────────────────────────────


-- 1 ─ Natural key for a slot.
--
-- THE critical one. Without it the horizon job duplicates every slot on a
-- re-run and a listing's capacity silently splits across the copies. With it
-- the generator can ON CONFLICT DO NOTHING and be safely idempotent.
CREATE UNIQUE INDEX IF NOT EXISTS experience_schedules_table_start_key
    ON public.experience_schedules (table_id, start_time);


-- 2 ─ The hot path: "upcoming, bookable slots for this experience".
--
-- Replaces a bitmap AND across two single-column indexes, one of which
-- (idx_experience_schedules_table_id) has never been scanned on prod.
--
-- NOTE THE PREDICATE. `status` is NULLABLE (default 'open'). A plain
-- `WHERE status <> 'cancelled'` evaluates to NULL — and therefore EXCLUDES —
-- any row whose status is NULL, while the application's own filter
-- (`s.status !== 'cancelled'` in JS) INCLUDES it. That mismatch would make a
-- slot invisible to any query the planner served from this index.
-- IS DISTINCT FROM is the NULL-safe form and matches the app's semantics.
CREATE INDEX IF NOT EXISTS experience_schedules_table_upcoming_idx
    ON public.experience_schedules (table_id, start_time)
    WHERE status IS DISTINCT FROM 'cancelled';


-- 3 ─ Capacity, enforced by the database rather than by convention.
--
-- Today capacity exists only inside the RPCs. A future writer that forgets
-- them oversells a paid slot silently. COALESCE because current_guests is
-- nullable: a bare `current_guests <= max_guests` evaluates to NULL on a NULL
-- row, and a CHECK constraint PASSES on NULL — the opposite of what is wanted.
-- Treating NULL as 0 matches all three existing writers.
--
-- NOT VALID then VALIDATE: the constraint binds every new and updated row
-- immediately, while the scan of existing rows takes only a weaker lock. At
-- six rows this is belt-and-braces; the habit is what keeps it safe later.
ALTER TABLE public.experience_schedules
    ADD CONSTRAINT experience_schedules_capacity_check
    CHECK (COALESCE(current_guests, 0) >= 0
       AND COALESCE(current_guests, 0) <= max_guests) NOT VALID;

ALTER TABLE public.experience_schedules
    VALIDATE CONSTRAINT experience_schedules_capacity_check;


-- 4 ─ A slot cannot end before it starts.
--
-- end_time is currently NOT NULL, so the NULL branch is unreachable today —
-- it is written NULL-tolerantly so the constraint survives that column ever
-- being relaxed. A generator emitting end <= start is a bug that should fail
-- at write time, not render a negative-length slot in the picker.
ALTER TABLE public.experience_schedules
    ADD CONSTRAINT experience_schedules_window_check
    CHECK (end_time IS NULL OR end_time > start_time) NOT VALID;

ALTER TABLE public.experience_schedules
    VALIDATE CONSTRAINT experience_schedules_window_check;


-- 5 ─ Working set for the expiry job.
--
-- expire_stale_experience_intents() runs every 5 minutes (cron jobid 14) and
-- scans pending-and-overdue. `status` alone is low cardinality; this partial
-- index IS the working set and stays small, because rows leave it on expiry.
CREATE INDEX IF NOT EXISTS experience_intents_pending_expiry_idx
    ON public.experience_purchase_intents (expires_at)
    WHERE status = 'pending';


-- 6 ─ "My Bookings" in /account, from one index.
--
-- The query is user_id + status='completed' ORDER BY paid_at DESC. Today that
-- intersects idx_exp_intents_user with idx_exp_intents_status and then sorts.
CREATE INDEX IF NOT EXISTS experience_intents_user_status_paid_idx
    ON public.experience_purchase_intents (user_id, status, paid_at DESC);


-- 7 ─ Drop a duplicate unique index on the money path.
--
-- xendit_external_id is indexed UNIQUE TWICE, with identical definitions:
--   experience_purchase_intents_xendit_external_id_key  ← a UNIQUE CONSTRAINT
--   idx_exp_intents_external_id                         ← a standalone index
-- Both show 0 scans. Dropping the standalone copy halves the write cost on
-- every booking and leaves uniqueness fully enforced by the constraint, which
-- cannot be dropped accidentally this way.
DROP INDEX IF EXISTS public.idx_exp_intents_external_id;


COMMENT ON INDEX public.experience_schedules_table_start_key IS
    'Natural key for a slot. Makes the availability horizon job idempotent: a re-run upserts instead of duplicating the calendar.';

COMMENT ON INDEX public.experience_schedules_table_upcoming_idx IS
    'Hot path for the buyer-facing calendar. Predicate is IS DISTINCT FROM, not <>, because status is nullable and a NULL-status slot must stay visible.';
