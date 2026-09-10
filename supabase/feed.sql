-- Class feed on the home page: posts, likes, comments, and file uploads.
-- Run once in the Supabase SQL editor.

create table if not exists posts (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (length(trim(name)) between 1 and 60),
  body       text not null check (length(trim(body)) between 1 and 2000),
  file_url   text,
  file_name  text,
  file_kind  text,                       -- 'image' or 'file'
  created_at timestamptz not null default now()
);
create index if not exists posts_new_idx on posts(created_at desc);

create table if not exists post_comments (
  id         uuid primary key default gen_random_uuid(),
  post_id    uuid not null references posts(id) on delete cascade,
  name       text not null check (length(trim(name)) between 1 and 60),
  body       text not null check (length(trim(body)) between 1 and 600),
  created_at timestamptz not null default now()
);
create index if not exists post_comments_idx on post_comments(post_id, created_at);

-- One like per person per post. No accounts, so "who" is the name they typed;
-- the primary key stops the same name liking twice.
create table if not exists post_likes (
  post_id    uuid not null references posts(id) on delete cascade,
  who        text not null check (length(trim(who)) between 1 and 60),
  created_at timestamptz not null default now(),
  primary key (post_id, who)
);

alter table posts         enable row level security;
alter table post_comments enable row level security;
alter table post_likes    enable row level security;

drop policy if exists "read_posts"     on posts;
drop policy if exists "write_posts"    on posts;
drop policy if exists "read_comments"  on post_comments;
drop policy if exists "write_comments" on post_comments;
drop policy if exists "read_likes"     on post_likes;
drop policy if exists "write_likes"    on post_likes;
drop policy if exists "remove_likes" on post_likes;

create policy "read_posts"     on posts         for select to anon, authenticated using (true);
create policy "write_posts"    on posts         for insert to anon, authenticated with check (true);
create policy "read_comments"  on post_comments for select to anon, authenticated using (true);
create policy "write_comments" on post_comments for insert to anon, authenticated with check (true);
create policy "read_likes"     on post_likes    for select to anon, authenticated using (true);
create policy "write_likes"    on post_likes    for insert to anon, authenticated with check (true);
-- liking is the one thing that can be undone
create policy "remove_likes" on post_likes    for delete to anon, authenticated using (true);

-- ------------------------------------------------------------------ uploads
insert into storage.buckets (id, name, public, file_size_limit)
values ('uploads', 'uploads', true, 10485760)
on conflict (id) do update set public = true, file_size_limit = 10485760;

drop policy if exists "uploads_read"   on storage.objects;
drop policy if exists "uploads_write"  on storage.objects;

create policy "uploads_read"  on storage.objects
  for select to anon, authenticated using (bucket_id = 'uploads');
create policy "uploads_write" on storage.objects
  for insert to anon, authenticated with check (bucket_id = 'uploads');
