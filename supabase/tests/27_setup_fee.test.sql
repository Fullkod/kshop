-- KSH0023: the one-time setup fee goes on the first invoice of a new store only, never takes a percentage discount,
-- moves to the next invoice when that one is voided, cannot be changed once invoiced and stays hidden from the
-- store's own users (the subscription columns they read are listed one by one).

select tests.create_user('owner_s');
select tests.create_user('owner_t');

update private.platform_config set value = '"dry_run"' where key = 'whatsapp_mode';

insert into pg_temp.fixtures (key, id)
select 'store_s', (public.create_store(
  'Puesta S', 'puesta-s', tests.fx('owner_s'), 'CUP', 'PS', '+5351111111', 'base', 0, 'kshop.fullkod.com', null)).id;
insert into pg_temp.fixtures (key, id)
select 'store_t', (public.create_store(
  'Puesta T', 'puesta-t', tests.fx('owner_t'), 'CUP', 'PT', '+5352222222', 'base', 0, 'kshop.fullkod.com', null)).id;

create function pg_temp.setup_lines(p_quote jsonb) returns int language sql as $$
  select count(*)::int from jsonb_array_elements(p_quote -> 'lines') l(item) where (l.item ->> 'setup')::boolean;
$$;
create function pg_temp.plan_amount(p_store text) returns numeric language sql as $$
  select (public.subscription_quote(tests.fx(p_store)) -> 'lines' -> 0 ->> 'amount')::numeric;
$$;
create function pg_temp.invoice_setup_lines(p_invoice uuid) returns int language sql as $$
  select count(*)::int from public.platform_invoice_lines
  where invoice_id = p_invoice and description like 'Puesta en marcha%';
$$;

select tests.eq('platform setting', (public.platform_billing_get() ->> 'setup_fee_usd')::numeric, 5::numeric);

-- A store without a setup fee (every store created before KSH0023) never gets one.
select tests.eq('no fee, no line', pg_temp.setup_lines(public.subscription_quote(tests.fx('store_t'))), 0);

select public.subscription_update(tests.fx('store_s'), '{"setup_fee": 5}', null);
select tests.eq('fee in the quote', pg_temp.setup_lines(public.subscription_quote(tests.fx('store_s'))), 1);
select tests.eq('total = plan + fee', (public.subscription_quote(tests.fx('store_s')) ->> 'total')::numeric,
  pg_temp.plan_amount('store_s') + 5);

-- A 50 % discount applies to the plan only.
insert into public.subscription_grants (store_id, type, value, reason)
values (tests.fx('store_s'), 'discount_percent', 50, 'Prueba');
select tests.eq('discount leaves the fee out', (public.subscription_quote(tests.fx('store_s')) ->> 'discount')::numeric,
  round(pg_temp.plan_amount('store_s') * 0.5, 2));
update public.subscription_grants set revoked_at = now() where store_id = tests.fx('store_s');

-- The first invoice carries it, and the subscription remembers which one.
select public.platform_invoice_issue(tests.fx('store_s'), null);
insert into pg_temp.fixtures (key, id)
select 'inv_1', id from public.platform_invoices where store_id = tests.fx('store_s') and status <> 'void';
select tests.eq('first invoice has the fee', pg_temp.invoice_setup_lines(tests.fx('inv_1')), 1);
select tests.eq('first invoice total', (select total from public.platform_invoices where id = tests.fx('inv_1')),
  pg_temp.plan_amount('store_s') + 5);
select tests.eq('invoice remembered',
  (select setup_fee_invoice_id from public.subscriptions where store_id = tests.fx('store_s')), tests.fx('inv_1'));
select tests.eq('next quote without the fee', pg_temp.setup_lines(public.subscription_quote(tests.fx('store_s'))), 0);

-- Once invoiced it is not changed here (same value is fine, the settings form sends it back).
select tests.check('cannot change once invoiced', tests.throws(format(
  $$select public.subscription_update(%L, '{"setup_fee": 7}', null)$$, tests.fx('store_s'))));
select tests.check('same value is accepted', not tests.throws(format(
  $$select public.subscription_update(%L, '{"setup_fee": 5}', null)$$, tests.fx('store_s'))));

-- Voiding that invoice puts the fee on the next one.
select public.platform_invoice_void(tests.fx('inv_1'), 'Prueba', null);
select tests.eq('back in the quote after void', pg_temp.setup_lines(public.subscription_quote(tests.fx('store_s'))), 1);
select public.platform_invoice_issue(tests.fx('store_s'), null);
select tests.eq('reissued invoice has the fee', pg_temp.invoice_setup_lines((select id from public.platform_invoices
  where store_id = tests.fx('store_s') and status <> 'void')), 1);

-- 0 or null removes a fee not invoiced yet.
select public.subscription_update(tests.fx('store_t'), '{"setup_fee": 5}', null);
select public.subscription_update(tests.fx('store_t'), '{"setup_fee": 0}', null);
select tests.eq('0 removes it', (select setup_fee from public.subscriptions where store_id = tests.fx('store_t')), null::numeric);

-- The store's users never read the fee columns directly (they see it in the quote the server gives them).
select tests.login('owner_s');
select tests.check('owner cannot read setup_fee', tests.throws('select setup_fee from public.subscriptions'));
select tests.check('owner cannot read setup_fee_invoice_id',
  tests.throws('select setup_fee_invoice_id from public.subscriptions'));
select tests.check('owner cannot quote', tests.throws(format(
  $$select public.subscription_quote(%L)$$, tests.fx('store_s'))));
select tests.logout();
