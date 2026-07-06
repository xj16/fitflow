-- FitFlow — Supabase schema
--
-- Run this once against your OWN Supabase project (free tier or self-hosted)
-- to enable optional cloud sync. FitFlow works 100% offline without it.
--
-- Design: each of the three collections is one table with a JSONB `data`
-- column holding the full record plus a few promoted columns for indexing and
-- conflict resolution. The client performs last-write-wins merging before it
-- pushes, so the server is a simple upsert store keyed on the client-generated
-- UUID `id`.
--
-- Apply via the Supabase SQL editor, or:
--   psql "$DATABASE_URL" -f supabase/schema.sql

create table if not exists public.workouts (
  id uuid primary key,
  updated_at timestamptz not null,
  deleted boolean not null default false,
  data jsonb not null,
  synced_at timestamptz not null default now()
);

create table if not exists public.exercises (
  id uuid primary key,
  updated_at timestamptz not null,
  deleted boolean not null default false,
  data jsonb not null,
  synced_at timestamptz not null default now()
);

create table if not exists public.routines (
  id uuid primary key,
  updated_at timestamptz not null,
  deleted boolean not null default false,
  data jsonb not null,
  synced_at timestamptz not null default now()
);

-- Helpful indexes for incremental sync queries.
create index if not exists workouts_updated_at_idx on public.workouts (updated_at);
create index if not exists exercises_updated_at_idx on public.exercises (updated_at);
create index if not exists routines_updated_at_idx on public.routines (updated_at);

-- Row Level Security.
--
-- The demo policies below allow the anonymous key full access, which is fine
-- for a SINGLE-USER, self-hosted project. For a multi-user deployment, add a
-- `user_id uuid` column defaulting to `auth.uid()` and scope every policy to
-- `user_id = auth.uid()` instead — the client already sends per-record ids so
-- this is a drop-in tightening.

alter table public.workouts  enable row level security;
alter table public.exercises enable row level security;
alter table public.routines  enable row level security;

do $$
begin
  -- workouts
  if not exists (select 1 from pg_policies where tablename = 'workouts' and policyname = 'anon_all_workouts') then
    create policy anon_all_workouts on public.workouts
      for all using (true) with check (true);
  end if;
  -- exercises
  if not exists (select 1 from pg_policies where tablename = 'exercises' and policyname = 'anon_all_exercises') then
    create policy anon_all_exercises on public.exercises
      for all using (true) with check (true);
  end if;
  -- routines
  if not exists (select 1 from pg_policies where tablename = 'routines' and policyname = 'anon_all_routines') then
    create policy anon_all_routines on public.routines
      for all using (true) with check (true);
  end if;
end $$;
