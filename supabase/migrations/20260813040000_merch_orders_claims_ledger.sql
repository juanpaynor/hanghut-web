-- Merch — Phase 1.3: unified order / fulfillment / payout schema. All ADDITIVE
-- (new tables + one new column on merch_products). No existing table is altered,
-- so the ticket money-path is untouched.
--
-- Two purchase paths, one catalog, unified fulfillment + payout:
--   • standalone → merch_orders + merch_order_items (mirrors experience_purchase_intents)
--   • add-on     → purchase_intent_merch_items (child of the ticket purchase_intent)
--   • BOTH produce merch_claims (+ items) for pickup, and merch_transactions for payout.

-- Which surfaces a product appears on.
alter table public.merch_products
    add column if not exists available_as text not null default 'both'
    check (available_as in ('addon', 'standalone', 'both'));

-- ── Standalone orders ─────────────────────────────────────────────────────────
create table if not exists public.merch_orders (
    id                    uuid primary key default gen_random_uuid(),
    organizer_id          uuid not null references public.partners(id) on delete cascade,
    event_id              uuid references public.events(id) on delete set null,
    user_id               uuid references auth.users(id) on delete set null,
    guest_email           text,
    guest_name            text,
    guest_phone           text,
    quantity              integer not null default 0,          -- total items
    subtotal              numeric not null default 0,
    platform_fee          numeric not null default 0,          -- passed portion the buyer covers
    total_amount          numeric not null default 0,
    fee_percentage        numeric,
    fees_passed_to_customer boolean,
    fulfillment_mode      text not null default 'claim' check (fulfillment_mode in ('claim', 'ship')),
    shipping_address      jsonb,
    status                text not null default 'pending' check (status in ('pending','completed','expired','refunded','cancelled')),
    payment_method        text,
    xendit_external_id    text unique,                         -- 'mer_' prefixed
    xendit_invoice_id     text,
    xendit_invoice_url    text,
    refunded_amount       numeric not null default 0,
    refunded_at           timestamptz,
    expires_at            timestamptz not null default (now() + interval '15 minutes'),
    paid_at               timestamptz,
    created_at            timestamptz not null default now(),
    updated_at            timestamptz not null default now()
);
create index if not exists merch_orders_organizer_idx on public.merch_orders(organizer_id);
create index if not exists merch_orders_event_idx on public.merch_orders(event_id);
create index if not exists merch_orders_user_idx on public.merch_orders(user_id);
create index if not exists merch_orders_external_idx on public.merch_orders(xendit_external_id);

create table if not exists public.merch_order_items (
    id            uuid primary key default gen_random_uuid(),
    order_id      uuid not null references public.merch_orders(id) on delete cascade,
    variant_id    uuid not null references public.merch_variants(id),
    product_id    uuid not null references public.merch_products(id),
    name_snapshot text not null,
    unit_price    numeric not null,
    quantity      integer not null,
    line_total    numeric not null
);
create index if not exists merch_order_items_order_idx on public.merch_order_items(order_id);

-- ── Add-on line items on a ticket purchase_intent ─────────────────────────────
create table if not exists public.purchase_intent_merch_items (
    id                 uuid primary key default gen_random_uuid(),
    purchase_intent_id uuid not null references public.purchase_intents(id) on delete cascade,
    variant_id         uuid not null references public.merch_variants(id),
    product_id         uuid not null references public.merch_products(id),
    name_snapshot      text not null,
    unit_price         numeric not null,
    quantity           integer not null,
    line_total         numeric not null
);
create index if not exists pi_merch_items_intent_idx on public.purchase_intent_merch_items(purchase_intent_id);

