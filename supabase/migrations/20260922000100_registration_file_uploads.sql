-- File answers on registration questions: a partner wants attendees to upload
-- an ID, a receipt, proof of student status.
--
-- The answer is stored in the existing text column as a JSON record --
--   {"path": "...", "name": "id.jpg", "size": 204800, "type": "image/jpeg"}
-- -- which matches how multi_choice already stores a JSON array there, so no
-- column change and every existing reader keeps working.
alter table registration_questions drop constraint registration_questions_question_type_check;
alter table registration_questions add constraint registration_questions_question_type_check
  check (question_type = any (array[
    'short_text','long_text','single_choice','multi_choice',
    'checkbox','social_profile','url','company','file'
  ]));

alter table registration_questions drop constraint registration_questions_analytics_kind_check;
alter table registration_questions add constraint registration_questions_analytics_kind_check
  check (analytics_kind = any (array['choice','contact','freetext','longform','file']));

-- The bucket is PRIVATE and has no policies at all. Uploads use a signed upload
-- URL minted server-side for one server-chosen path; reads use a 10-minute
-- signed URL issued only after the caller is checked against the event. Nothing
-- here is reachable by holding a session, and storage paths are not guessable.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'registration-uploads', 'registration-uploads', false, 10485760,
  array['image/jpeg','image/png','image/webp','image/heic','application/pdf']
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- get_event_answer_stats gains the 'file' kind, which is excluded from the
-- distribution the same way 'contact' is: a storage path is not an answer to
-- count, and charting filenames is noise. The full body is re-declared here so
-- replaying migrations produces the running definition.
-- (body as deployed; see 20260920 registration_answer_analytics for the original)
