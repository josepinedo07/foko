-- FOKO — Fase A: modelo de licencia "asiento Pro" + planes Individual/Equipo.
-- Invierte el conteo: cuentan org_admin + pro. field_tech = gratis, ilimitado.
-- Pega en el SQL Editor y Run. Re-ejecutable.

-- 1) Rol: expert -> pro -------------------------------------------------
alter table public.profiles drop constraint if exists profiles_role_check;
update public.profiles set role = 'pro' where role = 'expert';
alter table public.profiles add constraint profiles_role_check
  check (role in ('org_admin', 'pro', 'field_tech'));
alter table public.profiles alter column role set default 'pro';

alter table public.invitations drop constraint if exists invitations_role_check;
update public.invitations set role = 'pro' where role = 'expert';
alter table public.invitations add constraint invitations_role_check
  check (role in ('org_admin', 'pro', 'field_tech'));

-- 2) Planes: solo Individual + Equipo --------------------------------
alter table public.plans add column if not exists recording_retention_days integer;
update public.plans set recording_retention_days = coalesce(recording_retention_days, retention_days);

insert into public.plans
  (id, name, billing_type, price_cents, included_seats, per_extra_seat_cents,
   retention_days, recording_retention_days, visible, sort, features)
values
  ('individual', 'Individual', 'flat', 1500, 1, null, 30, 30, true, 1, '{}'::jsonb),
  ('equipo',     'Equipo',     'flat', 3900, 3, null, 60, 60, true, 2, '{}'::jsonb)
on conflict (id) do update set
  name = excluded.name, billing_type = excluded.billing_type, price_cents = excluded.price_cents,
  included_seats = excluded.included_seats, per_extra_seat_cents = excluded.per_extra_seat_cents,
  retention_days = excluded.retention_days, recording_retention_days = excluded.recording_retention_days,
  visible = excluded.visible, sort = excluded.sort, features = excluded.features;

-- Remapear orgs que estaban en planes retirados, luego borrar los viejos.
update public.companies
  set plan_id = 'equipo', seat_limit = greatest(coalesce(seat_limit, 0), 3)
  where plan_id is null or plan_id not in ('individual', 'equipo');
delete from public.plans where id not in ('individual', 'equipo');

-- 3) Conteo de asientos: org_admin + pro (field_tech NO cuenta) -----
create or replace function public.seats_used(p_company uuid)
returns integer language sql security definer set search_path = public stable as $$
  select count(*)::int from public.profiles
  where company_id = p_company and status = 'active' and role in ('org_admin', 'pro')
$$;

-- retención de grabaciones por plan
create or replace function public.retention_days_for(p_company uuid)
returns integer language sql security definer set search_path = public stable as $$
  select coalesce(pl.recording_retention_days, pl.retention_days, 60)
  from public.companies c left join public.plans pl on pl.id = c.plan_id
  where c.id = p_company
$$;
grant execute on function public.retention_days_for(uuid) to authenticated, service_role;

create or replace function public.expired_sessions(p_limit int default 500)
returns jsonb language plpgsql security definer set search_path = public as $$
declare result jsonb;
begin
  select coalesce(jsonb_agg(row_to_json(x)), '[]'::jsonb) into result
  from (
    select s.id,
           (select coalesce(jsonb_agg(m.storage_path), '[]'::jsonb)
            from public.session_media m where m.session_id = s.id) as paths
    from public.sessions s
    join public.companies c on c.id = s.company_id
    left join public.plans pl on pl.id = c.plan_id
    where s.created_at < now() - make_interval(days => coalesce(pl.recording_retention_days, pl.retention_days, 60))
    order by s.created_at
    limit greatest(1, least(p_limit, 1000))
  ) x;
  return result;
end $$;
grant execute on function public.expired_sessions(int) to service_role;

-- 4) Enforcement: bloquea alta/activación de PRO al límite ----------
create or replace function public.invite_user(
  p_company uuid, p_email text, p_role text default 'pro')
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_company public.companies; v_token text;
  v_is_admin boolean := public.is_platform_admin(); v_seats int;