-- ── Unified fulfillment: claims (one per paid merch order/intent) ──────────────
create table if not exists public.merch_claims (
    id                 uuid primary key default gen_random_uuid(),
    claim_token        uuid not null unique default gen_random_uuid(),
    organizer_id       uuid not null references public.partners(id) on delete cascade,
    event_id           uuid references public.events(id) on delete set null,
    source             text not null check (source in ('standalone', 'addon')),
    merch_order_id     uuid references public.merch_orders(id) on delete cascade,
    purchase_intent_id uuid references public.purchase_intents(id) on delete cascade,
    user_id            uuid references auth.users(id) on delete set null,
    buyer_email        text,
    buyer_name         text,
    fulfillment_mode   text not null default 'claim' check (fulfillment_mode in ('claim', 'ship')),
    shipping_address   jsonb,
    status             text not null default 'unclaimed' check (status in ('unclaimed','claimed','shipped','cancelled')),
    claimed_at         timestamptz,
    claimed_by         uuid references auth.users(id),
    created_at         timestamptz not null default now()
);
create index if not exists merch_claims_organizer_idx on public.merch_claims(organizer_id);
create index if not exists merch_claims_event_idx on public.merch_claims(event_id);
create index if not exists merch_claims_user_idx on public.merch_claims(user_id);
create index if not exists merch_claims_email_idx on public.merch_claims(lower(buyer_email));

create table if not exists public.merch_claim_items (
    id            uuid primary key default gen_random_uuid(),
    claim_id      uuid not null references public.merch_claims(id) on delete cascade,
    variant_id    uuid references public.merch_variants(id),
    product_id    uuid references public.merch_products(id),
    name_snapshot text not null,
    quantity      integer not null,
    unit_price    numeric not null
);
create index if not exists merch_claim_items_claim_idx on public.merch_claim_items(claim_id);

-- ── Unified payout ledger (mirrors experience_transactions) ────────────────────
create table if not exists public.merch_transactions (
    id                    uuid primary key default gen_random_uuid(),
    organizer_id          uuid not null references public.partners(id) on delete cascade,
    merch_order_id        uuid references public.merch_orders(id) on delete set null,
    purchase_intent_id    uuid references public.purchase_intents(id) on delete set null,
    user_id               uuid references auth.users(id) on delete set null,
    event_id              uuid references public.events(id) on delete set null,
    gross_amount          numeric not null,                    -- merch subtotal
    platform_fee          numeric not null default 0,          -- HangHut revenue on merch
    payment_processing_fee numeric not null default 0,
    organizer_payout      numeric not null,
    status                text not null default 'completed' check (status in ('completed','refunded')),
    payout_id             uuid,
    xendit_transaction_id text,
    created_at            timestamptz not null default now()
);
create index if not exists merch_transactions_organizer_idx on public.merch_transactions(organizer_id);
create index if not exists merch_transactions_status_idx on public.merch_transactions(status);

-- ── RLS ───────────────────────────────────────────────────────────────────────
-- Writes are done only by SECURITY DEFINER RPCs / service_role, so these are
-- read-only policies for organizers (their rows) and buyers (their own).
alter table public.merch_orders enable row level security;
alter table public.merch_order_items enable row level security;
alter table public.purchase_intent_merch_items enable row level security;
alter table public.merch_claims enable row level security;
alter table public.merch_claim_items enable row level security;
alter table public.merch_transactions enable row level security;

-- Reusable ownership check via a helper: is auth.uid() an owner/manager of org?
create or replace function public.is_org_member(p_org uuid)
returns boolean language sql stable security definer set search_path = public as $$
    select exists (select 1 from partners p where p.id = p_org and p.user_id = auth.uid())
        or exists (select 1 from partner_team_members m
                   where m.partner_id = p_org and m.user_id = auth.uid() and m.role in ('owner','manager'));
$$;
grant execute on function public.is_org_member(uuid) to authenticated, service_role;

create policy merch_orders_read on public.merch_orders
    for select using (user_id = auth.uid() or public.is_org_member(organizer_id));

create policy merch_order_items_read on public.merch_order_items
    for select using (exists (select 1 from public.merch_orders o where o.id = order_id
        and (o.user_id = auth.uid() or public.is_org_member(o.organizer_id))));

create policy pi_merch_items_read on public.purchase_intent_merch_items
    for select using (exists (
        select 1 from public.purchase_intents pi join public.events e on e.id = pi.event_id
        where pi.id = purchase_intent_id and (pi.user_id = auth.uid() or public.is_org_member(e.organizer_id))));

create policy merch_claims_read on public.merch_claims
    for select using (user_id = auth.uid() or public.is_org_member(organizer_id));

create policy merch_claim_items_read on public.merch_claim_items
    for select using (exists (select 1 from public.merch_claims c where c.id = claim_id
        and (c.user_id = auth.uid() or public.is_org_member(c.organizer_id))));

create policy merch_transactions_read on public.merch_transactions
    for select using (public.is_org_member(organizer_id));
