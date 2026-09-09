-- FOKO — TODO el SQL pendiente (fases 1, 2, 5 y 6), en orden.
-- Pega TODO en el SQL Editor de Supabase y Run UNA vez. Re-ejecutable.
-- https://supabase.com/dashboard/project/kjcsqyptjxdxzmaelglw/sql/new


-- ===================================================================
-- >>> phase1-plans-orgs.sql
-- ===================================================================

-- FOKO — Fase 1: planes, organizaciones multi-tenant y admin.
-- Pega TODO en el SQL Editor de Supabase y Run. Es re-ejecutable.
-- (También está integrado al final de schema.sql.)

-- ===========================================================================
-- PLANES, MULTI-TENANT Y FACTURACIÓN  (Fase 1)
-- ===========================================================================
-- Se extiende el modelo existente en su sitio: companies = "organización",
-- profiles = "usuario". Roles: owner->org_admin, member->expert. El superadmin
-- sigue siendo una fila en platform_admins. El técnico de campo NO es usuario.
-- Todo re-ejecutable.

-- --- Planes (fuente de verdad de precios; el front los lee, no los hardcodea) -
create table if not exists public.plans (
  id                   text primary key,
  name                 text not null,
  price_cents          integer not null default 0,
  currency             text not null default 'USD',
  interval             text not null default 'month' check (interval in ('month','year')),
  included_seats       integer not null default 0,
  per_extra_seat_cents integer,
  features             jsonb not null default '{}'::jsonb,
  hidden               boolean not null default false,
  sort                 integer not null default 0,
  created_at           timestamptz not null default now()
);
alter table public.plans enable row level security;
drop policy if exists "anyone reads plans" on public.plans;
create policy "anyone reads plans" on public.plans for select using (true);
grant select on public.plans to anon, authenticated;

insert into public.plans (id, name, price_cents, included_seats, per_extra_seat_cents, hidden, sort, features) values
  ('founder',   'Founder',    4500,  5, 900,  true,  0, '{"ai_reports":true,"history_months":24}'),
  ('cuadrilla', 'Cuadrilla',  7900,  6, 1200, false, 1, '{"ai_reports":true,"history_months":24}'),
  ('taller',    'Taller',    19900, 20, 1200, false, 2, '{"ai_reports":true,"history_months":24}'),
  ('flota',     'Flota',     44900, 50, 900,  false, 3, '{"ai_reports":true,"history_months":24}')
on conflict (id) do update set
  name = excluded.name, price_cents = excluded.price_cents,
  included_seats = excluded.included_seats, per_extra_seat_cents = excluded.per_extra_seat_cents,
  hidden = excluded.hidden, sort = excluded.sort, features = excluded.features;

-- --- Organización: columnas nuevas sobre companies ------------------------
alter table public.companies add column if not exists slug text unique;
alter table public.companies add column if not exists plan_id text references public.plans(id);
alter table public.companies add column if not exists seat_limit integer not null default 5;
alter table public.companies add column if not exists status text not null default 'trialing'
  check (status in ('trialing','active','past_due','paused','canceled'));
alter table public.companies add column if not exists trial_ends_at timestamptz;
alter table public.companies add column if not exists billing_mode text not null default 'manual'
  check (billing_mode in ('manual','stripe'));
alter table public.companies add column if not exists stripe_customer_id text;
alter table public.companies add column if not exists notes text;
alter table public.companies add column if not exists past_due_since timestamptz;

update public.companies set slug = lower(regexp_replace(coalesce(slug, name || '-' || left(id::text,4)), '[^a-z0-9]+', '-', 'gi'))
  where slug is null;

-- --- Usuario: columnas nuevas sobre profiles -----------------------------
alter table public.profiles add column if not exists status text not null default 'active'
  check (status in ('invited','active','disabled'));
alter table public.profiles add column if not exists last_active_at timestamptz;
alter table public.profiles add column if not exists invited_by uuid references auth.users(id) on delete set null;

-- Migración de roles: owner->org_admin, member->expert
alter table public.profiles drop constraint if exists profiles_role_check;
update public.profiles set role = 'org_admin' where role = 'owner';
update public.profiles set role = 'expert'    where role = 'member';
alter table public.profiles add constraint profiles_role_check check (role in ('org_admin','expert'));
alter table public.profiles alter column role set default 'expert';

