-- Phase 6.2 (D18, Roberto: yes): Excel columns «Precio {moneda}» (multi_currency) and «Stock {almacén}»
-- (multi_warehouse). Applied after import_product, only for the cells that have a value (an empty cell changes
-- nothing, like the rest of the import). p_variants: [{"sku": "...", "prices": {"USD": 10}, "stocks": {"<id>": 5}}].

create function public.import_variant_extras(p_store_id uuid, p_job_id uuid, p_variants jsonb, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item jsonb;
  v_variant_id uuid;
  v_price record;
  v_stock record;
  v_warehouse public.warehouses;
begin
  for v_item in select x from jsonb_array_elements(coalesce(p_variants, '[]')) x loop
    select v.id into v_variant_id from public.product_variants v
    where v.store_id = p_store_id and upper(v.sku) = upper(v_item ->> 'sku');
    continue when v_variant_id is null;

    -- Fixed price per sale currency (the variant_prices trigger requires multi_currency).
    for v_price in select key as currency, value::numeric as price from jsonb_each_text(coalesce(v_item -> 'prices', '{}'))
    loop
      if not exists (
        select 1 from public.store_currencies c
        where c.store_id = p_store_id and c.currency::text = v_price.currency and c.sells and not c.is_base
      ) then
        raise exception 'La tienda no vende en %', v_price.currency using errcode = 'P0001', hint = 'invalid_input';
      end if;
      insert into public.variant_prices (store_id, variant_id, currency, price)
      values (p_store_id, v_variant_id, v_price.currency::public.currency_code, v_price.price)
      on conflict (variant_id, currency) do update set price = excluded.price;
    end loop;

    for v_stock in select key as warehouse_id, value::int as quantity from jsonb_each_text(coalesce(v_item -> 'stocks', '{}'))
    loop
      select * into v_warehouse from public.warehouses
      where id = private.try_uuid(v_stock.warehouse_id) and store_id = p_store_id;
      if v_warehouse.id is null then
        raise exception 'El almacén no existe en esta tienda' using errcode = 'P0001', hint = 'invalid_reference';
      end if;
      if not v_warehouse.is_default then
        perform private.require_multi_warehouse(p_store_id);
      end if;
      perform public.set_stock_quantity(p_store_id, v_variant_id, v_warehouse.id, v_stock.quantity, 'import', null,
        p_user_id, p_job_id);
    end loop;
  end loop;
end;
$$;

revoke all on function public.import_variant_extras(uuid, uuid, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.import_variant_extras(uuid, uuid, jsonb, uuid) to service_role;
