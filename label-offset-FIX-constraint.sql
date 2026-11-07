-- ============================================================================
-- FIX for event_sections_label_offset_check, which I got wrong.
--
-- WHAT WAS WRONG
--   A CHECK constraint passes when its expression is NULL. It does not have to
--   be TRUE — only "not false". My version read:
--
--     jsonb_typeof(label_offset->'dx') = 'number' and ...
--
--   and for {"dx":0} the `->'dy'` is SQL NULL, so jsonb_typeof(NULL) is NULL,
--   so `NULL = 'number'` is NULL, so the whole AND is NULL — and the row was
--   ACCEPTED. Three shapes slip through: {"dx":0}, {"dy":0} and {}.
--
--   Verified against prod, not reasoned about: the deploy's own test block
--   reported "3 of 4 passed", and the one that failed was the missing-dy case.
--   A test that prints a score rather than just passing is the only reason
--   this was caught rather than shipped.
--
-- HOW BAD
--   Not very, which is the point of fixing it now rather than arguing about
--   it. A half-written offset renders as `?? 0`, so the label sits at its
--   normal place on one axis. Nothing crashes and nothing is mis-sold. But the
--   constraint does not do what it says, and the next person to read it would
--   believe it.
--
-- THE FIX
--   CASE evaluates its branches in order, which AND does not promise, and
--   `is distinct from` yields true/false for a NULL input where `<>` yields
--   NULL. Together they make the expression impossible to evaluate to NULL,
--   so a bad shape is refused instead of waved through.
-- ============================================================================

begin;

set local lock_timeout = '3s';

alter table public.event_sections
    drop constraint if exists event_sections_label_offset_check;

alter table public.event_sections
    add constraint event_sections_label_offset_check
    check (
        label_offset is null
        or case
            when jsonb_typeof(label_offset)        is distinct from 'object' then false
            when jsonb_typeof(label_offset->'dx')  is distinct from 'number' then false
            when jsonb_typeof(label_offset->'dy')  is distinct from 'number' then false
            else abs((label_offset->>'dx')::numeric) <= 5000
             and abs((label_offset->>'dy')::numeric) <= 5000
        end
    );

commit;

-- ─────────────────────────────────────────────────────────────────────────────
-- VERIFY. The DO block rolls itself back; the raise at the end IS the pass.
-- "4 of 4" is the number to look for.
-- ─────────────────────────────────────────────────────────────────────────────

do $$
declare v_id uuid; v_pass int := 0; v_notes text := '';
begin
  select id into v_id from event_sections limit 1;
  if v_id is null then raise notice 'no sections to test against'; return; end if;

  -- each of these MUST be refused
  for i in 1..3 loop
    begin
      update event_sections
         set label_offset = (array['{"dx":0}', '{"dy":0}', '{}'])[i]::jsonb
       where id = v_id;
      v_notes := v_notes || ' STILL-ACCEPTS:' || i;
    exception when check_violation then v_pass := v_pass + 1;
    end;
  end loop;

  -- and a real one MUST still be accepted
  begin
    update event_sections set label_offset = '{"dx":-12.5,"dy":40}'::jsonb where id = v_id;
    v_pass := v_pass + 1;
  exception when check_violation then v_notes := v_notes || ' REJECTS-VALID';
  end;

  raise exception 'TEST_COMPLETE_ROLLING_BACK: % of 4 passed.%', v_pass, v_notes;
end $$;

-- Nothing was stored by the test. Must read 209 / 209.
select count(*) as sections, count(*) filter (where label_offset is null) as still_centred
  from event_sections;

-- LEDGER
--   insert into supabase_migrations.schema_migrations (version, name)
--   values ('20261107130000', 'event_sections_label_offset'),
--          ('20261107140000', 'event_sections_label_offset_check_fix')
--   on conflict (version) do nothing;
