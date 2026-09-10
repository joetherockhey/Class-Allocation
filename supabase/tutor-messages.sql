-- "Message Joe" box on the groups page. Run once in the Supabase SQL editor.
--
-- Students can post, and nobody can edit or delete. Reads are open, because the
-- dashboard is a static page holding only the public key - anything it can read,
-- a determined student could also read. If that matters more than having the
-- messages on the dashboard, run the two lines at the bottom to close reads and
-- use `npm run inbox` instead, which reads them with the secret key.

create table if not exists tutor_messages (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (length(trim(name)) between 1 and 60),
  body       text not null check (length(trim(body)) between 1 and 1000),
  created_at timestamptz not null default now(),
  handled    boolean not null default false
);
create index if not exists tutor_messages_new_idx on tutor_messages(created_at desc);

alter table tutor_messages enable row level security;

drop policy if exists post_tutor_messages on tutor_messages;
drop policy if exists read_tutor_messages on tutor_messages;

create policy post_tutor_messages on tutor_messages
  for insert to anon, authenticated with check (true);
create policy read_tutor_messages on tutor_messages
  for select to anon, authenticated using (true);

-- To make messages private to you, run these two lines instead of the last one:
--   drop policy if exists read_tutor_messages on tutor_messages;
--   create policy read_tutor_messages on tutor_messages
--     for select to anon, authenticated using (false);
