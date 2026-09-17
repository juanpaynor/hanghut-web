-- ─────────────────────────────────────────────────────────────────────────────
-- Best-available seating ("buy by section, we pick the seats").
-- Spec: https://claude.ai/code/artifact/666c1c51-b66f-4495-904d-f95bb429ac65
--
-- Design: auto-assign is a way of CHOOSING seat_ids. hold_best_available() picks
-- seats and holds them under the buyer's browsing session; from there checkout
-- is the existing seat_ids path (assign_seats_to_intent verifies the holds).
--
-- Physical rows are derived from GEOMETRY, not row_label: on real maps (PICC,
-- 2,414 seats) every seat in a section is labelled row "A" with continuous
-- numbering, so "same row_label" would seat a party across two physical rows.
-- A physical row = a chain of consecutive seat numbers (same label) whose
-- neighbours sit within ~1.8× the section's median seat spacing.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Schema ------------------------------------------------------------------
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS seat_selection_mode text NOT NULL DEFAULT 'both'
    CHECK (seat_selection_mode IN ('best_available', 'pick', 'both')),
  ADD COLUMN IF NOT EXISTS avoid_orphan_seats boolean NOT NULL DEFAULT true;

ALTER TABLE public.event_sections
  ADD COLUMN IF NOT EXISTS row_order text NOT NULL DEFAULT 'asc'
    CHECK (row_order IN ('asc', 'desc'));

ALTER TABLE public.seat_holds
  ADD COLUMN IF NOT EXISTS origin text NOT NULL DEFAULT 'pick'
    CHECK (origin IN ('pick', 'auto', 'box_office', 'api'));

CREATE INDEX IF NOT EXISTS seats_section_status_idx
  ON public.seats (section_id, status) INCLUDE (row_label, seat_number, x, y, tier_id);

-- 2. Natural sort key: "A" < "B" < "AA", "1" < "2" < "10" -----------------------
CREATE OR REPLACE FUNCTION public.natsort_key(p text)
RETURNS text LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE AS $$
  SELECT string_agg(
           CASE WHEN m[1] ~ '^\d+$' THEN lpad(m[1], 8, '0') ELSE lower(m[1]) END,
           '' ORDER BY ord)
  FROM regexp_matches(p, '(\d+|\D+)', 'g') WITH ORDINALITY AS t(m, ord);
$$;

-- 3. The ranking ---------------------------------------------------------------
-- Shape the result once, ordered as the seats sit (row, then seat number).
CREATE OR REPLACE FUNCTION public.bas_result(p_seats uuid[], p_together text, p_split int[])
RETURNS jsonb LANGUAGE sql STABLE SET search_path TO 'public' AS $$
  SELECT jsonb_build_object(
    'ok', true,
    'together', p_together,
    'split', to_jsonb(p_split),
    'seats', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'seat_id', s.id, 'row', s.row_label, 'seat', s.seat_number,
               'label', s.label, 'x', s.x, 'y', s.y)
             ORDER BY natsort_key(s.row_label), s.seat_number)
      FROM seats s WHERE s.id = ANY(p_seats)
    ), '[]'::jsonb)
  );
$$;

