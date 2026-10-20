-- module28_offline_sync: base para o app offline (ver docs/offline/design.md §4)

-- 1. updated_at onde faltava (para o aparelho baixar só o que mudou)
alter table public.payments add column if not exists updated_at timestamptz not null default now();
alter table public.maintenance_requests add column if not exists updated_at timestamptz not null default now();
alter table public.internal_notes add column if not exists updated_at timestamptz not null default now();
alter table public.seasonal_rates add column if not exists updated_at timestamptz not null default now();

update public.payments set updated_at = created_at;
update public.maintenance_requests set updated_at = coalesce(resolved_at, created_at);
update public.internal_notes set updated_at = created_at;
update public.seasonal_rates set updated_at = created_at;

create trigger payments_set_updated_at before update on public.payments
  for each row execute function public.set_updated_at();
create trigger maintenance_requests_set_updated_at before update on public.maintenance_requests
  for each row execute function public.set_updated_at();
create trigger internal_notes_set_updated_at before update on public.internal_notes
  for each row execute function public.set_updated_at();
create trigger seasonal_rates_set_updated_at before update on public.seasonal_rates
  for each row execute function public.set_updated_at();

create index if not exists hotels_updated_at_idx on public.hotels (updated_at);
create index if not exists room_types_updated_at_idx on public.room_types (updated_at);
create index if not exists rooms_updated_at_idx on public.rooms (updated_at);
create index if not exists guests_updated_at_idx on public.guests (updated_at);
create index if not exists reservations_updated_at_idx on public.reservations (updated_at);
create index if not exists payments_updated_at_idx on public.payments (updated_at);
create index if not exists seasonal_rates_updated_at_idx on public.seasonal_rates (updated_at);
create index if not exists maintenance_requests_updated_at_idx on public.maintenance_requests (updated_at);
create index if not exists internal_notes_updated_at_idx on public.internal_notes (updated_at);
create index if not exists profiles_updated_at_idx on public.profiles (updated_at);

-- 2. registro de exclusões (os aparelhos apagam da cópia o que foi excluído no servidor)
create table public.sync_deletions (
  id bigint generated always as identity primary key,
  table_name text not null,
  row_id uuid not null,
  deleted_at timestamptz not null default now()
);
create index sync_deletions_deleted_at_idx on public.sync_deletions (deleted_at);
alter table public.sync_deletions enable row level security;
create policy sync_deletions_select_authenticated on public.sync_deletions
  for select to authenticated using (true);
revoke insert, update, delete on public.sync_deletions from anon, authenticated;

create or replace function private.log_sync_deletion()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'private'
as $$
begin
  insert into public.sync_deletions (table_name, row_id) values (tg_table_name, old.id);
  return old;
end;
$$;

create trigger guests_log_sync_deletion after delete on public.guests for each row execute function private.log_sync_deletion();
create trigger reservations_log_sync_deletion after delete on public.reservations for each row execute function private.log_sync_deletion();
create trigger payments_log_sync_deletion after delete on public.payments for each row execute function private.log_sync_deletion();
create trigger rooms_log_sync_deletion after delete on public.rooms for each row execute function private.log_sync_deletion();
create trigger room_types_log_sync_deletion after delete on public.room_types for each row execute function private.log_sync_deletion();
create trigger seasonal_rates_log_sync_deletion after delete on public.seasonal_rates for each row execute function private.log_sync_deletion();
create trigger maintenance_requests_log_sync_deletion after delete on public.maintenance_requests for each row execute function private.log_sync_deletion();
create trigger internal_notes_log_sync_deletion after delete on public.internal_notes for each row execute function private.log_sync_deletion();
create trigger hotels_log_sync_deletion after delete on public.hotels for each row execute function private.log_sync_deletion();

-- 3. hora informada pelo aparelho, só se for plausível
create or replace function private.client_time(p_at timestamptz)
returns timestamptz
language sql
stable
set search_path to ''
as $$
  select case
    when p_at is not null and p_at between now() - interval '3 days' and now() + interval '5 minutes' then p_at
    else now()
  end
$$;

-- 4. RPCs que aceitam repetição (o aparelho pode reenviar depois de uma queda)
drop function public.checkin_reservation(uuid);
create function public.checkin_reservation(p_reservation_id uuid, p_at timestamptz default null)
returns void
language plpgsql
security definer
set search_path to 'public', 'private'
as $function$
declare
  v_room_id uuid;
  v_status text;
  v_check_in date;
begin
  if not private.has_role(array['admin', 'gerente', 'recepcao']) then
    raise exception 'Sem permissão para fazer check-in';
  end if;

  select room_id, status, check_in into v_room_id, v_status, v_check_in
  from public.reservations
  where id = p_reservation_id
  for update;

  if not found then
    raise exception 'Reserva não encontrada';
  end if;

  if v_status = 'em_andamento' then
    return; -- já feito (envio repetido)
  end if;

  if v_status <> 'confirmada' then
    raise exception 'Só é possível fazer check-in de uma reserva confirmada';
  end if;

  if v_check_in > current_date then
    raise exception 'Check-in só pode ser feito a partir da data marcada';
  end if;

  update public.reservations
  set status = 'em_andamento', checked_in_at = private.client_time(p_at)
  where id = p_reservation_id;

  update public.rooms set status = 'ocupado' where id = v_room_id;
