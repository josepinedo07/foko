-- FOKO — evidencia de consentimiento del técnico de campo (cámara/grabación).
-- El checkbox en field-tech.html ya bloquea "Conectar" hasta que se marque;
-- esto deja un registro server-side con timestamp, versión de la política y
-- el código de sala, para poder demostrar que se pidió y se dio el
-- consentimiento en una fecha concreta bajo un texto concreto.
-- Re-ejecutable.

create table if not exists public.consent_log (
  id             bigint generated always as identity primary key,
  room_code      text not null,
  policy_version text not null,
  ip             text,
  user_agent     text,
  accepted_at    timestamptz not null default now()
);
create index if not exists consent_log_room_idx on public.consent_log(room_code, accepted_at desc);
alter table public.consent_log enable row level security;
-- Sin políticas para 'anon'/'authenticated': el alta la hace api/consent.js
-- con la service role key. Solo el superadmin puede leerlo, vía la RPC.

create or replace function public.admin_consent_log(p_room_code text default null, p_limit int default 200)
returns jsonb language plpgsql security definer set search_path = public as $$
declare result jsonb;
begin
  if not public.is_platform_admin() then raise exception 'No autorizado'; end if;
  select coalesce(jsonb_agg(row_to_json(c) order by c.accepted_at desc), '[]'::jsonb) into result
  from (
    select * from public.consent_log
    where p_room_code is null or room_code = p_room_code
    order by accepted_at desc limit greatest(1, least(p_limit, 500))
  ) c;
  return result;
end $$;
grant execute on function public.admin_consent_log(text, int) to authenticated;
