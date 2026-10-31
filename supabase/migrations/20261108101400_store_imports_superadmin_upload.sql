-- The superadmin can open the Excel import of any store (requireCatalogAccess), but store-imports only let its admins
-- upload, so the file failed for the platform. Insert only, and only inside a store's imports folder: the server reads
-- the file with the service client, so no read policy is needed.

create policy "store-imports: superadmin insert in any store"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'store-imports'
  and (select private.is_superadmin())
  and (storage.foldername(name))[3] = 'imports'
  and private.storage_store_id(name) is not null
);
