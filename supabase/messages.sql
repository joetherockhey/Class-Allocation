-- Message board under each tutorial group. Run once in the Supabase SQL editor.
-- Anyone can read and post; nobody can edit or delete from the browser, so a
-- message cannot be quietly changed or removed by another student.

create table if not exists messages (
  id          uuid primary key default gen_random_uuid(),
  tutorial_id text not null references tutorials(id) on delete cascade,
  name        text not null check (length(trim(name)) between 1 and 60),
  body        text not null check (length(trim(body)) between 1 and 500),
  created_at  timestamptz not null default now()
);
create index if not exists messages_tutorial_idx on messages(tutorial_id, created_at);

alter table messages enable row level security;

drop policy if exists read_messages on messages;
drop policy if exists post_messages on messages;

create policy read_messages on messages for select to anon, authenticated using (true);
create policy post_messages on messages for insert to anon, authenticated with check (true);
