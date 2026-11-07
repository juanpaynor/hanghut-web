-- ============================================================================
-- Draggable section names.
--
-- event_sections.label_offset  jsonb  {"dx": number, "dy": number}
--   NULL (every row today) = centred on the shape, exactly as now.
--
-- A section's name is drawn at the middle of its polygon. On a small table
-- that means the text covers the table AND the floor-plan artwork underneath
-- it, which is the whole reason this exists.
--
-- DECOR labels ("DJ BOOTH", "STAGE") needed NOTHING: background shapes reach
-- buyers straight out of canvas_data->'backgroundShapes', verbatim, so the
-- nudge is already on the wire. Section fields are listed out one by one in
-- the RPC, which is why only this half needs a column.
--
-- Picture only. Nothing here touches inventory, capacity, holds or price.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 1 — the column
-- ─────────────────────────────────────────────────────────────────────────────

begin;

-- Same reasoning as chair_scale: the work is instant (nullable, no default,
-- catalogue-only on PG 17), but the ACCESS EXCLUSIVE lock would queue behind
-- any long transaction and every seat read would queue behind IT, because
-- assign_seats_to_intent joins this table on the live buyer path. TRESPASSING
-- is selling. 3 seconds, then give up having changed nothing.
set local lock_timeout = '3s';

alter table public.event_sections
    add column if not exists label_offset jsonb;

do $$
begin
    if not exists (
        select 1 from pg_constraint
         where conrelid = 'public.event_sections'::regclass
           and conname = 'event_sections_label_offset_check'
    ) then
        -- Shape-checked, not just "is jsonb". A label_offset of {"dx":"left"}
        -- would render as NaN and put the name at the top-left of the canvas,
        -- nowhere near its section, with nothing to explain why.
        -- +/-5000 is the canvas, generously: past that the label is lost
        -- off-map and the save should refuse rather than render it.
        alter table public.event_sections
            add constraint event_sections_label_offset_check
            check (
                label_offset is null
                or (
                    jsonb_typeof(label_offset) = 'object'
                    and jsonb_typeof(label_offset->'dx') = 'number'
                    and jsonb_typeof(label_offset->'dy') = 'number'
                    and abs((label_offset->>'dx')::numeric) <= 5000
                    and abs((label_offset->>'dy')::numeric) <= 5000
                )
            );
    end if;
end $$;

commit;

comment on column public.event_sections.label_offset is
    'Nudge for the section name, in canvas units from the centre of the '
    'polygon: {"dx":number,"dy":number}. NULL = centred. Picture only.';

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 2 — hand it to the buyer's map.
-- CREATE OR REPLACE, identical signature, ONE added field.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_event_seat_geometry(p_event_id uuid)
 RETURNS json
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM event_seat_maps m WHERE m.event_id = p_event_id
  ) THEN NULL ELSE json_build_object(
    'event_id', p_event_id,
    'version', (
      SELECT extract(epoch FROM GREATEST(
        m.updated_at,
        COALESCE(
          (SELECT max(t.updated_at) FROM ticket_tiers t
            WHERE t.event_id = p_event_id AND t.is_active = true),
          m.updated_at
        )
      ))::bigint
      FROM event_seat_maps m WHERE m.event_id = p_event_id
    ),
    'canvas_width', (SELECT canvas_width FROM event_seat_maps WHERE event_id = p_event_id),
    'canvas_height', (SELECT canvas_height FROM event_seat_maps WHERE event_id = p_event_id),
    'seat_radius', (SELECT NULLIF(canvas_data->>'seatRadius','')::numeric FROM event_seat_maps WHERE event_id = p_event_id),
    'seat_shape', (SELECT canvas_data->>'seatShape' FROM event_seat_maps WHERE event_id = p_event_id),
    'background_shapes', (
      SELECT COALESCE(canvas_data->'backgroundShapes', '[]'::jsonb)
      FROM event_seat_maps WHERE event_id = p_event_id
    ),
    'tiers', (
      SELECT COALESCE(json_agg(json_build_object(
        'id', t.id,
        'name', t.name,
        'price', t.price,
        'sort_order', t.sort_order
      ) ORDER BY t.sort_order), '[]'::json)
      FROM ticket_tiers t
      WHERE t.event_id = p_event_id AND t.is_active = true
    ),
    'sections', (
      SELECT COALESCE(json_agg(json_build_object(
        'id', sec.id,
        'label', sec.label,
        'color', sec.color,
        'section_type', sec.section_type,
        'polygon_points', sec.polygon_points,
        'tier_id', sec.tier_id,
        'row_tier_overrides', sec.row_tier_overrides,
        'rows', CASE WHEN sec.show_row_labels THEN COALESCE(sec.rows, '[]'::jsonb) ELSE '[]'::jsonb END,
        'show_row_labels', sec.show_row_labels,
        'sales_mode', CASE
          WHEN sec.tier_id IS NOT NULL AND NOT EXISTS (
            SELECT 1 FROM seats s WHERE s.section_id = sec.id
          ) THEN 'ga'
          ELSE 'seated'
        END,
        'seat_count', (SELECT count(*) FROM seats s WHERE s.section_id = sec.id),
        -- NEW in Phase 2. Both NULL on every existing section, which the picker
        -- reads as "behave exactly as before".
        'unit_capacity', sec.unit_capacity,
        'seat_shape', sec.seat_shape,
        -- Decorative chairs. NULL on every existing section = default size.
        'chair_scale', sec.chair_scale,
        -- Label nudge. NULL on every existing section = centred.
        'label_offset', sec.label_offset
      ) ORDER BY sec.sort_order), '[]'::json)
      FROM event_sections sec
      WHERE sec.event_id = p_event_id AND sec.is_active = true
    )
  ) END;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 3 — verification. Read-only apart from the rolled-back block.
