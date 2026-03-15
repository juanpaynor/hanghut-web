-- ============================================================
-- 029: Performance — Batch ticket count function
-- Replaces N+1 individual count queries with a single call
-- ============================================================

CREATE OR REPLACE FUNCTION get_ticket_counts_by_events(p_event_ids uuid[])
RETURNS TABLE(event_id uuid, sold_count bigint) 
LANGUAGE sql STABLE
AS $$
    SELECT t.event_id, COUNT(*) as sold_count
    FROM tickets t
    WHERE t.event_id = ANY(p_event_ids)
      AND t.status NOT IN ('available', 'cancelled', 'refunded')
    GROUP BY t.event_id;
$$;
