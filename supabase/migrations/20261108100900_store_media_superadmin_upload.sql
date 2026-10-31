-- The superadmin sets up the look of any store (requireContentAccess), but store-media only let members upload, so
-- banners and logos failed for the platform. Insert only, and only inside a store's folder.

create policy "store-media: superadmin insert in any store"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'store-media'
  and (select private.is_superadmin())
  and private.storage_store_id(name) is not null
);
