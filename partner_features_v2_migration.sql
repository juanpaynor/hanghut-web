-- ==========================================
-- PARTNER FEATURES V2 MIGRATION (SCHEMA-COMPATIBLE)
-- ==========================================
-- This migration adds:
-- 1. Storefront Branding (colors, images, social links)
-- 2. Multi-Tier Ticketing (VIP, GA, Early Bird, etc.)
-- 3. Team Management with Roles (Owner, Manager, Scanner)
--
-- COMPATIBILITY NOTES:
-- - Works with existing partners, events, tickets, purchase_intents tables
-- - Adds tier_id to existing tickets and purchase_intents
-- - Backwards compatible with existing TEXT tier column
-- ==========================================

-- 1. ADD BRANDING COLUMN TO PARTNERS
-- Stores JSON for flexible branding options
ALTER TABLE partners 
ADD COLUMN IF NOT EXISTS branding JSONB DEFAULT '{}'::jsonb;

COMMENT ON COLUMN partners.branding IS 'Partner storefront branding: colors, cover_image, favicon, bio, tagline, social_links';

-- Example branding structure:
-- {
--   "colors": { "primary": "#FF5733", "secondary": "#333333", "accent": "#FFC300" },
--   "cover_image_url": "https://...",
--   "favicon_url": "https://...",
--   "bio": "We are Seattle's premier jazz venue...",
--   "tagline": "Where music lives",
--   "social_links": { "instagram": "@myvenue", "facebook": "facebook.com/myvenue", "website": "https://..." },
--   "contact_display": { "email": true, "phone": false }
-- }

-- 2. CREATE TICKET TIERS TABLE
-- Replaces simple ticket_price on events with sophisticated tier system
CREATE TABLE IF NOT EXISTS ticket_tiers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  
  -- Tier Info
  name TEXT NOT NULL,                      -- "VIP", "General Admission", "Early Bird"
  description TEXT,                        -- "Includes 2 free drinks and skip-the-line"
  price NUMERIC(10, 2) NOT NULL CHECK (price >= 0),
  
  -- Inventory
  quantity_total INTEGER NOT NULL CHECK (quantity_total > 0),
  quantity_sold INTEGER NOT NULL DEFAULT 0 CHECK (quantity_sold >= 0),
  
  -- Purchase Limits
  min_per_order INTEGER DEFAULT 1 CHECK (min_per_order >= 1),
  max_per_order INTEGER DEFAULT 10 CHECK (max_per_order >= min_per_order),
  
  -- Scheduling (Optional - for Early Bird, etc.)
  sales_start TIMESTAMP WITH TIME ZONE,
  sales_end TIMESTAMP WITH TIME ZONE,
  
  -- Status
  is_active BOOLEAN DEFAULT true,
  
  -- Sort Order (for display)
  sort_order INTEGER DEFAULT 0,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Constraints
  CHECK (quantity_sold <= quantity_total),
  CHECK (sales_end IS NULL OR sales_start IS NULL OR sales_end > sales_start)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_ticket_tiers_event_id ON ticket_tiers(event_id);
CREATE INDEX IF NOT EXISTS idx_ticket_tiers_active ON ticket_tiers(event_id, is_active);

COMMENT ON TABLE ticket_tiers IS 'Multiple ticket types/tiers per event (VIP, GA, Early Bird, etc.)';
COMMENT ON COLUMN ticket_tiers.quantity_sold IS 'Updated by trigger on ticket_purchases';

-- 3. UPDATE EXISTING TABLES FOR TIER SUPPORT

-- Add tier_id to purchase_intents (links to specific tier purchased)
ALTER TABLE purchase_intents 
ADD COLUMN IF NOT EXISTS tier_id UUID REFERENCES ticket_tiers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_purchase_intents_tier_id ON purchase_intents(tier_id);

COMMENT ON COLUMN purchase_intents.tier_id IS 'Reference to specific ticket tier purchased (NULL for legacy purchases)';

-- Add tier_id to tickets (replaces TEXT tier with proper FK)
ALTER TABLE tickets 
ADD COLUMN IF NOT EXISTS tier_id UUID REFERENCES ticket_tiers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tickets_tier_id ON tickets(tier_id);

COMMENT ON COLUMN tickets.tier_id IS 'Reference to ticket tier (NULL for legacy tickets, use TEXT tier column)';
COMMENT ON COLUMN tickets.tier IS 'Legacy tier identifier (deprecated, use tier_id)';

