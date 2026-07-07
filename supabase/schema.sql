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

-- ============================================================================
-- MULTI-USER / MULTI-DEVICE VARIANT (copy-paste to tighten the demo above)
-- ============================================================================
--
-- The anon-full-access policies above are appropriate ONLY for a single-user,
-- self-hosted project. For a shared project where each person signs in (so one
-- key can't read another user's data), scope every row to the authenticated
-- user. This is a drop-in tightening because the client already sends a
-- per-record UUID `id`; here we add a `user_id` column that defaults to the
-- caller's `auth.uid()` and scope all policies to it.
--
-- To adopt it: run `see_multi_user.sql` steps below INSTEAD of the anon
-- policies (drop those first), and have the app sign the user in so the
-- Supabase client sends a real JWT. (FitFlow's client uses the anon key with
-- `persistSession:false`; wiring email/OAuth sign-in is a small follow-up.)
--
--   -- 1. Add an owner column defaulting to the caller.
--   alter table public.workouts  add column if not exists user_id uuid default auth.uid();
--   alter table public.exercises add column if not exists user_id uuid default auth.uid();
--   alter table public.routines  add column if not exists user_id uuid default auth.uid();
--
--   -- 2. Index it for fast per-user delta queries.
--   create index if not exists workouts_user_idx  on public.workouts  (user_id, updated_at);
--   create index if not exists exercises_user_idx on public.exercises (user_id, updated_at);
--   create index if not exists routines_user_idx  on public.routines  (user_id, updated_at);
--
--   -- 3. Replace the anon policies with owner-scoped ones (example: workouts).
--   drop policy if exists anon_all_workouts on public.workouts;
--   create policy own_workouts on public.workouts
--     for all
--     using (user_id = auth.uid())
--     with check (user_id = auth.uid());
--   -- ...repeat for exercises and routines.
