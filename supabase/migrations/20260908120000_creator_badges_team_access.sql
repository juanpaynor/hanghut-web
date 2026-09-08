-- creator_badges was owner-only, so a partner's TEAM could not manage badges even
-- though getPartner() resolves team membership and the sidebar shows the Badges
-- page to managers and marketing. The result was a page that loads and then
-- refuses every action, including the art upload — reported live by a KOOLPALS
-- manager as "Forbidden" on upload.
--
-- is_team_member_of_partner() is the same helper the partners table already uses
-- for its "Team members can view their partner" policy, so this stays consistent
-- with how the rest of the dashboard decides who may act for a partner.
DROP POLICY IF EXISTS creator_badges_owner_rw ON creator_badges;

CREATE POLICY creator_badges_owner_rw ON creator_badges
    FOR ALL
    USING (
        organizer_id IN (SELECT id FROM partners WHERE user_id = (SELECT auth.uid()))
        OR is_team_member_of_partner(organizer_id)
    )
    WITH CHECK (
        organizer_id IN (SELECT id FROM partners WHERE user_id = (SELECT auth.uid()))
        OR is_team_member_of_partner(organizer_id)
    );
