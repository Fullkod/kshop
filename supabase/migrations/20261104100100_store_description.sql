-- Redesign v2 (PRP-R, answer 8): short description of the store for the storefront footer, edited in Appearance.
alter table public.stores
  add column description text check (description is null or char_length(description) between 1 and 300);

-- Part of the public store card, like the name and the WhatsApp phone.
grant select (description) on public.stores to anon, authenticated;
