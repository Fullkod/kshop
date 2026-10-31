-- KSH0002: change given in the paid currency could leave an order paid a few pesos over its total, because of the
-- cents of that currency at the agreed rate.

create or replace function public.order_record_payment(p_store_id uuid, p_order_id uuid, p_input jsonb, p_user_id uuid)
returns public.payments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
  v_payment public.payments;
  v_amount numeric := round((p_input ->> 'amount')::numeric, 2);
  v_method uuid := private.try_uuid(p_input ->> 'payment_method_id');
  v_currency public.currency_code;
  v_rate numeric := 1;
  v_change numeric := round((p_input ->> 'change_amount')::numeric, 2);
  v_change_currency public.currency_code := nullif(p_input ->> 'change_currency', '')::public.currency_code;
  v_applied numeric;
  v_remaining numeric;
begin
  select * into v_order from public.orders where id = p_order_id and store_id = p_store_id for update;
  if not found then
    raise exception 'Pedido no encontrado' using errcode = 'P0001', hint = 'not_found';
  end if;
  if v_order.status = 'cancelled' then
    raise exception 'El pedido está cancelado' using errcode = 'P0001', hint = 'invalid_transition';
  end if;
  if v_amount is null or v_amount <= 0 then
    raise exception 'El monto no es válido' using errcode = 'P0001', hint = 'invalid_input';
  end if;
  if v_method is not null and not exists (
    select 1 from public.payment_methods where id = v_method and store_id = p_store_id
  ) then
    raise exception 'El método de pago no existe' using errcode = 'P0001', hint = 'invalid_input';
  end if;

  v_currency := coalesce(nullif(p_input ->> 'currency', '')::public.currency_code, v_order.currency);
  if v_currency <> v_order.currency then
    v_rate := (p_input ->> 'rate')::numeric;
    if v_rate is null or v_rate <= 0 then
      raise exception 'La tasa no es válida' using errcode = 'P0001', hint = 'invalid_input';
    end if;
  end if;

  if v_change = 0 then
    v_change := null;
  end if;
  if (v_change is null) <> (v_change_currency is null) or v_change < 0
    or v_change_currency not in (v_order.currency, v_currency) then
    raise exception 'El vuelto no es válido' using errcode = 'P0001', hint = 'invalid_input';
  end if;

  v_applied := case
    when v_change is not null and v_change_currency = v_order.currency then round(v_amount * v_rate, 2) - v_change
    else round((v_amount - coalesce(v_change, 0)) * v_rate, 2)
  end;
  if v_applied <= 0 then
    raise exception 'El vuelto no puede superar lo cobrado' using errcode = 'P0001', hint = 'invalid_input';
  end if;
  -- A rate never lands exactly on the cent: within one cent of the balance, the payment settles it.
  v_remaining := v_order.total - v_order.paid_total;
  -- Change in the paid currency only has its cents: one cent of it can be worth several of the order (8,50 CUP at 850).
  if v_currency <> v_order.currency and v_remaining > 0 and abs(v_applied - v_remaining) <=
    (case when v_change_currency = v_currency then greatest(0.01, round(v_rate * 0.01, 2)) else 0.01 end) then
    v_applied := v_remaining;
  end if;

  insert into public.payments (store_id, order_id, payment_method_id, amount, currency, applied_amount, rate_to_order,
    change_amount, change_currency, reference, evidence_path, recorded_by)
  values (p_store_id, v_order.id, v_method, v_amount, v_currency, v_applied, v_rate, v_change, v_change_currency,
    nullif(btrim(coalesce(p_input ->> 'reference', '')), ''), nullif(p_input ->> 'evidence_path', ''), p_user_id)
  returning * into v_payment;
  perform private.refresh_order_payment(v_order.id);

  insert into public.order_events (store_id, order_id, type, payload, user_id)
  values (p_store_id, v_order.id, 'payment_recorded',
    jsonb_build_object('amount', v_amount, 'currency', v_currency, 'applied', v_applied, 'payment_id', v_payment.id),
    p_user_id);

  return v_payment;
end;
$$;
