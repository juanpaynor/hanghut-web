-- ════════════════════════════════════════════════════════════════════════════
-- ROLLBACK SOURCE for PHASE 2e — captured from PRODUCTION 2026-11-05
--
-- Verbatim `pg_get_functiondef` output. To roll back, paste the relevant
-- function back. They are all CREATE OR REPLACE, so each restores in place
-- WITHOUT dropping anything -- PROVIDED 2e did not change the signature. If 2e
-- dropped an old signature, restoring also means dropping 2e's new one first,
-- or PostgREST is left with two candidates.
--
-- ⚠ THIS FILE IS INCOMPLETE. Captured so far:
--      hold_seat(uuid, text, uuid)                        1,446 chars
--      book_seats_for_intent(uuid)                          470 chars
--      hold_best_available(...)                            3,508 chars
--
--      pick_best_available(...)                           8,137 chars
--
--   STILL TO CAPTURE before changing anything:
--      assign_seats_to_intent(uuid,uuid,int,uuid[])        5,170  (legacy,
--          being DROPPED in 2e -- capture it anyway, a drop needs a way back)
--      assign_seats_to_intent(uuid,uuid,int,uuid[],text,uuid)       10,072
--
--   Get them with:
--      select pg_get_functiondef(p.oid)
--      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--      where n.nspname = 'public'
--        and p.proname in ('hold_best_available','assign_seats_to_intent');
--
-- GRANTS AS FOUND (restore these too if a signature changes):
--   hold_seat              postgres, anon, authenticated, service_role
--   hold_best_available    postgres, anon, authenticated, service_role
--   book_seats_for_intent  postgres, anon, authenticated, service_role
--   assign_seats_to_intent postgres, service_role            (both overloads)
-- ════════════════════════════════════════════════════════════════════════════


-- ── hold_seat ───────────────────────────────────────────────────────────────
-- Note for 2e, not part of the rollback: this gates on `s.status = 'available'`,
-- which is the global seats.status flag with no notion of a night.

