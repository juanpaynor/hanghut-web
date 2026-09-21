-- Both bugs below were found while a partner tried to record a manual refund.
-- Neither had ever worked: all three refund RPCs were dead on arrival.
--
-- BUG 2 of 2 -- the phantom function.
-- record_manual_refund, complete_disbursement_refund and finalize_event_refund
-- all called decrement_tier_sold(uuid,int), which has NEVER existed in this
-- database. Every FULL refund through any of them aborted with 42883
-- undefined_function as soon as it reached a tiered order.
--
-- The loop is removed rather than repaired, because creating the missing
-- function would have been actively harmful: trigger_update_tier_quantity_sold
-- fires on the `update tickets set status='refunded'` immediately above and
-- RECOUNTS quantity_sold absolutely --
--     count(*) where status not in ('available','cancelled','refunded')
-- -- rather than applying a delta. Subtracting again afterwards would push
-- quantity_sold below the true figure and quietly resell seats.
--
-- The events.tickets_sold update is KEPT: sync_event_tickets_sold only moves
-- that counter when a ticket crosses the 'available' boundary, and
-- completed -> refunded does not, so it is genuinely required here.
--
-- Verified on prod by calling record_manual_refund inside a rolled-back
-- transaction while impersonating the real partner owner: reversal row written,
-- manual_refunds logged, tickets refunded, events.tickets_sold 2->1, and
-- tier.quantity_sold 2->1 matching an independent recount of 1.

