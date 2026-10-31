-- Every category update failed with 42883: the API always sets parent_id, which fires this trigger, and with an empty
-- search_path "is distinct from" cannot find the = operator of extensions.ltree. Comparing as text avoids the operator.

create or replace function private.categories_move_descendants()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.path::text is distinct from old.path::text then
    update public.categories c
    set path = new.path operator(extensions.||) extensions.subpath(c.path, extensions.nlevel(old.path)),
        depth = extensions.nlevel(new.path) + extensions.nlevel(c.path) - extensions.nlevel(old.path)
    where c.store_id = new.store_id
      and c.path operator(extensions.<@) old.path
      and c.id <> new.id;
  end if;
  return null;
end;
$$;
