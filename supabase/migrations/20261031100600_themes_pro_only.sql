-- Roberto (2026-10-25): the store look (Apariencia: theme, home, banners, menus, pages) is set up by the platform,
-- not by the store, so it needs Kshop and the store does not carry that responsibility. «themes» leaves Base (Pro
-- keeps it; the superadmin can give it to one store as a grant, and always edits any store from the server side).
-- Data is kept: a Base store keeps showing the look the superadmin set up.

delete from public.plan_modules
where module_code = 'themes' and plan_id = (select id from public.plans where code = 'base');

update public.modules set addon_price = null, addon_currency = null where code = 'themes';

select private.sync_plan_modules(s.store_id)
from public.subscriptions s join public.plans p on p.id = s.plan_id
where p.code = 'base';

-- Same name as in the admin menu.
update public.modules set name = 'Apariencia',
  description = 'Tema, portada, banners, menús y páginas de la tienda.'
where code = 'themes';