-- Returns jsonb:
--   { ok: true,  seats: [{seat_id,row,seat,label,x,y}], together: 'row'|'split_row'|'stacked'|'scattered', split: [n,...] }
--   { ok: false, code: 'NOT_ENOUGH' }
-- p_lock = true  → candidate rows are locked FOR UPDATE SKIP LOCKED (caller must
--                  be inside the transaction that will hold/book them).
-- p_own_session  → holds by this session do not disqualify a seat.
-- p_allow_split  → false = only 'row' results are returned as ok; anything else
--                  comes back as ok:false, code:'SPLIT_REQUIRED' with a proposal.
CREATE OR REPLACE FUNCTION public.pick_best_available(
  p_section_id   uuid,
  p_tier_id      uuid,
  p_quantity     int,
  p_own_session  text    DEFAULT NULL,
  p_exclude      uuid[]  DEFAULT NULL,
  p_avoid_orphan boolean DEFAULT true,
  p_allow_split  boolean DEFAULT true,
  p_lock         boolean DEFAULT false
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
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

  -- Every seat in the section, any status, with its resolved tier and whether
  -- it is a candidate for THIS party.
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

  -- Lock what we might take, and drop anything someone else already locked.
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

  -- Median distance between consecutive seat numbers (same label) → the
  -- "neighbour" threshold. A jump larger than that is a row wrap or an aisle.
  SELECT COALESCE(percentile_cont(0.5) WITHIN GROUP (ORDER BY d), 0) * 1.8 INTO v_thr
  FROM (
    SELECT sqrt((x - lag(x) OVER w)^2 + (y - lag(y) OVER w)^2) AS d
    FROM _bas WINDOW w AS (PARTITION BY row_label ORDER BY seat_number)
  ) q WHERE d IS NOT NULL;
  IF v_thr <= 0 THEN v_thr := 1e9; END IF;  -- single-seat rows / degenerate maps

  -- Physical rows: new row when the label changes, the number skips, or the
  -- distance to the previous seat exceeds the threshold.
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

  -- Position within the physical row, row size, row centre (in positions).
  UPDATE _bas b SET pos = q.pos, rown = q.rown, rowc = (q.rown - 1) / 2.0
  FROM (
    SELECT seat_id,
           row_number() OVER (PARTITION BY prow ORDER BY seat_number) - 1 AS pos,
           count(*)     OVER (PARTITION BY prow) AS rown
    FROM _bas
  ) q WHERE q.seat_id = b.seat_id;

  -- Front-to-back order of physical rows: label (natural sort), then vertical
  -- position; 'desc' flips both so the organizer can say "row Z is the front".
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

  -- Candidate runs: maximal stretches of consecutive candidate positions in a
  -- physical row.
  CREATE TEMP TABLE IF NOT EXISTS _runs (prow int, rk int, p0 int, p1 int, len int, rowc float8) ON COMMIT DROP;
  TRUNCATE _runs;
  INSERT INTO _runs
  SELECT b.prow, rw.rk, min(b.pos), max(b.pos), count(*), min(b.rowc)
  FROM (
    SELECT *, pos - row_number() OVER (PARTITION BY prow ORDER BY pos) AS grp
    FROM _bas WHERE cand
  ) b JOIN _rows rw ON rw.prow = b.prow
  GROUP BY b.prow, rw.rk, b.grp;

  -- ── Rung 1: one block in one physical row ─────────────────────────────────
  -- For every run that fits, score every window: orphan flag (leaves exactly one
  -- seat on either side), distance from row centre, then leftmost.
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
    -- Compute the proposal anyway so the buyer can see what they'd get.
    RETURN jsonb_build_object('ok', false, 'code', 'SPLIT_REQUIRED',
             'proposal', pick_best_available(p_section_id, p_tier_id, p_quantity, p_own_session, p_exclude, p_avoid_orphan, true, false));
  END IF;

  -- ── Rung 2: two blocks in the same physical row, as balanced as possible ──
  FOR rec IN
    SELECT a.prow, a.rk, a.p0 AS a0, a.p1 AS a1, a.len AS la, b.p0 AS b0, b.p1 AS b1, b.len AS lb
    FROM _runs a JOIN _runs b ON b.prow = a.prow AND b.p0 > a.p0
    WHERE a.len + b.len >= p_quantity
    ORDER BY a.rk, abs(a.len - b.len), a.p0
  LOOP
    -- most balanced split that fits: take v_half from the larger-capable run
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

  -- ── Rung 3: stacked — same positions in two adjacent physical rows ────────
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

  -- ── Rung 4: scattered — best seats in rank order until the party is seated ─
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
$$;

REVOKE ALL ON FUNCTION public.pick_best_available(uuid, uuid, int, text, uuid[], boolean, boolean, boolean) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.bas_result(uuid[], text, int[]) FROM public, anon, authenticated;

-- 4. hold_best_available: pick + hold under the buyer's browsing session ------
-- Everything after this is the existing seat_ids checkout path.
CREATE OR REPLACE FUNCTION public.hold_best_available(
  p_event_id    uuid,
  p_section_id  uuid,
  p_tier_id     uuid,
  p_quantity    int,
  p_session_id  text,
  p_user_id     uuid    DEFAULT NULL,
  p_allow_split boolean DEFAULT false,
  p_exclude     uuid[]  DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
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

  -- Cap: event max, tier max, minus seats this session already holds in the
  -- event by HAND (auto holds are replaced below, so they don't count).
  v_cap := LEAST(COALESCE(v_event.max_seats_per_order, 10), COALESCE(v_tier.max_per_order, 10));
  SELECT count(*) INTO v_held_other
  FROM seat_holds h JOIN seats s ON s.id = h.seat_id
  WHERE h.session_id = p_session_id AND h.expires_at > v_now
    AND s.event_id = p_event_id AND h.origin <> 'auto';
  IF p_quantity < 1 OR p_quantity > v_cap - v_held_other THEN
    RETURN jsonb_build_object('ok', false, 'code', 'MAX_PER_ORDER', 'max', GREATEST(v_cap - v_held_other, 0));
  END IF;

  -- One live auto-selection per tab: a second Continue replaces, never stacks.
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

  -- Belt and braces: every seat must now be ours, or we return none of them.
  IF (SELECT count(*) FROM seat_holds WHERE session_id = p_session_id AND seat_id = ANY(v_ids)) <> p_quantity THEN
    DELETE FROM seat_holds WHERE session_id = p_session_id AND seat_id = ANY(v_ids);
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_ENOUGH');
  END IF;

  RETURN v_res || jsonb_build_object('expires_at', v_expires, 'section_id', p_section_id, 'tier_id', p_tier_id);
END;
$$;
GRANT EXECUTE ON FUNCTION public.hold_best_available(uuid, uuid, uuid, int, text, uuid, boolean, uuid[]) TO anon, authenticated;

-- Read-only variant for the organizer's builder preview and for support.
CREATE OR REPLACE FUNCTION public.preview_best_available(
  p_section_id uuid, p_tier_id uuid, p_quantity int, p_allow_split boolean DEFAULT true
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_avoid boolean;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;
  SELECT e.avoid_orphan_seats INTO v_avoid
  FROM event_sections sec JOIN events e ON e.id = sec.event_id WHERE sec.id = p_section_id;
  RETURN pick_best_available(p_section_id, p_tier_id, p_quantity, NULL, NULL, COALESCE(v_avoid, true), p_allow_split, false);
END;
$$;
GRANT EXECUTE ON FUNCTION public.preview_best_available(uuid, uuid, int, boolean) TO authenticated;

-- 5. assign_seats_to_intent: section scope + the shared ranking for the
--    null-seat_ids branch (API / box office callers). The seat_ids branch — the
--    one the web picker and the auto sheet both use — is unchanged.
DROP FUNCTION IF EXISTS public.assign_seats_to_intent(uuid, uuid, integer, uuid[], text);
CREATE OR REPLACE FUNCTION public.assign_seats_to_intent(
  p_intent_id uuid, p_tier_id uuid, p_quantity integer, p_seat_ids uuid[], p_session_id text,
  p_section_id uuid DEFAULT NULL
) RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_event_id uuid;
  v_chosen uuid[];
  v_held integer;
  v_own_live integer;
  v_result json;
  v_avoid boolean;
  v_pick jsonb;
  v_sec record;
BEGIN
  SELECT event_id INTO v_event_id FROM purchase_intents WHERE id = p_intent_id;
  IF v_event_id IS NULL THEN
    RAISE EXCEPTION 'INTENT_NOT_FOUND';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM seats s
    JOIN event_sections sec ON sec.id = s.section_id
    WHERE s.event_id = v_event_id
      AND COALESCE(s.tier_id, NULLIF(sec.row_tier_overrides->>s.row_label, '')::uuid, sec.tier_id) = p_tier_id
  ) THEN
    RETURN NULL;
  END IF;

  IF p_seat_ids IS NOT NULL AND array_length(p_seat_ids, 1) > 0 THEN
    IF array_length(p_seat_ids, 1) != p_quantity THEN
      RAISE EXCEPTION 'SEAT_COUNT_MISMATCH';
    END IF;

    IF p_session_id IS NOT NULL AND p_session_id <> '' THEN
      SELECT count(*) INTO v_own_live
      FROM seat_holds h
      WHERE h.seat_id = ANY(p_seat_ids)
        AND h.session_id = p_session_id
        AND h.expires_at > now() - interval '30 seconds';

      IF v_own_live <> array_length(p_seat_ids, 1) THEN
        RAISE EXCEPTION 'SEATS_EXPIRED';
      END IF;
    END IF;

    WITH locked AS (
      SELECT s.id
      FROM seats s
      JOIN event_sections sec ON sec.id = s.section_id
      WHERE s.id = ANY(p_seat_ids)
        AND s.event_id = v_event_id
        AND s.status = 'available'
        AND COALESCE(s.tier_id, NULLIF(sec.row_tier_overrides->>s.row_label, '')::uuid, sec.tier_id) = p_tier_id
        AND NOT EXISTS (
          SELECT 1 FROM seat_holds h
          WHERE h.seat_id = s.id AND h.expires_at > now() - interval '30 seconds'
            AND h.session_id != p_intent_id::text
            AND (p_session_id IS NULL OR h.session_id != p_session_id)
        )
      FOR UPDATE OF s SKIP LOCKED
    )
    SELECT array_agg(id) INTO v_chosen FROM locked;

    IF v_chosen IS NULL OR array_length(v_chosen, 1) != p_quantity THEN
      RAISE EXCEPTION 'SEATS_UNAVAILABLE';
    END IF;
  ELSE
    -- No seats named: pick best available with the shared ranking. Scoped to
    -- the section when given, else the first section (by sort_order) of this
    -- tier that can seat the party.
    SELECT avoid_orphan_seats INTO v_avoid FROM events WHERE id = v_event_id;
    v_pick := NULL;
    FOR v_sec IN
      SELECT sec.id FROM event_sections sec
      WHERE sec.event_id = v_event_id AND sec.is_active
        AND (p_section_id IS NULL OR sec.id = p_section_id)
      ORDER BY sec.sort_order, sec.created_at
    LOOP
      v_pick := pick_best_available(v_sec.id, p_tier_id, p_quantity, p_session_id, NULL, COALESCE(v_avoid, true), true, true);
      EXIT WHEN (v_pick->>'ok')::boolean;
    END LOOP;
    IF v_pick IS NULL OR NOT (v_pick->>'ok')::boolean THEN
      RAISE EXCEPTION 'SEATS_UNAVAILABLE';
    END IF;
    SELECT array_agg((e->>'seat_id')::uuid) INTO v_chosen FROM jsonb_array_elements(v_pick->'seats') e;
  END IF;

  IF p_session_id IS NOT NULL AND p_session_id <> '' THEN
    DELETE FROM seat_holds
    WHERE seat_id = ANY(v_chosen) AND session_id = p_session_id;
  END IF;

  INSERT INTO seat_holds (seat_id, session_id, user_id, expires_at, origin)
  SELECT unnest(v_chosen), p_intent_id::text,
         (SELECT user_id FROM purchase_intents WHERE id = p_intent_id),
         now() + interval '18 minutes',
         CASE WHEN p_seat_ids IS NOT NULL AND array_length(p_seat_ids, 1) > 0 THEN 'pick' ELSE 'auto' END
  ON CONFLICT (seat_id) DO NOTHING;

  SELECT count(*) INTO v_held FROM seat_holds
  WHERE session_id = p_intent_id::text AND seat_id = ANY(v_chosen);

  IF v_held != p_quantity THEN
    DELETE FROM seat_holds WHERE session_id = p_intent_id::text;
    RAISE EXCEPTION 'SEATS_UNAVAILABLE';
  END IF;

  WITH ordered_tickets AS (
    SELECT id, row_number() OVER (ORDER BY created_at, id) AS rn
    FROM tickets
    WHERE purchase_intent_id = p_intent_id AND status = 'reserved'
  ),
  ordered_seats AS (
    SELECT s.id AS seat_id,
           jsonb_build_object(
             'section', sec.label,
             'row', s.row_label,
             'seat', s.seat_number,
             'label', s.label
           ) AS info,
           row_number() OVER (ORDER BY sec.sort_order, natsort_key(s.row_label), s.seat_number) AS rn
    FROM seats s
    JOIN event_sections sec ON sec.id = s.section_id
    WHERE s.id = ANY(v_chosen)
  )
  UPDATE tickets t
  SET seat_id = os.seat_id, seat_info = os.info
  FROM ordered_tickets ot
  JOIN ordered_seats os ON os.rn = ot.rn
  WHERE t.id = ot.id;

  SELECT json_agg(jsonb_build_object(
    'seat_id', s.id,
    'section', sec.label,
    'row', s.row_label,
    'seat', s.seat_number,
    'label', s.label
  ) ORDER BY sec.sort_order, natsort_key(s.row_label), s.seat_number)
  INTO v_result
  FROM seats s
  JOIN event_sections sec ON sec.id = s.section_id
  WHERE s.id = ANY(v_chosen);

  RETURN v_result;
END;
$$;

-- Server-side callers only (edge fns use the service role). The legacy 4-arg
-- overload was executable by anon — anyone could seat any intent; close that.
REVOKE ALL ON FUNCTION public.assign_seats_to_intent(uuid, uuid, integer, uuid[], text, uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assign_seats_to_intent(uuid, uuid, integer, uuid[], text, uuid) TO service_role;
REVOKE ALL ON FUNCTION public.assign_seats_to_intent(uuid, uuid, integer, uuid[]) FROM public, anon, authenticated;

-- 6. Status endpoint: largest contiguous block per section (and per tier when
--    a section mixes prices) so the picker can say "up to 6 together" without
--    a round trip.
CREATE OR REPLACE FUNCTION public.section_blocks(p_section_id uuid)
RETURNS TABLE (tier_id uuid, available_count bigint, largest_block bigint)
LANGUAGE sql STABLE SET search_path TO 'public' AS $$
  WITH base AS (
    SELECT s.id, s.row_label, s.seat_number, s.x, s.y,
           COALESCE(s.tier_id, NULLIF(sec.row_tier_overrides->>s.row_label, '')::uuid, sec.tier_id) AS tier_id,
           (s.status = 'available' AND NOT EXISTS (
              SELECT 1 FROM seat_holds h WHERE h.seat_id = s.id AND h.expires_at > now())) AS cand
    FROM seats s JOIN event_sections sec ON sec.id = s.section_id
    WHERE s.section_id = p_section_id
  ),
  dist AS (
    SELECT *, sqrt((x - lag(x) OVER w)^2 + (y - lag(y) OVER w)^2) AS d,
           lag(seat_number) OVER w AS prev_n, lag(row_label) OVER w AS prev_r,
           lag(tier_id) OVER w AS prev_t
    FROM base WINDOW w AS (ORDER BY natsort_key(row_label), seat_number)
  ),
  thr AS (SELECT COALESCE(percentile_cont(0.5) WITHIN GROUP (ORDER BY d), 0) * 1.8 AS t FROM dist WHERE d IS NOT NULL),
  grp AS (
    SELECT dist.*, sum(CASE WHEN prev_r IS DISTINCT FROM row_label OR seat_number <> prev_n + 1
                             OR d > (SELECT t FROM thr) OR prev_t IS DISTINCT FROM tier_id OR NOT cand
                            THEN 1 ELSE 0 END) OVER (ORDER BY natsort_key(row_label), seat_number) AS g
    FROM dist
  ),
  runs AS (SELECT tier_id, count(*) AS len FROM grp WHERE cand GROUP BY tier_id, g)
  SELECT b.tier_id, count(*) FILTER (WHERE b.cand), COALESCE((SELECT max(len) FROM runs r WHERE r.tier_id = b.tier_id), 0)
  FROM base b GROUP BY b.tier_id;
$$;

CREATE OR REPLACE FUNCTION public.get_event_seat_status(p_event_id uuid)
RETURNS json LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM event_seat_maps m WHERE m.event_id = p_event_id
  ) THEN NULL ELSE json_build_object(
    'event_id', p_event_id,
    'version', (
      SELECT extract(epoch FROM GREATEST(
        m.updated_at,
        COALESCE(
          (SELECT max(t.updated_at) FROM ticket_tiers t
            WHERE t.event_id = p_event_id AND t.is_active = true),
          m.updated_at
        )
      ))::bigint
      FROM event_seat_maps m WHERE m.event_id = p_event_id
    ),
    'selection_mode', (SELECT seat_selection_mode FROM events WHERE id = p_event_id),
    'max_per_order', (SELECT COALESCE(max_seats_per_order, 10) FROM events WHERE id = p_event_id),
    'taken', (
      SELECT COALESCE(json_agg(json_build_object(
        'id', s.id,
        'status', CASE WHEN s.status IN ('booked','disabled') THEN s.status ELSE 'held' END
      )), '[]'::json)
      FROM seats s
      JOIN event_sections sec ON sec.id = s.section_id
      WHERE sec.event_id = p_event_id AND sec.is_active = true
        AND (
          s.status IN ('booked','disabled')
          OR EXISTS (SELECT 1 FROM seat_holds h WHERE h.seat_id = s.id AND h.expires_at > now())
        )
    ),
    'sections', (
      SELECT COALESCE(json_agg(json_build_object(
        'id', sec.id,
        'available_count', CASE
          WHEN sec.tier_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM seats s WHERE s.section_id = sec.id) THEN (
            SELECT GREATEST(COALESCE(t.quantity_total, 0) - COALESCE(t.quantity_sold, 0), 0)
            FROM ticket_tiers t WHERE t.id = sec.tier_id
          )
          ELSE (SELECT COALESCE(sum(b.available_count), 0) FROM section_blocks(sec.id) b WHERE b.tier_id IS NOT NULL)
        END,
        'largest_block', (SELECT COALESCE(max(b.largest_block), 0) FROM section_blocks(sec.id) b WHERE b.tier_id IS NOT NULL),
        'by_tier', (
          SELECT COALESCE(json_agg(json_build_object(
            'tier_id', b.tier_id, 'available_count', b.available_count, 'largest_block', b.largest_block
          )), '[]'::json)
          FROM section_blocks(sec.id) b WHERE b.tier_id IS NOT NULL
        )
      )), '[]'::json)
      FROM event_sections sec
      WHERE sec.event_id = p_event_id AND sec.is_active = true
    )
  ) END;
$$;
