-- FOKO — pruebas pgTAP de la capa multi-tenant / facturación.
-- Corre en el SQL Editor de Supabase. Todo va dentro de una transacción que
-- hace ROLLBACK: no deja datos.
--
--   1) create extension if not exists pgtap;   (una vez)
--   2) pega este archivo y Run
--
-- Simula usuarios con  set local request.jwt.claims  y  set local role authenticated.

begin;
create extension if not exists pgtap;
select plan(10);

-- ---- Fixtures -----------------------------------------------------------
-- Usuarios de auth (mínimo viable)
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000','11111111-1111-1111-1111-111111111111','authenticated','authenticated','t_admin@test.foko','x', now(), now()),
  ('00000000-0000-0000-0000-000000000000','22222222-2222-2222-2222-222222222222','authenticated','authenticated','t_expert@test.foko','x', now(), now()),
  ('00000000-0000-0000-0000-000000000000','33333333-3333-3333-3333-333333333333','authenticated','authenticated','t_outsider@test.foko','x', now(), now());

insert into public.companies (id, name, slug, plan_id, seat_limit, status, trial_ends_at)
values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','Test Org','test-org','cuadrilla', 2, 'trialing', now() + interval '10 days');

insert into public.profiles (user_id, company_id, role, status) values
  ('11111111-1111-1111-1111-111111111111','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','org_admin','active'),
  ('22222222-2222-2222-2222-222222222222','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','expert','active');

-- helper para actuar como un usuario
create or replace function _as(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid::text)::text, true);
  perform set_config('role', 'authenticated', true);
end $$;

-- ---- 1. MRR ------------------------------------------------------------
select is( public._mrr_cents('cuadrilla', 4), 7900 + 0, 'MRR: 4 asientos usados <= 6 incluidos -> solo el base' );
select is( public._mrr_cents('cuadrilla', 8), 7900 + 2*1200, 'MRR: 2 asientos extra -> base + 2*per_extra' );
select is( public._mrr_cents('flota', 60), 44900 + 10*900, 'MRR: flota con 10 extra' );

-- ---- 2. seats_used cuenta solo activos --------------------------------
select is( public.seats_used('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'), 2, 'seats_used = 2 activos' );
update public.profiles set status = 'disabled' where user_id = '22222222-2222-2222-2222-222222222222';
select is( public.seats_used('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'), 1, 'seats_used = 1 tras deshabilitar' );
update public.profiles set status = 'active' where user_id = '22222222-2222-2222-2222-222222222222';

-- ---- 3. Acceso por rol ----------------------------------------------
select _as('22222222-2222-2222-2222-222222222222');
select throws_ok( 'select public.admin_orgs()', 'No autorizado', 'expert NO puede llamar admin_orgs()' );
select throws_ok( 'select public.admin_create_organization(''X'',''x@y.z'',''cuadrilla'')', 'No autorizado', 'expert NO puede crear organizaciones' );

-- ---- 4. Enforcement de asientos ------------------------------------
select _as('11111111-1111-1111-1111-111111111111');  -- org_admin, seat_limit 2, 2 activos
select throws_like(
  'select public.invite_user(''aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'', ''nuevo@test.foko'', ''expert'')',
  '%asientos disponibles%',
  'invite_user falla cuando se llegó al límite de asientos' );

update public.companies set seat_limit = 3 where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
select lives_ok(
  'select public.invite_user(''aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'', ''nuevo@test.foko'', ''expert'')',
  'invite_user funciona con un asiento libre' );

-- ---- 5. Muro por trial vencido -----------------------------------
select _as('22222222-2222-2222-2222-222222222222');
update public.companies set trial_ends_at = now() - interval '1 day' where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
select is( public.org_access_state(), 'billing_only', 'trial vencido -> org_access_state = billing_only' );

select * from finish();
rollback;
