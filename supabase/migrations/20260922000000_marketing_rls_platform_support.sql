-- Saving an automation failed with "new row violates row-level security policy
-- for table email_automations" for a platform-support (ghost) seat.
--
-- The marketing policies gated on partners.user_id = auth.uid() -- owner only.
-- Ghost mode is owner-equivalent everywhere in the dashboard, so the seat
-- resolved the partner correctly and then had its write rejected. Same root
-- cause as the URW wallet reading P0.00 and the refund RPCs' owner-or-finance
-- check: authorization written against partners.user_id instead of a shared gate.
--
-- Deliberately NOT can_manage_partner. That counts ANY team member, including
-- scanners and cashiers -- door staff who would then be able to mail every
-- customer the partner has. email_templates already grants exactly that, which
-- is a precedent worth not repeating on campaigns.
create or replace function public.can_manage_marketing(p_partner_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
    SELECT EXISTS (
        SELECT 1 FROM partners
        WHERE id = p_partner_id AND user_id = auth.uid()
    ) OR EXISTS (
        SELECT 1 FROM partner_team_members
        WHERE partner_id = p_partner_id
          AND user_id = auth.uid()
          AND is_active
          AND (is_platform_support OR role IN ('owner', 'manager', 'marketing'))
    ) OR EXISTS (
        SELECT 1 FROM users WHERE id = auth.uid() AND is_admin = true
    );
$$;

revoke all on function public.can_manage_marketing(uuid) from public, anon;
grant execute on function public.can_manage_marketing(uuid) to authenticated;

drop policy if exists email_automations_owner on email_automations;
create policy email_automations_marketing on email_automations
  for all using (can_manage_marketing(partner_id))
  with check (can_manage_marketing(partner_id));

-- Same gap: a support seat could neither read campaign history nor send.
drop policy if exists "Partners can view their own campaigns" on email_campaigns;
drop policy if exists "Partners can manage their own campaigns" on email_campaigns;
create policy email_campaigns_marketing on email_campaigns
  for all using (can_manage_marketing(partner_id))
  with check (can_manage_marketing(partner_id));

drop policy if exists email_automation_runs_owner_select on email_automation_runs;
create policy email_automation_runs_marketing on email_automation_runs
  for select using (exists (
    select 1 from email_automations a
    where a.id = email_automation_runs.automation_id
      and can_manage_marketing(a.partner_id)
  ));
