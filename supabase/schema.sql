-- FOKO — esquema de base de datos (Supabase / Postgres).
-- Fuente de verdad: se puede volver a correr completo (todo usa
-- `if not exists` / `or replace` / `on conflict do nothing`).
--
-- Modelo: una empresa (company) tiene varios usuarios (profiles). Un usuario
-- pertenece a una sola empresa, como owner (la creó) o member (se unió con
-- el código de invitación). El logo vive en Storage, bucket público "logos".

-- ---------------------------------------------------------------------------
-- Tablas
-- ---------------------------------------------------------------------------

create table if not exists public.companies (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  logo_url    text,
  invite_code text not null unique
              default upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8)),
  created_at  timestamptz not null default now()
);

create table if not exists public.profiles (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  company_id  uuid not null references public.companies(id) on delete cascade,
  role        text not null default 'member' check (role in ('owner', 'member')),
  full_name   text,
  created_at  timestamptz not null default now()
);

create index if not exists profiles_company_id_idx on public.profiles(company_id);

alter table public.companies enable row level security;
alter table public.profiles  enable row level security;

-- ---------------------------------------------------------------------------
-- Helpers (security definer: evitan que las políticas de RLS sobre `profiles`
-- tengan que hacer una subconsulta recursiva sobre la misma tabla).
-- ---------------------------------------------------------------------------

create or replace function public.my_company_id()
returns uuid
language sql security definer set search_path = public stable
as $$ select company_id from public.profiles where user_id = auth.uid() $$;

create or replace function public.my_role()
returns text
language sql security definer set search_path = public stable
as $$ select role from public.profiles where user_id = auth.uid() $$;

-- ---------------------------------------------------------------------------
-- Políticas RLS
-- ---------------------------------------------------------------------------

drop policy if exists "members read own company" on public.companies;
create policy "members read own company" on public.companies
  for select using (id = public.my_company_id());

drop policy if exists "owner updates own company" on public.companies;
create policy "owner updates own company" on public.companies
  for update using (id = public.my_company_id() and public.my_role() = 'owner');

drop policy if exists "read profiles in my company" on public.profiles;
create policy "read profiles in my company" on public.profiles
  for select using (company_id = public.my_company_id());

grant select, update on public.companies to authenticated;
grant select on public.profiles to authenticated;

-- ---------------------------------------------------------------------------
-- RPCs de alta (llamadas justo después de auth.signUp en el cliente)
-- ---------------------------------------------------------------------------

create or replace function public.create_company_and_join(company_name text)
returns public.companies
language plpgsql security definer set search_path = public
as $$
declare
  c public.companies;
begin
  if exists (select 1 from public.profiles where user_id = auth.uid()) then
    raise exception 'Ya perteneces a una empresa';
  end if;
  if coalesce(trim(company_name), '') = '' then
    raise exception 'Escribe el nombre de la empresa';
  end if;

  insert into public.companies (name) values (trim(company_name)) returning * into c;
  insert into public.profiles (user_id, company_id, role) values (auth.uid(), c.id, 'owner');
  return c;
end;
$$;

create or replace function public.join_company_by_code(code text)
returns public.companies
language plpgsql security definer set search_path = public
as $$
declare
  c public.companies;
begin
  if exists (select 1 from public.profiles where user_id = auth.uid()) then
    raise exception 'Ya perteneces a una empresa';
  end if;

  select * into c from public.companies where invite_code = upper(trim(code));
  if not found then
    raise exception 'Código de invitación inválido';
  end if;

  insert into public.profiles (user_id, company_id, role) values (auth.uid(), c.id, 'member');
  return c;
end;
$$;

