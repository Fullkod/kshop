-- Backfill the effective product summary (on_sale, promotion prices) of every existing product.
select private.refresh_store_promotions(id) from public.stores;
