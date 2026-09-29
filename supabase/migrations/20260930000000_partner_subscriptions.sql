-- HangHut Pro billing on Xendit recurring.
--
-- SEPARATION OF CONCERNS. `partner_entitlements` answers "what may this partner
-- do" and is the ONLY thing gates read. This table answers "how are they paying
-- for it". Entitlements deliberately do not care whether somebody pays monthly,
-- annually, or not at all -- a granted partner and a paying partner get
-- identical access, which is what makes granting free Pro safe.
--
-- HANGHUT IS THE MERCHANT HERE. Every other Xendit call in this codebase routes
-- money TO a partner sub-account via `for-user-id`. This one collects FROM the
-- partner into HangHut's main account, so that header must never be sent.

alter table public.partner_plans
    add column if not exists price_annual numeric(12,2),
    add column if not exists currency text not null default 'PHP';

-- Fixed PHP, not a converted USD figure. A recurring plan's amount is frozen at
-- creation, so quoting in USD would lock each partner to their signup-day FX
-- rate and leave partners paying different amounts for the same product.
update public.partner_plans
   set price_monthly = 1200.00, price_annual = 12000.00, currency = 'PHP'
 where code = 'pro';

create table if not exists public.partner_subscriptions (
    id uuid primary key default gen_random_uuid(),
    partner_id uuid not null references public.partners(id) on delete cascade,
    plan_code text not null references public.partner_plans(code),

    billing_interval text not null check (billing_interval in ('MONTH','YEAR')),
    amount numeric(12,2) not null check (amount > 0),
    currency text not null default 'PHP',

    -- Xendit handles.
    xendit_customer_id text,
    xendit_plan_id text unique,
    -- Our idempotency key, sent as the plan's reference_id. A plan that dies
    -- (declined signup charge) keeps its reference_id forever, so a retry must
    -- present a NEW one -- hence the attempt counter rather than a bare
    -- `pro_<partner_id>`.
    reference_id text not null unique,
    attempt int not null default 1,

    -- Mirrors Xendit: PENDING | REQUIRES_ACTION | ACTIVE | INACTIVE.
    -- Plus CANCELLED for a merchant-side stop, which Xendit also reports as
    -- INACTIVE but which we must be able to tell apart from dunning failure.
    status text not null default 'PENDING'
        check (status in ('PENDING','REQUIRES_ACTION','ACTIVE','INACTIVE','CANCELLED')),
    -- Set when status is REQUIRES_ACTION: the AUTH url the partner must visit to
    -- finish linking an e-wallet. Cards tokenized via a SAVE session skip this.
    action_url text,

    anchor_date date,
    current_period_start timestamptz,
    current_period_end timestamptz,
    last_cycle_at timestamptz,

    consecutive_failures int not null default 0,
    last_failure_code text,
    cancelled_at timestamptz,
    cancel_reason text,

    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

-- A partner may hold only ONE live subscription. Dead ones are kept for history,
-- which is why this is partial rather than a plain unique on partner_id.
create unique index if not exists partner_subscriptions_one_live_idx
    on public.partner_subscriptions (partner_id)
    where status in ('PENDING','REQUIRES_ACTION','ACTIVE');

create index if not exists partner_subscriptions_partner_idx
    on public.partner_subscriptions (partner_id, created_at desc);

-- Per-charge audit. Without this, a disputed invoice has nothing behind it but a
-- current_period_end, and a duplicate webhook has nothing to be idempotent
-- against.
create table if not exists public.partner_subscription_cycles (
    id uuid primary key default gen_random_uuid(),
    subscription_id uuid not null references public.partner_subscriptions(id) on delete cascade,
    cycle_number int,
    status text not null,
    amount numeric(12,2),
    currency text,
    xendit_payment_id text,
    failure_code text,
    occurred_at timestamptz not null default now(),
    payload jsonb
);

-- Webhook redelivery is normal, not exceptional. One row per Xendit payment.
create unique index if not exists partner_subscription_cycles_payment_idx
    on public.partner_subscription_cycles (xendit_payment_id)
    where xendit_payment_id is not null;

create index if not exists partner_subscription_cycles_sub_idx
    on public.partner_subscription_cycles (subscription_id, occurred_at desc);

alter table public.partner_subscriptions enable row level security;
alter table public.partner_subscription_cycles enable row level security;

-- Partners read their own billing; nobody writes through RLS. Every write comes
-- from the Xendit webhook or a server action running as the service role, so a
-- compromised browser session cannot mark itself paid.
drop policy if exists "Partners read own subscription" on public.partner_subscriptions;
create policy "Partners read own subscription"
    on public.partner_subscriptions for select using (
        partner_id in (select p.id from public.partners p where p.user_id = (select auth.uid()))
    );

drop policy if exists "Admins read all subscriptions" on public.partner_subscriptions;
create policy "Admins read all subscriptions"
    on public.partner_subscriptions for select using (
        exists (select 1 from public.users u where u.id = (select auth.uid()) and u.is_admin = true)
    );

drop policy if exists "Partners read own cycles" on public.partner_subscription_cycles;
create policy "Partners read own cycles"
    on public.partner_subscription_cycles for select using (
        subscription_id in (
            select s.id from public.partner_subscriptions s
            join public.partners p on p.id = s.partner_id
            where p.user_id = (select auth.uid())
        )
    );

drop policy if exists "Admins read all cycles" on public.partner_subscription_cycles;
create policy "Admins read all cycles"
    on public.partner_subscription_cycles for select using (
        exists (select 1 from public.users u where u.id = (select auth.uid()) and u.is_admin = true)
    );

create or replace function public.touch_partner_subscriptions()
returns trigger language plpgsql as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

drop trigger if exists partner_subscriptions_touch on public.partner_subscriptions;
create trigger partner_subscriptions_touch
    before update on public.partner_subscriptions
    for each row execute function public.touch_partner_subscriptions();

-- Xendit caps anchor_date at day 28. Signing a partner up on the 30th with their
-- own signup date would be rejected outright, so the cap is applied here, once,
-- rather than in each caller.
create or replace function public.pro_anchor_date(p_from timestamptz default now())
returns date language sql immutable as $$
    select make_date(
        extract(year from p_from)::int,
        extract(month from p_from)::int,
        least(extract(day from p_from)::int, 28)
    );
$$;

comment on table public.partner_subscriptions is
    'HangHut Pro billing via Xendit recurring plans. Entitlement lives in partner_entitlements; this is only how it is paid for.';
