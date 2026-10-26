-- Phase 5 (D7, D19): the superadmin edits plans, add-on prices and the billing settings. Changing the modules of a
-- plan re-syncs every store on it in the same transaction (modules that leave are disabled, data is kept).

-- p_input: { price, yearly_price (null = no yearly option), is_public, modules: [code], limits: {max_products,
-- max_staff} (null = no limit) }. Returns the ids of the stores on the plan (to expire their caches).
create function public.plan_update(p_plan_code text, p_input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan public.plans;
  v_modules text[] := array(select jsonb_array_elements_text(coalesce(p_input -> 'modules', '[]')));
  v_key text;
  v_store uuid;
  v_stores uuid[] := '{}';
begin
  select * into v_plan from public.plans where code = p_plan_code for update;
  if not found then
    raise exception 'El plan no existe' using errcode = 'P0001', hint = 'not_found';
  end if;
  if not ('catalog' = any (v_modules)) then
    raise exception 'Todo plan incluye el catálogo' using errcode = 'P0001', hint = 'invalid_input';
  end if;
  if exists (select 1 from unnest(v_modules) c where not exists (select 1 from public.modules m where m.code = c)) then
    raise exception 'Hay un módulo que no existe' using errcode = 'P0001', hint = 'invalid_input';
  end if;
  if exists (select 1 from public.modules m cross join lateral unnest(m.depends_on) d(code)
             where m.code = any (v_modules) and not (d.code = any (v_modules))) then
    raise exception 'Algún módulo del plan necesita otro que no está incluido' using errcode = 'P0001',
      hint = 'module_dependency';
  end if;

  update public.plans set
    price = (p_input ->> 'price')::numeric,
    yearly_price = (p_input ->> 'yearly_price')::numeric,
    is_public = coalesce((p_input ->> 'is_public')::boolean, is_public)
  where id = v_plan.id;

  delete from public.plan_modules where plan_id = v_plan.id and not (module_code = any (v_modules));
  insert into public.plan_modules (plan_id, module_code)
  select v_plan.id, c from unnest(v_modules) c
  on conflict do nothing;

  foreach v_key in array array['max_products', 'max_staff'] loop
    if p_input -> 'limits' ->> v_key is null then
      delete from public.plan_limits where plan_id = v_plan.id and key = v_key;
    else
      insert into public.plan_limits (plan_id, key, value)
      values (v_plan.id, v_key, (p_input -> 'limits' ->> v_key)::int)
      on conflict (plan_id, key) do update set value = excluded.value;
    end if;
  end loop;

  for v_store in select store_id from public.subscriptions where plan_id = v_plan.id for update loop
    perform private.sync_plan_modules(v_store);
    v_stores := v_stores || v_store;
  end loop;
  return jsonb_build_object('plan', v_plan.code, 'store_ids', to_jsonb(v_stores));
end;
$$;

-- Price of a module sold alone (null = not sold alone). Stores that already bought it keep their price.
create function public.module_set_addon_price(p_module_code text, p_price numeric)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_module_code = 'catalog' and p_price is not null then
    raise exception 'El catálogo no se vende suelto' using errcode = 'P0001', hint = 'invalid_input';
  end if;
  update public.modules set addon_price = p_price, addon_currency = case when p_price is null then null else 'USD' end
  where code = p_module_code;
  if not found then
    raise exception 'El módulo no existe' using errcode = 'P0001', hint = 'not_found';
  end if;
  return jsonb_build_object('module', p_module_code, 'price', p_price);
end;
$$;

create function public.platform_billing_get()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'invoice_lead_days', private.billing_int('invoice_lead_days', 5),
    'invoice_due_days', private.billing_int('invoice_due_days', 7),
    'grace_days', private.billing_int('grace_days', 7),
    'trial_reminder_days', private.billing_int('trial_reminder_days', 3),
    'default_trial_days', private.billing_int('default_trial_days', 30),
    'billing_instructions', private.platform_setting('billing_instructions') #>> '{}',
    'support_whatsapp', private.platform_setting('support_whatsapp') #>> '{}');
$$;

create function public.platform_billing_set(p_input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key text;
begin
  foreach v_key in array array['invoice_lead_days', 'invoice_due_days', 'grace_days', 'trial_reminder_days',
    'default_trial_days', 'billing_instructions', 'support_whatsapp'] loop
    if p_input ? v_key then
      insert into private.platform_config (key, value, updated_at) values (v_key, p_input -> v_key, now())
      on conflict (key) do update set value = excluded.value, updated_at = now();
    end if;
  end loop;
  return public.platform_billing_get();
end;
$$;

-- The superadmin suspends or reactivates by hand (D15): a manual suspension is not lifted by a payment.
create function public.store_set_status(p_store_id uuid, p_status text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.stores set
    status = p_status::public.store_status,
    suspended_reason = case when p_status = 'suspended' then 'manual'::public.suspension_reason end
  where id = p_store_id;
  if not found then
    raise exception 'La tienda no existe' using errcode = 'P0001', hint = 'not_found';
  end if;
  return jsonb_build_object('store_id', p_store_id, 'status', p_status);
end;
$$;

revoke all on function public.plan_update(text, jsonb), public.module_set_addon_price(text, numeric),
  public.platform_billing_get(), public.platform_billing_set(jsonb), public.store_set_status(uuid, text)
  from public, anon, authenticated;
grant execute on function public.plan_update(text, jsonb), public.module_set_addon_price(text, numeric),
  public.platform_billing_get(), public.platform_billing_set(jsonb), public.store_set_status(uuid, text)
  to service_role;
