-- Redesign v2 (PRP-R, R5): seven new home section types and two new banner fields for the split hero.
-- No new tables: home_sections and banners keep their RLS (scheduled + active store, all for staff). The new values
-- of the enum cannot be used in this same transaction, so default sections and the demo seed write them later.

alter type public.home_section_type add value if not exists 'announcement_bar';
alter type public.home_section_type add value if not exists 'benefits';
alter type public.home_section_type add value if not exists 'banner_mosaic';
alter type public.home_section_type add value if not exists 'offer_countdown';
alter type public.home_section_type add value if not exists 'featured_product';
alter type public.home_section_type add value if not exists 'collection_cards';
alter type public.home_section_type add value if not exists 'testimonials';

-- Hero: a short pill above the title («Nueva temporada») and a product shown in a floating mini card. The composite
-- FK keeps the product in the banner's store; deleting the product only clears the link.
alter table public.banners
  add column eyebrow text check (char_length(eyebrow) <= 40),
  add column product_id uuid,
  add constraint banners_product_fkey foreign key (store_id, product_id)
    references public.products (store_id, id) on delete set null (product_id);

create index banners_product_idx on public.banners (store_id, product_id) where product_id is not null;
