-- FOKO — pruebas del cobro por pasarela. Corre en el SQL Editor.
-- Todo dentro de begin/rollback: no deja datos. Devuelve PASS/FAIL por prueba.

begin;

create or replace function _qa_billing() returns table(test text, result text) language plpgsql as $$
declare
  v_user  uuid := '90000000-0000-0000-0000-000000000001';
  v_user2 uuid := '90000000-0000-0000-0000-000000000002';
  v_ck    uuid;
  v_ck2   uuid;
  v_org   uuid;
  v_r     jsonb;
  v_cnt   int;
  v_state text;
begin
  -- Fixtures: dos usuarios sin organización.
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, created_at, updated_at) values
    ('00000000-0000-0000-0000-000000000000', v_user,  'authenticated','authenticated','qa_pay1@foko','x',now(),now()),
    ('00000000-0000-0000-0000-000000000000', v_user2, 'authenticated','authenticated','qa_pay2@foko','x',now(),now());

  -- ============ 1. Activación por webhook (pago para crear) ============
  insert into public.billing_checkouts (kind, user_id, email, org_name, plan_id, interval, provider)
    values ('create', v_user, 'qa_pay1@foko', 'QA Pagos SA', 'equipo', 'month', 'sim')
    returning id into v_ck;

  test := 'antes del webhook: el usuario no tiene organización';
  result := case when not exists (select 1 from public.profiles where user_id = v_user)
                 then 'PASS' else 'FAIL' end; return next;

  v_r := public.process_billing_payment('sim', 'evt_qa_1', v_ck, 'sim_qa_1', 'succeeded',
                                        3900, 'USD', now() + interval '30 days');
  v_org := (v_r->>'org_id')::uuid;

  test := 'webhook exitoso crea la organización activa';
  result := case when (select status from public.companies where id = v_org) = 'active'
                  and (select billing_mode from public.companies where id = v_org) = 'gateway'
                 then 'PASS' else 'FAIL got '||coalesce((select status from public.companies where id = v_org),'null') end; return next;

  test := 'el usuario queda como org_admin activo';
  result := case when (select role from public.profiles where user_id = v_user) = 'org_admin'
                 then 'PASS' else 'FAIL' end; return next;

  test := 'se registró un pago succeeded';
  result := case when (select count(*) from public.payments where org_id = v_org and status = 'succeeded') = 1
                 then 'PASS' else 'FAIL' end; return next;

  test := 'el checkout quedó completed';
  result := case when (select status from public.billing_checkouts where id = v_ck) = 'completed'
                 then 'PASS' else 'FAIL' end; return next;

  -- ============ 2. Idempotencia: mismo event_id no repite ============
  v_r := public.process_billing_payment('sim', 'evt_qa_1', v_ck, 'sim_qa_1', 'succeeded',
                                        3900, 'USD', now() + interval '30 days');
  test := 'reenviar el mismo evento -> already_processed';
  result := case when (v_r->>'already_processed') = 'true' then 'PASS' else 'FAIL' end; return next;

  test := 'no se duplicó el pago';
  result := case when (select count(*) from public.payments where org_id = v_org) = 1
                 then 'PASS' else 'FAIL got '||(select count(*) from public.payments where org_id = v_org) end; return next;

  -- ============ 3. Checkout inexistente -> error ============
  begin
    perform public.process_billing_payment('sim', 'evt_qa_x', gen_random_uuid(), 'x', 'succeeded', 100, 'USD', now());
    test := 'checkout inexistente -> lanza'; result := 'FAIL (no lanzó)'; return next;
  exception when others then
    test := 'checkout inexistente -> lanza'; result := 'PASS'; return next;
  end;

  -- ============ 4. Muro por past_due pasada la gracia ============
  update public.companies set status = 'past_due', past_due_since = now() - interval '8 days' where id = v_org;
  perform set_config('request.jwt.claims', json_build_object('sub', v_user)::text, true);
  v_state := public.org_access_state();
  test := 'past_due > 7 días -> org_access_state = billing_only';
  result := case when v_state = 'billing_only' then 'PASS' else 'FAIL got '||v_state end; return next;

  update public.companies set past_due_since = now() - interval '2 days' where id = v_org;
  v_state := public.org_access_state();
  test := 'past_due dentro de la gracia -> ok';
  result := case when v_state = 'ok' then 'PASS' else 'FAIL got '||v_state end; return next;
  perform set_config('request.jwt.claims', '', true);

  -- ============ 5. Prepago vencido -> billing_lapse_overdue lo marca ============
  update public.companies set status = 'active', past_due_since = null,
         current_period_end = now() - interval '1 day' where id = v_org;
  perform public.billing_lapse_overdue();
  test := 'período vencido y active -> pasa a past_due';
  result := case when (select status from public.companies where id = v_org) = 'past_due'
                 then 'PASS' else 'FAIL got '||(select status from public.companies where id = v_org) end; return next;

  -- ============ 6. Downgrade de seat_limit no expulsa, pero bloquea altas ============
  -- Org con 2 asientos pro ocupados, baja a un plan de 1 asiento incluido.
  update public.companies set status = 'active', current_period_end = now() + interval '30 days' where id = v_org;
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, created_at, updated_at) values
    ('00000000-0000-0000-0000-000000000000','90000000-0000-0000-0000-000000000003','authenticated','authenticated','qa_pro1@foko','x',now(),now());
  insert into public.profiles (user_id, company_id, role, status)
    values ('90000000-0000-0000-0000-000000000003', v_org, 'pro', 'active');
  -- ahora 2 asientos usados (org_admin + pro); upgrade a 'individual' (included_seats = 1)
  insert into public.billing_checkouts (kind, user_id, org_id, plan_id, interval, provider)
    values ('upgrade', v_user, v_org, 'individual', 'month', 'sim') returning id into v_ck2;
  perform public.process_billing_payment('sim', 'evt_qa_down', v_ck2, 'sim_down', 'succeeded',
                                         1500, 'USD', now() + interval '30 days');

  test := 'downgrade: seat_limit = max(incluidos, usados) y nadie es expulsado';
  result := case when (select seat_limit from public.companies where id = v_org) = 2
                  and (select count(*) from public.profiles where company_id = v_org and status = 'active') = 2
                 then 'PASS' else 'FAIL seat_limit='||(select seat_limit from public.companies where id = v_org) end; return next;

  perform set_config('request.jwt.claims', json_build_object('sub', v_user)::text, true);
  begin
    perform public.invite_user(v_org, 'nuevo_pro@foko', 'pro');
    test := 'downgrade: invitar otro pro sobre el límite -> bloquea'; result := 'FAIL (no bloqueó)'; return next;
  exception when others then
    test := 'downgrade: invitar otro pro sobre el límite -> bloquea';
    result := case when sqlerrm ilike '%plan%' or sqlerrm ilike '%asiento%' or sqlerrm ilike '%límite%'
                   then 'PASS' else 'FAIL: '||sqlerrm end; return next;
  end;
  perform set_config('request.jwt.claims', '', true);
end $$;

select test, result from _qa_billing();

rollback;
