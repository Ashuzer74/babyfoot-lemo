-- BabyFoot LEMO - Base Supabase partagée
-- À exécuter dans Supabase > SQL Editor > Run.

create table if not exists public.babyfoot_state (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.babyfoot_state enable row level security;

grant select, insert, update on table public.babyfoot_state to anon;

drop policy if exists "babyfoot_state_select" on public.babyfoot_state;
drop policy if exists "babyfoot_state_insert" on public.babyfoot_state;
drop policy if exists "babyfoot_state_update" on public.babyfoot_state;

create policy "babyfoot_state_select"
on public.babyfoot_state
for select
to anon
using (true);

create policy "babyfoot_state_insert"
on public.babyfoot_state
for insert
to anon
with check (true);

create policy "babyfoot_state_update"
on public.babyfoot_state
for update
to anon
using (true)
with check (true);
