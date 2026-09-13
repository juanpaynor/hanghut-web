-- Experience bookings get the same hosted pass events have had since the
-- ticket-delivery overhaul.
--
-- Events deliver a ticket as a page: purchase_intents.access_token addresses an
-- unguessable /t/{token} that renders the QR, carries the organizer's design and
-- offers a PDF on demand. Experiences never got any of that. Their confirmation
-- email generated a PDF with pdf-lib at purchase time, attached it, and linked
-- nowhere — so a guest who lost the attachment had no way back to their pass,
-- and the booking's QR was fetched from api.qrserver.com, putting a third party
-- in the middle of a paid booking.
--
-- This is the missing half: a token on the booking, and one definer read that
-- resolves it, mirroring get_ticket_order field for field so the two surfaces
-- can be rendered by the same design language instead of drifting apart again.

-- Existing rows are filled by the DEFAULT — every booking, including the ones
-- taken before today, becomes addressable.
ALTER TABLE public.experience_purchase_intents
    ADD COLUMN IF NOT EXISTS access_token uuid NOT NULL DEFAULT gen_random_uuid();

CREATE UNIQUE INDEX IF NOT EXISTS experience_purchase_intents_access_token_key
    ON public.experience_purchase_intents (access_token);

/**
 * One booking, by its token. The anon key calls this — the token IS the
 * credential, exactly as on /t/{token}.
 *
 * SECURITY DEFINER because the guest reading their own pass is frequently not
 * signed in (they may have checked out as a guest, or be opening the link on a
 * phone that has never seen the site), so there is no session for RLS to
 * evaluate. The token is a random uuid held only by whoever received the
 * confirmation email.
 *
 * Returns the row whatever its status, rather than NULL for anything unpaid.
 * The page needs to tell "this link is wrong" (404) apart from "you just paid
 * and the webhook has not landed yet" (wait a moment), and collapsing both into
 * a missing row is how a buyer who paid ends up staring at a Not Found.
 */
CREATE OR REPLACE FUNCTION public.get_experience_booking(p_token uuid)
RETURNS json
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT CASE WHEN i.id IS NULL THEN NULL ELSE json_build_object(
    'booking_id',     i.id,
    -- Experiences have no ticket_number sequence. The first block of the id is
    -- stable, unique enough to quote over the phone, and already what the old
    -- pass PDF printed as "Ref".
    'reference',      upper(left(i.id::text, 8)),
    'guest_name',     COALESCE(i.guest_name, u.display_name),
    'quantity',       i.quantity,
    'status',         i.status,
    'check_in_status', COALESCE(i.check_in_status, 'pending'),
    -- The booking id, unchanged from what the old attached pass encoded. No
    -- scanner reads experience codes yet (hosts check guests in by hand from
    -- the bookings manager), so this is the one payload that stays correct
    -- whenever one is built.
    'qr_code',        i.id::text,
    'total_amount',   i.total_amount,
    'experience', json_build_object(
      'id',              t.id,
      'title',           t.title,
      'venue_name',      COALESCE(t.location_name, t.venue_address),
      -- A booking against a schedule happens at the SCHEDULE's time; the
      -- experience's own datetime is only the fallback for one-off tables.
      'start_datetime',  COALESCE(s.start_time, t.datetime),
      'end_datetime',    s.end_time,
      'cover_image_url', COALESCE(t.image_url, t.images[1])
    ),
    'host', json_build_object(
      'name',     COALESCE(p.business_name, hu.display_name),
      'logo_url', COALESCE(t.host_avatar_url, p.profile_photo_url)
    )
  ) END
  FROM experience_purchase_intents i
  JOIN tables t ON t.id = i.table_id
  LEFT JOIN experience_schedules s ON s.id = i.schedule_id
  LEFT JOIN partners p ON p.id = t.partner_id
  LEFT JOIN users hu ON hu.id = t.host_id
  LEFT JOIN users u ON u.id = i.user_id
  WHERE i.access_token = p_token;
$$;

GRANT EXECUTE ON FUNCTION public.get_experience_booking(uuid) TO anon, authenticated;
