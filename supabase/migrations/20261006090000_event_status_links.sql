-- Shareable, read-only "how is the show doing" links.
--
-- An organizer hands a URL to door staff, the venue or a promoter. They open it
-- on a phone and see counts. No account, no invite, no team seat -- which is the
-- whole point: a seat costs a gate (team_seats is 2 on Free) and gives far more
-- access than "how many are in".
--
-- The token IS the credential, so the shape of this matters more than its size:
--   * anon gets EXECUTE on one function and NOTHING on the table. The advisor
--     lint we just worked through was a public view handing auth.users emails to
--     anyone holding the publishable key; a public status endpoint is exactly
--     where that mistake gets made twice.
--   * the payload carries no attendee names, emails or ticket codes. A link that
--     gets forwarded into a group chat must not become a contact leak.
--   * revenue is OFF unless the organizer ticks it per link.

CREATE TABLE IF NOT EXISTS public.event_status_links (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id      uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
    -- 32 random bytes, base64url. Short codes are guessable and this is the only
    -- thing standing between a stranger and the event's numbers.
    token         text NOT NULL UNIQUE,
    -- So the organizer remembers who they gave it to, and what to revoke later.
    label         text,
    show_revenue  boolean NOT NULL DEFAULT false,
    is_active     boolean NOT NULL DEFAULT true,
    expires_at    timestamptz,
    created_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at    timestamptz NOT NULL DEFAULT now(),
    revoked_at    timestamptz,
    -- Usage, so an organizer can tell whether the venue ever opened it.
    view_count    integer NOT NULL DEFAULT 0,
    last_viewed_at timestamptz
);

CREATE INDEX IF NOT EXISTS event_status_links_event_idx
    ON public.event_status_links (event_id) WHERE is_active;

ALTER TABLE public.event_status_links ENABLE ROW LEVEL SECURITY;

-- Organizers manage their own links. Readers never touch this table at all --
-- they go through get_event_status_by_token, which is SECURITY DEFINER.
DROP POLICY IF EXISTS event_status_links_owner ON public.event_status_links;
CREATE POLICY event_status_links_owner ON public.event_status_links
    FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.events e
            JOIN public.partners p ON p.id = e.organizer_id
            WHERE e.id = event_status_links.event_id
              AND (
                p.user_id = auth.uid()
                OR EXISTS (
                    SELECT 1 FROM public.partner_team_members m
                    WHERE m.partner_id = p.id
                      AND m.user_id = auth.uid()
                      AND m.is_active
                      AND m.role IN ('owner', 'manager')
                )
              )
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.events e
            JOIN public.partners p ON p.id = e.organizer_id
            WHERE e.id = event_status_links.event_id
              AND (
                p.user_id = auth.uid()
                OR EXISTS (
                    SELECT 1 FROM public.partner_team_members m
                    WHERE m.partner_id = p.id
                      AND m.user_id = auth.uid()
                      AND m.is_active
                      AND m.role IN ('owner', 'manager')
                )
              )
        )
    );

REVOKE ALL ON public.event_status_links FROM anon;


