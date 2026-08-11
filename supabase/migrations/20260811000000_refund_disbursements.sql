-- Disbursement-based refunds (QRPH / bank-transfer payouts via Xendit Disbursement API).
--
-- Xendit disbursements are ASYNC (PENDING -> COMPLETED/FAILED via webhook), so unlike
-- record_manual_refund (which assumes the money already moved) we cannot reverse the
-- ledger the instant we fire the payout. This migration adds:
--   1. refund_disbursements  — tracks each payout (pending lock + webhook mapping).
--   2. complete_disbursement_refund(id) — webhook-invoked on COMPLETED: does the SAME
--        ledger reversal as record_manual_refund, then marks the row completed.
--   3. fail_disbursement_refund(id, reason) — webhook-invoked on FAILED: releases the lock.
--
-- The pending lock is purchase_intents.refunded_at (set at create time, cleared on
-- failure) so the OTHER refund paths (request-refund, refundTransaction) already treat
-- an in-flight disbursement as REFUND_IN_PROGRESS and won't double-refund.

create table if not exists public.refund_disbursements (
    id                   uuid primary key default gen_random_uuid(),
    purchase_intent_id   uuid not null references public.purchase_intents(id),
    partner_id           uuid not null references public.partners(id),
    event_id             uuid references public.events(id),
    amount               numeric not null,            -- refunded to the customer
    fee                  numeric not null default 0,  -- Xendit transfer fee (organizer pays)
    channel              text not null,               -- PH_GCASH | PH_PAYMAYA | INSTAPAY | PESONET | bank code
    destination_account  text not null,               -- 09XX for GCash, account number for banks
    destination_name     text not null,               -- account holder name
    external_id          text not null unique,        -- our idempotency key sent to Xendit
    xendit_disbursement_id text,                       -- Xendit's id (from POST response)
    status               text not null default 'pending'
                             check (status in ('pending','completed','failed')),
    failure_reason       text,
    created_by           uuid,
    created_at           timestamptz not null default now(),
    updated_at           timestamptz not null default now(),
    completed_at         timestamptz
);

create index if not exists idx_refund_disbursements_intent on public.refund_disbursements(purchase_intent_id);
create index if not exists idx_refund_disbursements_xendit on public.refund_disbursements(xendit_disbursement_id);
create index if not exists idx_refund_disbursements_status on public.refund_disbursements(status);

alter table public.refund_disbursements enable row level security;

-- Organizers (owner/finance) can read their own partner's disbursement refunds.
-- Writes happen only through the service-role edge fn + the SECURITY DEFINER RPCs below.
drop policy if exists refund_disbursements_select on public.refund_disbursements;
create policy refund_disbursements_select on public.refund_disbursements
    for select using (
        exists (select 1 from public.partners p
                where p.id = refund_disbursements.partner_id and p.user_id = auth.uid())
        or exists (select 1 from public.partner_team_members m
                where m.partner_id = refund_disbursements.partner_id and m.user_id = auth.uid()
                  and m.is_active and m.role in ('owner','finance'))
    );

-- ============================================================================
-- complete_disbursement_refund: called by the disbursement webhook (service role)
-- when Xendit confirms the payout COMPLETED. Mirrors record_manual_refund's ledger
-- math exactly (reverse gross + organizer payout, KEEP platform + fixed fee), but
-- keyed off the tracked disbursement row and WITHOUT the interactive auth.uid()
-- check (authorization already happened when the organizer created the payout).
-- ============================================================================
create or replace function public.complete_disbursement_refund(p_disbursement_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
    v_d          record;
    v_intent     record;
    v_orig       record;
    v_ratio      numeric;
    v_full       boolean;
    v_already    numeric;
    v_fee_pct    numeric;
    r            record;
begin
    select * into v_d from refund_disbursements where id = p_disbursement_id;
    if not found then return jsonb_build_object('success', false, 'error', 'Disbursement not found'); end if;
    -- Idempotency: webhooks can be delivered more than once.
    if v_d.status = 'completed' then return jsonb_build_object('success', true, 'already', true); end if;
    if v_d.status = 'failed' then return jsonb_build_object('success', false, 'error', 'Disbursement already failed'); end if;

    select pi.* into v_intent from purchase_intents pi where pi.id = v_d.purchase_intent_id;
    if not found then return jsonb_build_object('success', false, 'error', 'Order not found'); end if;

    v_already := coalesce(v_intent.refunded_amount, 0);
    -- Guard: don't over-refund (refunded_amount here excludes THIS pending payout).
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

    -- Reversal row: reverse gross + organizer payout; KEEP platform + fixed fee (fee retained).
    insert into transactions (
        purchase_intent_id, event_id, partner_id, user_id,
        gross_amount, platform_fee, fixed_fee, organizer_payout, payment_processing_fee,
        fee_percentage, fee_basis, xendit_transaction_id, status
    ) values (
        v_d.purchase_intent_id, v_intent.event_id, v_d.partner_id, v_intent.user_id,
        -v_d.amount, 0, 0, -round(coalesce(v_orig.organizer_payout, 0) * v_ratio), 0,
        v_fee_pct, 'disbursement_refund', v_d.xendit_disbursement_id, 'refunded'
    );

    -- Log alongside the manual refunds (channel + Xendit disbursement id as reference).
    insert into manual_refunds (purchase_intent_id, partner_id, event_id, amount, channel, reference, note, refunded_by)
    values (v_d.purchase_intent_id, v_d.partner_id, v_intent.event_id, v_d.amount, v_d.channel,
            v_d.xendit_disbursement_id, 'Xendit disbursement refund', v_d.created_by);

    if v_full then
        update tickets set status = 'refunded', updated_at = now()
          where purchase_intent_id = v_d.purchase_intent_id and status <> 'refunded';

        update seats set status = 'available'
          where id in (select seat_id from tickets where purchase_intent_id = v_d.purchase_intent_id and seat_id is not null);

        for r in
            select tier_id, count(*)::int as cnt from tickets
            where purchase_intent_id = v_d.purchase_intent_id and tier_id is not null group by tier_id
        loop
            perform decrement_tier_sold(r.tier_id, r.cnt);
        end loop;

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

-- ============================================================================
-- fail_disbursement_refund: webhook-invoked on FAILED. Releases the pending lock
-- (clears refunded_at ONLY if nothing has actually been refunded yet) so the
-- organizer can retry via another method.
-- ============================================================================
create or replace function public.fail_disbursement_refund(p_disbursement_id uuid, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
    v_d       record;
    v_intent  record;
begin
    select * into v_d from refund_disbursements where id = p_disbursement_id;
    if not found then return jsonb_build_object('success', false, 'error', 'Disbursement not found'); end if;
    if v_d.status <> 'pending' then return jsonb_build_object('success', true, 'already', true); end if;

    update refund_disbursements
      set status = 'failed', failure_reason = p_reason, updated_at = now()
      where id = p_disbursement_id;

    -- Release the lock only when this order has no actual refunded value and isn't
    -- already fully refunded (never unlock a real refund).
    select refunded_amount, status into v_intent from purchase_intents where id = v_d.purchase_intent_id;
    if coalesce(v_intent.refunded_amount, 0) = 0 and v_intent.status <> 'refunded' then
        update purchase_intents set refunded_at = null, refund_method = null
          where id = v_d.purchase_intent_id;
    end if;

    return jsonb_build_object('success', true);
end $function$;

revoke all on function public.complete_disbursement_refund(uuid) from public, anon, authenticated;
revoke all on function public.fail_disbursement_refund(uuid, text) from public, anon, authenticated;