end;
$function$;
revoke all on function public.checkin_reservation(uuid, timestamptz) from public, anon;
grant execute on function public.checkin_reservation(uuid, timestamptz) to authenticated;

drop function public.checkout_reservation(uuid);
create function public.checkout_reservation(p_reservation_id uuid, p_at timestamptz default null)
returns void
language plpgsql
security definer
set search_path to 'public', 'private'
as $function$
declare
  v_room_id uuid;
  v_status text;
begin
  if not private.has_role(array['admin', 'gerente', 'recepcao']) then
    raise exception 'Sem permissão para fazer check-out';
  end if;

  select room_id, status into v_room_id, v_status
  from public.reservations
  where id = p_reservation_id
  for update;

  if not found then
    raise exception 'Reserva não encontrada';
  end if;

  if v_status = 'finalizada' then
    return; -- já feito (envio repetido)
  end if;

  if v_status <> 'em_andamento' then
    raise exception 'Só é possível fazer check-out de uma reserva em andamento';
  end if;

  update public.reservations
  set status = 'finalizada', checked_out_at = private.client_time(p_at)
  where id = p_reservation_id;

  update public.rooms set status = 'limpeza' where id = v_room_id;
end;
$function$;
revoke all on function public.checkout_reservation(uuid, timestamptz) from public, anon;
grant execute on function public.checkout_reservation(uuid, timestamptz) to authenticated;

create or replace function public.cancel_reservation(p_reservation_id uuid, p_reason text default null, p_notes text default null)
returns void
language plpgsql
security definer
set search_path to 'public', 'private'
as $function$
declare
  v_room_id uuid;
  v_status text;
begin
  if not private.has_role(array['admin', 'gerente', 'recepcao']) then
    raise exception 'Sem permissão para cancelar reserva';
  end if;

  if p_reason is not null and p_reason not in ('hospede_avisou', 'no_show', 'outro') then
    raise exception 'Motivo de cancelamento inválido';
  end if;

  select room_id, status into v_room_id, v_status
  from public.reservations
  where id = p_reservation_id
  for update;

  if not found then
    raise exception 'Reserva não encontrada';
  end if;

  if v_status = 'cancelada' then
    return; -- já feito (envio repetido)
  end if;

  if v_status not in ('confirmada', 'em_andamento') then
    raise exception 'Só é possível cancelar reservas confirmadas ou em andamento';
  end if;

  update public.reservations
  set status = 'cancelada',
      cancellation_reason = p_reason,
      cancellation_notes = nullif(btrim(p_notes), '')
  where id = p_reservation_id;

  if v_status = 'em_andamento' then
    update public.rooms set status = 'limpeza' where id = v_room_id;
  end if;
end;
$function$;

create or replace function public.mark_room_clean(p_room_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public', 'private'
as $function$
declare
  v_status text;
begin
  if not private.has_role(array['admin', 'gerente', 'governanca']) then
    raise exception 'Sem permissão para marcar quarto como limpo';
  end if;

  select status into v_status from public.rooms where id = p_room_id for update;

  if not found then
    raise exception 'Quarto não encontrado';
  end if;

  if v_status = 'disponivel' then
    return; -- já feito (envio repetido)
  end if;

  if v_status <> 'limpeza' then
    raise exception 'Esse quarto não está aguardando limpeza';
  end if;

  update public.rooms set status = 'disponivel' where id = p_room_id;
end;
$function$;

drop function public.register_payment(uuid, numeric, text, text);
create function public.register_payment(
  p_reservation_id uuid,
  p_amount numeric,
  p_method text,
  p_notes text default null,
  p_id uuid default null,
  p_paid_at timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'private'
as $function$
declare
  v_id uuid;
begin
  if not private.has_role(array['admin', 'gerente', 'recepcao', 'financeiro']) then
    raise exception 'Você não tem permissão para registrar pagamentos.';
  end if;

  if p_id is not null and exists (select 1 from public.payments where id = p_id) then
    return p_id; -- já gravado (envio repetido)
  end if;

  if not exists (select 1 from public.reservations where id = p_reservation_id) then
    raise exception 'Reserva não encontrada.';
  end if;

  if p_method not in ('dinheiro', 'pix', 'cartao_credito', 'cartao_debito', 'transferencia') then
    raise exception 'Forma de pagamento inválida.';
  end if;

  insert into public.payments (id, reservation_id, amount, method, notes, registered_by, created_at)
  values (coalesce(p_id, gen_random_uuid()), p_reservation_id, p_amount, p_method, nullif(p_notes, ''), auth.uid(), private.client_time(p_paid_at))
  on conflict (id) do nothing
  returning id into v_id;

  return coalesce(v_id, p_id);
end;
$function$;
revoke all on function public.register_payment(uuid, numeric, text, text, uuid, timestamptz) from public, anon;
grant execute on function public.register_payment(uuid, numeric, text, text, uuid, timestamptz) to authenticated;
