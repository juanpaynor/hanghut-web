-- Box office close-out: what the system EXPECTED vs what was actually counted.
--
-- Until now the door till could only report what it recorded. At close, someone
-- counted the tin against that number in their head or on paper, and a shortfall
-- left no trace — no record of who counted, when, or how far out it was.
--
-- Cash is the only method that needs this. Terminal and bank settle to the
-- organizer's own accounts and reconcile against those statements; comps carry no
-- value. So the count is per SELLER per EVENT, matching how drawers are actually
-- handed over: each person counts their own, and a variance is attributable
-- rather than a mystery spread across the team.
--
-- `expected_cash` is snapshotted at count time and NEVER supplied by the client —
-- the RPC recomputes it from purchase_intents with the same predicate as
-- get_box_office_summary. A client-supplied expectation would let a till be
-- balanced by asserting the number it was supposed to prove.

CREATE TABLE IF NOT EXISTS public.box_office_closeouts (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id        uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
    -- The seller whose drawer this is. NULL = a single count for the whole door
    -- (small events where one tin is shared).
    seller_id       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    counted_cash    numeric(12,2) NOT NULL CHECK (counted_cash >= 0),
    expected_cash   numeric(12,2) NOT NULL,
    -- Positive = over (more in the tin than sold), negative = short.
    variance        numeric(12,2) GENERATED ALWAYS AS (counted_cash - expected_cash) STORED,
    note            text,
    counted_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    counted_at      timestamptz NOT NULL DEFAULT now()
);

-- One standing count per drawer. Re-counting corrects it rather than appending a
-- second contradictory figure; counted_at shows when it was last settled.
CREATE UNIQUE INDEX IF NOT EXISTS box_office_closeouts_event_seller_key
    ON public.box_office_closeouts (event_id, COALESCE(seller_id, '00000000-0000-0000-0000-000000000000'::uuid));

CREATE INDEX IF NOT EXISTS box_office_closeouts_event_idx
    ON public.box_office_closeouts (event_id);

ALTER TABLE public.box_office_closeouts ENABLE ROW LEVEL SECURITY;

-- Reads go through the RPC (SECURITY DEFINER, guarded by can_sell_at_door). No
-- direct policy: the table holds cash-variance data and there is no reason for a
-- client to reach it outside that guard.
REVOKE ALL ON public.box_office_closeouts FROM anon, authenticated;

COMMENT ON TABLE public.box_office_closeouts IS
  'Till counts for door sales: expected cash (computed server-side) vs counted cash, per seller per event. Records the variance so a shortfall is attributable. Door money never passes through HangHut — see create_box_office_order.';


-- ── Record a count ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.record_box_office_closeout(
    p_event_id     uuid,
    p_counted_cash numeric,
    p_seller_id    uuid DEFAULT NULL,
    p_note         text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_org uuid; v_expected numeric; v_id uuid; v_variance numeric;
BEGIN
    IF p_counted_cash IS NULL OR p_counted_cash < 0 THEN
        RAISE EXCEPTION 'Counted cash cannot be negative';
    END IF;

    SELECT organizer_id INTO v_org FROM events WHERE id = p_event_id;
    IF v_org IS NULL THEN RAISE EXCEPTION 'Event not found'; END IF;
    IF NOT can_sell_at_door(v_org) THEN
        RAISE EXCEPTION 'You do not have permission to close out this door';
    END IF;

    -- Same predicate as get_box_office_summary. Computed here, never trusted from
    -- the client — see the table comment.
    SELECT COALESCE(SUM(pi.total_amount), 0) INTO v_expected
    FROM purchase_intents pi
    WHERE pi.event_id = p_event_id
      AND pi.source = 'box_office'
      AND pi.status = 'completed'
      AND pi.payment_method = 'CASH'
      AND (p_seller_id IS NULL OR (pi.metadata ->> 'sold_by')::uuid = p_seller_id);

    INSERT INTO box_office_closeouts (
        event_id, seller_id, counted_cash, expected_cash, note, counted_by
    ) VALUES (
        p_event_id, p_seller_id, round(p_counted_cash, 2), v_expected,
        NULLIF(btrim(COALESCE(p_note, '')), ''), auth.uid()
    )
    ON CONFLICT (event_id, COALESCE(seller_id, '00000000-0000-0000-0000-000000000000'::uuid))
    DO UPDATE SET
        counted_cash  = EXCLUDED.counted_cash,
        expected_cash = EXCLUDED.expected_cash,
        note          = EXCLUDED.note,
        counted_by    = EXCLUDED.counted_by,
        counted_at    = now()
    RETURNING id, variance INTO v_id, v_variance;

    RETURN jsonb_build_object(
        'id', v_id,
        'expected_cash', v_expected,
        'counted_cash', round(p_counted_cash, 2),
        'variance', v_variance
    );
END;
$function$;


-- ── Read the counts back ───────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_box_office_closeouts(p_event_id uuid)
RETURNS TABLE(
    seller_id uuid, seller_name text,
    counted_cash numeric, expected_cash numeric, variance numeric,
    note text, counted_by_name text, counted_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_org uuid;
BEGIN
    SELECT organizer_id INTO v_org FROM events WHERE id = p_event_id;
    IF v_org IS NULL THEN RAISE EXCEPTION 'Event not found'; END IF;
    IF NOT can_sell_at_door(v_org) THEN
        RAISE EXCEPTION 'You do not have permission to view door sales for this event';
    END IF;

    RETURN QUERY
    SELECT c.seller_id,
           COALESCE(s.display_name, 'Whole door'),
           c.counted_cash, c.expected_cash, c.variance,
           c.note,
           COALESCE(b.display_name, 'Unknown'),
           c.counted_at
    FROM box_office_closeouts c
    LEFT JOIN users s ON s.id = c.seller_id
    LEFT JOIN users b ON b.id = c.counted_by
    WHERE c.event_id = p_event_id
    ORDER BY c.counted_at DESC;
END;
$function$;

REVOKE ALL ON FUNCTION public.record_box_office_closeout(uuid, numeric, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_box_office_closeout(uuid, numeric, uuid, text) TO authenticated;
REVOKE ALL ON FUNCTION public.get_box_office_closeouts(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_box_office_closeouts(uuid) TO authenticated;

COMMENT ON FUNCTION public.record_box_office_closeout(uuid, numeric, uuid, text) IS
  'Records a till count against server-computed expected cash and stores the variance. Upserts: re-counting a drawer corrects the standing figure.';
