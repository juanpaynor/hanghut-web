-- ============================================================================
-- Request 2: "save responses so a returning registrant goes straight to payment"
--
-- WHAT THIS ADDS
--   One read-only function. Nothing is altered, nothing is dropped. Rollback is
--   a single DROP FUNCTION, printed at the bottom of this file.
--
-- WHY A NEW FUNCTION AND NOT A POLICY
--   submit_event_request already reuses an unconsummated registration and
--   already matches guests on lower(guest_email), so the WRITE side of this
--   request needs no change at all. What is missing is the READ: the browser
--   cannot ask "do you already have my answers?", so the form is shown again.
--   Average gap before someone comes back is 173 hours, and the id was being
--   kept in sessionStorage, which does not survive closing the tab.
--
-- WHY IT TAKES A REGISTRATION ID AND NOT AN EMAIL
--   An email-keyed version would let anyone type a stranger's address and read
--   back their phone number, emergency contact and dietary answers. A
--   registration id is a 122-bit uuid that the browser only holds because it
--   created the registration. The event id is required alongside it so a stale
--   id from another event cannot resolve.
--
--   The cost is honest and worth stating: this works on the SAME BROWSER only.
--   A new device gets the form again. Widening it safely means an emailed
--   tokenised link, which is a separate job.
--
-- SECURITY DEFINER is required: the buyer is anon, and event_registrations and
-- registration_answers are both behind RLS that anon cannot read through.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 1 — the function
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.get_registration_for_resume(
    p_registration_id uuid,
    p_event_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
    v_reg          record;
    v_event_status text;
    v_answers      jsonb;
    v_consummated  boolean;
begin
    if p_registration_id is null or p_event_id is null then
        return null;
    end if;

    -- Both keys must match. The event id is not decoration: without it a
    -- localStorage entry left over from a different event would resolve and
    -- prefill the wrong answers into this one's form.
    select r.id, r.event_id, r.user_id, r.guest_email, r.guest_name,
           r.tier_id, r.status, r.purchase_intent_id
      into v_reg
      from event_registrations r
     where r.id = p_registration_id
       and r.event_id = p_event_id;

    if not found then
        return null;
    end if;

    -- 'rejected' is the organizer's decision and must not be resumable.
    -- 'pending' is already in the review queue; the gate has its own screen for
    -- that and showing a prefilled form instead would invite a second submit.
    if v_reg.status::text in ('rejected', 'pending') then
        return null;
    end if;

    select e.status::text into v_event_status from events e where e.id = p_event_id;
    if v_event_status is null or v_event_status not in ('active', 'hidden') then
        return null;
    end if;

    -- ORDER-LEVEL answers only (ticket_id is null). A per-attendee answer
    -- belongs to a ticket that was already issued; it is not part of the
    -- submission being resumed, and submit_event_request deliberately leaves
    -- those alone when it reuses a row.
    select coalesce(
               jsonb_agg(jsonb_build_object('question_id', a.question_id,
                                            'answer',      a.answer)),
               '[]'::jsonb)
      into v_answers
      from registration_answers a
     where a.registration_id = v_reg.id
       and a.ticket_id is null;

    -- Did this submission already produce an order? The same three tests
    -- submit_event_request uses, in the same order and for the same reasons --
    -- tickets.registration_id is null on some older orders, so the intent is
    -- sometimes the only surviving proof.
    --
    -- This is NOT a reason to refuse. A buyer coming back for a second ticket
    -- deserves their details prefilled just as much. The caller is told so it
    -- can ask submit_event_request for a fresh row rather than reusing this one.
    v_consummated :=
        exists (select 1 from tickets t
                 where t.registration_id = v_reg.id
                   and t.status::text in ('valid', 'used'))
     or exists (select 1 from purchase_intents pi
                 where pi.status = 'completed'
                   and (pi.metadata->>'registration_id') = v_reg.id::text)
     or exists (select 1 from purchase_intents pi2
                 where pi2.id = v_reg.purchase_intent_id
                   and pi2.status = 'completed');

    return jsonb_build_object(
        'registration_id', v_reg.id,
        'event_id',        v_reg.event_id,
        'status',          v_reg.status::text,
        'tier_id',         v_reg.tier_id,
        'guest_name',      v_reg.guest_name,
        'guest_email',     v_reg.guest_email,
        'is_guest',        v_reg.user_id is null,
        'consummated',     v_consummated,
        'answers',         v_answers
    );
end;
$function$;

-- PUBLIC and anon are independent grants, so revoking one leaves the other.
revoke all on function public.get_registration_for_resume(uuid, uuid)
    from PUBLIC, anon, authenticated;
-- anon is not optional: every guest buyer runs as anon, and 95.4% of
-- registrations have no user_id at all.
grant execute on function public.get_registration_for_resume(uuid, uuid)
    to anon, authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 2 — verification. Read-only. Paste and read the output.
-- ─────────────────────────────────────────────────────────────────────────────

-- 2a. Exactly ONE function with this name, and the grants are what we asked for.
select p.proname,
       p.pronargs,
       p.provolatile                                    as volatile_s_is_stable,
       p.prosecdef                                      as security_definer,
       p.proconfig                                      as search_path,
       has_function_privilege('anon',          p.oid, 'execute') as anon,
       has_function_privilege('authenticated', p.oid, 'execute') as authed,
       has_function_privilege('service_role',  p.oid, 'execute') as svc
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname = 'get_registration_for_resume';

-- 2b. It returns answers for a real registration that has some.
with pick as (
    select a.registration_id, r.event_id, count(*) as answers
      from registration_answers a
      join event_registrations r on r.id = a.registration_id
      join events e on e.id = r.event_id
     where a.ticket_id is null
       and r.status::text in ('approved', 'auto_approved')
       and e.status::text in ('active', 'hidden')
     group by 1, 2
     order by 3 desc
     limit 1
)
select pick.answers                                            as answers_in_table,
       jsonb_array_length(res->'answers')                      as answers_returned,
       res->>'status'                                          as status,
       res->>'consummated'                                     as consummated,
       (res->>'guest_email') is not null                       as has_email
  from pick,
       lateral public.get_registration_for_resume(pick.registration_id, pick.event_id) as res;

-- 2c. The three refusals. All three must be NULL.
with pick as (
    select r.id, r.event_id from event_registrations r
     join events e on e.id = r.event_id
    where r.status::text in ('approved', 'auto_approved')
      and e.status::text in ('active', 'hidden')
    limit 1
)
select public.get_registration_for_resume(gen_random_uuid(), pick.event_id) as unknown_id_must_be_null,
       public.get_registration_for_resume(pick.id, gen_random_uuid())       as wrong_event_must_be_null,
       public.get_registration_for_resume(null, pick.event_id)              as null_id_must_be_null
  from pick;

-- 2d. A rejected or pending registration is never resumable. Must be 0 rows.
select r.id, r.status
  from event_registrations r
 where r.status::text in ('rejected', 'pending')
   and public.get_registration_for_resume(r.id, r.event_id) is not null;

-- ─────────────────────────────────────────────────────────────────────────────
-- ROLLBACK (do not run unless rolling back)
--   drop function if exists public.get_registration_for_resume(uuid, uuid);
-- ─────────────────────────────────────────────────────────────────────────────

-- LEDGER (run only after the verification above reads clean)
--   insert into supabase_migrations.schema_migrations (version, name)
--   values ('20261107110000', 'get_registration_for_resume')
--   on conflict (version) do nothing;
