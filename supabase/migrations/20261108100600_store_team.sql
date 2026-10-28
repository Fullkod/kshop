-- R11: Admin › Equipo read every account of the platform from Auth (listUsers, up to 1 000, growing with each store
-- and customer) only to show the e-mails of a few members. One query now: the members of the store with their
-- e-mail. Service role only (the API checks the role first); nothing else of auth.users leaves the function.

create function public.store_team(p_store_id uuid)
returns table (user_id uuid, email text, role public.store_role, created_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select m.user_id, u.email::text, m.role, m.created_at
  from public.store_members m
  join auth.users u on u.id = m.user_id
  where m.store_id = p_store_id;
$$;

revoke execute on function public.store_team(uuid) from public, anon, authenticated;
grant execute on function public.store_team(uuid) to service_role;
