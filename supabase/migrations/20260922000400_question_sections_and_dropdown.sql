-- Section blocks and dropdowns on registration questions.
--
-- From the partner's existing Google Form: a "Size Chart" panel sits ABOVE two
-- separate garment questions (Race Singlet, which everyone gets, and Finisher
-- Shirt, which only 21KM gets). One chart, several questions — so attaching the
-- image to a single question, as help_image_url does, would mean uploading and
-- maintaining the same chart twice.
--
-- A 'section' carries a heading, help_text and help_image_url, renders no
-- input, and stores no answer. A 'dropdown' is a single choice rendered as a
-- select, which is what seven shirt sizes want on a phone.

alter table public.registration_questions
    drop constraint if exists registration_questions_question_type_check;
alter table public.registration_questions
    add constraint registration_questions_question_type_check
    check (question_type = any (array[
        'short_text', 'long_text', 'single_choice', 'multi_choice', 'checkbox',
        'social_profile', 'url', 'company', 'file', 'date', 'dropdown', 'section'
    ]));

-- A section collects nothing, so it can never be "required" and can never be
-- missing. Enforced in the database rather than trusted to the editor, because
-- submit_event_request's required-question scan reads is_required directly — a
-- section marked required would block every submission with no way to answer it.
update public.registration_questions set is_required = false where question_type = 'section';

alter table public.registration_questions
    drop constraint if exists registration_questions_section_not_required;
alter table public.registration_questions
    add constraint registration_questions_section_not_required
    check (question_type <> 'section' or is_required = false);
