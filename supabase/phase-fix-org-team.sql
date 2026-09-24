-- Corrige org_team(): ordenaba usuarios e invitaciones por created_at sin
-- seleccionar esa columna ("column u.created_at does not exist"), así que la
-- lista del equipo fallaba aunque el usuario sí se creara. Re-ejecutable.

create or replace function public.org_team()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_company uuid := public.my_company_id(); result jsonb;
begin
  if v_company is null then raise exception 'Sin organización'; end if;
  select jsonb_build_object(
    'seat_limit', (select seat_limit from public.companies where id = v_company),
    'seats_used', public.seats_used(v_company),
    'my_role', public.my_role(),
    'users', coalesce((select jsonb_agg(row_to_json(u) order by u.created_at) from (
      select p.user_id, au.email, p.full_name, p.role, p.status, p.last_active_at, p.created_at
      from public.profiles p join auth.users au on au.id = p.user_id
      where p.company_id = v_company) u), '[]'::jsonb),
    'invitations', coalesce((select jsonb_agg(row_to_json(i) order by i.created_at desc) from (
      select token, email, role, expires_at, accepted_at, created_at
      from public.invitations where company_id = v_company and accepted_at is null) i), '[]'::jsonb)
  ) into result;
  return result;
end $$;
grant execute on function public.org_team() to authenticated;
