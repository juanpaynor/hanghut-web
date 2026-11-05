do $$
declare
  v_event   uuid;
  v_status  text;
  v_rule    uuid;
  v_res     jsonb;
  v_nights  integer;
  v_mondays integer;
  v_local   text;
begin
  select e.id, e.status::text
    into v_event, v_status
  from public.events e
  where e.status = 'draft'
    and exists (select 1 from public.ticket_tiers t where t.event_id = e.id)
  order by (e.title ilike '%DRAFT%' or e.title ilike '%test%') desc, e.created_at desc
  limit 1;
  if v_event is null then
    raise exception 'TEST CANNOT RUN: no draft event with a tier';
  end if;
  if v_status <> 'draft' then
    raise exception 'TEST REFUSED: picked a % event, expected draft', v_status;
  end if;
  insert into public.event_recurrence_rules
    (event_id, byweekday, start_time, duration_minutes, starts_on, ends_on)
  values
    (v_event, array[2,3,4,5,6,0]::smallint[], '20:00', 180,
     '2026-11-05', '2026-11-18')
  returning id into v_rule;
  v_res := public.sync_occurrences_for_rule(v_rule);
  if (v_res->>'ok')::boolean is not true then
    raise exception 'TEST 1 FAILED: %', v_res::text;
  end if;
  if (v_res->>'created')::int <> 12 then
    raise exception 'TEST 1 FAILED: expected 12 nights, got % (%)',
      v_res->>'created', v_res::text;
  end if;
  select count(*) into v_mondays from public.event_occurrences
   where recurrence_rule_id = v_rule
     and extract(dow from starts_at at time zone 'Asia/Manila') = 1;
  if v_mondays <> 0 then
    raise exception 'TEST 1 FAILED: % Mondays generated', v_mondays;
  end if;
  raise notice 'TEST 1 passed: 12 nights, 0 Mondays';
  select distinct to_char(starts_at at time zone 'Asia/Manila', 'HH24:MI')
    into v_local
  from public.event_occurrences where recurrence_rule_id = v_rule;
  if v_local is distinct from '20:00' then
    raise exception 'TEST 2 FAILED: local start time is %, expected 20:00', v_local;
  end if;
  raise notice 'TEST 2 passed: every night starts at 20:00 local';
  v_res := public.sync_occurrences_for_rule(v_rule);
  if (v_res->>'created')::int <> 0 or (v_res->>'deleted')::int <> 0 then
    raise exception 'TEST 3 FAILED: second run was not a no-op (%)', v_res::text;
  end if;
  raise notice 'TEST 3 passed: re-running changed nothing';
  update public.event_recurrence_rules
     set byweekday = array[3,4,5,6,0]::smallint[]
   where id = v_rule;
  v_res := public.sync_occurrences_for_rule(v_rule);
  if (v_res->>'deleted')::int <> 2 then
    raise exception 'TEST 4 FAILED: expected 2 Tuesdays deleted, got % (%)',
      v_res->>'deleted', v_res::text;
  end if;
  select count(*) into v_nights from public.event_occurrences where recurrence_rule_id = v_rule;
  if v_nights <> 10 then
    raise exception 'TEST 4 FAILED: % nights left, expected 10', v_nights;
  end if;
  raise notice 'TEST 4 passed: 2 ticketless Tuesdays deleted, 10 nights left';
  declare
    v_night uuid;
    v_tier  uuid;
  begin
    select id into v_night from public.event_occurrences
     where recurrence_rule_id = v_rule and status = 'scheduled'
     order by starts_at limit 1;
    select id into v_tier from public.ticket_tiers where event_id = v_event limit 1;
    insert into public.tickets (event_id, ticket_number, tier_id, status, occurrence_id)
    values (v_event, 'TEST-OCC-TICKET', v_tier, 'valid', v_night);
    update public.event_recurrence_rules
       set byweekday = array[1]::smallint[]
     where id = v_rule;
    v_res := public.sync_occurrences_for_rule(v_rule);
    if (v_res->>'cancelled')::int < 1 then
      raise exception 'TEST 5 FAILED: the ticketed night was not cancelled (%)', v_res::text;
    end if;
    if not exists (select 1 from public.event_occurrences
                    where id = v_night and status = 'cancelled') then
      raise exception 'TEST 5 FAILED: the ticketed night is not in cancelled state';
    end if;
    if not exists (select 1 from public.tickets where occurrence_id = v_night) then
      raise exception 'TEST 5 FAILED: the ticket was destroyed';
    end if;
    raise notice 'TEST 5 passed: ticketed night cancelled, ticket survived';
  end;
  update public.event_recurrence_rules set is_active = false where id = v_rule;
  v_res := public.sync_occurrences_for_rule(v_rule);
  if (v_res->>'error') is distinct from 'RULE_INACTIVE' then
    raise exception 'TEST 6 FAILED: inactive rule returned %', v_res::text;
  end if;
  raise notice 'TEST 6 passed: inactive rule refused';
  raise notice 'ALL 6 TESTS PASSED. Rolling everything back now.';
  raise exception 'TEST_COMPLETE_ROLLING_BACK';
end $$;
