-- ====================================================================
-- Enlaces de llamada (duran días) + timbre entrante para la oficina
-- --------------------------------------------------------------------
-- El técnico de oficina crea un enlace con nombre ("Grúas Pérez – Juan")
-- que vence en 1-4 días. Quien lo abre escribe su nombre y toca "Llamar":
-- se crea una solicitud "ringing" y a todos los técnicos de oficina de la
-- empresa (org_admin / pro) les suena en FOKO vía Realtime. El primero que
-- acepta se queda con la llamada (accept_call es atómico) y su sala FK-XXXXXX
-- se le entrega al que llama, que se conecta como hoy.
--
-- Quien llama no tiene cuenta: solo usa las RPC security definer de abajo,
-- que exigen el token del enlace (o el secreto de su propia solicitud).
-- Re-ejecutable.
-- ====================================================================

create table if not exists public.call_links (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies(id) on delete cascade,
  created_by  uuid not null references auth.users(id) on delete cascade,
  token       text not null unique default replace(gen_random_uuid()::text, '-', ''),
  label       text not null check (char_length(label) between 1 and 80),
  expires_at  timestamptz not null,
  revoked_at  timestamptz,
  created_at  timestamptz not null default now(),
  constraint call_links_max_life check (expires_at <= created_at + interval '7 days')
);
create index if not exists call_links_company_idx on public.call_links (company_id, created_at desc);

create table if not exists public.call_requests (
  id            uuid primary key default gen_random_uuid(),
  link_id       uuid not null references public.call_links(id) on delete cascade,
  company_id    uuid not null references public.companies(id) on delete cascade,
  caller_name   text not null check (char_length(caller_name) between 1 and 60),
  caller_secret text not null,
  status        text not null default 'ringing' check (status in ('ringing','accepted','missed','cancelled')),
  room_code     text,
  answered_by   uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  answered_at   timestamptz
);
create index if not exists call_requests_company_idx on public.call_requests (company_id, created_at desc);
create index if not exists call_requests_link_idx on public.call_requests (link_id, created_at desc);

-- --- RLS -------------------------------------------------------------
alter table public.call_links enable row level security;
alter table public.call_requests enable row level security;

drop policy if exists "office reads company call links" on public.call_links;
create policy "office reads company call links" on public.call_links
  for select using (
    company_id = public.my_company_id()
    and public.my_role() in ('org_admin', 'pro')
    and public.session_is_current()
  );

drop policy if exists "office creates call links" on public.call_links;
create policy "office creates call links" on public.call_links
  for insert with check (
    company_id = public.my_company_id()
    and created_by = auth.uid()
    and public.my_role() in ('org_admin', 'pro')
    and public.org_access_state() = 'ok'
    and public.session_is_current()
    and expires_at <= now() + interval '7 days'
  );

drop policy if exists "office revokes call links" on public.call_links;
create policy "office revokes call links" on public.call_links
  for update using (
    company_id = public.my_company_id()
    and public.my_role() in ('org_admin', 'pro')
    and public.session_is_current()
  );
-- Solo se puede anular (revoked_at); nada más del enlace es editable.
revoke update on public.call_links from authenticated;
grant update (revoked_at) on public.call_links to authenticated;

drop policy if exists "office reads company calls" on public.call_requests;
create policy "office reads company calls" on public.call_requests
  for select using (
    company_id = public.my_company_id()
    and public.my_role() in ('org_admin', 'pro')
    and public.session_is_current()
  );
-- Sin políticas de insert/update: las solicitudes solo cambian vía las RPC.

-- --- Acceso de la empresa (sin sesión: quien llama es anónimo) -------
-- Misma regla que org_access_state(), pero para una empresa dada.
create or replace function public._company_can_call(p_company uuid)
returns boolean language plpgsql security definer set search_path = public stable as $$
declare c public.companies;
begin
  select * into c from public.companies where id = p_company;
  if not found then return false; end if;
  if c.status in ('canceled', 'paused') then return false; end if;
  if c.status = 'trialing' and c.trial_ends_at is not null and c.trial_ends_at < now() then return false; end if;
  if c.status = 'past_due' and c.past_due_since is not null and c.past_due_since < now() - interval '7 days' then return false; end if;
  if c.billing_mode = 'gateway' and c.current_period_end is not null
     and c.current_period_end < now() - interval '7 days' then return false; end if;
  return true;
end $$;
revoke all on function public._company_can_call(uuid) from public, anon, authenticated;

