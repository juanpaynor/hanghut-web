-- Experience promo codes have never once worked. Two independent reasons, both
-- here; the checkout half was already complete (reserve_experience validates the
-- code under the same lock that reserves the slot, increments usage_count, and
-- returns PROMO_* error codes), so nothing downstream needs touching.

-- ── 1. RLS: organizers could not create them ───────────────────────────────
-- Both existing manage policies filter on `event_id IN (...)`. An experience
-- code has event_id NULL, and `NULL IN (...)` is NULL -- never true -- so every
-- insert was refused. That is why prod holds 0 experience codes.
--
-- Ownership mirrors the three-way check already used in
-- src/lib/organizer/experience-question-actions.ts: the host, the partner that
-- owns the experience, or a member of that partner's team. Inventing a
-- narrower rule here would mean a team member can edit the experience but not
-- its promo codes.
--
-- auth.uid() is wrapped in a scalar subquery so it is an InitPlan evaluated
-- once per query rather than once per row.
CREATE POLICY "Organizers can manage experience promo codes"
ON public.promo_codes
FOR ALL
TO authenticated
USING (
    experience_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.tables t
        WHERE t.id = promo_codes.experience_id
          AND (
              t.host_id = (SELECT auth.uid())
              OR t.partner_id IN (
                  SELECT p.id FROM public.partners p
                   WHERE p.user_id = (SELECT auth.uid())
                  UNION
                  SELECT ptm.partner_id FROM public.partner_team_members ptm
                   WHERE ptm.user_id = (SELECT auth.uid())
              )
          )
    )
)
WITH CHECK (
    experience_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.tables t
        WHERE t.id = promo_codes.experience_id
          AND (
              t.host_id = (SELECT auth.uid())
              OR t.partner_id IN (
                  SELECT p.id FROM public.partners p
                   WHERE p.user_id = (SELECT auth.uid())
                  UNION
                  SELECT ptm.partner_id FROM public.partner_team_members ptm
                   WHERE ptm.user_id = (SELECT auth.uid())
              )
          )
    )
);

-- ── 2. Uniqueness: duplicates were unlimited ───────────────────────────────
-- The only unique constraint is UNIQUE (event_id, code). On an experience row
-- event_id is NULL, and NULLs are DISTINCT in a unique index, so
-- (NULL, 'SAVE10') could be inserted without limit -- and the 23505 handler in
-- createExperiencePromoCode() was unreachable code. A partial unique index is
-- the right shape: it constrains experience rows without touching event rows.
--
-- Codes are stored upper-cased by the writers and looked up upper-cased by
-- reserve_experience, so a plain (experience_id, code) index matches how the
-- column is actually used.
CREATE UNIQUE INDEX IF NOT EXISTS promo_codes_experience_id_code_key
    ON public.promo_codes (experience_id, code)
    WHERE experience_id IS NOT NULL;
