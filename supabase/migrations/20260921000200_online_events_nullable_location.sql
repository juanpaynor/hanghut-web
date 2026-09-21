-- Online events had nowhere to live. events.latitude/longitude were NOT NULL, so
-- an organizer running a Zoom workshop had to invent a venue and pin it on a map;
-- all 357 events on record carry real coordinates because there was no other way
-- to save one.
--
-- Coordinates become optional, and is_online marks the absence as deliberate. The
-- flag matters: without it "no location" is indistinguishable from "venue not
-- announced yet", and every consumer -- event page, API, the app -- would have to
-- guess which it was looking at.
alter table events alter column latitude drop not null;
alter table events alter column longitude drop not null;

alter table events add column if not exists is_online boolean not null default false;

-- A physical event must still carry coordinates. Without this, "location is
-- optional now" quietly becomes "location is optional for everything", and a
-- venue event saved from any code path that forgets the field loses its map.
alter table events add constraint events_location_required_unless_online
  check (is_online or (latitude is not null and longitude is not null));

-- Clear the geography point when coordinates are removed. The old version only
-- ever SET location, so switching a venue event to online left a stale point
-- behind that map and proximity features would still treat as real.
create or replace function public.update_event_location()
returns trigger language plpgsql as $$
begin
  if NEW.latitude is not null and NEW.longitude is not null then
    NEW.location = ST_SetSRID(ST_MakePoint(NEW.longitude, NEW.latitude), 4326)::geography;
  else
    NEW.location = null;
  end if;
  return NEW;
end $$;

-- ── Join link ───────────────────────────────────────────────────────────────
-- An online event needs somewhere to send people, and the link is closer to a
-- credential than to event metadata: whoever holds it walks into the event.
--
-- It deliberately does NOT live on `events`. That table is anon-readable by
-- design, so a column there would have been one `?select=online_url` away from
-- public over the REST API -- app-side filtering would not have helped. Column
-- level grants would work but rot: every future column added to `events` would
-- be invisible to anon until someone remembered to grant it. A separate table is
-- deny-by-default and needs no maintenance to stay closed.
create table if not exists event_online_access (
  event_id   uuid primary key references events(id) on delete cascade,
  join_url   text not null,
  updated_at timestamptz not null default now()
);

alter table event_online_access enable row level security;

-- No anon policy, and none for a plain authenticated user either: an attendee
-- reaches the link through get_ticket_order (SECURITY DEFINER), never by
-- reading this table.
drop policy if exists "organizers manage their own online access" on event_online_access;
create policy "organizers manage their own online access"
  on event_online_access for all
  using (exists (
    select 1 from events e
    where e.id = event_online_access.event_id
      and can_manage_partner(e.organizer_id)
  ))
  with check (exists (
    select 1 from events e
    where e.id = event_online_access.event_id
      and can_manage_partner(e.organizer_id)
  ));

revoke all on event_online_access from anon;
grant select, insert, update, delete on event_online_access to authenticated;

-- get_ticket_order is reached only by holding the order's access token -- the
-- same proof of purchase the tickets rest on -- so it is the right place to
-- release the link. Refunded and cancelled orders get NULL, so a refunded buyer
-- cannot keep walking into the room.
CREATE OR REPLACE FUNCTION public.get_ticket_order(p_token uuid)
 RETURNS json
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
  SELECT CASE WHEN pi.id IS NULL THEN NULL ELSE json_build_object(
    'order_id', pi.id,
    'buyer_name', COALESCE(pi.guest_name, u.display_name),
    'event', json_build_object(
      'id', e.id,
      'title', e.title,
      'venue_name', e.venue_name,
      'start_datetime', e.start_datetime,
      'end_datetime', e.end_datetime,
      'cover_image_url', e.cover_image_url,
      'is_online', e.is_online,
      'online_url', CASE
        WHEN e.is_online AND pi.status = 'completed' THEN oa.join_url
        ELSE NULL
      END
    ),
    'organizer', json_build_object(
      'name', p.business_name,
      'logo_url', p.profile_photo_url,
      'branding', p.branding
    ),
    'tickets', (
      SELECT COALESCE(json_agg(json_build_object(
        'id', t.id,
        'ticket_number', t.ticket_number,
        'qr_code', t.qr_code,
        'status', t.status,
        'tier', COALESCE(tt.name, t.tier),
        'tier_sort', tt.sort_order,
        'seat_info', t.seat_info
      ) ORDER BY t.created_at, t.id), '[]'::json)
      FROM tickets t
      LEFT JOIN ticket_tiers tt ON tt.id = t.tier_id
      WHERE t.purchase_intent_id = pi.id
        AND t.status::text IN ('valid','used','confirmed','approved')
    )
  ) END
  FROM purchase_intents pi
  JOIN events e ON e.id = pi.event_id
  LEFT JOIN event_online_access oa ON oa.event_id = e.id
  LEFT JOIN partners p ON p.id = e.organizer_id
  LEFT JOIN users u ON u.id = pi.user_id
  WHERE pi.access_token = p_token;
$function$;