-- --- Invitaciones por email --------------------------------------------
create table if not exists public.invitations (
  token       text primary key default md5(random()::text || clock_timestamp()::text || random()::text) || md5(gen_random_uuid()::text),
  company_id  uuid not null references public.companies(id) on delete cascade,
  email       text not null,
  role        text not null default 'expert' check (role in ('org_admin','expert')),
  invited_by  uuid references auth.users(id) on delete set null,
  expires_at  timestamptz not null default now() + interval '14 days',
  accepted_at timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists invitations_company_idx on public.invitations(company_id);
create index if not exists invitations_email_idx on public.invitations(lower(email));
alter table public.invitations enable row level security;

drop policy if exists "org reads own invitations" on public.invitations;
create policy "org reads own invitations" on public.invitations
  for select using (company_id = public.my_company_id() or public.is_platform_admin());
grant select on public.invitations to authenticated;

-- --- Helpers de asientos y estado de acceso --------------------------
create or replace function public.seats_used(p_company uuid)
returns integer language sql security definer set search_path = public stable as $$
  select count(*)::int from public.profiles
  where company_id = p_company and status = 'active'
$$;
grant execute on function public.seats_used(uuid) to authenticated;

-- 'ok' = acceso normal · 'billing_only' = solo /billing (org_admin) o muro (resto)
create or replace function public.org_access_state()
returns text language plpgsql security definer set search_path = public stable as $$
declare c public.companies;
begin
  if public.is_platform_admin() then return 'ok'; end if;
  select * into c from public.companies where id = public.my_company_id();
  if not found then return 'ok'; end if;
  if c.status = 'canceled' or c.status = 'paused' then return 'billing_only'; end if;
  if c.status = 'trialing' and c.trial_ends_at is not null and c.trial_ends_at < now() then
    return 'billing_only';
  end if;
  if c.status = 'past_due' and c.past_due_since is not null
     and c.past_due_since < now() - interval '7 days' then
    return 'billing_only';
  end if;
  return 'ok';
end $$;
grant execute on function public.org_access_state() to authenticated;

-- --- RLS: org_admin gestiona usuarios de su org; superadmin, todos --------
drop policy if exists "owner updates own company" on public.companies;
create policy "org_admin updates own company" on public.companies
  for update using (id = public.my_company_id() and public.my_role() = 'org_admin');

drop policy if exists "org_admin manages members" on public.profiles;
create policy "org_admin manages members" on public.profiles
  for update using (
    (company_id = public.my_company_id() and public.my_role() = 'org_admin')
    or public.is_platform_admin()
  );

-- --- RPC: onboarding de organización (solo superadmin) -----------------
create or replace function public.admin_create_organization(
  p_name text, p_admin_email text, p_plan_id text,
  p_seat_limit int default null, p_trial_days int default 30,
  p_billing_mode text default 'manual')
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_company public.companies;
  v_seats int;
  v_token text;
  v_plan public.plans;
begin
  if not public.is_platform_admin() then raise exception 'No autorizado'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'Falta el nombre'; end if;
  if coalesce(trim(p_admin_email), '') = '' then raise exception 'Falta el correo del admin'; end if;

  select * into v_plan from public.plans where id = p_plan_id;
  if not found then raise exception 'Plan inválido'; end if;
  v_seats := coalesce(p_seat_limit, v_plan.included_seats);

  insert into public.companies (name, plan_id, seat_limit, status, billing_mode,
                                trial_ends_at)
  values (trim(p_name), p_plan_id, v_seats,
          case when p_trial_days > 0 then 'trialing' else 'active' end,
          p_billing_mode,
          case when p_trial_days > 0 then now() + make_interval(days => p_trial_days) end)
  returning * into v_company;

  insert into public.invitations (company_id, email, role, invited_by)
  values (v_company.id, lower(trim(p_admin_email)), 'org_admin', auth.uid())
  returning token into v_token;

  insert into public.audit_log (company_id, actor, action, target_type, target_id, meta)
  values (v_company.id, auth.uid(), 'org.created', 'company', v_company.id::text,
          jsonb_build_object('plan', p_plan_id, 'seats', v_seats, 'admin_email', lower(trim(p_admin_email))));

  return jsonb_build_object('company_id', v_company.id, 'slug', v_company.slug,
                            'invite_token', v_token, 'invite_email', lower(trim(p_admin_email)));
end $$;
grant execute on function public.admin_create_organization(text, text, text, int, int, text) to authenticated;

-- --- RPC: editar organización (solo superadmin) -----------------------
create or replace function public.admin_update_organization(
  p_company uuid, p_patch jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_platform_admin() then raise exception 'No autorizado'; end if;
  update public.companies set
    plan_id       = coalesce(p_patch->>'plan_id', plan_id),
    seat_limit    = coalesce((p_patch->>'seat_limit')::int, seat_limit),
    status        = coalesce(p_patch->>'status', status),
    billing_mode  = coalesce(p_patch->>'billing_mode', billing_mode),
    notes         = coalesce(p_patch->>'notes', notes),
    trial_ends_at = case when p_patch ? 'trial_ends_at'
                         then nullif(p_patch->>'trial_ends_at','')::timestamptz
                         else trial_ends_at end,
    past_due_since = case when (p_patch->>'status') = 'past_due' and status <> 'past_due'
                          then now() else past_due_since end
  where id = p_company;

  insert into public.audit_log (company_id, actor, action, target_type, target_id, meta)
  values (p_company, auth.uid(), 'org.updated', 'company', p_company::text, p_patch);
end $$;
grant execute on function public.admin_update_organization(uuid, jsonb) to authenticated;

-- --- RPC: invitar usuario (org_admin de su org, o superadmin) ---------
create or replace function public.invite_user(
  p_company uuid, p_email text, p_role text default 'expert')
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_company public.companies;
  v_token text;
  v_is_admin boolean := public.is_platform_admin();
begin
  select * into v_company from public.companies where id = p_company;
  if not found then raise exception 'Organización no encontrada'; end if;
  if not v_is_admin and not (public.my_company_id() = p_company and public.my_role() = 'org_admin') then
    raise exception 'No autorizado';
  end if;
  if p_role not in ('org_admin','expert') then raise exception 'Rol inválido'; end if;
  if coalesce(trim(p_email),'') = '' then raise exception 'Falta el correo'; end if;

  -- Enforcement de asientos: activos + invitaciones pendientes < seat_limit
  if (public.seats_used(p_company)
      + (select count(*) from public.invitations i
         where i.company_id = p_company and i.accepted_at is null and i.expires_at > now()))
     >= v_company.seat_limit then
    raise exception 'Sin asientos disponibles (límite %). Aumenta el plan.', v_company.seat_limit;
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

-- --- RPC: aceptar invitación (el invitado, ya autenticado) ------------
create or replace function public.accept_invitation(p_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_inv public.invitations;
  v_email text;
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
  if public.seats_used(v_inv.company_id) >= (select seat_limit from public.companies where id = v_inv.company_id) then
    raise exception 'La organización no tiene asientos libres';
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

-- --- RPC: gestión de usuarios (org_admin / superadmin) ---------------
create or replace function public.set_user_status(p_user uuid, p_status text)
returns void language plpgsql security definer set search_path = public as $$
declare v_company uuid;
begin
  if p_status not in ('active','disabled') then raise exception 'Estado inválido'; end if;
  select company_id into v_company from public.profiles where user_id = p_user;
  if not public.is_platform_admin() and not (public.my_company_id() = v_company and public.my_role() = 'org_admin') then
    raise exception 'No autorizado';
  end if;
  if p_user = auth.uid() then raise exception 'No puedes deshabilitarte a ti mismo'; end if;
  if p_status = 'active' and public.seats_used(v_company) >= (select seat_limit from public.companies where id = v_company) then
    raise exception 'Sin asientos disponibles';
  end if;
  update public.profiles set status = p_status where user_id = p_user;
  insert into public.audit_log (company_id, actor, action, target_type, target_id, meta)
  values (v_company, auth.uid(), 'user.status', 'profile', p_user::text, jsonb_build_object('status', p_status));
end $$;
grant execute on function public.set_user_status(uuid, text) to authenticated;

create or replace function public.set_user_role(p_user uuid, p_role text)
returns void language plpgsql security definer set search_path = public as $$
declare v_company uuid;
begin
  if p_role not in ('org_admin','expert') then raise exception 'Rol inválido'; end if;
  select company_id into v_company from public.profiles where user_id = p_user;
  if not public.is_platform_admin() and not (public.my_company_id() = v_company and public.my_role() = 'org_admin') then
    raise exception 'No autorizado';
  end if;
  update public.profiles set role = p_role where user_id = p_user;
  insert into public.audit_log (company_id, actor, action, target_type, target_id, meta)
  values (v_company, auth.uid(), 'user.role', 'profile', p_user::text, jsonb_build_object('role', p_role));
end $$;
grant execute on function public.set_user_role(uuid, text) to authenticated;

-- --- Alta self-serve: roles nuevos + enforcement de asientos ----------
drop function if exists public.create_company_and_join(text);
drop function if exists public.join_company_by_code(text);

create or replace function public.create_company_and_join(company_name text)
returns public.companies
language plpgsql security definer set search_path = public
as $$
declare c public.companies;
begin
  if exists (select 1 from public.profiles where user_id = auth.uid()) then
    raise exception 'Ya perteneces a una organización';
  end if;
  if coalesce(trim(company_name), '') = '' then
    raise exception 'Escribe el nombre de la empresa';
  end if;
  insert into public.companies (name, plan_id, seat_limit, status, trial_ends_at)
  values (trim(company_name), 'cuadrilla', 6, 'trialing', now() + interval '14 days')
  returning * into c;
  insert into public.profiles (user_id, company_id, role, status)
  values (auth.uid(), c.id, 'org_admin', 'active');
  return c;
end $$;

create or replace function public.join_company_by_code(code text)
returns public.companies
language plpgsql security definer set search_path = public
as $$
declare c public.companies;
begin
  if exists (select 1 from public.profiles where user_id = auth.uid()) then
    raise exception 'Ya perteneces a una organización';
  end if;
  select * into c from public.companies where invite_code = upper(trim(code));
  if not found then raise exception 'Código de invitación inválido'; end if;
  if public.seats_used(c.id) >= c.seat_limit then
    raise exception 'La organización no tiene asientos libres';
  end if;
  insert into public.profiles (user_id, company_id, role, status)
  values (auth.uid(), c.id, 'expert', 'active');
  return c;
end $$;

-- --- Feeds para las consolas ----------------------------------------
-- MRR estimado = precio del plan + asientos extra usados × per_extra.
create or replace function public._mrr_cents(p_plan text, p_seats_used int)
returns integer language sql stable set search_path = public as $$
  select case when p.interval = 'year' then p.price_cents / 12 else p.price_cents end
       + greatest(0, coalesce(p_seats_used,0) - p.included_seats) * coalesce(p.per_extra_seat_cents, 0)
  from public.plans p where p.id = p_plan
$$;

create or replace function public.admin_orgs()
returns jsonb language plpgsql security definer set search_path = public as $$
declare result jsonb;
begin
  if not public.is_platform_admin() then raise exception 'No autorizado'; end if;
  select coalesce(jsonb_agg(row_to_json(x) order by x.created_at desc), '[]'::jsonb) into result
  from (
    select c.id, c.name, c.slug, c.plan_id, c.seat_limit, c.status, c.billing_mode,
           c.trial_ends_at, c.notes, c.created_at,
           public.seats_used(c.id) as seats_used,
           public._mrr_cents(c.plan_id, public.seats_used(c.id)) as mrr_cents,
           (select max(p.last_active_at) from public.profiles p where p.company_id = c.id) as last_active_at
    from public.companies c
  ) x;
  return result;
end $$;
grant execute on function public.admin_orgs() to authenticated;

create or replace function public.admin_org_detail(p_company uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare result jsonb;
begin
  if not public.is_platform_admin() then raise exception 'No autorizado'; end if;
  select jsonb_build_object(
    'org', (select row_to_json(c) from (
      select c.*, public.seats_used(c.id) as seats_used,
             public._mrr_cents(c.plan_id, public.seats_used(c.id)) as mrr_cents
      from public.companies c where c.id = p_company) c),
    'users', coalesce((select jsonb_agg(row_to_json(u) order by u.created_at) from (
      select p.user_id, au.email, p.full_name, p.role, p.status, p.last_active_at, p.created_at
      from public.profiles p join auth.users au on au.id = p.user_id
      where p.company_id = p_company) u), '[]'::jsonb),
    'invitations', coalesce((select jsonb_agg(row_to_json(i) order by i.created_at desc) from (
      select token, email, role, expires_at, accepted_at, created_at
      from public.invitations where company_id = p_company) i), '[]'::jsonb),
    'audit', coalesce((select jsonb_agg(row_to_json(a) order by a.created_at desc) from (
      select a.action, a.target_type, a.target_id, a.meta, a.created_at, au.email as actor_email
      from public.audit_log a left join auth.users au on au.id = a.actor
      where a.company_id = p_company order by a.created_at desc limit 100) a), '[]'::jsonb)
  ) into result;
  return result;
end $$;
grant execute on function public.admin_org_detail(uuid) to authenticated;

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
      select p.user_id, au.email, p.full_name, p.role, p.status, p.last_active_at
      from public.profiles p join auth.users au on au.id = p.user_id
      where p.company_id = v_company) u), '[]'::jsonb),
    'invitations', coalesce((select jsonb_agg(row_to_json(i) order by i.created_at desc) from (
      select token, email, role, expires_at, accepted_at
      from public.invitations where company_id = v_company and accepted_at is null) i), '[]'::jsonb)
  ) into result;
  return result;
