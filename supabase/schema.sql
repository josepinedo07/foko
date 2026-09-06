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
