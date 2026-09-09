-- FOKO — Fase 2: búsqueda de usuario por correo para la consola de plataforma.
-- Pega en el SQL Editor y Run. Re-ejecutable.

create or replace function public.admin_find_user(p_email text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare result jsonb;
begin
  if not public.is_platform_admin() then raise exception 'No autorizado'; end if;
  select coalesce(jsonb_agg(row_to_json(x)), '[]'::jsonb) into result
  from (
    select au.id as user_id, au.email, p.role, p.status,
           p.company_id, c.name as company_name, c.slug,
           exists(select 1 from public.platform_admins pa where pa.user_id = au.id) as is_superadmin
    from auth.users au
    left join public.profiles p on p.user_id = au.id
    left join public.companies c on c.id = p.company_id
    where au.email ilike '%' || trim(p_email) || '%'
    limit 25
  ) x;
  return result;
end $$;
grant execute on function public.admin_find_user(text) to authenticated;
