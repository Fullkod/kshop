-- Realtime signals (2026-10-27): a write to orders, order events, WhatsApp notices, platform invoices or stores
-- broadcasts a bare signal (table and operation, no row data; realtime.send adds its own message id). The staff of store A receives only the topic of A, the
-- superadmin every topic, a customer or anon no private topic at all, and nobody can broadcast on a private topic.

-- ---------------------------------------------------------------------------
-- Fixtures (as the database owner)
-- ---------------------------------------------------------------------------

select tests.create_user('owner_a');
select tests.create_user('owner_b');
select tests.create_user('super', '{"role": "superadmin"}');
select tests.create_user('cust_a', '{"kind": "customer"}');

insert into pg_temp.fixtures (key, id)
select 'store_a', (public.create_store(
  'Realtime A', 'realtime-a', tests.fx('owner_a'), 'CUP', 'RA', '5351111111', 'base', 0, 'kshop.fullkod.com', null)).id;
insert into pg_temp.fixtures (key, id)
select 'store_b', (public.create_store(
  'Realtime B', 'realtime-b', tests.fx('owner_b'), 'CUP', 'RB', '5352222222', 'base', 0, 'kshop.fullkod.com', null)).id;

with x as (
  insert into public.orders (store_id, number, currency, subtotal, customer_name, customer_phone, warehouse_id)
  select tests.fx('store_a'), 1, 'CUP', 100, 'Cliente', '+5350000001', w.id
  from public.warehouses w where w.store_id = tests.fx('store_a') limit 1
  returning id
) insert into pg_temp.fixtures select 'order_a', id from x;
update public.orders set status = 'cancelled' where id = tests.fx('order_a');
insert into public.notification_log (store_id, audience, event, recipient, message, status)
values (tests.fx('store_b'), 'store', 'test', '+5350000002', 'x', 'simulated');

-- ---------------------------------------------------------------------------
-- Signals (only this transaction's: the table keeps the real ones of the last days)
-- ---------------------------------------------------------------------------

select tests.eq('an order of A signals its store topic (insert and update), without row data', (
  select string_agg((payload - 'id')::text, ' ' order by payload ->> 'op') from realtime.messages
  where topic = 'store:' || tests.fx('store_a') and payload ->> 'table' = 'orders'),
  '{"op": "insert", "table": "orders"} {"op": "update", "table": "orders"}');
select tests.check('the order page topic is public and carries only the status', exists (
  select 1 from realtime.messages m join public.orders o on m.topic = 'order:' || o.public_token
  where o.id = tests.fx('order_a') and not m.private and m.payload - 'id' = '{"status": "cancelled"}'));
select tests.check('a WhatsApp notice of B signals the topic of B and the platform', (
  select count(*) from realtime.messages
  where private and payload ->> 'table' = 'notification_log'
    and topic in ('store:' || tests.fx('store_b'), 'platform')
    and inserted_at >= now() at time zone 'utc') = 2);

-- ---------------------------------------------------------------------------
-- Isolation (realtime.topic() is what the Realtime server sets for the channel being joined)
-- ---------------------------------------------------------------------------

create function pg_temp.receives(p_topic text) returns boolean
language plpgsql as $$
begin
  perform set_config('realtime.topic', p_topic, true);
  return exists (select 1 from realtime.messages where topic = p_topic and extension = 'broadcast');
end;
$$;

select tests.login('owner_a');
select tests.check('staff of A receives the topic of A', pg_temp.receives('store:' || tests.fx('store_a')));
select tests.check('staff of A does not receive the topic of B', not pg_temp.receives('store:' || tests.fx('store_b')));
select tests.check('staff of A does not receive the platform topic', not pg_temp.receives('platform'));
select tests.check('staff of A cannot broadcast on a private topic', tests.throws(format(
  $$insert into realtime.messages (topic, extension, payload, event, private)
    values (%L, 'broadcast', '{}', 'change', true)$$, 'store:' || tests.fx('store_b'))));
select tests.logout();

select tests.login('cust_a');
select tests.check('a customer receives no private store topic', not pg_temp.receives('store:' || tests.fx('store_a')));
select tests.logout();

select tests.login('super');
select tests.check('the superadmin receives every store and the platform',
  pg_temp.receives('store:' || tests.fx('store_a')) and pg_temp.receives('store:' || tests.fx('store_b'))
  and pg_temp.receives('platform'));
select tests.logout();

select tests.login_anon();
select tests.check('anon receives no private topic', not pg_temp.receives('store:' || tests.fx('store_a')));
select tests.logout();
