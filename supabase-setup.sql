-- BabyFoot LEMO - Setup Supabase
-- A executer dans Supabase > SQL Editor > New query > Run.
-- Ne pas importer de fichier dans Table Editor : ce script cree et corrige tout.

create table if not exists public.babyfoot_state (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.babyfoot_state enable row level security;

grant usage on schema public to anon, authenticated;
grant select, insert, update on table public.babyfoot_state to anon, authenticated;

drop policy if exists "babyfoot_state_select" on public.babyfoot_state;
drop policy if exists "babyfoot_state_insert" on public.babyfoot_state;
drop policy if exists "babyfoot_state_update" on public.babyfoot_state;

create policy "babyfoot_state_select"
on public.babyfoot_state
for select
to anon, authenticated
using (id = 'main');

create policy "babyfoot_state_insert"
on public.babyfoot_state
for insert
to anon, authenticated
with check (id = 'main');

create policy "babyfoot_state_update"
on public.babyfoot_state
for update
to anon, authenticated
using (id = 'main')
with check (id = 'main');

insert into public.babyfoot_state (id, data, updated_at)
values (
  'main',
  '{
    "players": ["Hugo", "Maxime", "Romain", "Giuseppe"],
    "standardMode": "1v1",
    "standardHistory": [],
    "tournamentConfig": {
      "mode": "1v1",
      "format": "knockout"
    },
    "tournament": null,
    "tournamentArchive": []
  }'::jsonb,
  now()
)
on conflict (id) do update
set
  data = coalesce(public.babyfoot_state.data, excluded.data),
  updated_at = public.babyfoot_state.updated_at;
