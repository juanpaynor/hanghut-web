-- ============================================================================
-- Per-section label size.
--
-- event_sections.label_font_size  smallint  NULL = default (15px)
--
-- Decor shapes ("DJ BOOTH") have had a font-size slider for a while. Section
-- names ("Table 1") were hardcoded, and worse, hardcoded INCONSISTENTLY: 14px
-- in the editor and 15px on the buyer's map, so what an organizer laid out was
-- never quite what a buyer saw. The frontend half of this change settles both
-- renderers on 15.
--
-- A PLAIN COLUMN, NOT ANOTHER JSONB, deliberately. The label_offset jsonb
-- shipped earlier today with a constraint I got wrong: a CHECK passes when its
-- expression is NULL, and a missing key made it NULL, so {"dx":0} was
-- accepted. A scalar column cannot have that hole — `label_font_size between
-- 8 and 48` is true or false and nothing else.
--
-- 8..48 matches the decor slider exactly, so the two controls cannot disagree
-- about what a sane size is.
--
-- Picture only. Nothing here touches inventory, capacity, holds or price.
-- ============================================================================

begin;

-- Same reason as the last two: the work is instant, but the ACCESS EXCLUSIVE
-- lock would queue behind a long transaction and seat reads would queue behind
-- IT. TRESPASSING is selling. 3 seconds, then give up having changed nothing.
set local lock_timeout = '3s';

alter table public.event_sections
    add column if not exists label_font_size smallint;

do $$
begin
    if not exists (
        select 1 from pg_constraint
         where conrelid = 'public.event_sections'::regclass
           and conname = 'event_sections_label_font_size_check'
    ) then
        alter table public.event_sections
            add constraint event_sections_label_font_size_check
            check (label_font_size is null
                   or (label_font_size >= 8 and label_font_size <= 48));
    end if;
end $$;

commit;

comment on column public.event_sections.label_font_size is
    'Section name size in px. NULL = default 15. 8-48, matching the decor '
    'label slider. Picture only.';

-- ──────────────────────────────────────────────────────────────────────
-- Hand it to the buyer. Identical signature, ONE added field.
-- ──────────────────────────────────────────────────────────────────────

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
        'label_offset', sec.label_offset,
        -- Label size. NULL on every existing section = the 15px default.
        'label_font_size', sec.label_font_size
      ) ORDER BY sec.sort_order), '[]'::json)
      FROM event_sections sec
      WHERE sec.event_id = p_event_id AND sec.is_active = true
    )
  ) END;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- VERIFY. The DO block rolls itself back; the raise IS the pass. Want 4 of 4.
-- ─────────────────────────────────────────────────────────────────────────────

select
  (select count(*) from information_schema.columns
    where table_schema='public' and table_name='event_sections'
      and column_name='label_font_size')                                as column_exists,
  (select count(*) from event_sections)                                 as sections,
  (select count(*) from event_sections where label_font_size is null)   as still_default,
  (select count(*) from event_sections where label_offset is null)      as label_offset_untouched,
  (select count(*) from event_sections where chair_scale is null)       as chair_scale_untouched,
  (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='get_event_seat_geometry')   as fn_copies;

do $$
declare v_id uuid; v_pass int := 0; v_notes text := '';
begin
  select id into v_id from event_sections limit 1;
  if v_id is null then raise notice 'no sections to test against'; return; end if;

  -- too small, too big: both MUST be refused
  begin
    update event_sections set label_font_size = 4 where id = v_id;
    v_notes := v_notes || ' ACCEPTS-4';
  exception when check_violation then v_pass := v_pass + 1;
  end;
  begin
    update event_sections set label_font_size = 99 where id = v_id;
    v_notes := v_notes || ' ACCEPTS-99';
  exception when check_violation then v_pass := v_pass + 1;
  end;
  -- the ends of the allowed range MUST be accepted
  begin
    update event_sections set label_font_size = 8 where id = v_id;
    v_pass := v_pass + 1;
  exception when check_violation then v_notes := v_notes || ' REJECTS-8';
  end;
  begin
    update event_sections set label_font_size = 48 where id = v_id;
    v_pass := v_pass + 1;
  exception when check_violation then v_notes := v_notes || ' REJECTS-48';
  end;

  raise exception 'TEST_COMPLETE_ROLLING_BACK: % of 4 passed.%', v_pass, v_notes;
end $$;

-- Nothing stored by the test. Must read 209 / 209.
select count(*) as sections, count(*) filter (where label_font_size is null) as still_default
  from event_sections;

-- ROLLBACK (do not run unless rolling back)
--   alter table public.event_sections drop constraint if exists event_sections_label_font_size_check;
--   alter table public.event_sections drop column if exists label_font_size;
--   -- then re-apply rollback/get_event_seat_geometry_before_label_size.sql

-- LEDGER — all four of today's seat-map changes, safe to run once at the end.
--   insert into supabase_migrations.schema_migrations (version, name)
--   values ('20261107120000', 'event_sections_chair_scale'),
--          ('20261107130000', 'event_sections_label_offset'),
--          ('20261107140000', 'event_sections_label_offset_check_fix'),
--          ('20261107150000', 'event_sections_label_font_size')
--   on conflict (version) do nothing;
