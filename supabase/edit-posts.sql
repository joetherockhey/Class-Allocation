-- Let people edit their own posts, without accounts.
--
-- Each post carries a secret token the browser generated and kept. Editing
-- requires sending that token as a request header, and the token column is
-- unreadable, so one student cannot discover another's and rewrite their post.

alter table posts add column if not exists edit_token text;
alter table posts add column if not exists edited_at  timestamptz;

-- the token must never come back out of the database
revoke select (edit_token) on posts from anon, authenticated;

drop policy if exists "edit_own_posts" on posts;
create policy "edit_own_posts" on posts
  for update to anon, authenticated
  using (
    edit_token is not null
    and edit_token = (current_setting('request.headers', true)::json ->> 'x-edit-token')
  )
  with check (
    edit_token is not null
    and edit_token = (current_setting('request.headers', true)::json ->> 'x-edit-token')
  );
