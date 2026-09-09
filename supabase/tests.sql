-- FOKO — pruebas de la capa multi-tenant / planes / facturación.
-- Corre en el SQL Editor de Supabase. Crea una función temporal, corre todo
-- dentro de begin/rollback (no deja datos) y devuelve PASS/FAIL por prueba.

begin;

create or replace function _qa() returns table(test text, result text) language plpgsql as $$
declare v int; v_txt text; v_err text;
begin
  -- ---- Fixtures ----
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, created_at, updated_at) values
    ('00000000-0000-0000-0000-000000000000','11111111-1111-1111-1111-111111111111','authenticated','authenticated','t_admin@qa.foko','x',now(),now()),
    ('00000000-0000-0000-0000-000000000000','22222222-2222-2222-2222-222222222222','authenticated','authenticated','t_expert@qa.foko','x',now(),now()),
    ('00000000-0000-0000-0000-000000000000','33333333-3333-3333-3333-333333333333','authenticated','authenticated','t_field1@qa.foko','x',now(),now()),
    ('00000000-0000-0000-0000-000000000000','44444444-4444-4444-4444-444444444444','authenticated','authenticated','t_field2@qa.foko','x',now(),now());
  insert into public.companies (id, name, slug, plan_id, seat_limit, status, trial_ends_at)
    values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','QA Org','qa-org','arranque',2,'trialing',now()+interval '10 days');
  insert into public.profiles (user_id, company_id, role, status) values
    ('11111111-1111-1111-1111-111111111111','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','org_admin','active'),
    ('22222222-2222-2222-2222-222222222222','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','expert','active'),
    ('33333333-3333-3333-3333-333333333333','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','field_tech','active'),
    ('44444444-4444-4444-4444-444444444444','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','field_tech','active');

  -- ---- 1. MRR ----
  test:='MRR flat arranque (fijo)';        result:=case when public._mrr_cents('arranque',2)=3900 then 'PASS' else 'FAIL got '||public._mrr_cents('arranque',2) end; return next;
  test:='MRR flat cuadrilla sin extras';   result:=case when public._mrr_cents('cuadrilla',8)=9900 then 'PASS' else 'FAIL got '||public._mrr_cents('cuadrilla',8) end; return next;
  test:='MRR flat cuadrilla 3 extras';     result:=case when public._mrr_cents('cuadrilla',11)=9900+3*1200 then 'PASS' else 'FAIL got '||public._mrr_cents('cuadrilla',11) end; return next;
  test:='MRR flat flota 10 extras';        result:=case when public._mrr_cents('flota',60)=44900+10*900 then 'PASS' else 'FAIL got '||public._mrr_cents('flota',60) end; return next;
  test:='MRR per_seat founder 7';          result:=case when public._mrr_cents('founder',7)=7*900 then 'PASS' else 'FAIL got '||public._mrr_cents('founder',7) end; return next;
  test:='MRR per_seat founder < mínimo';   result:=case when public._mrr_cents('founder',2)=5*900 then 'PASS' else 'FAIL got '||public._mrr_cents('founder',2) end; return next;

  -- ---- 2. seats_used cuenta solo field_tech activos ----
  test:='seats_used = 2 field_tech (expert/admin no cuentan)';
    result:=case when public.seats_used('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')=2 then 'PASS' else 'FAIL got '||public.seats_used('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') end; return next;
  update public.profiles set status='disabled' where user_id='44444444-4444-4444-4444-444444444444';
  test:='seats_used = 1 tras deshabilitar un field_tech';
    result:=case when public.seats_used('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')=1 then 'PASS' else 'FAIL got '||public.seats_used('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') end; return next;
  update public.profiles set status='active' where user_id='44444444-4444-4444-4444-444444444444';

  -- ---- 3. Acceso por rol: expert no puede admin_orgs() ----
  perform set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222"}', true);
  begin
    perform public.admin_orgs();
    test:='expert NO puede admin_orgs()'; result:='FAIL (no lanzó excepción)'; return next;
  exception when others then
    test:='expert NO puede admin_orgs()'; result:=case when sqlerrm ilike '%autorizado%' then 'PASS' else 'FAIL: '||sqlerrm end; return next;
  end;

  -- ---- 4. Enforcement de asientos (solo field_tech) ----
  perform set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111"}', true);
  begin
    perform public.invite_user('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','nf@qa.foko','field_tech');
    test:='invite_user(field_tech) al límite → bloquea'; result:='FAIL (no bloqueó)'; return next;
  exception when others then
    test:='invite_user(field_tech) al límite → bloquea'; result:=case when sqlerrm ilike '%Sube a %' then 'PASS' else 'FAIL: '||sqlerrm end; return next;
  end;
  begin
    perform public.invite_user('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','no@qa.foko','expert');
    test:='invite_user(expert) NO consume asiento → permite'; result:='PASS'; return next;
  exception when others then
    test:='invite_user(expert) NO consume asiento → permite'; result:='FAIL: '||sqlerrm; return next;
  end;

  -- ---- 5. Muro de facturación ----
  perform set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222"}', true);
  update public.companies set status='paused' where id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  test:='status paused → org_access_state = billing_only';
    result:=case when public.org_access_state()='billing_only' then 'PASS' else 'FAIL got '||public.org_access_state() end; return next;
  update public.companies set status='trialing', trial_ends_at=now()-interval '1 day' where id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  test:='trial vencido → org_access_state = billing_only';
    result:=case when public.org_access_state()='billing_only' then 'PASS' else 'FAIL got '||public.org_access_state() end; return next;
end $$;

select test, result from _qa();

rollback;
