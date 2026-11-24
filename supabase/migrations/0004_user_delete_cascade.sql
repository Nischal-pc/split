-- Run in Supabase -> SQL Editor. Lets you delete an auth user: their rows cascade away.
-- Without this, deleting a user fails because these tables still reference them.

alter table groups
  drop constraint if exists groups_created_by_fkey,
  add  constraint groups_created_by_fkey foreign key (created_by) references auth.users(id) on delete cascade;

alter table group_members
  drop constraint if exists group_members_user_id_fkey,
  add  constraint group_members_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade;

alter table expenses
  drop constraint if exists expenses_paid_by_fkey,
  add  constraint expenses_paid_by_fkey foreign key (paid_by) references auth.users(id) on delete cascade,
  drop constraint if exists expenses_created_by_fkey,
  add  constraint expenses_created_by_fkey foreign key (created_by) references auth.users(id) on delete cascade;

alter table expense_splits
  drop constraint if exists expense_splits_member_id_fkey,
  add  constraint expense_splits_member_id_fkey foreign key (member_id) references auth.users(id) on delete cascade;

alter table settlements
  drop constraint if exists settlements_from_member_fkey,
  add  constraint settlements_from_member_fkey foreign key (from_member) references auth.users(id) on delete cascade,
  drop constraint if exists settlements_to_member_fkey,
  add  constraint settlements_to_member_fkey foreign key (to_member) references auth.users(id) on delete cascade;

alter table messages
  drop constraint if exists messages_user_id_fkey,
  add  constraint messages_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade;

-- comments table exists only after 0003_features.sql; skip the block if you haven't run that yet.
alter table comments
  drop constraint if exists comments_user_id_fkey,
  add  constraint comments_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade;

-- profiles already cascades (from 0002); nothing to change there.
