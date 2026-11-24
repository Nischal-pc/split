-- Run this in Supabase -> SQL Editor AFTER schema.sql. Adds people/invite + fixes group creation.

-- ---------- profiles (so users can be found by email) ----------
create table if not exists profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  email        text,
  display_name text not null
);
alter table profiles enable row level security;
-- No client policies on purpose: profiles are only read through the SECURITY DEFINER
-- functions below, so nobody can scrape the whole email list.

-- keep profiles in sync with auth.users
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, email, display_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)))
  on conflict (id) do update set email = excluded.email;
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- backfill anyone who signed up before this migration
insert into profiles (id, email, display_name)
select id, email, coalesce(raw_user_meta_data->>'display_name', split_part(email, '@', 1))
from auth.users
on conflict (id) do nothing;

-- ---------- create a group + add yourself atomically (fixes the RLS read-back bug) ----------
create or replace function public.create_group(p_name text, p_currency text, p_me text)
returns groups language plpgsql security definer set search_path = public as $$
declare g groups;
begin
  insert into groups (name, currency, created_by)
  values (p_name, coalesce(nullif(p_currency, ''), '$'), auth.uid())
  returning * into g;
  insert into group_members (group_id, user_id, display_name) values (g.id, auth.uid(), p_me);
  return g;
end; $$;

-- ---------- find a registered user by exact email ----------
create or replace function public.find_user_by_email(p_email text)
returns table (id uuid, display_name text)
language sql security definer set search_path = public as $$
  select id, display_name from profiles where lower(email) = lower(trim(p_email)) limit 1;
$$;

-- ---------- let any group member add other registered users ----------
drop policy if exists gm_insert on group_members;
create policy gm_insert on group_members for insert
  with check (user_id = auth.uid() or is_group_member(group_id));
