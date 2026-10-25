-- Advisors: covering indexes for the composite foreign keys of the discounts schema.
create index promotion_targets_promotion_idx on public.promotion_targets (store_id, promotion_id);
create index variant_promotions_variant_idx on public.variant_promotions (store_id, variant_id);
create index voucher_usages_order_idx on public.voucher_usages (store_id, order_id);
