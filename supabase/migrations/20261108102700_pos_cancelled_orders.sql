-- The phone's «Hoy en este teléfono» only knew the sales voided on the phone itself. A sale already uploaded is an
-- order, and cancelling that order (from the order page, on any phone or the web) did not reach the phone, so its
-- total kept counting it (Minimercado, 2026-11-07: 3 sales, 9750 CUP above «Vendido hoy»).
--
-- admin_pos_cancelled_orders: of the orders the phone uploaded, the ones cancelled now. Security invoker: the RLS of
-- orders keeps it to the stores of the caller (any member, staff included: they sold them).

create or replace function public.admin_pos_cancelled_orders(p_store_id uuid, p_order_ids uuid[])
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(jsonb_agg(o.id), '[]'::jsonb)
  from public.orders o
  where o.store_id = p_store_id
    and o.id = any(p_order_ids[1:500])
    and o.status = 'cancelled';
$$;

revoke execute on function public.admin_pos_cancelled_orders(uuid, uuid[]) from public, anon;
grant execute on function public.admin_pos_cancelled_orders(uuid, uuid[]) to authenticated;
