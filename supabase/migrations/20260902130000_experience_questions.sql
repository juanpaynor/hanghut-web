-- Custom booking questions for experiences — the events "registration questions"
-- feature (registration_questions / registration_answers), mirrored for the
-- paid experience booking flow.
--
-- Events attach answers to an event_registrations row created before payment.
-- Experiences have no registration step, so answers are stored directly on the
-- booking (experience_purchase_intents.answers), written by create-experience-intent
-- right after the slot is reserved. Storing the label alongside each answer keeps
-- a booking's answers readable even after a question is later edited or removed.

create table if not exists public.experience_questions (
    id            uuid primary key default gen_random_uuid(),
    table_id      uuid not null references public.tables(id) on delete cascade,
    label         text not null,
    question_type text not null,
    options       jsonb,
    is_required   boolean not null default false,
    display_order integer not null default 0,
    created_at    timestamptz default now()
);

create index if not exists idx_experience_questions_table
    on public.experience_questions(table_id, display_order);

alter table public.experience_purchase_intents
    add column if not exists answers jsonb;

comment on column public.experience_purchase_intents.answers is
    'Custom question answers captured at booking: [{question_id, label, answer}]. Label is denormalized so answers survive question edits/deletes.';

-- RLS: questions are shown to buyers on the public booking page, so anyone may
-- read them. Writes go through saveExperienceQuestions, which uses the service
-- role (bypasses RLS) after verifying the caller manages the experience — matching
-- how registration_questions are written. No public write policy on purpose.
alter table public.experience_questions enable row level security;

drop policy if exists "experience_questions_public_read" on public.experience_questions;
create policy "experience_questions_public_read"
    on public.experience_questions for select
    using (true);
