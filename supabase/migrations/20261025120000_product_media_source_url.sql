-- Images imported from an Excel URL remember where they came from, so re-importing the same file does not
-- download them again. The source URL can reveal a supplier: it stays out of public reads (column grants).

alter table public.product_media add column source_url text;

create index product_media_source_idx on public.product_media (store_id, product_id, source_url)
  where source_url is not null;

revoke select on public.product_media from anon, authenticated;
grant select (id, store_id, product_id, storage_key, url, thumb_url, alt, type, sort_order, created_at)
  on public.product_media to anon, authenticated;
