-- Fix: the earlier column-level revoke had no effect.
--
-- In Postgres a column-level REVOKE cannot subtract from a table-level grant,
-- and anon already held SELECT on the whole table. The table grant has to go
-- first, then SELECT is granted back column by column - leaving edit_token out.

revoke select on posts from anon, authenticated;

grant select (id, name, body, file_url, file_name, file_kind, created_at, edited_at)
  on posts to anon, authenticated;
