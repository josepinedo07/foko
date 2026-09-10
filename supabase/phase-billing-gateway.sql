-- FOKO — Cobro por pasarela con checkout alojado (prepago / renovación manual).
-- Modo "gateway" junto al "manual" (pilotos comped). No toca asientos ni notas.
-- El adapter concreto vive en api/_billing/*; esto es solo el estado en la DB.
-- Pega en el SQL Editor y Run. Re-ejecutable.

-- ============================================================
-- 0) Retiro de Stripe (no se usa)
-- ============================================================
update public.companies set billing_mode = 'manual' where billing_mode = 'stripe';
alter table public.companies drop column if exists stripe_customer_id;
alter table public.plans     drop column if exists stripe_price_id;
alter table public.plans     drop column if exists stripe_price_id_year;
drop table if exists public.stripe_events;

-- ============================================================
-- 1) Campos nuevos
-- ============================================================
alter table public.plans
  add column if not exists gateway_price_id text;

alter table public.companies
  add column if not exists gateway_customer_id     text,
  add column if not exists gateway_subscription_id text,
  add column if not exists current_period_end      timestamptz,
  add column if not exists billing_interval        text
    check (billing_interval in ('month', 'year'));

alter table public.companies drop constraint if exists companies_billing_mode_check;
alter table public.companies add  constraint companies_billing_mode_check
  check (billing_mode in ('manual', 'gateway'));

-- ============================================================
-- 2) billing_events — idempotencia del webhook
-- ============================================================
create table if not exists public.billing_events (
  id           bigint generated always as identity primary key,
  org_id       uuid references public.companies(id) on delete set null,
  provider     text not null,
  event_id     text not null,
  type         text,
  raw          jsonb not null default '{}'::jsonb,
  processed_at timestamptz,
  created_at   timestamptz not null default now(),
  unique (provider, event_id)
);
alter table public.billing_events enable row level security;
-- sin políticas: solo el service role (ignora RLS) escribe/lee.

-- ============================================================
-- 3) payments — historial de cobros
-- ============================================================
create table if not exists public.payments (
  id           bigint generated always as identity primary key,
  org_id       uuid not null references public.companies(id) on delete cascade,
  provider     text not null,
  external_id  text,
  amount_cents integer not null,
  currency     text not null default 'USD',
  status       text not null check (status in ('succeeded', 'failed', 'refunded')),
  period_start timestamptz,
  period_end   timestamptz,
  created_at   timestamptz not null default now()
);
create index if not exists payments_org_idx on public.payments(org_id, created_at desc);
alter table public.payments enable row level security;
drop policy if exists "org reads its payments" on public.payments;
create policy "org reads its payments" on public.payments
  for select using (org_id = public.my_company_id() or public.is_platform_admin());
grant select on public.payments to authenticated;

-- ============================================================
-- 4) billing_checkouts — intención de alta (pago para crear) o de upgrade
-- ============================================================
create table if not exists public.billing_checkouts (
  id                  uuid primary key default gen_random_uuid(),
  kind                text not null check (kind in ('create', 'upgrade')),
  user_id             uuid not null references auth.users(id) on delete cascade,
  email               text,
  org_id              uuid references public.companies(id) on delete cascade, -- null en 'create'
  org_name            text,                                                  -- null en 'upgrade'
  plan_id             text not null references public.plans(id),
  interval            text not null default 'month' check (interval in ('month', 'year')),
  provider            text not null,
  external_session_id text,
  status              text not null default 'pending'
    check (status in ('pending', 'completed', 'failed', 'expired')),
  created_at          timestamptz not null default now(),
  completed_at        timestamptz
);
create index if not exists billing_checkouts_user_idx on public.billing_checkouts(user_id, created_at desc);
create index if not exists billing_checkouts_ext_idx  on public.billing_checkouts(provider, external_session_id);
alter table public.billing_checkouts enable row level security;
drop policy if exists "user reads own checkouts" on public.billing_checkouts;
create policy "user reads own checkouts" on public.billing_checkouts
  for select using (user_id = auth.uid());
grant select on public.billing_checkouts to authenticated;

-- ============================================================
-- 5) billing_can_checkout — valida antes de crear la sesión de pago
-- ============================================================
create or replace function public.billing_can_checkout(p_plan_id text)
returns jsonb language plpgsql security definer set search_path = public stable as $$
declare v_plan public.plans; v_profile public.profiles;
begin
  select * into v_plan from public.plans where id = p_plan_id;
  if not found then raise exception 'Plan no encontrado'; end if;
  if not coalesce(v_plan.visible, true) then raise exception 'Ese plan no está disponible'; end if;

  select * into v_profile from public.profiles where user_id = auth.uid();
  if not found then
    return jsonb_build_object('kind', 'create', 'plan_id', p_plan_id);
  end if;
  if v_profile.role <> 'org_admin' then
    raise exception 'Solo el administrador de la organización puede cambiar el plan';
  end if;
  return jsonb_build_object('kind', 'upgrade', 'plan_id', p_plan_id, 'org_id', v_profile.company_id);
end $$;
grant execute on function public.billing_can_checkout(text) to authenticated;

-- ============================================================
-- 6) process_billing_payment — transición idempotente (la llama el webhook)
--    p_status: 'succeeded' | 'failed'
-- ============================================================
create or replace function public.process_billing_payment(
  p_provider     text,
  p_event_id     text,
  p_checkout_id  uuid,
  p_external_id  text,
  p_status       text,
  p_amount_cents integer,
  p_currency     text,
  p_period_end   timestamptz
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_ck   public.billing_checkouts;
  v_plan public.plans;
  v_org  uuid;
  v_new  boolean := false;
  v_period_start timestamptz := now();
begin
  -- Idempotencia: si ya vimos este evento, no repetir.
  insert into public.billing_events (provider, event_id, type, raw, org_id)
  values (p_provider, p_event_id, 'payment.' || p_status, '{}'::jsonb, null)
  on conflict (provider, event_id) do nothing;
  if not found then
    return jsonb_build_object('ok', true, 'already_processed', true);
  end if;

  select * into v_ck from public.billing_checkouts where id = p_checkout_id;
  if not found then raise exception 'Checkout no encontrado'; end if;
  select * into v_plan from public.plans where id = v_ck.plan_id;

  if p_status = 'failed' then
    update public.billing_checkouts set status = 'failed' where id = p_checkout_id;
    if v_ck.kind = 'upgrade' and v_ck.org_id is not null then
      update public.companies
        set status = 'past_due',
            past_due_since = coalesce(past_due_since, now())
        where id = v_ck.org_id and status <> 'canceled';
    end if;
    update public.billing_events set org_id = v_ck.org_id, processed_at = now()
      where provider = p_provider and event_id = p_event_id;
    return jsonb_build_object('ok', true, 'status', 'failed');
  end if;

  -- --- pago exitoso ---
  if v_ck.kind = 'create' then
    if exists (select 1 from public.profiles where user_id = v_ck.user_id) then
      -- carrera: el usuario ya tiene org. Reusar.
      select company_id into v_org from public.profiles where user_id = v_ck.user_id;
    else
      insert into public.companies
        (name, plan_id, seat_limit, status, billing_mode, billing_interval, current_period_end)
      values
        (coalesce(nullif(trim(v_ck.org_name), ''), 'Mi organización'),
         v_plan.id, v_plan.included_seats, 'active', 'gateway', v_ck.interval, p_period_end)
      returning id into v_org;
      insert into public.profiles (user_id, company_id, role, status)
      values (v_ck.user_id, v_org, 'org_admin', 'active');
      v_new := true;
    end if;
  else
    v_org := v_ck.org_id;
    update public.companies set
      plan_id            = v_plan.id,
      seat_limit         = greatest(v_plan.included_seats, public.seats_used(v_org)),
      status             = 'active',
      billing_mode       = 'gateway',
      billing_interval   = v_ck.interval,
      current_period_end = p_period_end,
      past_due_since     = null
      where id = v_org;
  end if;

  insert into public.payments
    (org_id, provider, external_id, amount_cents, currency, status, period_start, period_end)
  values
    (v_org, p_provider, p_external_id, p_amount_cents, coalesce(p_currency, 'USD'),
     'succeeded', v_period_start, p_period_end);

  update public.billing_checkouts
    set status = 'completed', completed_at = now(), org_id = v_org
    where id = p_checkout_id;

  update public.billing_events set org_id = v_org, processed_at = now()
    where provider = p_provider and event_id = p_event_id;

  insert into public.audit_log (company_id, actor, action, target_type, target_id, meta)
  values (v_org, v_ck.user_id,
          case when v_new then 'billing.org_created' else 'billing.renewed' end,
          'company', v_org::text,
          jsonb_build_object('plan', v_plan.id, 'interval', v_ck.interval, 'amount_cents', p_amount_cents));

  return jsonb_build_object('ok', true, 'status', 'active', 'org_id', v_org, 'created', v_new);
end $$;
grant execute on function public.process_billing_payment(text, text, uuid, text, text, integer, text, timestamptz) to service_role;

-- ============================================================
-- 7) Cron: marca vencimientos (la lógica de aviso/email vive en api/billing-cron)
-- ============================================================
create or replace function public.billing_lapse_overdue()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_past int; v_due jsonb;
begin
  -- período vencido y aún 'active' -> past_due
  update public.companies
    set status = 'past_due', past_due_since = coalesce(past_due_since, now())
    where billing_mode = 'gateway' and status = 'active'
      and current_period_end is not null and current_period_end < now();
  get diagnostics v_past = row_count;

  -- past_due más allá de la gracia -> canceled
  update public.companies
    set status = 'canceled'
    where billing_mode = 'gateway' and status = 'past_due'
      and past_due_since is not null and past_due_since < now() - interval '14 days';

  -- por vencer en 3 días (para el aviso)
  select coalesce(jsonb_agg(jsonb_build_object(
           'org_id', id, 'name', name, 'current_period_end', current_period_end)), '[]'::jsonb)
    into v_due
    from public.companies
    where billing_mode = 'gateway' and status = 'active'
      and current_period_end between now() and now() + interval '3 days';

  return jsonb_build_object('lapsed_to_past_due', v_past, 'due_soon', v_due);
end $$;
grant execute on function public.billing_lapse_overdue() to service_role;

-- ============================================================
-- 8) org_access_state — defensa: prepago vencido pasada la gracia
-- ============================================================
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
  if c.billing_mode = 'gateway' and c.current_period_end is not null
     and c.current_period_end < now() - interval '7 days' then
    return 'billing_only';
  end if;
  return 'ok';
end $$;
grant execute on function public.org_access_state() to authenticated;

-- ============================================================
-- 9) org_billing — agrega período y modo de recurrencia
-- ============================================================
create or replace function public.org_billing()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_company public.companies; result jsonb;
begin
  select * into v_company from public.companies where id = public.my_company_id();
  if not found then raise exception 'Sin organización'; end if;
  select jsonb_build_object(
    'name', v_company.name, 'status', v_company.status,
    'billing_mode', v_company.billing_mode,
    'billing_interval', v_company.billing_interval,
    'current_period_end', v_company.current_period_end,
    'seat_limit', v_company.seat_limit, 'seats_used', public.seats_used(v_company.id),
    'trial_ends_at', v_company.trial_ends_at,
    'access_state', public.org_access_state(),
    'plan', (select row_to_json(p) from public.plans p where p.id = v_company.plan_id),
    'mrr_cents', public._mrr_cents(v_company.plan_id, public.seats_used(v_company.id))
  ) into result;
  return result;
end $$;
grant execute on function public.org_billing() to authenticated;

-- ============================================================
-- 10) Alta self-serve gratuita retirada (ahora es "pago para crear")
-- ============================================================
create or replace function public.create_company_and_join(company_name text)
returns public.companies language plpgsql security definer set search_path = public as $$
begin
  raise exception 'El alta ahora requiere un plan de pago. Elige uno en /precios.';
end $$;
