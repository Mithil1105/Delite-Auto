-- Prevents demoting, disabling, or deleting the final remaining owner account — a real invariant
-- enforced at the database layer (not just hidden in the Admin Users UI), so it holds even against
-- a bug in a future Edge Function or a direct table write. Applies to every caller, including
-- service-role — this is a business invariant, not an RLS/permission concern (service-role writes
-- must still respect it; only "promoting a new owner" is ever safe to allow unconditionally).
--
-- Additive: no existing column/trigger is touched. See Documentations MD/delite-auth-security.md.

create or replace function private.prevent_last_owner_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  remaining_owners integer;
begin
  if TG_OP = 'DELETE' then
    if old.admin_role = 'owner' then
      select count(*) into remaining_owners from public.profiles where admin_role = 'owner' and id <> old.id;
      if remaining_owners = 0 then
        raise exception 'Cannot remove the last remaining owner account';
      end if;
    end if;
    return old;
  end if;

  -- UPDATE: only guard a row that IS currently an owner and is being demoted away from it, or
  -- disabled (is_admin flipped false while admin_role stays owner would be a contradictory state,
  -- so also guard that combination).
  if old.admin_role = 'owner' and (new.admin_role is distinct from 'owner' or new.is_admin = false) then
    select count(*) into remaining_owners from public.profiles where admin_role = 'owner' and id <> old.id;
    if remaining_owners = 0 then
      raise exception 'Cannot demote or disable the last remaining owner account';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_prevent_last_owner_removal on public.profiles;
create trigger profiles_prevent_last_owner_removal
before update or delete on public.profiles
for each row execute function private.prevent_last_owner_change();
