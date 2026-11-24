-- Run in Supabase -> SQL Editor AFTER schema.sql and 0002_people.sql.
-- Adds: expense dates, edit, remove/leave/delete, activity feed, comments.

-- ---------- expense date + edit ----------
alter table expenses add column if not exists spent_on date not null default current_date;

drop policy if exists exp_update on expenses;
create policy exp_update on expenses for update using (is_group_member(group_id)) with check (is_group_member(group_id));

-- ---------- remove members / leave / delete group ----------
drop policy if exists gm_delete on group_members;
create policy gm_delete on group_members for delete using (is_group_member(group_id)); -- any member can remove anyone; you leave by removing yourself

drop policy if exists groups_delete on groups;
create policy groups_delete on groups for delete using (created_by = auth.uid()); -- only the creator deletes the group

-- ---------- activity feed ----------
create table if not exists activity (
  id         uuid primary key default gen_random_uuid(),
  group_id   uuid not null references groups(id) on delete cascade,
  actor_name text not null,
  text       text not null,
  created_at timestamptz not null default now()
);
alter table activity enable row level security;
drop policy if exists act_select on activity;
create policy act_select on activity for select using (is_group_member(group_id));
drop policy if exists act_insert on activity;
create policy act_insert on activity for insert with check (is_group_member(group_id));

-- ---------- comments on an expense ----------
create table if not exists comments (
  id           uuid primary key default gen_random_uuid(),
  group_id     uuid not null references groups(id) on delete cascade,
  expense_id   uuid not null references expenses(id) on delete cascade,
  user_id      uuid not null references auth.users(id),
  display_name text not null,
  body         text not null,
  created_at   timestamptz not null default now()
);
alter table comments enable row level security;
drop policy if exists cmt_select on comments;
create policy cmt_select on comments for select using (is_group_member(group_id));
drop policy if exists cmt_insert on comments;
create policy cmt_insert on comments for insert with check (is_group_member(group_id) and user_id = auth.uid());

-- ---------- realtime ----------
alter publication supabase_realtime add table activity;
alter publication supabase_realtime add table comments;
