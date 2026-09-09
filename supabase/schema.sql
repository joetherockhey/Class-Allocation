-- Tutorial group allocation - Supabase schema
-- Run this once in the Supabase SQL editor (Dashboard > SQL Editor > New query).
-- Safe to re-run: it drops and recreates everything.

drop table if exists allocations   cascade;
drop table if exists availability  cascade;
drop table if exists submissions   cascade;
drop table if exists students      cascade;
drop table if exists tutorials     cascade;
drop table if exists settings      cascade;

-- ---------------------------------------------------------------- tutorials
create table tutorials (
  id          text primary key,          -- short code, e.g. 'T01'
  label       text not null,             -- e.g. 'Tutorial 1'
  when_text   text not null,             -- e.g. 'Mon 15 Sep, 10:00-11:00'
  location    text default '',
  sort_order  int  not null default 0
);

-- ----------------------------------------------------------------- students
create table students (
  id      uuid primary key default gen_random_uuid(),
  name    text not null unique,
  is_vet  boolean not null default false
);

-- ------------------------------------------------------------- availability
-- One row per (student, tutorial they can attend). rank 1 = most preferred.
create table availability (
  student_id  uuid not null references students(id)  on delete cascade,
  tutorial_id text not null references tutorials(id) on delete cascade,
  rank        int  not null check (rank >= 1),
  primary key (student_id, tutorial_id)
);
create index availability_student_idx on availability(student_id);

-- -------------------------------------------------------------- submissions
create table submissions (
  student_id   uuid primary key references students(id) on delete cascade,
  submitted_at timestamptz not null default now(),
  note         text default ''
);

-- -------------------------------------------------------------- allocations
-- Written by scripts/publish.mjs (service-role key), never from the browser.
create table allocations (
  student_id  uuid primary key references students(id)  on delete cascade,
  group_no    int  not null,
  group_name  text default '',
  tutorial_id text references tutorials(id) on delete set null
);

-- ----------------------------------------------------------------- settings
create table settings (
  key   text primary key,
  value text not null
);
insert into settings (key, value) values
  ('results_published', 'false'),
  ('submissions_open',  'true'),
  ('deadline_text',     '');

-- ---------------------------------------------------------------------- RLS
-- The site is public and students identify themselves by picking a name, so
-- this is deliberately trusting. What it DOES protect: nobody can edit the
-- roster, the tutorial list, or the published allocations from the browser.
alter table tutorials    enable row level security;
alter table students     enable row level security;
alter table availability enable row level security;
alter table submissions  enable row level security;
alter table allocations  enable row level security;
alter table settings     enable row level security;

-- Read-only for everyone (seeded/updated locally with the service-role key)
create policy read_tutorials   on tutorials    for select to anon, authenticated using (true);
create policy read_students    on students     for select to anon, authenticated using (true);
create policy read_allocations on allocations  for select to anon, authenticated using (true);
create policy read_settings    on settings     for select to anon, authenticated using (true);

-- Students write their own preferences from the browser
create policy rw_availability on availability for all to anon, authenticated using (true) with check (true);
create policy rw_submissions  on submissions  for all to anon, authenticated using (true) with check (true);