CREATE OR REPLACE FUNCTION public.hold_seat(p_seat_id uuid, p_session_id text, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_held boolean;
  v_event_id uuid;
  v_tier_id uuid;
  v_max_per_order integer;
  v_current integer;
BEGIN
  DELETE FROM seat_holds WHERE expires_at < now();

  SELECT s.event_id,
         COALESCE(s.tier_id, NULLIF(sec.row_tier_overrides->>s.row_label, '')::uuid, sec.tier_id)
    INTO v_event_id, v_tier_id
  FROM seats s
  JOIN event_sections sec ON sec.id = s.section_id
  WHERE s.id = p_seat_id AND s.status = 'available';

  IF v_event_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT COALESCE(max_per_order, 10) INTO v_max_per_order
  FROM ticket_tiers WHERE id = v_tier_id;
  v_max_per_order := COALESCE(v_max_per_order, 10);

  SELECT count(*) INTO v_current
  FROM seat_holds h
  JOIN seats s2 ON s2.id = h.seat_id
  WHERE h.session_id = p_session_id
    AND h.expires_at > now()
    AND s2.event_id = v_event_id
    AND h.seat_id <> p_seat_id;

  IF v_current >= v_max_per_order THEN
    RETURN false;
  END IF;

  INSERT INTO seat_holds (seat_id, session_id, user_id)
  VALUES (p_seat_id, p_session_id, p_user_id)
  ON CONFLICT (seat_id) DO NOTHING;

  SELECT EXISTS (
    SELECT 1 FROM seat_holds
    WHERE seat_id = p_seat_id AND session_id = p_session_id
  ) INTO v_held;

  RETURN v_held;
END;
$function$;


-- ── book_seats_for_intent ───────────────────────────────────────────────────
-- Notes for 2e, not part of the rollback:
--   * This is what makes a seat unsellable on EVERY other night: one global
--     status='booked' per seat, no occurrence.
--   * No status filter on tickets, so it also books seats carried by
--     cancelled/refunded tickets on the same intent.
--   * SECURITY DEFINER with NO `SET search_path`.
--   * anon-executable, and takes only an intent id.
-- None of those are 2e's job to fix, but none should be made worse.

CREATE OR REPLACE FUNCTION public.book_seats_for_intent(p_intent_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_count integer;
BEGIN
  UPDATE seats
  SET status = 'booked'
  WHERE id IN (
    SELECT seat_id FROM tickets
    WHERE purchase_intent_id = p_intent_id AND seat_id IS NOT NULL
  );
  GET DIAGNOSTICS v_count = ROW_COUNT;

  DELETE FROM seat_holds WHERE session_id = p_intent_id::text;
  RETURN v_count;
END;
$function$;


-- ── hold_best_available ─────────────────────────────────────────────────────
-- Notes for 2e, not part of the rollback:
--   * It does NOT choose seats itself. It delegates to
--     `pick_best_available(p_section_id, p_tier_id, p_quantity, p_session_id,
--     p_exclude, avoid_orphan, p_allow_split, true)` -- and THAT is where the
--     `status = 'available'` test lives. So pick_best_available is a SIXTH
--     function 2e has to change, not a bystander.
--   * `ON CONFLICT (seat_id) DO NOTHING` again, on an INSERT ... SELECT unnest.
--   * The hold readback counts `session_id = p_session_id AND seat_id = ANY(...)`
--     with no occurrence, so it would count another night's hold as this one's.
--   * Unrelated, noted not fixed: holds here last 12 minutes while hold_seat's
--     default is 10, and it refuses a 'paused' event although paused events do
--     sell elsewhere on the platform.

CREATE OR REPLACE FUNCTION public.hold_best_available(p_event_id uuid, p_section_id uuid, p_tier_id uuid, p_quantity integer, p_session_id text, p_user_id uuid DEFAULT NULL::uuid, p_allow_split boolean DEFAULT false, p_exclude uuid[] DEFAULT NULL::uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_sec          record;
  v_tier         record;
  v_event        record;
  v_cap          int;
  v_held_other   int;
  v_res          jsonb;
  v_ids          uuid[];
  v_expires      timestamptz;
  v_now          timestamptz := now();
BEGIN
  IF p_session_id IS NULL OR p_session_id = '' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'SESSION_REQUIRED');
  END IF;

  DELETE FROM seat_holds WHERE expires_at < v_now;

  SELECT id, event_id, is_active, tier_id INTO v_sec FROM event_sections WHERE id = p_section_id;
  IF v_sec.id IS NULL OR v_sec.event_id <> p_event_id OR v_sec.is_active IS DISTINCT FROM true THEN
    RETURN jsonb_build_object('ok', false, 'code', 'SECTION_NOT_FOUND');
  END IF;

  SELECT seat_selection_mode, avoid_orphan_seats, max_seats_per_order, status
    INTO v_event FROM events WHERE id = p_event_id;
  IF v_event.status NOT IN ('active', 'hidden') THEN
    RETURN jsonb_build_object('ok', false, 'code', 'EVENT_NOT_ON_SALE');
  END IF;
  IF v_event.seat_selection_mode = 'pick' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'AUTO_DISABLED');
  END IF;

  SELECT id, is_active, sales_start, sales_end, max_per_order INTO v_tier
    FROM ticket_tiers WHERE id = p_tier_id AND event_id = p_event_id;
  IF v_tier.id IS NULL
     OR v_tier.is_active IS FALSE
     OR (v_tier.sales_start IS NOT NULL AND v_tier.sales_start > v_now)
     OR (v_tier.sales_end   IS NOT NULL AND v_tier.sales_end   < v_now) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'SECTION_NOT_ON_SALE');
  END IF;

  v_cap := LEAST(COALESCE(v_event.max_seats_per_order, 10), COALESCE(v_tier.max_per_order, 10));
  SELECT count(*) INTO v_held_other
  FROM seat_holds h JOIN seats s ON s.id = h.seat_id
  WHERE h.session_id = p_session_id AND h.expires_at > v_now
    AND s.event_id = p_event_id AND h.origin <> 'auto';
  IF p_quantity < 1 OR p_quantity > v_cap - v_held_other THEN
    RETURN jsonb_build_object('ok', false, 'code', 'MAX_PER_ORDER', 'max', GREATEST(v_cap - v_held_other, 0));
  END IF;

  DELETE FROM seat_holds h USING seats s
  WHERE s.id = h.seat_id AND h.session_id = p_session_id AND h.origin = 'auto' AND s.event_id = p_event_id;

  v_res := pick_best_available(p_section_id, p_tier_id, p_quantity, p_session_id, p_exclude,
                               v_event.avoid_orphan_seats, p_allow_split, true);
  IF NOT (v_res->>'ok')::boolean THEN
    RETURN v_res;
  END IF;

  SELECT array_agg((e->>'seat_id')::uuid) INTO v_ids FROM jsonb_array_elements(v_res->'seats') e;
  v_expires := v_now + interval '12 minutes';

  INSERT INTO seat_holds (seat_id, session_id, user_id, expires_at, origin)
  SELECT unnest(v_ids), p_session_id, p_user_id, v_expires, 'auto'
  ON CONFLICT (seat_id) DO NOTHING;

  IF (SELECT count(*) FROM seat_holds WHERE session_id = p_session_id AND seat_id = ANY(v_ids)) <> p_quantity THEN
    DELETE FROM seat_holds WHERE session_id = p_session_id AND seat_id = ANY(v_ids);
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_ENOUGH');
  END IF;

  RETURN v_res || jsonb_build_object('expires_at', v_expires, 'section_id', p_section_id, 'tier_id', p_tier_id);
