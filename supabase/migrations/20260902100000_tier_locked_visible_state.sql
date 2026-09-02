-- A third tier state: locked but still SHOWN.
--
-- Until now a tier had two states — on sale, or is_active = false which removed
-- it from every buyer surface entirely. Organizers want a middle state: keep the
-- tier visible (so buyers can see that a VIP tier exists and is coming back /
-- has closed) but greyed out and unbuyable, with a short note explaining why.
--
-- is_active keeps its exact current meaning — NOT purchasable — and stays the
-- thing create-purchase-intent enforces (v109). These two columns only decide
-- whether a locked tier is DISPLAYED and what it says.
alter table public.ticket_tiers
    add column if not exists show_when_locked boolean not null default false,
    add column if not exists lock_note text;

comment on column public.ticket_tiers.show_when_locked is
    'When is_active = false, still display this tier greyed out and unbuyable instead of hiding it.';
comment on column public.ticket_tiers.lock_note is
    'Short buyer-facing reason shown on a locked, visible tier (e.g. "Opens Friday 6PM").';