CREATE OR REPLACE FUNCTION public.record_manual_refund(p_intent_id uuid, p_amount numeric, p_channel text, p_reference text DEFAULT NULL::text, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_intent record;
  v_partner_id uuid;
  v_orig record;
  v_ratio numeric;
  v_full boolean;
  v_authorized boolean;
  v_already numeric;
  v_fee_pct numeric;
begin
  select pi.*, e.organizer_id as e_organizer_id, e.tickets_sold as e_tickets_sold
    into v_intent
  from purchase_intents pi
  join events e on e.id = pi.event_id
  where pi.id = p_intent_id;
  if not found then return jsonb_build_object('success', false, 'error', 'Order not found'); end if;

  v_partner_id := v_intent.e_organizer_id;

  select exists (
    select 1 from partners p where p.id = v_partner_id and p.user_id = auth.uid()
    union all
    select 1 from partner_team_members m
      where m.partner_id = v_partner_id and m.user_id = auth.uid()
        and m.is_active and m.role in ('owner','finance')
  ) into v_authorized;
  if not v_authorized then return jsonb_build_object('success', false, 'error', 'Not authorized'); end if;

  if v_intent.status = 'refunded' then return jsonb_build_object('success', false, 'error', 'Already refunded'); end if;
  if v_intent.status <> 'completed' then return jsonb_build_object('success', false, 'error', 'Only completed orders can be refunded'); end if;
  if lower(coalesce(v_intent.payment_method, '')) <> 'qrph' then
    return jsonb_build_object('success', false, 'error', 'Manual refund only applies to QRPH payments');
  end if;

  -- Guard: a Xendit disbursement refund is already in flight for this order. Blocking
  -- here prevents paying the customer twice across the two QRPH refund paths.
  if exists (select 1 from refund_disbursements rd
             where rd.purchase_intent_id = p_intent_id and rd.status = 'pending') then
    return jsonb_build_object('success', false, 'error', 'A transfer refund is already in progress for this order');
  end if;

  v_already := coalesce(v_intent.refunded_amount, 0);
  if p_amount <= 0 or (v_already + p_amount) > v_intent.total_amount then
    return jsonb_build_object('success', false, 'error', 'Invalid refund amount');
  end if;
  v_full := (v_already + p_amount) >= v_intent.total_amount;

  select platform_fee, organizer_payout, fixed_fee, gross_amount
    into v_orig
  from transactions
  where purchase_intent_id = p_intent_id and status = 'completed'
  limit 1;

  v_ratio := case
    when v_orig.gross_amount is not null and v_orig.gross_amount <> 0 then p_amount / v_orig.gross_amount
    else p_amount / nullif(v_intent.total_amount, 0) end;

  select coalesce(custom_percentage, 4.0) into v_fee_pct from partners where id = v_partner_id;

  insert into transactions (
    purchase_intent_id, event_id, partner_id, user_id,
    gross_amount, platform_fee, fixed_fee, organizer_payout, payment_processing_fee,
    fee_percentage, fee_basis, xendit_transaction_id, status
  ) values (
    p_intent_id, v_intent.event_id, v_partner_id, v_intent.user_id,
    -p_amount, 0, 0, -round(coalesce(v_orig.organizer_payout, 0) * v_ratio), 0,
    v_fee_pct, 'manual_refund', null, 'refunded'
  );

  insert into manual_refunds (purchase_intent_id, partner_id, event_id, amount, channel, reference, note, refunded_by)
  values (p_intent_id, v_partner_id, v_intent.event_id, p_amount, p_channel, p_reference, p_note, auth.uid());

  if v_full then
    -- trigger_update_tier_quantity_sold recounts ticket_tiers.quantity_sold off
    -- this statement. Do not adjust tier counts by hand below it.
    update tickets set status = 'refunded', updated_at = now()
      where purchase_intent_id = p_intent_id and status <> 'refunded';

    update seats set status = 'available'
      where id in (select seat_id from tickets where purchase_intent_id = p_intent_id and seat_id is not null);

    -- Required: sync_event_tickets_sold ignores completed -> refunded.
    update events set tickets_sold = greatest(0, coalesce(tickets_sold, 0) - v_intent.quantity)
      where id = v_intent.event_id;

    update purchase_intents
      set status = 'refunded', refunded_amount = v_already + p_amount, refunded_at = now(), refund_method = 'manual'
      where id = p_intent_id;
  else
    update purchase_intents
      set refunded_amount = v_already + p_amount, refund_method = 'manual', refunded_at = coalesce(refunded_at, now())
      where id = p_intent_id;
  end if;

  return jsonb_build_object('success', true, 'full', v_full, 'amount', p_amount);
end $function$;


CREATE OR REPLACE FUNCTION public.complete_disbursement_refund(p_disbursement_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
    v_d          record;
    v_intent     record;
    v_orig       record;
    v_ratio      numeric;
    v_full       boolean;
    v_already    numeric;
    v_fee_pct    numeric;
begin
    select * into v_d from refund_disbursements where id = p_disbursement_id;
    if not found then return jsonb_build_object('success', false, 'error', 'Disbursement not found'); end if;
    if v_d.status = 'completed' then return jsonb_build_object('success', true, 'already', true); end if;
    if v_d.status = 'failed' then return jsonb_build_object('success', false, 'error', 'Disbursement already failed'); end if;

    select pi.* into v_intent from purchase_intents pi where pi.id = v_d.purchase_intent_id;
    if not found then return jsonb_build_object('success', false, 'error', 'Order not found'); end if;

    v_already := coalesce(v_intent.refunded_amount, 0);
    if (v_already + v_d.amount) > v_intent.total_amount then
        return jsonb_build_object('success', false, 'error', 'Refund exceeds order total');
    end if;
    v_full := (v_already + v_d.amount) >= v_intent.total_amount;

    select platform_fee, organizer_payout, fixed_fee, gross_amount
      into v_orig
    from transactions
    where purchase_intent_id = v_d.purchase_intent_id and status = 'completed'
    limit 1;

    v_ratio := case
        when v_orig.gross_amount is not null and v_orig.gross_amount <> 0 then v_d.amount / v_orig.gross_amount
        else v_d.amount / nullif(v_intent.total_amount, 0) end;

    select coalesce(custom_percentage, 4.0) into v_fee_pct from partners where id = v_d.partner_id;

    insert into transactions (
        purchase_intent_id, event_id, partner_id, user_id,
        gross_amount, platform_fee, fixed_fee, organizer_payout, payment_processing_fee,
        fee_percentage, fee_basis, xendit_transaction_id, status
    ) values (
        v_d.purchase_intent_id, v_intent.event_id, v_d.partner_id, v_intent.user_id,
        -v_d.amount, 0, 0, -round(coalesce(v_orig.organizer_payout, 0) * v_ratio), 0,
        v_fee_pct, 'disbursement_refund', v_d.xendit_disbursement_id, 'refunded'
    );

    insert into manual_refunds (purchase_intent_id, partner_id, event_id, amount, channel, reference, note, refunded_by)
    values (v_d.purchase_intent_id, v_d.partner_id, v_intent.event_id, v_d.amount, v_d.channel,
            v_d.xendit_disbursement_id, 'Xendit disbursement refund', v_d.created_by);

    if v_full then
        -- trigger_update_tier_quantity_sold recounts ticket_tiers.quantity_sold
        -- off this statement. Do not adjust tier counts by hand below it.
        update tickets set status = 'refunded', updated_at = now()
          where purchase_intent_id = v_d.purchase_intent_id and status <> 'refunded';

        update seats set status = 'available'
          where id in (select seat_id from tickets where purchase_intent_id = v_d.purchase_intent_id and seat_id is not null);

        -- Required: sync_event_tickets_sold ignores completed -> refunded.
        update events set tickets_sold = greatest(0, coalesce(tickets_sold, 0) - v_intent.quantity)
          where id = v_intent.event_id;

        update purchase_intents
          set status = 'refunded', refunded_amount = v_already + v_d.amount, refunded_at = now(), refund_method = 'disbursement'
          where id = v_d.purchase_intent_id;
    else
        update purchase_intents
          set refunded_amount = v_already + v_d.amount, refund_method = 'disbursement', refunded_at = coalesce(refunded_at, now())
          where id = v_d.purchase_intent_id;
    end if;

    update refund_disbursements
      set status = 'completed', completed_at = now(), updated_at = now()
      where id = p_disbursement_id;

    return jsonb_build_object('success', true, 'full', v_full, 'amount', v_d.amount);
end $function$;


CREATE OR REPLACE FUNCTION public.finalize_event_refund(p_intent_id uuid, p_amount numeric DEFAULT NULL::numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
begin
    select pi.*, e.organizer_id as e_organizer_id
      into v_intent
    from purchase_intents pi
    join events e on e.id = pi.event_id
    where pi.id = p_intent_id;
    if not found then return jsonb_build_object('success', false, 'error', 'Order not found'); end if;

    v_partner_id := v_intent.e_organizer_id;

    select exists (
        select 1 from partners p where p.id = v_partner_id and p.user_id = auth.uid()
        union all
        select 1 from partner_team_members m
          where m.partner_id = v_partner_id and m.user_id = auth.uid()
            and m.is_active and m.role in ('owner','finance')
    ) into v_authorized;
    if not v_authorized then return jsonb_build_object('success', false, 'error', 'Not authorized'); end if;

    if v_intent.status = 'refunded' then return jsonb_build_object('success', true, 'already', true); end if;

    v_already := coalesce(v_intent.refunded_amount, 0);
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
        -- trigger_update_tier_quantity_sold recounts ticket_tiers.quantity_sold
        -- off this statement. Do not adjust tier counts by hand below it.
        update tickets set status = 'refunded', updated_at = now()
          where purchase_intent_id = p_intent_id and status <> 'refunded';

        update seats set status = 'available'
          where id in (select seat_id from tickets where purchase_intent_id = p_intent_id and seat_id is not null);

        -- Required: sync_event_tickets_sold ignores completed -> refunded.
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
