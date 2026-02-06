-- Create partner_invites table
CREATE TABLE IF NOT EXISTS partner_invites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    partner_id UUID NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('owner', 'manager', 'viewer')),
    token UUID DEFAULT gen_random_uuid(),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired')),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '7 days'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- Prevent duplicate pending invites for same email+partner
    UNIQUE(partner_id, email)
);

-- Enable RLS
ALTER TABLE partner_invites ENABLE ROW LEVEL SECURITY;

-- Policies
-- 1. Owners can see all invites for their partner
CREATE POLICY "Owners can view invites" ON partner_invites
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM partner_team_members
            WHERE partner_team_members.partner_id = partner_invites.partner_id
            AND partner_team_members.user_id = auth.uid()
            AND partner_team_members.role = 'owner'
        )
        OR
        -- Allow partners table (direct owners) to access
        EXISTS (
            SELECT 1 FROM partners
            WHERE partners.id = partner_invites.partner_id
            AND partners.user_id = auth.uid()
        )
    );

-- 2. Owners can create/delete invites
CREATE POLICY "Owners can manage invites" ON partner_invites
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM partner_team_members
            WHERE partner_team_members.partner_id = partner_invites.partner_id
            AND partner_team_members.user_id = auth.uid()
            AND partner_team_members.role = 'owner'
        )
        OR
        EXISTS (
            SELECT 1 FROM partners
            WHERE partners.id = partner_invites.partner_id
            AND partners.user_id = auth.uid()
        )
    );

-- 3. Users can view invites sent to their email (for accepting)
CREATE POLICY "Users can view their own invites" ON partner_invites
    FOR SELECT
    USING (
        email = auth.email()
    );
