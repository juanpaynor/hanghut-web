-- Enable Promo Code Management
-- This allows Organizers to Create, Update, and Delete promo codes for their events.

ALTER TABLE promo_codes ENABLE ROW LEVEL SECURITY;

-- 1. Public can VIEW active codes (Required for Checkout validation)
DROP POLICY IF EXISTS "Public can view active promo codes" ON promo_codes;
CREATE POLICY "Public can view active promo codes"
ON promo_codes FOR SELECT
USING ( is_active = true );

-- 2. Organizers can MANAGE (Insert, Update, Delete) codes for THEIR events
DROP POLICY IF EXISTS "Organizers can manage promo codes" ON promo_codes;
CREATE POLICY "Organizers can manage promo codes"
ON promo_codes FOR ALL
TO authenticated
USING (
  event_id IN (
    SELECT id FROM events WHERE organizer_id IN (
       -- Direct Owner
       SELECT id FROM partners WHERE user_id = auth.uid()
       UNION
       -- Team Member
       SELECT partner_id FROM partner_team_members WHERE user_id = auth.uid()
    )
  )
)
WITH CHECK (
  event_id IN (
    SELECT id FROM events WHERE organizer_id IN (
       SELECT id FROM partners WHERE user_id = auth.uid()
       UNION
       SELECT partner_id FROM partner_team_members WHERE user_id = auth.uid()
    )
  )
);
