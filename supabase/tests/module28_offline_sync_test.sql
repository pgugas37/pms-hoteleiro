-- Teste da migration module28_offline_sync. Tudo é desfeito no fim (o bloco termina com raise exception).
-- Passa quando a mensagem começa com "RESULTADO: tudo certo".
do $$
declare
  v_admin uuid := (select id from public.profiles where role = 'admin' and active order by created_at limit 1);
  v_guest uuid := (select id from public.guests where active order by created_at limit 1);
  v_room uuid := (select id from public.rooms where status = 'disponivel' order by number limit 1);
  v_res uuid := '00000000-0000-4000-8000-0000000000a1';
  v_pay uuid := '00000000-0000-4000-8000-0000000000b1';
  v_pay_old uuid := '00000000-0000-4000-8000-0000000000b2';
  v_ret uuid;
  v_count int;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);

  insert into public.reservations (id, guest_id, room_id, check_in, check_out, adults, children, daily_rate, status, notes)
  values (v_res, v_guest, v_room, current_date, current_date + 2, 1, 0, 100, 'confirmada', 'TESTE OFFLINE');

  -- check-in repetido não dá erro e guarda a hora real
  perform public.checkin_reservation(v_res, now() - interval '30 minutes');
  perform public.checkin_reservation(v_res, now() - interval '30 minutes');
  assert (select status from public.reservations where id = v_res) = 'em_andamento', 'check-in';
  assert (select checked_in_at from public.reservations where id = v_res) < now() - interval '29 minutes', 'hora real do check-in';
  assert (select status from public.rooms where id = v_room) = 'ocupado', 'quarto ocupado';

  -- pagamento com a mesma etiqueta duas vezes = um só
  v_ret := public.register_payment(v_res, 50, 'pix', null, v_pay, now() - interval '1 hour');
  assert v_ret = v_pay, 'devolve a etiqueta';
  v_ret := public.register_payment(v_res, 50, 'pix', null, v_pay, now() - interval '1 hour');
  select count(*) into v_count from public.payments where id = v_pay;
  assert v_count = 1, 'pagamento repetido gravou duas vezes';
  assert (select created_at from public.payments where id = v_pay) < now() - interval '59 minutes', 'hora real do pagamento';

  -- hora fora do limite (10 dias atrás) vira now()
  perform public.register_payment(v_res, 10, 'dinheiro', null, v_pay_old, now() - interval '10 days');
  assert (select created_at from public.payments where id = v_pay_old) = now(), 'hora fora do limite';

  -- chamada do app antigo (sem os parâmetros novos) continua funcionando
  v_ret := public.register_payment(p_reservation_id => v_res, p_amount => 5, p_method => 'pix', p_notes => null);
  assert v_ret is not null, 'chamada antiga de pagamento';

  -- updated_at muda ao editar pagamento
  update public.payments set notes = 'x' where id = v_pay;
  assert (select updated_at from public.payments where id = v_pay) = now(), 'updated_at do pagamento';

  -- check-out repetido, limpeza repetida
  perform public.checkout_reservation(v_res, now() - interval '5 minutes');
  perform public.checkout_reservation(v_res);
  assert (select status from public.reservations where id = v_res) = 'finalizada', 'check-out';
  perform public.mark_room_clean(v_room);
  perform public.mark_room_clean(v_room);
  assert (select status from public.rooms where id = v_room) = 'disponivel', 'limpeza';

  -- cancelamento repetido
  update public.reservations set status = 'confirmada' where id = v_res;
  perform public.cancel_reservation(v_res, 'outro', 'teste');
  perform public.cancel_reservation(v_res, 'outro', 'teste');
  assert (select status from public.reservations where id = v_res) = 'cancelada', 'cancelamento';

  -- exclusões geram registro em sync_deletions
  delete from public.payments where reservation_id = v_res;
  delete from public.reservations where id = v_res;
  select count(*) into v_count from public.sync_deletions where row_id in (v_res, v_pay, v_pay_old);
  assert v_count = 3, 'registro de exclusões';

  raise exception 'RESULTADO: tudo certo (check-in/out, limpeza, cancelamento e pagamento aceitam repetição; hora real; exclusões registradas)';
end
$$;
