-- finalize_event_refund: the DB side of an automatic (Xendit-reversed) EVENT refund.
--
-- request-refund (edge fn) moves the money and sets refunded_amount/refunded_at, but
-- historically the ticket voiding was done ad-hoc in TS (markIntentAsRefunded) which
-- did NOT restore seats, did NOT decrement events.tickets_sold, and wrote NO reversal
-- transactions row (finding D). This RPC brings the auto-refund path to parity with
-- record_manual_refund: it writes the reversal ledger row (reverse gross + organizer
-- payout, KEEP platform + fixed fee), voids tickets, frees seats, decrements tier +
-- tickets_sold, and marks the order refunded — all atomically.
--
-- Called AFTER request-refund succeeds, so it must NOT re-add refunded_amount (the edge
-- fn already set it). Idempotent via status='refunded'.
create or replace function public.finalize_event_refund(p_intent_id uuid, p_amount numeric default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
    v_intent record;
    v_partner_id uuid;
    v_orig record;
    v_ratio numeric;
    v_full boolean;
    v_authorized boolean;
    v_already numeric;
    v_amt numeric;
    v_fee_pct numeric;
    r record;
begin
    select pi.*, e.organizer_id as e_organizer_id
      into v_intent
    from purchase_intents pi
    join events e on e.id = pi.event_id
    where pi.id = p_intent_id;
    if not found then return jsonb_build_object('success', false, 'error', 'Order not found'); end if;

    v_partner_id := v_intent.e_organizer_id;

    -- Same authorization model as record_manual_refund (organizer owner/finance).
    select exists (
        select 1 from partners p where p.id = v_partner_id and p.user_id = auth.uid()
        union all
        select 1 from partner_team_members m
          where m.partner_id = v_partner_id and m.user_id = auth.uid()
            and m.is_active and m.role in ('owner','finance')
    ) into v_authorized;
    if not v_authorized then return jsonb_build_object('success', false, 'error', 'Not authorized'); end if;

    -- Idempotent: already finalized by a previous call.
    if v_intent.status = 'refunded' then return jsonb_build_object('success', true, 'already', true); end if;

    v_already := coalesce(v_intent.refunded_amount, 0);
    -- Amount to reverse in the ledger: the passed amount, else what request-refund
    -- already recorded, else the full order total. markIntentAsRefunded is always full.
    v_amt := coalesce(nullif(p_amount, 0), nullif(v_already, 0), v_intent.total_amount);
    v_full := (p_amount is null) or (v_amt >= v_intent.total_amount) or (v_already >= v_intent.total_amount);

    select platform_fee, organizer_payout, fixed_fee, gross_amount
      into v_orig
    from transactions
    where purchase_intent_id = p_intent_id and status = 'completed'
    limit 1;

    v_ratio := case
        when v_orig.gross_amount is not null and v_orig.gross_amount <> 0 then v_amt / v_orig.gross_amount
        else v_amt / nullif(v_intent.total_amount, 0) end;

    select coalesce(custom_percentage, 4.0) into v_fee_pct from partners where id = v_partner_id;

    -- Reversal row: reverse gross + organizer payout; KEEP platform + fixed fee.
    insert into transactions (
        purchase_intent_id, event_id, partner_id, user_id,
        gross_amount, platform_fee, fixed_fee, organizer_payout, payment_processing_fee,
        fee_percentage, fee_basis, xendit_transaction_id, status
    ) values (
        p_intent_id, v_intent.event_id, v_partner_id, v_intent.user_id,
        -v_amt, 0, 0, -round(coalesce(v_orig.organizer_payout, 0) * v_ratio), 0,
        v_fee_pct, 'auto_refund', null, 'refunded'
    );

    if v_full then
        update tickets set status = 'refunded', updated_at = now()
          where purchase_intent_id = p_intent_id and status <> 'refunded';

        update seats set status = 'available'
          where id in (select seat_id from tickets where purchase_intent_id = p_intent_id and seat_id is not null);

        for r in
            select tier_id, count(*)::int as cnt from tickets
            where purchase_intent_id = p_intent_id and tier_id is not null group by tier_id
        loop
            perform decrement_tier_sold(r.tier_id, r.cnt);
        end loop;

        update events set tickets_sold = greatest(0, coalesce(tickets_sold, 0) - v_intent.quantity)
          where id = v_intent.event_id;

        update purchase_intents
          set status = 'refunded',
              refunded_amount = greatest(v_already, v_amt),
              refunded_at = coalesce(refunded_at, now()),
              refund_method = coalesce(refund_method, 'auto')
          where id = p_intent_id;
    else
        update purchase_intents
          set refunded_amount = greatest(v_already, v_amt),
              refunded_at = coalesce(refunded_at, now()),
              refund_method = coalesce(refund_method, 'auto')
          where id = p_intent_id;
    end if;

    return jsonb_build_object('success', true, 'full', v_full, 'amount', v_amt);
end $function$;

revoke all on function public.finalize_event_refund(uuid, numeric) from public, anon;
grant execute on function public.finalize_event_refund(uuid, numeric) to authenticated, service_role;