grant execute on function public.create_company_and_join(text) to authenticated;
grant execute on function public.join_company_by_code(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Storage: bucket "logos" (lectura pública, escritura por miembros de esa
-- empresa, en su propia carpeta logos/{company_id}/...)
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('logos', 'logos', true)
on conflict (id) do nothing;

drop policy if exists "public read logos" on storage.objects;
create policy "public read logos" on storage.objects
  for select using (bucket_id = 'logos');

drop policy if exists "members write own company logo" on storage.objects;
create policy "members write own company logo" on storage.objects
  for insert with check (
    bucket_id = 'logos' and (storage.foldername(name))[1] = public.my_company_id()::text
  );

drop policy if exists "members update own company logo" on storage.objects;
create policy "members update own company logo" on storage.objects
  for update using (
    bucket_id = 'logos' and (storage.foldername(name))[1] = public.my_company_id()::text
  );

-- ===========================================================================
-- SUPER-ADMIN DE PLATAFORMA (cross-tenant)
-- ===========================================================================
-- Un platform admin puede leer y gestionar TODAS las empresas y perfiles, sin
-- pertenecer a ninguna empresa. Se guarda en una tabla aparte (no en `profiles`,
-- que exige company_id). La consola vive en `admin.html`.
--
-- Todo este bloque es re-ejecutable (if not exists / or replace / drop policy).

create table if not exists public.platform_admins (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.platform_admins enable row level security;

-- El cliente solo necesita saber si la sesión actual es admin (para la UI);
-- ver la fila propia basta. Alta/baja de admins = por SQL o vía admin_*() abajo.
drop policy if exists "admin sees own admin row" on public.platform_admins;
create policy "admin sees own admin row" on public.platform_admins
  for select using (user_id = auth.uid());

grant select on public.platform_admins to authenticated;

create or replace function public.is_platform_admin()
returns boolean
language sql security definer set search_path = public stable
as $$ select exists (select 1 from public.platform_admins where user_id = auth.uid()) $$;

grant execute on function public.is_platform_admin() to authenticated;

-- --- RLS: el admin ve/gestiona todo -----------------------------------------
-- Las políticas se combinan con OR: un usuario normal sigue viendo solo lo suyo;
-- estas solo amplían el acceso cuando is_platform_admin() es true.

drop policy if exists "platform admin reads all companies" on public.companies;
create policy "platform admin reads all companies" on public.companies
  for select using (public.is_platform_admin());

drop policy if exists "platform admin updates all companies" on public.companies;
create policy "platform admin updates all companies" on public.companies
  for update using (public.is_platform_admin());

drop policy if exists "platform admin deletes companies" on public.companies;
create policy "platform admin deletes companies" on public.companies
  for delete using (public.is_platform_admin());

drop policy if exists "platform admin reads all profiles" on public.profiles;
create policy "platform admin reads all profiles" on public.profiles
  for select using (public.is_platform_admin());

drop policy if exists "platform admin updates all profiles" on public.profiles;
create policy "platform admin updates all profiles" on public.profiles
  for update using (public.is_platform_admin());

drop policy if exists "platform admin deletes profiles" on public.profiles;
create policy "platform admin deletes profiles" on public.profiles
  for delete using (public.is_platform_admin());

grant delete on public.companies to authenticated;
grant update, delete on public.profiles to authenticated;

-- --- Vista de conjunto para la consola -------------------------------------
-- Un solo RPC: empresas, usuarios (con email, que vive en auth.users), altas
-- incompletas y totales. Gated por is_platform_admin().

create or replace function public.admin_overview()
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare result jsonb;
begin
  if not public.is_platform_admin() then
    raise exception 'No autorizado';
  end if;

  select jsonb_build_object(
    'companies', coalesce((
      select jsonb_agg(row_to_json(x) order by x.created_at desc) from (
        select c.id, c.name, c.logo_url, c.invite_code, c.created_at,
               (select count(*) from public.profiles p where p.company_id = c.id) as members
        from public.companies c
      ) x
    ), '[]'::jsonb),
    'users', coalesce((
      select jsonb_agg(row_to_json(x) order by x.created_at desc) from (
        select p.user_id, u.email, p.full_name, p.role,
               p.company_id, c.name as company_name, p.created_at,
               exists(select 1 from public.platform_admins pa where pa.user_id = p.user_id) as is_platform_admin
        from public.profiles p
        join auth.users u on u.id = p.user_id
        left join public.companies c on c.id = p.company_id
      ) x
    ), '[]'::jsonb),
    'orphans', coalesce((
      select jsonb_agg(row_to_json(x) order by x.created_at desc) from (
        select u.id as user_id, u.email, u.created_at
        from auth.users u
        where not exists (select 1 from public.profiles p where p.user_id = u.id)
          and not exists (select 1 from public.platform_admins pa where pa.user_id = u.id)
      ) x
    ), '[]'::jsonb),
    'totals', jsonb_build_object(
      'companies', (select count(*) from public.companies),
      'users',     (select count(*) from public.profiles),
      'admins',    (select count(*) from public.platform_admins)
    )
  ) into result;

  return result;
end;
$$;

grant execute on function public.admin_overview() to authenticated;

-- --- Acciones del admin ----------------------------------------------------

create or replace function public.admin_rename_company(company_id uuid, new_name text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_platform_admin() then raise exception 'No autorizado'; end if;
  if coalesce(trim(new_name), '') = '' then raise exception 'Nombre vacío'; end if;
  update public.companies set name = trim(new_name) where id = company_id;
end;
$$;

create or replace function public.admin_delete_company(company_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_platform_admin() then raise exception 'No autorizado'; end if;
  -- profiles cae por ON DELETE CASCADE; los usuarios de auth.users quedan.
  delete from public.companies where id = company_id;
end;
$$;

create or replace function public.admin_set_admin(target_email text, make_admin boolean)
returns void
language plpgsql security definer set search_path = public
as $$
declare uid uuid;
begin
  if not public.is_platform_admin() then raise exception 'No autorizado'; end if;
  select id into uid from auth.users where lower(email) = lower(trim(target_email));
  if uid is null then raise exception 'No hay un usuario con ese correo'; end if;
  if make_admin then
    insert into public.platform_admins (user_id) values (uid) on conflict do nothing;
  else
    delete from public.platform_admins where user_id = uid;
  end if;
end;
$$;

grant execute on function public.admin_rename_company(uuid, text) to authenticated;
grant execute on function public.admin_delete_company(uuid) to authenticated;
grant execute on function public.admin_set_admin(text, boolean) to authenticated;

-- --- Bootstrap del primer admin ------------------------------------------
-- Corre esto DESPUÉS de crear el usuario en Supabase → Authentication → Add user
-- (josepinedo@chambeoapp.com). Es idempotente y no-op si el usuario aún no existe.
insert into public.platform_admins (user_id)
select id from auth.users where lower(email) = 'josepinedo@chambeoapp.com'
on conflict (user_id) do nothing;

-- ===========================================================================
-- HISTORIAL DE SESIONES DE SOPORTE
-- ===========================================================================
-- Cada llamada de soporte que el técnico de oficina decide guardar en la
-- pantalla de cierre crea una fila en `sessions` + N filas en `session_media`
-- (fotos y videos suben al bucket público `sessions`). La consola vive en
-- `historial.html`. Re-ejecutable.

create table if not exists public.sessions (
  id               uuid primary key default gen_random_uuid(),
  company_id       uuid not null references public.companies(id) on delete cascade,
  created_by       uuid not null references auth.users(id),
  room_code        text,
  client_name      text,
  description      text,
  started_at       timestamptz,
  ended_at         timestamptz,
  duration_seconds integer,
  photo_count      integer not null default 0,
  video_count      integer not null default 0,
  created_at       timestamptz not null default now()
);
create index if not exists sessions_company_idx on public.sessions(company_id, created_at desc);
alter table public.sessions enable row level security;

create table if not exists public.session_media (
  id           uuid primary key default gen_random_uuid(),
  session_id   uuid not null references public.sessions(id) on delete cascade,
  company_id   uuid not null references public.companies(id) on delete cascade,
  kind         text not null check (kind in ('photo', 'video')),
  storage_path text not null,
  url          text,
  created_at   timestamptz not null default now()
);
create index if not exists session_media_session_idx on public.session_media(session_id, created_at);
alter table public.session_media enable row level security;

-- RLS: los miembros de la empresa ven y gestionan sus sesiones; el admin, todas.
drop policy if exists "read company sessions" on public.sessions;
create policy "read company sessions" on public.sessions
  for select using (company_id = public.my_company_id() or public.is_platform_admin());

drop policy if exists "insert company sessions" on public.sessions;
create policy "insert company sessions" on public.sessions
  for insert with check (company_id = public.my_company_id() and created_by = auth.uid());

drop policy if exists "update company sessions" on public.sessions;
create policy "update company sessions" on public.sessions
  for update using (company_id = public.my_company_id() or public.is_platform_admin());

drop policy if exists "delete company sessions" on public.sessions;
create policy "delete company sessions" on public.sessions
  for delete using (company_id = public.my_company_id() or public.is_platform_admin());

drop policy if exists "read company session media" on public.session_media;
create policy "read company session media" on public.session_media
  for select using (company_id = public.my_company_id() or public.is_platform_admin());

drop policy if exists "insert company session media" on public.session_media;
create policy "insert company session media" on public.session_media
  for insert with check (company_id = public.my_company_id());

drop policy if exists "delete company session media" on public.session_media;
create policy "delete company session media" on public.session_media
  for delete using (company_id = public.my_company_id() or public.is_platform_admin());

grant select, insert, update, delete on public.sessions to authenticated;
grant select, insert, delete on public.session_media to authenticated;

-- Storage: bucket "sessions" (fotos y videos del historial).
-- PRIVADO: los archivos no son legibles por URL directa. El historial genera
-- URLs firmadas temporales. Lectura/escritura/borrado solo en la carpeta de
-- la propia empresa (sessions/{company_id}/{session_id}/...), o el admin.
insert into storage.buckets (id, name, public)
values ('sessions', 'sessions', false)
on conflict (id) do update set public = false;

drop policy if exists "public read session files" on storage.objects;
drop policy if exists "company reads session files" on storage.objects;
create policy "company reads session files" on storage.objects
  for select using (
    bucket_id = 'sessions' and (
      (storage.foldername(name))[1] = public.my_company_id()::text
      or public.is_platform_admin()
    )
  );

drop policy if exists "company writes session files" on storage.objects;
create policy "company writes session files" on storage.objects
  for insert with check (
    bucket_id = 'sessions' and (storage.foldername(name))[1] = public.my_company_id()::text
  );

drop policy if exists "company deletes session files" on storage.objects;
create policy "company deletes session files" on storage.objects
  for delete using (
    bucket_id = 'sessions' and (
      (storage.foldername(name))[1] = public.my_company_id()::text
      or public.is_platform_admin()
    )
  );

-- ===========================================================================
-- REGISTRO DE AUDITORÍA
-- ===========================================================================
-- Quién hizo qué y cuándo dentro de una empresa. Se escribe solo vía la RPC
-- write_audit (valida el actor); nunca insert directo desde el cliente.

create table if not exists public.audit_log (
  id          bigint generated always as identity primary key,
  company_id  uuid references public.companies(id) on delete set null,
  actor       uuid references auth.users(id) on delete set null,
  action      text not null,
  target_type text,
  target_id   text,
  meta        jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists audit_log_company_idx on public.audit_log(company_id, created_at desc);
alter table public.audit_log enable row level security;

drop policy if exists "read company audit" on public.audit_log;
create policy "read company audit" on public.audit_log
  for select using (company_id = public.my_company_id() or public.is_platform_admin());

grant select on public.audit_log to authenticated;

create or replace function public.write_audit(
  p_action text, p_target_type text default null,
  p_target_id text default null, p_meta jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return; end if;
  insert into public.audit_log (company_id, actor, action, target_type, target_id, meta)
  values (public.my_company_id(), auth.uid(), left(p_action, 60),
          left(p_target_type, 40), left(p_target_id, 100), coalesce(p_meta, '{}'::jsonb));
end $$;

grant execute on function public.write_audit(text, text, text, jsonb) to authenticated;

-- Emails de los actores para mostrarlos en la consola (gated por empresa/admin).
create or replace function public.audit_feed(p_limit int default 200)
returns jsonb language plpgsql security definer set search_path = public as $$
declare result jsonb;
begin
  if public.my_company_id() is null and not public.is_platform_admin() then
    raise exception 'No autorizado';
  end if;
  select coalesce(jsonb_agg(row_to_json(x) order by x.created_at desc), '[]'::jsonb) into result
  from (
    select a.id, a.action, a.target_type, a.target_id, a.meta, a.created_at,
           u.email as actor_email, c.name as company_name
    from public.audit_log a
    left join auth.users u on u.id = a.actor
    left join public.companies c on c.id = a.company_id
    where public.is_platform_admin() or a.company_id = public.my_company_id()
    order by a.created_at desc
    limit greatest(1, least(p_limit, 500))
  ) x;
  return result;
end $$;

grant execute on function public.audit_feed(int) to authenticated;

-- ===========================================================================
-- ERRORES DE CLIENTE (monitoreo)
-- ===========================================================================
-- Los captura js/errlog.js y los escribe api/log.js con service role.
-- Solo el admin de plataforma los lee.

create table if not exists public.client_errors (
  id         bigint generated always as identity primary key,
  user_id    uuid,
  page       text,
  message    text,
  stack      text,
  ua         text,
  created_at timestamptz not null default now()
);
create index if not exists client_errors_created_idx on public.client_errors(created_at desc);
alter table public.client_errors enable row level security;

drop policy if exists "admin reads client errors" on public.client_errors;
create policy "admin reads client errors" on public.client_errors
  for select using (public.is_platform_admin());

grant select on public.client_errors to authenticated;