-- 4. CREATE PARTNER TEAM MEMBERS TABLE (RBAC)
-- Allows venues to have multiple staff with different permissions
DO $$ BEGIN
  CREATE TYPE partner_role AS ENUM ('owner', 'manager', 'scanner');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS partner_team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id UUID NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Role Definition
  role partner_role NOT NULL DEFAULT 'scanner',
  
  -- Metadata
  invited_by UUID REFERENCES auth.users(id),
  invited_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  accepted_at TIMESTAMP WITH TIME ZONE,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Constraints: One user can only have one role per partner
  UNIQUE(partner_id, user_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_team_members_partner ON partner_team_members(partner_id);
CREATE INDEX IF NOT EXISTS idx_team_members_user ON partner_team_members(user_id);

COMMENT ON TABLE partner_team_members IS 'Team members with role-based access: owner, manager, scanner';
COMMENT ON TYPE partner_role IS 'owner=full access, manager=ops without financials, scanner=check-in only';

-- 5. ROW LEVEL SECURITY POLICIES

-- Ticket Tiers: Public can read active tiers for active events
DROP POLICY IF EXISTS "Public can view active ticket tiers" ON ticket_tiers;
CREATE POLICY "Public can view active ticket tiers"
ON ticket_tiers FOR SELECT
USING (
  is_active = true 
  AND EXISTS (
    SELECT 1 FROM events 
    WHERE events.id = ticket_tiers.event_id 
    AND events.status = 'active'
  )
);

-- Partners can manage their own event tiers
DROP POLICY IF EXISTS "Partners manage their ticket tiers" ON ticket_tiers;
CREATE POLICY "Partners manage their ticket tiers"
ON ticket_tiers FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM events 
    WHERE events.id = ticket_tiers.event_id 
    AND (
      -- Direct partner ownership (legacy)
      events.organizer_id = (
        SELECT id FROM partners WHERE user_id = auth.uid() LIMIT 1
      )
      -- Or team member with owner/manager role
      OR events.organizer_id IN (
        SELECT partner_id FROM partner_team_members 
        WHERE user_id = auth.uid() 
        AND role IN ('owner', 'manager')
      )
    )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM events 
    WHERE events.id = ticket_tiers.event_id 
    AND (
      events.organizer_id = (
        SELECT id FROM partners WHERE user_id = auth.uid() LIMIT 1
      )
      OR events.organizer_id IN (
        SELECT partner_id FROM partner_team_members 
        WHERE user_id = auth.uid() 
        AND role IN ('owner', 'manager')
      )
    )
  )
);

-- Team Members: Users can view teams they belong to
DROP POLICY IF EXISTS "Users can view their team memberships" ON partner_team_members;
CREATE POLICY "Users can view their team memberships"
ON partner_team_members FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- Only owners can manage team members
DROP POLICY IF EXISTS "Owners manage team members" ON partner_team_members;
CREATE POLICY "Owners manage team members"
ON partner_team_members FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM partner_team_members AS ptm
    WHERE ptm.partner_id = partner_team_members.partner_id
    AND ptm.user_id = auth.uid()
    AND ptm.role = 'owner'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM partner_team_members AS ptm
    WHERE ptm.partner_id = partner_team_members.partner_id
    AND ptm.user_id = auth.uid()
    AND ptm.role = 'owner'
  )
);

-- 6. HELPER FUNCTIONS

-- Function to check if user has specific role for a partner
CREATE OR REPLACE FUNCTION has_partner_role(p_partner_id UUID, p_role partner_role)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM partner_team_members
    WHERE partner_id = p_partner_id
    AND user_id = auth.uid()
    AND role = p_role
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check if user has any role for a partner (or is the direct owner)
CREATE OR REPLACE FUNCTION is_partner_member(p_partner_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM partner_team_members
    WHERE partner_id = p_partner_id
    AND user_id = auth.uid()
  ) OR EXISTS (
    SELECT 1 FROM partners
    WHERE id = p_partner_id
    AND user_id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get user's role for a partner
CREATE OR REPLACE FUNCTION get_partner_role(p_partner_id UUID)
RETURNS partner_role AS $$
DECLARE
  user_role partner_role;
BEGIN
  -- Check if direct owner (legacy)
  IF EXISTS (
    SELECT 1 FROM partners 
    WHERE id = p_partner_id AND user_id = auth.uid()
  ) THEN
    RETURN 'owner'::partner_role;
  END IF;
  
  -- Check team membership
  SELECT role INTO user_role
  FROM partner_team_members
  WHERE partner_id = p_partner_id
  AND user_id = auth.uid()
  LIMIT 1;
  
  RETURN user_role;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. ENSURE PARTNER CREATORS ARE TEAM OWNERS

-- When a partner is created, automatically add them as 'owner'
-- This ensures backwards compatibility with existing partners
INSERT INTO partner_team_members (partner_id, user_id, role, accepted_at)
SELECT 
  p.id AS partner_id,
  p.user_id,
  'owner'::partner_role,
  NOW() AS accepted_at
FROM partners p
WHERE p.user_id IS NOT NULL
ON CONFLICT (partner_id, user_id) DO NOTHING;

-- 8. DATA MIGRATION FOR EXISTING EVENTS (OPTIONAL)
-- Creates a default "General Admission" tier for events with simple pricing

-- Uncomment and run this if you want to migrate existing events:
/*
INSERT INTO ticket_tiers (event_id, name, description, price, quantity_total, is_active, sort_order)
SELECT 
  id AS event_id,
  'General Admission' AS name,
  'Standard entry ticket' AS description,
  ticket_price AS price,
  capacity AS quantity_total,
  true AS is_active,
  0 AS sort_order
FROM events
WHERE ticket_price IS NOT NULL 
  AND capacity IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM ticket_tiers WHERE ticket_tiers.event_id = events.id
  );
*/

-- 9. VERIFICATION QUERIES 
-- Run these to verify migration success

-- Check team members setup
-- SELECT COUNT(*) AS total_team_members, role, COUNT(DISTINCT partner_id) AS partners_count
-- FROM partner_team_members GROUP BY role;

-- Check if all partners have owners
-- SELECT COUNT(*) AS partners_without_owners 
-- FROM partners p 
-- WHERE NOT EXISTS (
--   SELECT 1 FROM partner_team_members ptm 
--   WHERE ptm.partner_id = p.id AND ptm.role = 'owner'
-- );

-- Check ticket tiers
-- SELECT COUNT(*) AS events_with_tiers FROM (
--   SELECT DISTINCT event_id FROM ticket_tiers
-- ) AS t;

-- Sample branding check
-- SELECT id, business_name, branding FROM partners WHERE branding != '{}'::jsonb LIMIT 3;

-- Migration complete!
-- Next steps:
-- 1. Update frontend to use ticket_tiers instead of events.ticket_price
-- 2. Update checkout flow to select specific tier_id
-- 3. Build the organizer UI for managing tiers

