-- SplitIt schema. Paste ALL of this into Supabase -> SQL Editor -> Run.
-- Money is stored as integer cents everywhere. RLS: you only see groups you belong to.

-- ---------- tables ----------
create table if not exists groups (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  currency   text not null default '$',
  join_code  text not null unique default upper(substr(md5(random()::text), 1, 6)),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists group_members (
  id           uuid primary key default gen_random_uuid(),
  group_id     uuid not null references groups(id) on delete cascade,
  user_id      uuid not null references auth.users(id),
  display_name text not null,
  created_at   timestamptz not null default now(),
  unique (group_id, user_id)
);

create table if not exists expenses (
  id          uuid primary key default gen_random_uuid(),
  group_id    uuid not null references groups(id) on delete cascade,
  description text not null,
  amount_cents integer not null check (amount_cents > 0),
  paid_by     uuid not null references auth.users(id),
  category    text not null default 'general',
  created_by  uuid not null references auth.users(id),
  created_at  timestamptz not null default now()
);

create table if not exists expense_splits (
  id         uuid primary key default gen_random_uuid(),
  expense_id uuid not null references expenses(id) on delete cascade,
  group_id   uuid not null references groups(id) on delete cascade, -- denormalized for simple RLS
  member_id  uuid not null references auth.users(id),
  owed_cents integer not null
);

create table if not exists settlements (
  id          uuid primary key default gen_random_uuid(),
  group_id    uuid not null references groups(id) on delete cascade,
  from_member uuid not null references auth.users(id),
  to_member   uuid not null references auth.users(id),
  amount_cents integer not null check (amount_cents > 0),
  created_at  timestamptz not null default now()
);

create table if not exists messages (
  id           uuid primary key default gen_random_uuid(),
  group_id     uuid not null references groups(id) on delete cascade,
  user_id      uuid not null references auth.users(id),
  display_name text not null,
  body         text not null,
  created_at   timestamptz not null default now()
);

-- ---------- membership helper (SECURITY DEFINER avoids RLS recursion on group_members) ----------
create or replace function public.is_group_member(gid uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from group_members where group_id = gid and user_id = auth.uid());
$$;

-- join a group by its share code (runs with definer rights so you can find a group you're not in yet)
create or replace function public.join_group(p_code text, p_name text)
returns uuid language plpgsql security definer set search_path = public as $$
declare gid uuid;
begin
  select id into gid from groups where join_code = upper(p_code);
  if gid is null then raise exception 'No group with that code'; end if;
  insert into group_members (group_id, user_id, display_name)
  values (gid, auth.uid(), p_name)
  on conflict (group_id, user_id) do update set display_name = excluded.display_name;
  return gid;
end; $$;

-- ---------- row level security ----------
alter table groups         enable row level security;
alter table group_members  enable row level security;
alter table expenses       enable row level security;
alter table expense_splits enable row level security;
alter table settlements    enable row level security;
alter table messages       enable row level security;

-- groups
create policy groups_select on groups for select using (is_group_member(id));
create policy groups_insert on groups for insert with check (created_by = auth.uid());
create policy groups_update on groups for update using (created_by = auth.uid());

-- group_members
create policy gm_select on group_members for select using (is_group_member(group_id));
create policy gm_insert on group_members for insert with check (user_id = auth.uid());
create policy gm_delete on group_members for delete using (user_id = auth.uid());

-- expenses
create policy exp_select on expenses for select using (is_group_member(group_id));
create policy exp_insert on expenses for insert with check (is_group_member(group_id) and created_by = auth.uid());
create policy exp_delete on expenses for delete using (is_group_member(group_id));

-- expense_splits
create policy spl_select on expense_splits for select using (is_group_member(group_id));
create policy spl_insert on expense_splits for insert with check (is_group_member(group_id));
create policy spl_delete on expense_splits for delete using (is_group_member(group_id));

-- settlements
create policy set_select on settlements for select using (is_group_member(group_id));
create policy set_insert on settlements for insert with check (is_group_member(group_id));

-- messages
create policy msg_select on messages for select using (is_group_member(group_id));
create policy msg_insert on messages for insert with check (is_group_member(group_id) and user_id = auth.uid());

-- ---------- realtime ----------
alter publication supabase_realtime add table expenses;
alter publication supabase_realtime add table expense_splits;
alter publication supabase_realtime add table settlements;
alter publication supabase_realtime add table group_members;
alter publication supabase_realtime add table messages;
