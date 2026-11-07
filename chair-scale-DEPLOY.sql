-- ============================================================================
-- Per-table chair size, and the option of no chairs at all.
--
-- ONE COLUMN DOES BOTH JOBS
--   event_sections.chair_scale
--     NULL  -> default. Chairs at the map's own seat radius. Every existing
--              section reads this way, so there is no backfill and nothing
--              that is live today changes by one pixel.
--     0     -> NO CHAIRS. A bare table.
--     0.1-3 -> size multiplier on the map's seat radius.
--
--   A separate boolean plus a size would have allowed the contradiction
--   "hidden, size 2", which the UI would then have to explain. Zero means
--   none, which is the same thing a reader already assumes.
--
-- WHY NOT canvas_data
--   Map-wide settings (seatRadius, seatShape) live in event_seat_maps.canvas_data
--   and are read straight out of it by the RPC. This is PER SECTION, and
--   event_sections has no jsonb of its own to hang it on -- row_tier_overrides
--   is a tier map and arc_config is geometry. A typed, CHECK-constrained column
--   next to unit_capacity and seat_shape is the shape the table already uses.
--
-- The chairs are DECORATION. This changes nothing about inventory, capacity,
-- holds or price: unit_capacity still says how many people the piece admits
-- and is still what gets sold. A table set to 0 chairs still admits 6.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 1 — the column
-- ─────────────────────────────────────────────────────────────────────────────

begin;

-- Fail fast rather than queue.
--
-- ADD COLUMN on a nullable column with no default is a catalogue-only change
-- in PG 11+ (prod is 17.6) and event_sections holds 209 rows, so the work is
-- instantaneous. The risk is not the work, it is the ACCESS EXCLUSIVE lock:
-- if any long transaction is holding event_sections, this statement QUEUES —
-- and every seat read queues behind it, because assign_seats_to_intent joins
-- this table on the live buyer path. TRESPASSING is selling right now with 87
-- seats already gone.
--
-- 3 seconds, then give up and change nothing. Re-run it; it is idempotent.
set local lock_timeout = '3s';

alter table public.event_sections
    add column if not exists chair_scale numeric;

do $$
begin
    if not exists (
        select 1 from pg_constraint
         where conrelid = 'public.event_sections'::regclass
           and conname = 'event_sections_chair_scale_check'
    ) then
        -- 3 is a deliberate ceiling, not a round number: a chair is 2 radii
        -- wide, so 3x on a default 6px radius is a 36px chair, already larger
        -- than several of the catalogue's tables. Past that the organizer is
        -- not sizing a chair, they are making a mistake the save should refuse
        -- rather than render.
        alter table public.event_sections
            add constraint event_sections_chair_scale_check
            check (chair_scale is null or (chair_scale >= 0 and chair_scale <= 3));
    end if;
end $$;

commit;

comment on column public.event_sections.chair_scale is
    'Decorative chairs drawn round a whole-sell piece. NULL = default size, '
    '0 = no chairs, 0.1-3 = multiplier on the map seat radius. Picture only: '
    'inventory and capacity come from unit_capacity and are untouched by this.';

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 2 — hand it to the buyer's map
--
-- CREATE OR REPLACE with the IDENTICAL signature, so this replaces the one
-- function rather than creating a second candidate for PostgREST to choose
-- between. Only one line is added; everything else is verbatim.
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
        'chair_scale', sec.chair_scale
      ) ORDER BY sec.sort_order), '[]'::json)
      FROM event_sections sec
      WHERE sec.event_id = p_event_id AND sec.is_active = true
    )
  ) END;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 3 — verification. Read-only. Paste and read the output.
-- ─────────────────────────────────────────────────────────────────────────────

-- 3a. Column and constraint exist, and nothing was backfilled.
select
  (select count(*) from information_schema.columns
    where table_schema='public' and table_name='event_sections'
      and column_name='chair_scale')                              as column_exists,
  (select count(*) from pg_constraint
    where conrelid='public.event_sections'::regclass
      and conname='event_sections_chair_scale_check')             as constraint_exists,
  (select count(*) from event_sections)                           as sections_total,
  (select count(*) from event_sections where chair_scale is null) as still_default;

-- 3b. The constraint actually refuses nonsense. Rolled back; writes nothing.
do $$
declare v_id uuid;
begin
  select id into v_id from event_sections limit 1;
  if v_id is null then raise notice 'no sections to test against'; return; end if;

  begin
    update event_sections set chair_scale = -1 where id = v_id;
    raise exception 'FAIL: a negative scale was accepted';
  exception when check_violation then
    raise notice 'ok: negative refused';
  end;

  begin
    update event_sections set chair_scale = 99 where id = v_id;
    raise exception 'FAIL: an absurd scale was accepted';
  exception when check_violation then
    raise notice 'ok: 99 refused';
  end;

  update event_sections set chair_scale = 0 where id = v_id;
  raise notice 'ok: 0 (no chairs) accepted';
  update event_sections set chair_scale = 1.5 where id = v_id;
  raise notice 'ok: 1.5 accepted';

  raise exception 'TEST_COMPLETE_ROLLING_BACK';
end $$;

-- 3c. Exactly ONE get_event_seat_geometry, and it now returns chair_scale.
select p.proname, p.pronargs, p.provolatile as s_is_stable, p.prosecdef,
       pg_get_functiondef(p.oid) ilike '%chair_scale%' as returns_chair_scale
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname='public' and p.proname='get_event_seat_geometry';

-- 3d. Call it on a real seated event. chair_scale must be present and null.
select (s->>'label') as section,
       s ? 'chair_scale'   as key_present,
       s->>'chair_scale'   as value_is_null
  from (
    select json_array_elements(
             public.get_event_seat_geometry(
               (select event_id from event_seat_maps order by updated_at desc limit 1)
             )->'sections'
           )::jsonb as s
  ) q
 limit 5;

-- ─────────────────────────────────────────────────────────────────────────────
-- ROLLBACK (do not run unless rolling back)
--   alter table public.event_sections drop constraint if exists event_sections_chair_scale_check;
--   alter table public.event_sections drop column if exists chair_scale;
--   -- then re-apply the previous get_event_seat_geometry from
--   -- rollback/get_event_seat_geometry_before_chair_scale.sql
-- ─────────────────────────────────────────────────────────────────────────────

-- LEDGER (run only after the verification above reads clean)
--   insert into supabase_migrations.schema_migrations (version, name)
--   values ('20261107120000', 'event_sections_chair_scale')
--   on conflict (version) do nothing;
