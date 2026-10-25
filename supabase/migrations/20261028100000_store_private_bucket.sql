-- Private bucket for store files that must not be public (payment evidence). Same path convention as
-- store-media (stores/{store_id}/...); only the staff of that store reads, uploads or deletes. Files are
-- shown through short-lived signed URLs created by the staff client.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('store-private', 'store-private', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "store-private: staff read own store"
on storage.objects for select
to authenticated
using (
  bucket_id = 'store-private'
  and (select private.has_store_role(private.storage_store_id(name), 'staff'))
);

create policy "store-private: staff insert in own store"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'store-private'
  and (select private.has_store_role(private.storage_store_id(name), 'staff'))
);

create policy "store-private: staff delete in own store"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'store-private'
  and (select private.has_store_role(private.storage_store_id(name), 'staff'))
);