-- ---------------------------------------------------------------------------
-- The ONLY public read path.
-- ---------------------------------------------------------------------------
-- Every failure returns the same {ok:false, reason:'invalid'}. Distinguishing
-- "no such token" from "revoked" from "expired" would confirm to someone probing
-- tokens that a given one once existed, and the viewer can do nothing with the
-- difference anyway -- the organizer sees real link state on the dashboard.
--
-- VOLATILE, not STABLE: it writes the view counters.
CREATE OR REPLACE FUNCTION public.get_event_status_by_token(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_link   record;
    v_event  record;
    v_tiers  jsonb;
    v_sold   integer;
    v_used   integer;
    v_revenue numeric;
BEGIN
    IF p_token IS NULL OR length(p_token) < 16 THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'invalid');
    END IF;

    SELECT * INTO v_link FROM event_status_links WHERE token = p_token;

    IF NOT FOUND
       OR NOT v_link.is_active
       OR v_link.revoked_at IS NOT NULL
       OR (v_link.expires_at IS NOT NULL AND v_link.expires_at < now())
    THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'invalid');
    END IF;

    SELECT e.id, e.title, e.start_datetime, e.end_datetime, e.venue_name,
           e.is_online, e.capacity, e.status::text AS status
      INTO v_event
      FROM events e WHERE e.id = v_link.event_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'invalid');
    END IF;

    -- One scope for both numbers, deliberately. A sold ticket is valid|used; a
    -- checked-in one is used. `reserved` is an abandoned cart and has never been
    -- sold, so counting it here would make this page disagree with the dashboard
    -- for the entire length of a checkout window.
    SELECT
        count(*) FILTER (WHERE t.status IN ('valid', 'used')),
        count(*) FILTER (WHERE t.status = 'used')
      INTO v_sold, v_used
      FROM tickets t WHERE t.event_id = v_event.id;

    -- Tier labels come from ticket_tiers where the ticket carries a tier_id, and
    -- fall back to the legacy free-text column otherwise -- a chunk of older
    -- rows have a null tier_id, and dropping them would silently under-report.
    SELECT coalesce(jsonb_agg(x ORDER BY x->>'name'), '[]'::jsonb) INTO v_tiers
      FROM (
        SELECT jsonb_build_object(
                 'name',       coalesce(tt.name, initcap(replace(t.tier, '_', ' ')), 'General'),
                 'sold',       count(*) FILTER (WHERE t.status IN ('valid', 'used')),
                 'checked_in', count(*) FILTER (WHERE t.status = 'used'),
                 'total',      max(tt.quantity_total)
               ) AS x
          FROM tickets t
          LEFT JOIN ticket_tiers tt ON tt.id = t.tier_id
         WHERE t.event_id = v_event.id
           AND t.status IN ('valid', 'used')
         GROUP BY coalesce(tt.name, initcap(replace(t.tier, '_', ' ')), 'General')
      ) s;

    IF v_link.show_revenue THEN
        -- purchase_intents, not transactions: box-office sales deliberately write
        -- no transactions row, so summing those would quietly omit door takings.
        SELECT coalesce(sum(pi.total_amount), 0) INTO v_revenue
          FROM purchase_intents pi
         WHERE pi.event_id = v_event.id AND pi.status = 'completed';
    END IF;

    UPDATE event_status_links
       SET view_count = view_count + 1, last_viewed_at = now()
     WHERE id = v_link.id;

    RETURN jsonb_build_object(
        'ok', true,
        'label', v_link.label,
        'event', jsonb_build_object(
            'title',     v_event.title,
            'starts_at', v_event.start_datetime,
            'ends_at',   v_event.end_datetime,
            'venue',     v_event.venue_name,
            'is_online', v_event.is_online,
            'status',    v_event.status
        ),
        'totals', jsonb_build_object(
            'capacity',   v_event.capacity,
            'sold',       v_sold,
            'checked_in', v_used,
            'remaining',  greatest(0, coalesce(v_event.capacity, 0) - v_sold)
        ),
        'tiers',   v_tiers,
        'revenue', CASE WHEN v_link.show_revenue
                        THEN jsonb_build_object('gross', v_revenue, 'currency', 'PHP')
                        ELSE NULL END,
        'generated_at', now()
    );
END;
$$;

-- anon may CALL this and nothing else. No table grants, by design.
REVOKE ALL ON FUNCTION public.get_event_status_by_token(text) FROM public;
GRANT EXECUTE ON FUNCTION public.get_event_status_by_token(text) TO anon, authenticated;

COMMENT ON FUNCTION public.get_event_status_by_token(text) IS
  'Public read path for a shared event status link. Returns counts only -- never attendee PII -- and revenue only when the link opts in.';
