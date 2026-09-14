-- FOKO — leads del formulario de contacto (/contacto.html).
-- Público solo puede INSERTAR (vía api/lead.js con service role); leer y
-- marcar como contactado es exclusivo del superadmin de plataforma.
-- Re-ejecutable.

create table if not exists public.leads (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  company      text,
  email        text not null,
  phone        text,
  plan_interest text,
  message      text,
  source       text,              -- de qué página vino: precios, demo, etc.
  contacted    boolean not null default false,
  contacted_at timestamptz,
  created_at   timestamptz not null default now()
);
create index if not exists leads_created_idx on public.leads(created_at desc);
alter table public.leads enable row level security;

-- Sin políticas de select/insert/update para 'authenticated' ni 'anon': el
-- alta la hace api/lead.js con la service role key (que ignora RLS). Los
-- superadmins leen y actualizan vía las RPCs de abajo (security definer).

create or replace function public.admin_leads(p_limit int default 200)
returns jsonb language plpgsql security definer set search_path = public as $$
declare result jsonb;
begin
  if not public.is_platform_admin() then raise exception 'No autorizado'; end if;
  select coalesce(jsonb_agg(row_to_json(l) order by l.created_at desc), '[]'::jsonb) into result
  from (select * from public.leads order by created_at desc limit greatest(1, least(p_limit, 500))) l;
  return result;
end $$;
grant execute on function public.admin_leads(int) to authenticated;

create or replace function public.admin_set_lead_contacted(p_id uuid, p_contacted boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_platform_admin() then raise exception 'No autorizado'; end if;
  update public.leads
    set contacted = p_contacted, contacted_at = case when p_contacted then now() else null end
    where id = p_id;
end $$;
grant execute on function public.admin_set_lead_contacted(uuid, boolean) to authenticated;
