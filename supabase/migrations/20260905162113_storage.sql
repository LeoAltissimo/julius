-- Storage for category and subcategory images.
--
-- The bucket is private and every object must live under a folder named after
-- the owner's user id, so a leaked object URL is worthless without a session.
-- The app reads these through short lived signed URLs.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'category-images',
  'category-images',
  false,
  2 * 1024 * 1024,
  array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']
)
on conflict (id) do nothing;

create policy "category images are readable by their owner"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'category-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "category images are insertable by their owner"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'category-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "category images are updatable by their owner"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'category-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'category-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "category images are deletable by their owner"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'category-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
