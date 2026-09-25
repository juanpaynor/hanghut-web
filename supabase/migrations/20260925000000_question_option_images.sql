-- A picture per choice option.
--
-- The size chart (help_image_url) explains a question. This is different: it
-- shows the OPTIONS themselves — shirt designs, colourways, meal choices. A
-- <select> cannot render an image, so a question carrying these is presented as
-- a grid of picture cards instead of a dropdown.
--
-- Deliberately a PARALLEL map rather than a new shape for `options`.
-- `options` is read as a plain string array by the editor, all three buyer
-- surfaces, the CSV export and the app, and the stored ANSWER is the option's
-- label. Changing that shape would break every one of them and orphan existing
-- answers. A separate column is additive: anything that ignores it behaves
-- exactly as before.
--
-- Keyed by LABEL, not index, so renaming or reordering options cannot silently
-- repoint a picture at the wrong choice. An image whose label no longer exists
-- is simply never looked up.
alter table public.registration_questions
    add column if not exists option_images jsonb;

comment on column public.registration_questions.option_images is
    'Optional picture per choice option: {"<option label>": "<public url>"}. Keyed by LABEL, not index, so reordering or editing options cannot silently repoint an image at the wrong one. Answers still store the label string, so exports, stats and the app are unaffected.';