-- ─────────────────────────────────────────────────────────────────────────────

-- 3a. Column and constraint exist, nothing backfilled, chair_scale untouched.
select
  (select count(*) from information_schema.columns
    where table_schema='public' and table_name='event_sections'
      and column_name='label_offset')                              as column_exists,
  (select count(*) from pg_constraint
    where conrelid='public.event_sections'::regclass
      and conname='event_sections_label_offset_check')             as constraint_exists,
  (select count(*) from event_sections)                            as sections_total,
  (select count(*) from event_sections where label_offset is null) as still_centred,
  (select count(*) from event_sections where chair_scale is null)  as chair_scale_still_default;

-- 3b. The constraint refuses nonsense. Rolled back; writes nothing.
do $$
declare v_id uuid;
begin
  select id into v_id from event_sections limit 1;
  if v_id is null then raise notice 'no sections to test against'; return; end if;

  begin
    update event_sections set label_offset = '{"dx":"left","dy":0}'::jsonb where id = v_id;
    raise exception 'FAIL: a non-numeric dx was accepted';
  exception when check_violation then raise notice 'ok: text dx refused';
  end;

  begin
    update event_sections set label_offset = '{"dx":0}'::jsonb where id = v_id;
    raise exception 'FAIL: a missing dy was accepted';
  exception when check_violation then raise notice 'ok: missing dy refused';
  end;

  begin
    update event_sections set label_offset = '{"dx":99999,"dy":0}'::jsonb where id = v_id;
    raise exception 'FAIL: an off-canvas offset was accepted';
  exception when check_violation then raise notice 'ok: 99999 refused';
  end;

  update event_sections set label_offset = '{"dx":-12.5,"dy":40}'::jsonb where id = v_id;
  raise notice 'ok: a real offset accepted';

  raise exception 'TEST_COMPLETE_ROLLING_BACK';
end $$;

-- 3c. Exactly ONE get_event_seat_geometry, returning BOTH new fields.
select p.proname, p.pronargs, p.provolatile as s_is_stable, p.prosecdef,
       pg_get_functiondef(p.oid) ilike '%label_offset%' as returns_label_offset,
       pg_get_functiondef(p.oid) ilike '%chair_scale%'  as still_returns_chair_scale,
       (select count(*) from pg_proc p2 join pg_namespace n2 on n2.oid=p2.pronamespace
         where n2.nspname='public' and p2.proname='get_event_seat_geometry') as how_many_copies
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname='public' and p.proname='get_event_seat_geometry';

-- 3d. A real call still works and carries both keys as null.
select (s->>'label') as section,
       s ? 'label_offset' as label_key_present,
       s ? 'chair_scale'  as chair_key_present,
       s->>'label_offset' as label_value
  from (
    select jsonb_array_elements(
             public.get_event_seat_geometry(
               (select event_id from event_seat_maps order by updated_at desc limit 1)
             )::jsonb->'sections'
           ) as s
  ) q
 limit 5;

-- ─────────────────────────────────────────────────────────────────────────────
-- ROLLBACK (do not run unless rolling back)
--   alter table public.event_sections drop constraint if exists event_sections_label_offset_check;
--   alter table public.event_sections drop column if exists label_offset;
--   -- then re-apply rollback/get_event_seat_geometry_before_label_offset.sql
-- ─────────────────────────────────────────────────────────────────────────────

-- LEDGER (run only after the verification above reads clean)
--   insert into supabase_migrations.schema_migrations (version, name)
--   values ('20261107130000', 'event_sections_label_offset')
--   on conflict (version) do nothing;
