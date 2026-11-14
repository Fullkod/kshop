-- The sales of a closing and of a product (Minimercado, 2026-11-14): Caja › Cierres opens each closing's sales with
-- their lines (to filter them by product on the phone), pages back to older closings, and finds the counter sales of
-- one product across all the closings. Reads only, security invoker: the RLS of pos_sales, orders, order_lines,
-- payments and pos_closings decides who sees what. No costs here (the profit stays in admin_pos_closings).

-- ---------------------------------------------------------------------------
-- One counter sale as a card: who, when, how much, how it was paid and its lines.
-- ---------------------------------------------------------------------------

create function private.pos_sale_card(p_store_id uuid, p_order_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'orderId', o.id,
    'number', o.number,
    'soldAt', s.sold_at,
    'day', (s.sold_at at time zone 'America/Havana')::date,
    'cashier', private.member_email(s.store_id, s.cashier_id),
    'cancelled', o.status = 'cancelled',
    'currency', o.currency,
    'total', o.total::text,
    'closingId', s.closing_id,
    'payments', coalesce((
      select jsonb_agg(distinct m.name)
      from public.payments p
      join public.payment_methods m on m.store_id = p.store_id and m.id = p.payment_method_id
      where p.store_id = p_store_id and p.order_id = o.id
    ), '[]'::jsonb),
    'lines', coalesce((
      select jsonb_agg(jsonb_build_object(
        'productId', l.product_id, 'name', l.product_name, 'variant', l.variant_name, 'sku', l.sku,
        'quantity', l.quantity::text, 'unit', l.unit, 'lineTotal', l.line_total::text
      ) order by l.sort_order, l.id)
      from public.order_lines l
      where l.store_id = p_store_id and l.order_id = o.id
    ), '[]'::jsonb)
  )
  from public.pos_sales s
  join public.orders o on o.store_id = s.store_id and o.id = s.order_id
  where s.store_id = p_store_id and s.order_id = p_order_id;
$$;

revoke all on function private.pos_sale_card(uuid, uuid) from public, anon;
grant execute on function private.pos_sale_card(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Closings, now pageable: p_before (a Cuban day, exclusive) moves the window of p_days back. Same shape as
-- 20261108102600 plus 'before' (the p_before of the next page) and 'hasOlder'.
-- ---------------------------------------------------------------------------

drop function public.admin_pos_closings(uuid, int);

create function public.admin_pos_closings(p_store_id uuid, p_days int default 30, p_before date default null)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with w as (
    select v_end, v_end - least(greatest(coalesce(p_days, 30), 1), 366) as v_start
    from (select coalesce(p_before, (now() at time zone 'America/Havana')::date + 1) as v_end) e
  )
  select jsonb_build_object(
    'float', coalesce(private.pos_float(p_store_id), '{}'::jsonb),
    'before', (select v_start from w),
    'hasOlder', exists (
      select 1 from public.pos_closings c where c.store_id = p_store_id and c.day < (select v_start from w)
    ),
    'closings', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id, 'day', c.day, 'sequence', c.sequence, 'cashier', private.member_email(c.store_id, c.cashier_id),
        'float', c.float, 'expected', c.expected, 'counted', c.counted, 'note', c.note, 'closedAt', c.closed_at,
        'orders', (select coalesce(jsonb_agg(jsonb_build_object('id', o.id, 'number', o.number,
            'cancelled', o.status = 'cancelled') order by s.sold_at), '[]'::jsonb)
          from public.pos_sales s join public.orders o on o.id = s.order_id where s.closing_id = c.id),
        -- null for the staff (costs are for owner and admin).
        'profit', private.closing_profit(c.store_id,
          array(select s.order_id from public.pos_sales s where s.closing_id = c.id))
      ) order by c.day desc, c.closed_at desc, c.sequence desc)
      from public.pos_closings c, w
      where c.store_id = p_store_id and c.day >= w.v_start and c.day < w.v_end
    ), '[]'::jsonb)
  );
$$;

revoke all on function public.admin_pos_closings(uuid, int, date) from public, anon;
grant execute on function public.admin_pos_closings(uuid, int, date) to authenticated;

-- ---------------------------------------------------------------------------
-- The sales of one closing with their lines. null when the closing is not of that store or not readable.
-- ---------------------------------------------------------------------------

create function public.admin_pos_closing_sales(p_store_id uuid, p_closing_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'closing', jsonb_build_object(
      'id', c.id, 'day', c.day, 'sequence', c.sequence,
      'cashier', private.member_email(c.store_id, c.cashier_id), 'closedAt', c.closed_at
    ),
    'sales', coalesce((
      select jsonb_agg(private.pos_sale_card(p_store_id, s.order_id) order by s.sold_at desc, s.order_id)
      from public.pos_sales s
      where s.store_id = p_store_id and s.closing_id = c.id
    ), '[]'::jsonb)
  )
  from public.pos_closings c
  where c.store_id = p_store_id and c.id = p_closing_id;
$$;

revoke all on function public.admin_pos_closing_sales(uuid, uuid) from public, anon;
grant execute on function public.admin_pos_closing_sales(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- The counter sales with one product (closed or not), by the Cuban day of the sale, p_days at a time going back
-- from p_before (exclusive). Each sale brings its closing (null = not closed yet).
-- ---------------------------------------------------------------------------

create function public.admin_pos_product_sales(
  p_store_id uuid, p_product_id uuid, p_days int default 30, p_before date default null
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with w as (
    select v_end, v_end - least(greatest(coalesce(p_days, 30), 1), 366) as v_start
    from (select coalesce(p_before, (now() at time zone 'America/Havana')::date + 1) as v_end) e
  ),
  hits as (
    select s.order_id, s.sold_at, s.closing_id, (s.sold_at at time zone 'America/Havana')::date as day
    from (select distinct l.order_id from public.order_lines l
          where l.store_id = p_store_id and l.product_id = p_product_id) l
    join public.pos_sales s on s.store_id = p_store_id and s.order_id = l.order_id
  )
  select jsonb_build_object(
    'product', (select jsonb_build_object('id', p.id, 'name', p.name)
                from public.products p where p.store_id = p_store_id and p.id = p_product_id),
    'before', (select v_start from w),
    'hasOlder', exists (select 1 from hits where hits.day < (select v_start from w)),
    'sales', coalesce((
      select jsonb_agg(private.pos_sale_card(p_store_id, h.order_id) || jsonb_build_object(
          'closingSequence', c.sequence, 'closingDay', c.day)
        order by h.sold_at desc, h.order_id)
      from hits h
      cross join w
      left join public.pos_closings c on c.store_id = p_store_id and c.id = h.closing_id
      where h.day >= w.v_start and h.day < w.v_end
    ), '[]'::jsonb)
  );
$$;

revoke all on function public.admin_pos_product_sales(uuid, uuid, int, date) from public, anon;
grant execute on function public.admin_pos_product_sales(uuid, uuid, int, date) to authenticated;