END;
$function$;


-- ── pick_best_available ─────────────────────────────────────────────────────
-- Notes for 2e, not part of the rollback:
--   * GOOD NEWS: of 8,137 characters, the availability test is ONE expression
--     -- the `cand` column in the INSERT INTO _bas below. Everything after it
--     is pure geometry (row grouping by pixel gap, contiguous runs, orphan
--     avoidance, split-row / stacked / scattered fallbacks) and reads only
--     `cand`. 2e changes that one expression and nothing else here.
--   * `FOR UPDATE OF s SKIP LOCKED` locks the SEAT row, which under per-night
--     selling serialises Tuesday against Wednesday for the instant of the
--     pick. Pessimistic, not wrong. Not worth changing in 2e.
--   * The hold test ignores occurrence, so another night's hold reads as this
--     night's.

CREATE OR REPLACE FUNCTION public.pick_best_available(p_section_id uuid, p_tier_id uuid, p_quantity integer, p_own_session text DEFAULT NULL::text, p_exclude uuid[] DEFAULT NULL::uuid[], p_avoid_orphan boolean DEFAULT true, p_allow_split boolean DEFAULT true, p_lock boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_row_order   text;
  v_thr         double precision;
  rec           record;
  v_best        jsonb := NULL;
  v_best_orphan jsonb := NULL;
  v_chosen      uuid[];
  v_half        int;
  v_rest        int;
  v_a           uuid[];
  v_b           uuid[];
BEGIN
  IF p_quantity IS NULL OR p_quantity < 1 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'BAD_QUANTITY');
  END IF;

  SELECT row_order INTO v_row_order FROM event_sections WHERE id = p_section_id;
  IF v_row_order IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'SECTION_NOT_FOUND');
  END IF;

  CREATE TEMP TABLE IF NOT EXISTS _bas (
    seat_id uuid, row_label text, seat_number int, x float8, y float8, label text,
    cand boolean, ord int, prow int, pos int, rown int, rowc float8
  ) ON COMMIT DROP;
  TRUNCATE _bas;

  INSERT INTO _bas (seat_id, row_label, seat_number, x, y, label, cand, ord)
  SELECT s.id, s.row_label, s.seat_number, s.x, s.y, s.label,
         ( s.status = 'available'
           AND COALESCE(s.tier_id, NULLIF(sec.row_tier_overrides->>s.row_label, '')::uuid, sec.tier_id) = p_tier_id
           AND (p_exclude IS NULL OR NOT (s.id = ANY(p_exclude)))
           AND NOT EXISTS (
             SELECT 1 FROM seat_holds h
             WHERE h.seat_id = s.id AND h.expires_at > now()
               AND (p_own_session IS NULL OR h.session_id <> p_own_session)
           )
         ) AS cand,
         row_number() OVER (ORDER BY natsort_key(s.row_label), s.seat_number)
  FROM seats s
  JOIN event_sections sec ON sec.id = s.section_id
  WHERE s.section_id = p_section_id;

  IF (SELECT count(*) FROM _bas WHERE cand) < p_quantity THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_ENOUGH');
  END IF;

  IF p_lock THEN
    SELECT array_agg(id) INTO v_chosen FROM (
      SELECT s.id FROM seats s WHERE s.id IN (SELECT seat_id FROM _bas WHERE cand)
      FOR UPDATE OF s SKIP LOCKED
    ) locked;
    UPDATE _bas SET cand = false WHERE cand AND NOT (seat_id = ANY(COALESCE(v_chosen, '{}'::uuid[])));
    v_chosen := NULL;
    IF (SELECT count(*) FROM _bas WHERE cand) < p_quantity THEN
      RETURN jsonb_build_object('ok', false, 'code', 'NOT_ENOUGH');
    END IF;
  END IF;

  SELECT COALESCE(percentile_cont(0.5) WITHIN GROUP (ORDER BY d), 0) * 1.8 INTO v_thr
  FROM (
    SELECT sqrt((x - lag(x) OVER w)^2 + (y - lag(y) OVER w)^2) AS d
    FROM _bas WINDOW w AS (PARTITION BY row_label ORDER BY seat_number)
  ) q WHERE d IS NOT NULL;
  IF v_thr <= 0 THEN v_thr := 1e9; END IF;

  UPDATE _bas b SET prow = q.prow
  FROM (
    SELECT seat_id, sum(brk) OVER (ORDER BY ord) AS prow
    FROM (
      SELECT seat_id, ord,
             CASE WHEN lag(row_label) OVER w IS DISTINCT FROM row_label
                    OR seat_number <> lag(seat_number) OVER w + 1
                    OR sqrt((x - lag(x) OVER w)^2 + (y - lag(y) OVER w)^2) > v_thr
                  THEN 1 ELSE 0 END AS brk
      FROM _bas WINDOW w AS (ORDER BY ord)
    ) z
  ) q WHERE q.seat_id = b.seat_id;

  UPDATE _bas b SET pos = q.pos, rown = q.rown, rowc = (q.rown - 1) / 2.0
  FROM (
    SELECT seat_id,
           row_number() OVER (PARTITION BY prow ORDER BY seat_number) - 1 AS pos,
           count(*)     OVER (PARTITION BY prow) AS rown
    FROM _bas
  ) q WHERE q.seat_id = b.seat_id;

  CREATE TEMP TABLE IF NOT EXISTS _rows (prow int, rk int, ncand int) ON COMMIT DROP;
  TRUNCATE _rows;
  INSERT INTO _rows
  SELECT prow,
         row_number() OVER (
           ORDER BY CASE WHEN v_row_order = 'asc' THEN natsort_key(min(row_label)) END ASC,
                    CASE WHEN v_row_order = 'desc' THEN natsort_key(min(row_label)) END DESC,
                    CASE WHEN v_row_order = 'asc' THEN avg(y) END ASC,
                    CASE WHEN v_row_order = 'desc' THEN avg(y) END DESC,
                    min(ord)),
         count(*) FILTER (WHERE cand)
  FROM _bas GROUP BY prow;

  CREATE TEMP TABLE IF NOT EXISTS _runs (prow int, rk int, p0 int, p1 int, len int, rowc float8) ON COMMIT DROP;
  TRUNCATE _runs;
  INSERT INTO _runs
  SELECT b.prow, rw.rk, min(b.pos), max(b.pos), count(*), min(b.rowc)
  FROM (
    SELECT *, pos - row_number() OVER (PARTITION BY prow ORDER BY pos) AS grp
    FROM _bas WHERE cand
  ) b JOIN _rows rw ON rw.prow = b.prow
  GROUP BY b.prow, rw.rk, b.grp;

  FOR rec IN
    SELECT ru.prow, ru.rk, w.start,
           ((w.start - ru.p0) = 1 OR (ru.p1 - (w.start + p_quantity - 1)) = 1) AS orphan,
           abs((w.start + (p_quantity - 1) / 2.0) - ru.rowc) AS dist
    FROM _runs ru
    CROSS JOIN LATERAL generate_series(ru.p0, ru.p1 - p_quantity + 1) AS w(start)
    WHERE ru.len >= p_quantity
    ORDER BY ru.rk, orphan, dist, w.start
  LOOP
    IF v_best IS NULL AND (NOT rec.orphan OR NOT p_avoid_orphan) THEN
      v_best := jsonb_build_object('prow', rec.prow, 'start', rec.start);
      EXIT;
    END IF;
    IF v_best_orphan IS NULL THEN
      v_best_orphan := jsonb_build_object('prow', rec.prow, 'start', rec.start);
    END IF;
  END LOOP;
  IF v_best IS NULL THEN v_best := v_best_orphan; END IF;

  IF v_best IS NOT NULL THEN
    SELECT array_agg(seat_id ORDER BY pos) INTO v_chosen
    FROM _bas WHERE prow = (v_best->>'prow')::int
      AND pos BETWEEN (v_best->>'start')::int AND (v_best->>'start')::int + p_quantity - 1;
    RETURN bas_result(v_chosen, 'row', ARRAY[p_quantity]);
  END IF;

  IF NOT p_allow_split THEN
    RETURN jsonb_build_object('ok', false, 'code', 'SPLIT_REQUIRED',
             'proposal', pick_best_available(p_section_id, p_tier_id, p_quantity, p_own_session, p_exclude, p_avoid_orphan, true, false));
  END IF;

  FOR rec IN
    SELECT a.prow, a.rk, a.p0 AS a0, a.p1 AS a1, a.len AS la, b.p0 AS b0, b.p1 AS b1, b.len AS lb
    FROM _runs a JOIN _runs b ON b.prow = a.prow AND b.p0 > a.p0
    WHERE a.len + b.len >= p_quantity
    ORDER BY a.rk, abs(a.len - b.len), a.p0
  LOOP
    v_half := GREATEST(CEIL(p_quantity / 2.0)::int, p_quantity - rec.lb);
    v_half := LEAST(v_half, rec.la);
    v_rest := p_quantity - v_half;
    IF v_rest >= 1 AND v_rest <= rec.lb THEN
      SELECT array_agg(seat_id ORDER BY pos) INTO v_a FROM _bas
       WHERE prow = rec.prow AND pos BETWEEN rec.a0 AND rec.a0 + v_half - 1;
      SELECT array_agg(seat_id ORDER BY pos) INTO v_b FROM _bas
       WHERE prow = rec.prow AND pos BETWEEN rec.b0 AND rec.b0 + v_rest - 1;
      RETURN bas_result(v_a || v_b, 'split_row', ARRAY[v_half, v_rest]);
    END IF;
  END LOOP;

  v_half := CEIL(p_quantity / 2.0)::int; v_rest := p_quantity - v_half;
  IF v_rest >= 1 THEN
    FOR rec IN
      SELECT f.prow AS fp, k.prow AS bp, f.rk,
             GREATEST(f.p0, k.p0) AS p0, LEAST(f.p1, k.p1) AS p1
      FROM _runs f
      JOIN _rows fr ON fr.prow = f.prow
      JOIN _rows kr ON kr.rk = fr.rk + 1
      JOIN _runs k ON k.prow = kr.prow
      WHERE LEAST(f.p1, k.p1) - GREATEST(f.p0, k.p0) + 1 >= v_half
      ORDER BY f.rk, abs(GREATEST(f.p0, k.p0) + (v_half - 1) / 2.0 - f.rowc)
    LOOP
      SELECT array_agg(seat_id ORDER BY pos) INTO v_a FROM _bas
       WHERE prow = rec.fp AND pos BETWEEN rec.p0 AND rec.p0 + v_half - 1;
      SELECT array_agg(seat_id ORDER BY pos) INTO v_b FROM _bas
       WHERE prow = rec.bp AND pos BETWEEN rec.p0 AND rec.p0 + v_rest - 1;
      RETURN bas_result(v_a || v_b, 'stacked', ARRAY[v_half, v_rest]);
    END LOOP;
  END IF;

  SELECT array_agg(seat_id) INTO v_chosen FROM (
    SELECT b.seat_id
    FROM _bas b JOIN _rows rw ON rw.prow = b.prow
    WHERE b.cand
    ORDER BY rw.rk, abs(b.pos - b.rowc), b.pos
    LIMIT p_quantity
  ) q;
  IF v_chosen IS NULL OR array_length(v_chosen, 1) < p_quantity THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_ENOUGH');
  END IF;
  RETURN bas_result(v_chosen, 'scattered', ARRAY[]::int[]);
END;
$function$;
