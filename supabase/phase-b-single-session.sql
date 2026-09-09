-- FOKO — Fase B: una sola sesión activa por perfil (anti-compartir).
-- "Gana el último login". Pega en el SQL Editor y Run. Re-ejecutable.

-- 1) Sesión activa por perfil -----------------------------------------
create table if not exists public.active_sessions (
  profile_id   uuid primary key references auth.users(id) on delete cascade,
  session_id   text not null,
  device       text,
  ip           text,
  last_seen_at timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
alter table public.active_sessions enable row level security;
drop policy if exists "own active session" on public.active_sessions;
create policy "own active session" on public.active_sessions
  for select using (profile_id = auth.uid());
grant select on public.active_sessions to authenticated;

-- 2) Registro de tomas de sesión ------------------------------------
create table if not exists public.session_takeovers (
  id              bigint generated always as identity primary key,
  profile_id      uuid references auth.users(id) on delete set null,
  org_id          uuid references public.companies(id) on delete set null,
  prev_ip         text,
  new_ip          text,
  prev_user_agent text,
  new_user_agent  text,
  created_at      timestamptz not null default now()
);
create index if not exists session_takeovers_profile_idx on public.session_takeovers(profile_id, created_at desc);
create index if not exists session_takeovers_org_idx on public.session_takeovers(org_id, created_at desc);
alter table public.session_takeovers enable row level security;
drop policy if exists "org reads takeovers" on public.session_takeovers;
create policy "org reads takeovers" on public.session_takeovers
  for select using (org_id = public.my_company_id() or public.is_platform_admin());
grant select on public.session_takeovers to authenticated;

-- 3) Reclamar la sesión (se llama en cada carga tras login) --------
create or replace function public.claim_session(p_device text default null, p_ip text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_sid text := auth.jwt() ->> 'session_id';
  v_prev public.active_sessions;
  v_org uuid := public.my_company_id();
  v_takeovers int;
begin
  if v_sid is null then
    return jsonb_build_object('ok', false, 'reason', 'no_session_id');
  end if;

  select * into v_prev from public.active_sessions where profile_id = auth.uid();

  if found and v_prev.session_id is distinct from v_sid then
    insert into public.session_takeovers (profile_id, org_id, prev_ip, new_ip, prev_user_agent, new_user_agent)
    values (auth.uid(), v_org, v_prev.ip, p_ip, v_prev.device, p_device);
  end if;

  insert into public.active_sessions (profile_id, session_id, device, ip, last_seen_at, updated_at)
  values (auth.uid(), v_sid, left(p_device, 300), left(p_ip, 64), now(), now())
  on conflict (profile_id) do update
    set session_id = excluded.session_id, device = excluded.device, ip = excluded.ip,
        last_seen_at = now(), updated_at = now();

  select count(*) into v_takeovers from public.session_takeovers
  where profile_id = auth.uid() and created_at > now() - interval '24 hours';

  return jsonb_build_object('ok', true, 'session_id', v_sid, 'shared_account', v_takeovers > 3);
end $$;
grant execute on function public.claim_session(text, text) to authenticated;

-- 4) ¿La sesión del JWT sigue siendo la vigente? -------------------
create or replace function public.session_is_current()
returns boolean language sql security definer set search_path = public stable as $$
  select coalesce(
    (auth.jwt() ->> 'session_id') = (select session_id from public.active_sessions where profile_id = auth.uid()),
    true
  )
$$;
grant execute on function public.session_is_current() to authenticated;

-- 5) Enforcement en RLS: una sesión superada no lee ni escribe datos
drop policy if exists "read company sessions" on public.sessions;
create policy "read company sessions" on public.sessions
  for select using (
    (company_id = public.my_company_id() or public.is_platform_admin())
    and public.session_is_current()
  );

drop policy if exists "insert company sessions" on public.sessions;
create policy "insert company sessions" on public.sessions
  for insert with check (
    company_id = public.my_company_id()
    and created_by = auth.uid()
    and public.org_access_state() = 'ok'
    and public.session_is_current()
  );

drop policy if exists "read company session media" on public.session_media;
create policy "read company session media" on public.session_media
  for select using (
    (company_id = public.my_company_id() or public.is_platform_admin())
    and public.session_is_current()
  );

drop policy if exists "insert company session media" on public.session_media;
create policy "insert company session media" on public.session_media
  for insert with check (
    company_id = public.my_company_id()
    and public.org_access_state() = 'ok'
    and public.session_is_current()
  );

-- 6) Badge "posible cuenta compartida" para los paneles ----------
create or replace function public.shared_account_flags(p_company uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare result jsonb; v_company uuid := coalesce(p_company, public.my_company_id());
begin
  if not public.is_platform_admin()
     and not (v_company = public.my_company_id() and public.my_role() = 'org_admin') then
    raise exception 'No autorizado';
  end if;
  select coalesce(jsonb_agg(row_to_json(x)), '[]'::jsonb) into result
  from (
    select t.profile_id, u.email, count(*) as takeovers_24h, max(t.created_at) as last_takeover
    from public.session_takeovers t
    join auth.users u on u.id = t.profile_id
    where t.created_at > now() - interval '24 hours'
      and (p_company is null or t.org_id = v_company)
      and (public.is_platform_admin() or t.org_id = public.my_company_id())
    group by t.profile_id, u.email
    having count(*) > 3
  ) x;
  return result;
end $$;
grant execute on function public.shared_account_flags(uuid) to authenticated;

-- 7) Realtime para que el cliente detecte la toma en vivo -------
do $$ begin
  alter publication supabase_realtime add table public.active_sessions;
exception when duplicate_object then null; when others then null;
end $$;
