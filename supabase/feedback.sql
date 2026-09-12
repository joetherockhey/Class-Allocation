-- Feedback from the students who watched a talk. Run once in the Supabase SQL
-- editor. Re-runnable.
--
-- Anonymous on purpose: the audience is BUS1000 first-years who are not on our
-- roster, and unsigned feedback is more honest. That also means there is no
-- real way to stop someone submitting twice - the form keeps a note in their
-- browser, which is a speed bump, not a lock.
--
-- Insert and select are open, like the feed: the results are meant to be on the
-- home page, and anything the page can read a determined student could read
-- too. Nothing is updatable or deletable by anon, so feedback cannot be edited
-- away after the fact.

create table if not exists feedback (
  id          uuid primary key default gen_random_uuid(),
  tutorial_id text not null references tutorials(id) on delete cascade,
  -- 0-10 each, null when the student left that slider alone
  useful      smallint check (useful    between 0 and 10),
  clear       smallint check (clear     between 0 and 10),
  engaging    smallint check (engaging  between 0 and 10),
  confident   smallint check (confident between 0 and 10),
  comment     text check (length(trim(comment)) between 1 and 1000),
  created_at  timestamptz not null default now()
);
create index if not exists feedback_tut_idx on feedback(tutorial_id, created_at desc);

alter table feedback enable row level security;

drop policy if exists "read_feedback"  on feedback;
drop policy if exists "write_feedback" on feedback;

create policy "read_feedback"  on feedback for select to anon, authenticated using (true);
create policy "write_feedback" on feedback for insert to anon, authenticated with check (true);

-- Nothing may be changed or removed once it is in.
revoke update, delete on feedback from anon, authenticated;
