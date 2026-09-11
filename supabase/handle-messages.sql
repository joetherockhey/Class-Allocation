-- Let the dashboard tick a student message as dealt with.
--
-- Only the handled flag is writable: the table-level UPDATE grant is dropped
-- first, because a column grant cannot narrow one that is already there. Worst
-- case someone ticks a box they should not have, which un-ticks again.

revoke update on tutor_messages from anon, authenticated;
grant update (handled) on tutor_messages to anon, authenticated;

drop policy if exists "handle_tutor_messages" on tutor_messages;
create policy "handle_tutor_messages" on tutor_messages
  for update to anon, authenticated using (true) with check (true);