end $$;
grant execute on function public.org_team() to authenticated;

create or replace function public.org_billing()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_company public.companies; result jsonb;
begin
  select * into v_company from public.companies where id = public.my_company_id();
  if not found then raise exception 'Sin organización'; end if;
  select jsonb_build_object(
    'name', v_company.name, 'status', v_company.status,
    'billing_mode', v_company.billing_mode,
    'seat_limit', v_company.seat_limit, 'seats_used', public.seats_used(v_company.id),
    'trial_ends_at', v_company.trial_ends_at,
    'access_state', public.org_access_state(),
    'plan', (select row_to_json(p) from public.plans p where p.id = v_company.plan_id),
    'mrr_cents', public._mrr_cents(v_company.plan_id, public.seats_used(v_company.id))
  ) into result;
  return result;
end $$;
grant execute on function public.org_billing() to authenticated;

-- Marca de actividad (la llama la app al cargar una página protegida).
create or replace function public.touch_activity()
returns void language sql security definer set search_path = public as $$
  update public.profiles set last_active_at = now() where user_id = auth.uid()
$$;
grant execute on function public.touch_activity() to authenticated;

-- --- Backfill + seed --------------------------------------------------
update public.companies set plan_id = 'cuadrilla' where plan_id is null;
update public.companies set seat_limit = 6 where seat_limit is null or seat_limit = 0;
update public.companies set status = 'active' where status is null;

