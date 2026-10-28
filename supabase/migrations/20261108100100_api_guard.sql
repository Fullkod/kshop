-- R11 (admin performance): the guard of every /api/v1 store call in one statement. requireStoreRole read
-- store_members and assertStoreWritable read stores, one after the other (154 ms median, 3.6 s p95 from Vercel for a
-- query that costs < 1 ms in the database: the rest was queueing). The API memoizes the result per request.
-- security definer + service_role only: the API passes the user id it verified from the JWT.

create function public.api_guard(p_user_id uuid, p_store_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'role', (select sm.role from public.store_members sm
      where sm.store_id = p_store_id and sm.user_id = p_user_id),
    'storeStatus', st.status,
    'suspendedReason', st.suspended_reason
  )
  from (select 1) one
  left join public.stores st on st.id = p_store_id;
$$;

revoke all on function public.api_guard(uuid, uuid) from public, anon, authenticated;
grant execute on function public.api_guard(uuid, uuid) to service_role;
