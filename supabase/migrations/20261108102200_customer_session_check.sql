-- KSH0013: since R11 the API verifies JWTs locally (getClaims), so a customer's token kept working after a password
-- reset until it expired. requireCustomer already reads the customer row on every call; this function reads it only
-- while the token's session still exists, so a reset (which deletes the sessions) signs out at once, at no extra cost.

create function public.api_customer(p_store_id uuid, p_user_id uuid, p_session_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select to_jsonb(c)
  from public.customers c
  where c.store_id = p_store_id
    and c.user_id = p_user_id
    and exists (select 1 from auth.sessions s where s.id = p_session_id and s.user_id = p_user_id);
$$;

revoke all on function public.api_customer(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.api_customer(uuid, uuid, uuid) to service_role;

-- Signs a user out everywhere (their refresh tokens go with the sessions).
create function public.auth_revoke_user_sessions(p_user_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from auth.sessions where user_id = p_user_id;
$$;

revoke all on function public.auth_revoke_user_sessions(uuid) from public, anon, authenticated;
grant execute on function public.auth_revoke_user_sessions(uuid) to service_role;