-- Organización demo (solo si no existe ninguna llamada así)
insert into public.companies (name, slug, plan_id, seat_limit, status, trial_ends_at, billing_mode)
select 'Foko Demo', 'foko-demo', 'founder', 5, 'trialing', now() + interval '30 days', 'manual'
where not exists (select 1 from public.companies where slug = 'foko-demo');


-- ===================================================================
-- >>> phase2.sql
-- ===================================================================

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


-- ===================================================================
-- >>> phase5.sql
-- ===================================================================

-- FOKO — Fase 5: enforcement en la base de datos (además del muro en el cliente).
-- Bloquea guardar sesiones / subir media cuando la organización está fuera de
-- servicio (trial vencido, paused, canceled, past_due > 7 días).
-- Pega en el SQL Editor y Run. Re-ejecutable.

drop policy if exists "insert company sessions" on public.sessions;
create policy "insert company sessions" on public.sessions
  for insert with check (
    company_id = public.my_company_id()
    and created_by = auth.uid()
    and public.org_access_state() = 'ok'
  );

drop policy if exists "insert company session media" on public.session_media;
create policy "insert company session media" on public.session_media
  for insert with check (
    company_id = public.my_company_id()
    and public.org_access_state() = 'ok'
  );

-- El reporte con IA también se corta si la org está fuera de servicio.
-- (api/report.js además lo chequea en el servidor.)


-- ===================================================================
-- >>> phase6-stripe.sql
-- ===================================================================

-- FOKO — Fase 6: soporte para Stripe (todo detrás del flag BILLING_STRIPE_ENABLED).
-- Pega en el SQL Editor y Run. Re-ejecutable. No cambia nada del flujo manual.

alter table public.plans add column if not exists stripe_price_id text;
alter table public.plans add column if not exists stripe_price_id_year text;

-- Idempotencia del webhook: cada evento de Stripe se procesa una sola vez.
create table if not exists public.stripe_events (
  event_id     text primary key,
  type         text,
  processed_at timestamptz not null default now()
);
alter table public.stripe_events enable row level security;
-- sin políticas: solo el service role (que ignora RLS) escribe/lee.
