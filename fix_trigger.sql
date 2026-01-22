-- ==============================================
-- FIX: Updated User Trigger (Typing Safe)
-- This removes 'role' and 'status' from the INSERT to let
-- the database DEFAULTS handle the Enum casting automatically.
-- ==============================================

create or replace function public.handle_new_user()
returns trigger as $$
declare
  _display_name text;
begin
  -- Extract display name, fallback to email prefix
  _display_name := coalesce(
    new.raw_user_meta_data->>'display_name',
    split_part(new.email, '@', 1)
  );

  insert into public.users (
    id,
    email,
    display_name,
    created_at,
    updated_at
    -- REMOVED: role, status (Rely on table defaults to avoid 'active' string vs Enum type errors)
  )
  values (
    new.id,
    new.email,
    _display_name,
    now(),
    now()
  )
  on conflict (id) do update set
    email = excluded.email,
    display_name = excluded.display_name,
    updated_at = now();

  return new;
end;
$$ language plpgsql security definer;