begin
  select * into v_company from public.companies where id = p_company;
  if not found then raise exception 'Organización no encontrada'; end if;
  if not v_is_admin and not (public.my_company_id() = p_company and public.my_role() = 'org_admin') then
    raise exception 'No autorizado';
  end if;
  if p_role not in ('org_admin', 'pro', 'field_tech') then raise exception 'Rol inválido'; end if;
  if coalesce(trim(p_email), '') = '' then raise exception 'Falta el correo'; end if;

  if p_role <> 'field_tech' then
    v_seats := public.seats_used(p_company)
      + (select count(*) from public.invitations i
         where i.company_id = p_company and i.role <> 'field_tech'
           and i.accepted_at is null and i.expires_at > now());
    if v_seats >= v_company.seat_limit then
      raise exception 'Sube de plan para agregar más expertos (límite %).', v_company.seat_limit;
    end if;
  end if;

  insert into public.invitations (company_id, email, role, invited_by)
  values (p_company, lower(trim(p_email)), p_role, auth.uid())
  returning token into v_token;

  insert into public.audit_log (company_id, actor, action, target_type, target_id, meta)
  values (p_company, auth.uid(), 'user.invited', 'invitation', v_token,
          jsonb_build_object('email', lower(trim(p_email)), 'role', p_role));

  return jsonb_build_object('token', v_token, 'email', lower(trim(p_email)));
end $$;
grant execute on function public.invite_user(uuid, text, text) to authenticated;

create or replace function public.accept_invitation(p_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_inv public.invitations; v_email text;
begin
  select email into v_email from auth.users where id = auth.uid();
  select * into v_inv from public.invitations where token = p_token;
  if not found then raise exception 'Invitación no encontrada'; end if;
  if v_inv.accepted_at is not null then raise exception 'Invitación ya usada'; end if;
  if v_inv.expires_at < now() then raise exception 'Invitación vencida'; end if;
  if lower(v_email) <> lower(v_inv.email) then
    raise exception 'Esta invitación es para otro correo (%).', v_inv.email;
  end if;
  if exists (select 1 from public.profiles where user_id = auth.uid()) then
    raise exception 'Ya perteneces a una organización';
  end if;
  if v_inv.role <> 'field_tech'
     and public.seats_used(v_inv.company_id) >= (select seat_limit from public.companies where id = v_inv.company_id) then
    raise exception 'La organización no tiene asientos de experto libres';
  end if;

  insert into public.profiles (user_id, company_id, role, status, invited_by)
  values (auth.uid(), v_inv.company_id, v_inv.role, 'active', v_inv.invited_by);
  update public.invitations set accepted_at = now() where token = p_token;
  insert into public.audit_log (company_id, actor, action, target_type, target_id, meta)
  values (v_inv.company_id, auth.uid(), 'user.joined', 'profile', auth.uid()::text,
          jsonb_build_object('role', v_inv.role));
  return jsonb_build_object('company_id', v_inv.company_id, 'role', v_inv.role);
end $$;
grant execute on function public.accept_invitation(text) to authenticated;

create or replace function public.set_user_status(p_user uuid, p_status text)
returns void language plpgsql security definer set search_path = public as $$
declare v_company uuid; v_role text;
begin
  if p_status not in ('active', 'disabled') then raise exception 'Estado inválido'; end if;
  select company_id, role into v_company, v_role from public.profiles where user_id = p_user;
  if not public.is_platform_admin() and not (public.my_company_id() = v_company and public.my_role() = 'org_admin') then
    raise exception 'No autorizado';
  end if;
  if p_user = auth.uid() then raise exception 'No puedes deshabilitarte a ti mismo'; end if;
  if p_status = 'active' and v_role <> 'field_tech'
     and public.seats_used(v_company) >= (select seat_limit from public.companies where id = v_company) then
    raise exception 'Sin asientos de experto disponibles';
  end if;
  update public.profiles set status = p_status where user_id = p_user;
  insert into public.audit_log (company_id, actor, action, target_type, target_id, meta)
  values (v_company, auth.uid(), 'user.status', 'profile', p_user::text, jsonb_build_object('status', p_status));
end $$;
grant execute on function public.set_user_status(uuid, text) to authenticated;

-- 5) Alta self-serve entra en 'equipo' (trial 30d) -----------------
drop function if exists public.create_company_and_join(text);
create function public.create_company_and_join(company_name text)
returns public.companies language plpgsql security definer set search_path = public as $$
declare c public.companies;
begin
  if exists (select 1 from public.profiles where user_id = auth.uid()) then
    raise exception 'Ya perteneces a una organización';
  end if;
  if coalesce(trim(company_name), '') = '' then raise exception 'Escribe el nombre de la empresa'; end if;
  insert into public.companies (name, plan_id, seat_limit, status, trial_ends_at)
  values (trim(company_name), 'equipo', 3, 'trialing', now() + interval '30 days')
  returning * into c;
  insert into public.profiles (user_id, company_id, role, status)
  values (auth.uid(), c.id, 'org_admin', 'active');
  return c;
end $$;
grant execute on function public.create_company_and_join(text) to authenticated;
