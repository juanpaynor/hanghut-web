-- Registration questions: date type, help media, conditional display, tier scoping.
--
-- Driven by a running-event partner (Sinadya Run 2026, 5KM/10KM/21KM tiers).
-- They asked for a birthdate picker, a size-chart image attached to a question,
-- and a finisher-shirt-size question that ONLY 21KM entrants are asked.
--
-- The last one is why `tier_ids` exists rather than leaning on depends_on_*:
-- the distance is a ticket TIER, not an answer. Making the organizer re-ask it
-- as a question would let someone answer "21km" and then buy the 5KM ticket,
-- and the shirt would be sized off the answer rather than off what they paid
-- for. A tier-scoped question is asked at checkout, where the tier is known.

-- ── 1. `date` joins the question types ───────────────────────────────────────
-- Birthdates were being collected as short_text, which cannot be validated,
-- sorted, or turned into an age.
alter table public.registration_questions
    drop constraint if exists registration_questions_question_type_check;
alter table public.registration_questions
    add constraint registration_questions_question_type_check
    check (question_type = any (array[
        'short_text', 'long_text', 'single_choice', 'multi_choice', 'checkbox',
        'social_profile', 'url', 'company', 'file', 'date'
    ]));

alter table public.registration_questions
    drop constraint if exists registration_questions_analytics_kind_check;
alter table public.registration_questions
    add constraint registration_questions_analytics_kind_check
    check (analytics_kind = any (array[
        'choice', 'contact', 'freetext', 'longform', 'file', 'date'
    ]));

-- ── 2. Helper media on a question ────────────────────────────────────────────
-- A size chart is the motivating case: the question ("Finisher shirt size") is
-- unanswerable without the chart sitting next to it.
alter table public.registration_questions
    add column if not exists help_text text,
    add column if not exists help_image_url text;

-- ── 3. Conditional display ───────────────────────────────────────────────────
-- Show this question only when another question holds one of these answers.
-- ON DELETE SET NULL rather than CASCADE: deleting the question someone depends
-- on should unhide the dependent, never silently delete it along with the
-- answers people already gave.
alter table public.registration_questions
    add column if not exists depends_on_question_id uuid
        references public.registration_questions(id) on delete set null,
    add column if not exists depends_on_values jsonb;

-- ── 4. Tier scoping ──────────────────────────────────────────────────────────
-- A jsonb array of ticket_tier ids. NULL or [] means "ask everyone", which is
-- what every existing question is.
alter table public.registration_questions
    add column if not exists tier_ids jsonb;

comment on column public.registration_questions.tier_ids is
    'jsonb array of ticket_tiers.id this question applies to. NULL/[] = all tiers. Tier-scoped questions are asked at checkout, after the tier is known.';
comment on column public.registration_questions.depends_on_question_id is
    'Show this question only when depends_on_question_id''s answer is in depends_on_values.';

create index if not exists idx_registration_questions_depends_on
    on public.registration_questions (depends_on_question_id)
    where depends_on_question_id is not null;
