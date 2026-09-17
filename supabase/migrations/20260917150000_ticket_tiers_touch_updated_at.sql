-- get_event_seat_geometry derives the buyer-side cache version from
-- max(ticket_tiers.updated_at), but nothing ever moved that column — a price
-- change after publish left the seat map showing the old price for as long as
-- the CDN/browser held the immutable geometry response.
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS ticket_tiers_touch_updated_at ON public.ticket_tiers;
CREATE TRIGGER ticket_tiers_touch_updated_at
  BEFORE UPDATE ON public.ticket_tiers
  FOR EACH ROW
  WHEN (OLD.* IS DISTINCT FROM NEW.*)
  EXECUTE FUNCTION public.touch_updated_at();