-- Cuánto suena antes de darse por perdida (igual a RING_SECONDS en js/limits.js).
create or replace function public._ring_window()
returns interval language sql immutable as $$ select interval '60 seconds' $$;

-- --- Quien llama (anónimo) -------------------------------------------
create or replace function public.call_link_info(p_token text)
returns jsonb language plpgsql security definer set search_path = public stable as $$
declare l public.call_links; c public.companies;
begin
  select * into l from public.call_links where token = p_token;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  if l.revoked_at is not null then return jsonb_build_object('ok', false, 'reason', 'revoked'); end if;
  if l.expires_at < now() then return jsonb_build_object('ok', false, 'reason', 'expired'); end if;
  if not public._company_can_call(l.company_id) then return jsonb_build_object('ok', false, 'reason', 'unavailable'); end if;
  select * into c from public.companies where id = l.company_id;
  return jsonb_build_object(
    'ok', true, 'label', l.label, 'expires_at', l.expires_at,
    'company', jsonb_build_object('name', c.name, 'logoUrl', c.logo_url)
  );
end $$;
grant execute on function public.call_link_info(text) to anon, authenticated;

create or replace function public.start_call(p_token text, p_name text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare l public.call_links; v_name text := btrim(coalesce(p_name, '')); v_id uuid; v_secret text;
begin
  select * into l from public.call_links where token = p_token;
  if not found or l.revoked_at is not null or l.expires_at < now() then
    return jsonb_build_object('ok', false, 'reason', 'invalid_link');
  end if;
  if not public._company_can_call(l.company_id) then return jsonb_build_object('ok', false, 'reason', 'unavailable'); end if;
  if char_length(v_name) < 1 then return jsonb_build_object('ok', false, 'reason', 'name_required'); end if;
  v_name := left(v_name, 60);
  -- Freno al abuso de un enlace filtrado: 20 llamadas por hora por enlace.
  if (select count(*) from public.call_requests
      where link_id = l.id and created_at > now() - interval '1 hour') >= 20 then
    return jsonb_build_object('ok', false, 'reason', 'rate_limited');
  end if;
  v_secret := replace(gen_random_uuid()::text, '-', '');
  insert into public.call_requests (link_id, company_id, caller_name, caller_secret)
  values (l.id, l.company_id, v_name, v_secret)
  returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id, 'secret', v_secret,
                            'ring_seconds', extract(epoch from public._ring_window())::int);
end $$;
grant execute on function public.start_call(text, text) to anon, authenticated;

create or replace function public.call_status(p_id uuid, p_secret text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r public.call_requests;
begin
  select * into r from public.call_requests where id = p_id and caller_secret = p_secret;
  if not found then return jsonb_build_object('status', 'not_found'); end if;
  if r.status = 'ringing' and r.created_at < now() - public._ring_window() then
    update public.call_requests set status = 'missed' where id = r.id and status = 'ringing';
    return jsonb_build_object('status', 'missed');
  end if;
  return jsonb_build_object('status', r.status, 'room_code', r.room_code);
end $$;
grant execute on function public.call_status(uuid, text) to anon, authenticated;

create or replace function public.cancel_call(p_id uuid, p_secret text)
returns void language sql security definer set search_path = public as $$
  update public.call_requests set status = 'cancelled'
  where id = p_id and caller_secret = p_secret and status = 'ringing';
$$;
grant execute on function public.cancel_call(uuid, text) to anon, authenticated;

-- --- Oficina ---------------------------------------------------------
-- Atómico: si dos contestan a la vez, solo uno recibe true.
create or replace function public.accept_call(p_id uuid, p_room text)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or coalesce(public.my_role(), '') not in ('org_admin', 'pro') then return false; end if;
  if not public.session_is_current() or public.org_access_state() <> 'ok' then return false; end if;
  if p_room !~ '^FK-[0-9A-F]{6}$' then return false; end if;
  update public.call_requests
     set status = 'accepted', room_code = p_room, answered_by = auth.uid(), answered_at = now()
   where id = p_id
     and company_id = public.my_company_id()
     and status = 'ringing'
     and created_at > now() - public._ring_window();
  return found;
end $$;
revoke all on function public.accept_call(uuid, text) from public, anon;
grant execute on function public.accept_call(uuid, text) to authenticated;

-- Realtime: el timbre llega a la oficina al instante.
do $$ begin
  alter publication supabase_realtime add table public.call_requests;
exception when duplicate_object then null; when others then null;
end $$;
