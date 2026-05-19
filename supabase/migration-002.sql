-- Migration 002: per-event crew password, welcome screen, image storage.
-- Run this in the Supabase SQL editor AFTER schema.sql.

-- 1. Per-event crew password.
alter table events
  add column if not exists crew_password text;

-- 2. Welcome / intro screen fields.
alter table event_templates
  add column if not exists intro_image_url text,
  add column if not exists welcome_title text,
  add column if not exists welcome_subtitle text;

-- 3. Storage bucket for product + intro images.
insert into storage.buckets (id, name, public)
values ('emboss-uploads', 'emboss-uploads', true)
on conflict (id) do nothing;

-- 4. Permissive storage policies for MVP. Tighten later for production.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'emboss_uploads_read'
  ) then
    create policy emboss_uploads_read
      on storage.objects for select
      using (bucket_id = 'emboss-uploads');
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'emboss_uploads_insert'
  ) then
    create policy emboss_uploads_insert
      on storage.objects for insert
      with check (bucket_id = 'emboss-uploads');
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'emboss_uploads_update'
  ) then
    create policy emboss_uploads_update
      on storage.objects for update
      using (bucket_id = 'emboss-uploads');
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'emboss_uploads_delete'
  ) then
    create policy emboss_uploads_delete
      on storage.objects for delete
      using (bucket_id = 'emboss-uploads');
  end if;
end$$;
