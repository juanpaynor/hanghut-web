-- ============================================================
-- 028: Team Feature Improvements
-- 1. Expand partner_role ENUM (partner_team_members uses this)
-- 2. Expand partner_invites role CHECK constraint
-- 3. Add invited_by column to partner_invites
-- 4. Update RLS policies so managers can also manage invites
-- ============================================================

-- 1. Expand the partner_role ENUM type used by partner_team_members
-- ALTER TYPE ... ADD VALUE is idempotent-safe with IF NOT EXISTS (PG 9.3+)
ALTER TYPE partner_role ADD VALUE IF NOT EXISTS 'finance';
ALTER TYPE partner_role ADD VALUE IF NOT EXISTS 'marketing';

-- 2. Expand the CHECK constraint on partner_invites.role
-- Current: ('owner', 'manager', 'viewer')
-- New: add 'scanner', 'finance', 'marketing'
ALTER TABLE partner_invites
    DROP CONSTRAINT IF EXISTS partner_invites_role_check;

ALTER TABLE partner_invites
    ADD CONSTRAINT partner_invites_role_check
    CHECK (role IN ('owner', 'manager', 'viewer', 'scanner', 'finance', 'marketing'));

-- 3. Add invited_by column to partner_invites if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'partner_invites' AND column_name = 'invited_by'
    ) THEN
        ALTER TABLE partner_invites ADD COLUMN invited_by UUID REFERENCES auth.users(id);
    END IF;
END $$;

-- 4. Allow managers (not just owners) to view and manage invites
DROP POLICY IF EXISTS "Owners can view invites" ON partner_invites;
DROP POLICY IF EXISTS "Team leads can view invites" ON partner_invites;
CREATE POLICY "Team leads can view invites" ON partner_invites
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM partner_team_members
            WHERE partner_team_members.partner_id = partner_invites.partner_id
            AND partner_team_members.user_id = auth.uid()
            AND partner_team_members.role IN ('owner', 'manager')
        )
        OR
        EXISTS (
            SELECT 1 FROM partners
            WHERE partners.id = partner_invites.partner_id
            AND partners.user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Owners can manage invites" ON partner_invites;
DROP POLICY IF EXISTS "Team leads can manage invites" ON partner_invites;
CREATE POLICY "Team leads can manage invites" ON partner_invites
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM partner_team_members
            WHERE partner_team_members.partner_id = partner_invites.partner_id
            AND partner_team_members.user_id = auth.uid()
            AND partner_team_members.role IN ('owner', 'manager')
        )
        OR
        EXISTS (
            SELECT 1 FROM partners
            WHERE partners.id = partner_invites.partner_id
            AND partners.user_id = auth.uid()
        )
    );
