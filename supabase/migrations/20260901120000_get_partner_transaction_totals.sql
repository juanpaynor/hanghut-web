-- Totals for the payouts Transactions tab.
--
-- The tab paginates 10 rows at a time but the summary cards were summing the
-- CURRENT PAGE while displaying the FULL count beside it — so a partner with 23
-- transactions saw "Total Incoming ₱54,000 · Count 23" when the real gross was
-- ₱149,000. Aggregate in Postgres over the whole filtered set instead of shipping
-- every row to the browser to add up.
--
-- security invoker: transactions RLS already scopes reads to the partner.
create or replace function public.get_partner_transaction_totals(
    p_partner_id uuid,
    p_from timestamptz default null,
    p_to timestamptz default null,
    p_search text default null
)
returns table (
    txn_count bigint,
    gross numeric,
    payout numeric,
    refunds numeric
)
language sql
stable
security invoker
set search_path = public
as $$
    select
        count(*),
        coalesce(sum(t.gross_amount), 0),
        coalesce(sum(t.organizer_payout), 0),
        coalesce(sum(coalesce(pi.refunded_amount, 0)), 0)
    from transactions t
    join events e on e.id = t.event_id
    left join purchase_intents pi on pi.id = t.purchase_intent_id
    where t.partner_id = p_partner_id
      -- Internal refund-reversal rows carry a negative gross and are excluded from
      -- the sales view; the refund itself is surfaced from refunded_amount.
      and t.gross_amount >= 0
      and (p_from is null or t.created_at >= p_from)
      and (p_to   is null or t.created_at <= p_to)
      and (
            p_search is null
         or p_search = ''
         or (p_search ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
             and t.id = p_search::uuid)
         or (p_search !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
             and e.title ilike '%' || p_search || '%')
      );
$$;

revoke all on function public.get_partner_transaction_totals(uuid, timestamptz, timestamptz, text) from public, anon;
grant execute on function public.get_partner_transaction_totals(uuid, timestamptz, timestamptz, text) to authenticated, service_role;
