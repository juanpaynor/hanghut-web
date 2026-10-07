-- Per-user badge progress for the app's creator badge case.
--
-- The app asked for this because it can no longer be computed client-side:
-- qualification keys on the buyer's lowercased email, and SELECT on
-- user_creator_badges.buyer_email was revoked from anon + authenticated in
-- 20261007100000_badge_holder_email_column_revoke.sql. So the measurement has
-- to happen where the email is still visible -- here -- and the email must not
-- come back out in the payload. It does not.
--
-- Scoped to auth.uid() with no p_user_id parameter, deliberately: a caller
-- cannot ask for anybody else's progress, so there is no authorization check to
-- get wrong.
--
-- COST: every measure filters by user_id / lower(guest_email), both indexed on
-- tickets and purchase_intents, so a call costs what the CALLER has bought --
-- not what the organizer has sold (measured: 13 buffers, 0.3ms). The one
-- exception is kind='segment', which calls organizer_customer_segments() and is
-- therefore organizer-scoped. No badge uses that criteria type today; if one
-- ever does on a large organizer, that branch needs a per-email variant before
-- it goes on a profile screen.

CREATE OR REPLACE FUNCTION public.get_my_badge_progress(p_organizer_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
    v_uid   uuid := auth.uid();
    v_email text;
    v_uids  uuid[];
    v_out   jsonb;
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;
    IF p_organizer_id IS NULL THEN
        RAISE EXCEPTION 'organizer_id required';
    END IF;

    SELECT lower(u.email) INTO v_email FROM users u WHERE u.id = v_uid;

    -- The badge engine keys every row on
    -- coalesce(lower(users.email), lower(guest_email)), so two account rows
    -- sharing one email are ONE badge subject to it. There are none today; the
    -- array keeps this faithful if that ever changes and costs one indexed
    -- lookup. Filtering by id (not by the computed coalesce) is what keeps the
    -- per-user measures indexable instead of scanning the organizer's history.
    v_uids := CASE
        WHEN v_email IS NULL THEN ARRAY[v_uid]
        ELSE ARRAY(SELECT u.id FROM users u WHERE lower(u.email) = v_email)
    END;

    WITH b AS (
        SELECT cb.*,
               cb.criteria->>'type'                        AS ctype,
               COALESCE(cb.criteria->'params','{}'::jsonb)  AS params
        FROM creator_badges cb
        WHERE cb.organizer_id = p_organizer_id AND cb.is_active
    ),
    held AS (
        SELECT b.*, ucb.earned_at,
               (ucb.badge_id IS NOT NULL) AS is_held
        FROM b
        LEFT JOIN user_creator_badges ucb
               ON ucb.badge_id = b.id
              AND ucb.buyer_email = v_email
    ),
    scored AS (
        SELECT
            h.id, h.name, h.description, h.tier,
            CASE WHEN h.art_suppressed THEN NULL ELSE h.art_url END AS art_url,
            h.holder_count, h.is_held, h.earned_at, h.ctype,

            -- How the bar should be read. Only 'count' and 'amount' are a
            -- personal bar. 'race' is a GLOBAL bar (slots claimed, not your
            -- doing) and is named differently so the app cannot render it as
            -- personal progress by accident. 'binary', 'segment', 'manual' and
            -- 'unknown' have no honest bar and send nulls rather than a 0/1
            -- that would look like a stalled one.
            CASE h.ctype
                WHEN 'attendance_count'     THEN 'count'
                WHEN 'checkin_count'        THEN 'count'
                WHEN 'event_count_purchased' THEN 'count'
                WHEN 'group_buyer'          THEN 'count'
                WHEN 'streak_months'        THEN 'count'
                WHEN 'spend_total'          THEN 'amount'
                WHEN 'first_n_buyers'       THEN 'race'
                WHEN 'specific_event'       THEN 'binary'
                WHEN 'tier_purchased'       THEN 'binary'
                WHEN 'customer_segment'     THEN 'segment'
                WHEN 'manual_grant'         THEN 'manual'
                ELSE 'unknown'
            END AS kind,

            CASE h.ctype
                WHEN 'attendance_count' THEN (
                    SELECT count(DISTINCT t.event_id)
                    FROM tickets t JOIN events e ON e.id = t.event_id
                    WHERE e.organizer_id = p_organizer_id
                      AND t.checked_in_at IS NOT NULL
                      AND t.status NOT IN ('cancelled','refunded')
                      AND (t.user_id = ANY(v_uids)
                           OR (t.user_id IS NULL AND lower(t.guest_email) = v_email))
                )::numeric
                WHEN 'checkin_count' THEN (
                    SELECT count(*)
                    FROM tickets t JOIN events e ON e.id = t.event_id
                    WHERE e.organizer_id = p_organizer_id
                      AND t.checked_in_at IS NOT NULL
                      AND t.status NOT IN ('cancelled','refunded')
                      AND (t.user_id = ANY(v_uids)
                           OR (t.user_id IS NULL AND lower(t.guest_email) = v_email))
                )::numeric
                WHEN 'event_count_purchased' THEN (
                    SELECT count(DISTINCT pi.event_id)
                    FROM purchase_intents pi JOIN events e ON e.id = pi.event_id
                    WHERE e.organizer_id = p_organizer_id AND pi.status = 'completed'
                      AND (pi.user_id = ANY(v_uids)
                           OR (pi.user_id IS NULL AND lower(pi.guest_email) = v_email))
                )::numeric
                WHEN 'spend_total' THEN (
                    SELECT COALESCE(sum(greatest(
                        COALESCE(pi.total_amount,0) - COALESCE(pi.refunded_amount,0), 0)), 0)
                    FROM purchase_intents pi JOIN events e ON e.id = pi.event_id
                    WHERE e.organizer_id = p_organizer_id AND pi.status = 'completed'
                      AND (pi.user_id = ANY(v_uids)
                           OR (pi.user_id IS NULL AND lower(pi.guest_email) = v_email))
                )::numeric
                WHEN 'group_buyer' THEN (
                    -- Biggest single order, because the badge fires on one
                    -- order reaching min_quantity -- not on a lifetime total.
                    SELECT COALESCE(max(q.qty), 0) FROM (
                        SELECT count(t.id) AS qty
                        FROM purchase_intents pi JOIN events e ON e.id = pi.event_id
                        JOIN tickets t ON t.purchase_intent_id = pi.id
                                      AND t.status NOT IN ('cancelled','refunded')
                        WHERE e.organizer_id = p_organizer_id AND pi.status = 'completed'
                          AND (pi.user_id = ANY(v_uids)
                               OR (pi.user_id IS NULL AND lower(pi.guest_email) = v_email))
                        GROUP BY pi.id
                    ) q
                )::numeric
                WHEN 'streak_months' THEN (
                    -- Longest run of consecutive Manila months, matching the
                    -- engine's island logic. Note this is the longest EVER, not
                    -- the current one: the engine awards on any historical run,
                    -- so a bar built on the current streak would read 1/5 for
                    -- someone the engine is about to award.
                    SELECT COALESCE(max(i.cnt), 0) FROM (
                        SELECT count(*) AS cnt FROM (
                            SELECT g.mm,
                                   (extract(year FROM g.mm) * 12 + extract(month FROM g.mm))
                                     - row_number() OVER (ORDER BY g.mm) AS island
                            FROM (
                                SELECT DISTINCT date_trunc('month',
                                    pi.paid_at AT TIME ZONE 'Asia/Manila') AS mm
                                FROM purchase_intents pi JOIN events e ON e.id = pi.event_id
                                WHERE e.organizer_id = p_organizer_id
                                  AND pi.status = 'completed' AND pi.paid_at IS NOT NULL
                                  AND (pi.user_id = ANY(v_uids)
                                       OR (pi.user_id IS NULL AND lower(pi.guest_email) = v_email))
                            ) g
                        ) islands GROUP BY islands.island
                    ) i
                )::numeric
                -- A race bar is global: how many of the N slots are gone.
                WHEN 'first_n_buyers' THEN h.holder_count::numeric
                ELSE NULL
            END AS progress,

            CASE h.ctype
                WHEN 'attendance_count'      THEN COALESCE((h.params->>'n')::numeric, 1)
                WHEN 'checkin_count'         THEN COALESCE((h.params->>'n')::numeric, 1)
                WHEN 'event_count_purchased' THEN COALESCE((h.params->>'n')::numeric, 2)
                WHEN 'group_buyer'           THEN COALESCE((h.params->>'min_quantity')::numeric, 2)
                WHEN 'streak_months'         THEN COALESCE((h.params->>'n')::numeric, 2)
                WHEN 'spend_total'           THEN COALESCE((h.params->>'amount')::numeric, 0)
                WHEN 'first_n_buyers'        THEN COALESCE((h.params->>'n')::numeric, 0)
                ELSE NULL
            END AS target,

            -- Only the segment kind needs words instead of numbers.
            CASE WHEN h.ctype = 'customer_segment' THEN (
                SELECT s.rfm_segment FROM public.organizer_customer_segments(p_organizer_id) s
                WHERE s.email = v_email LIMIT 1
            ) END AS detail,
            CASE WHEN h.ctype = 'customer_segment'
                 THEN h.params->>'segment' END AS detail_target
        FROM held h
    )
    SELECT COALESCE(jsonb_agg(row_to_json(r) ORDER BY r.is_held DESC, r.name), '[]'::jsonb)
      INTO v_out
      FROM (SELECT * FROM scored) r;

    RETURN jsonb_build_object('organizer_id', p_organizer_id, 'badges', v_out);
END;
$fn$;

COMMENT ON FUNCTION public.get_my_badge_progress(uuid) IS
'Per-badge {held, progress, target, kind} for auth.uid() at one organizer. Never returns an email. kind=count|amount are personal bars; kind=race is a GLOBAL slots-claimed bar; binary|segment|manual|unknown have no bar and send null progress.';

-- New functions in schema public inherit EXECUTE for PUBLIC from pg_default_acl,
-- so this is not redundant. anon has no auth.uid() and would only ever get the
-- 'Not authenticated' exception, but it has no business holding the grant.
REVOKE ALL ON FUNCTION public.get_my_badge_progress(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_badge_progress(uuid) TO authenticated, service_role;
