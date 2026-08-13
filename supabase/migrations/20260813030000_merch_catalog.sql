-- Merch — Phase 1.1: catalog (products + variants). Additive, no money-path impact.
-- Mirrors the ticket_tiers shape (a product with priced, stock-tracked variants).

create table if not exists public.merch_products (
    id               uuid primary key default gen_random_uuid(),
    organizer_id     uuid not null references public.partners(id) on delete cascade,
    event_id         uuid references public.events(id) on delete set null,  -- null = storefront-wide
    name             text not null,
    description      text,
    images           text[] not null default '{}',
    fulfillment_mode text not null default 'claim' check (fulfillment_mode in ('claim', 'ship', 'both')),
    is_active        boolean not null default true,
    sort_order       integer not null default 0,
    created_at       timestamptz not null default now(),
    updated_at       timestamptz not null default now()
);

create index if not exists merch_products_organizer_idx on public.merch_products(organizer_id);
create index if not exists merch_products_event_idx on public.merch_products(event_id);

create table if not exists public.merch_variants (
    id             uuid primary key default gen_random_uuid(),
    product_id     uuid not null references public.merch_products(id) on delete cascade,
    name           text not null,                       -- e.g. "Black / Large"
    options        jsonb not null default '{}',         -- { size, color, ... }
    price          numeric not null check (price >= 0),
    sku            text,
    quantity_total integer,                             -- null = unlimited stock
    quantity_sold  integer not null default 0,
    is_active      boolean not null default true,
    sort_order     integer not null default 0,
    created_at     timestamptz not null default now()
);

create index if not exists merch_variants_product_idx on public.merch_variants(product_id);

-- ── RLS ───────────────────────────────────────────────────────────────────────
alter table public.merch_products enable row level security;
alter table public.merch_variants enable row level security;

-- Helper predicate: does auth.uid() own or manage this organizer?
-- (inlined per-policy since Postgres RLS can't share a local function cheaply here)

-- Products: public reads active ones (buyers); owner/manager do everything.
drop policy if exists merch_products_public_read on public.merch_products;
create policy merch_products_public_read on public.merch_products
    for select using (is_active = true);

drop policy if exists merch_products_owner_rw on public.merch_products;
create policy merch_products_owner_rw on public.merch_products
    for all
    using (
        organizer_id in (select id from public.partners where user_id = auth.uid())
        or exists (
            select 1 from public.partner_team_members m
            where m.partner_id = merch_products.organizer_id
              and m.user_id = auth.uid() and m.role in ('owner', 'manager')
        )
    )
    with check (
        organizer_id in (select id from public.partners where user_id = auth.uid())
        or exists (
            select 1 from public.partner_team_members m
            where m.partner_id = merch_products.organizer_id
              and m.user_id = auth.uid() and m.role in ('owner', 'manager')
        )
    );

-- Variants: public reads active ones; owner/manager manage via parent product.
drop policy if exists merch_variants_public_read on public.merch_variants;
create policy merch_variants_public_read on public.merch_variants
    for select using (is_active = true);

drop policy if exists merch_variants_owner_rw on public.merch_variants;
create policy merch_variants_owner_rw on public.merch_variants
    for all
    using (
        exists (
            select 1 from public.merch_products p
            where p.id = merch_variants.product_id
              and (
                p.organizer_id in (select id from public.partners where user_id = auth.uid())
                or exists (
                    select 1 from public.partner_team_members m
                    where m.partner_id = p.organizer_id
                      and m.user_id = auth.uid() and m.role in ('owner', 'manager')
                )
              )
        )
    )
    with check (
        exists (
            select 1 from public.merch_products p
            where p.id = merch_variants.product_id
              and (
                p.organizer_id in (select id from public.partners where user_id = auth.uid())
                or exists (
                    select 1 from public.partner_team_members m
                    where m.partner_id = p.organizer_id
                      and m.user_id = auth.uid() and m.role in ('owner', 'manager')
                )
              )
        )
    );
