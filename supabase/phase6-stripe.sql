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
