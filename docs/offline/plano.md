# HotelFlow offline e instalável — plano de implementação

> **Para quem for executar:** siga as tarefas na ordem. Cada uma termina com testes passando e um commit. Os passos usam caixas (`- [ ]`) para marcar o andamento. A execução recomendada é nesta mesma sessão (o Gustavo não pediu subagentes).

**Objetivo:** transformar o HotelFlow num app instalável (PWA) que funciona sem internet nas partes combinadas e sincroniza sozinho, sem perder nem duplicar dados.

**Arquitetura:**
- Cada aparelho guarda uma cópia das tabelas do hotel em IndexedDB (Dexie).
- As telas leem só dessa cópia.
- As ações que funcionam offline mudam a cópia na hora e entram num caderninho (outbox). O caderninho é enviado em ordem para o Supabase, com etiqueta única por ação.
- Um motor de sincronização envia o caderninho, depois baixa o que mudou (por `updated_at`) e aplica as exclusões (tabela `sync_deletions`).
- Um service worker (vite-plugin-pwa) guarda as telas para o app abrir sem internet.

**Tecnologias:** React 18, TypeScript, Vite 5, TanStack Query 5, Supabase JS 2.116, Dexie 4, vite-plugin-pwa (Workbox), Vitest 3 + fake-indexeddb, @fontsource.

**Design:** [`docs/offline/design.md`](design.md). Leia antes; o plano segue o design e não repete as justificativas.

## Restrições globais

- Pacotes: sempre `npx -y pnpm@10 …` com `--virtual-store-dir "C:\Users\Gustavo Pereira\.pnpm-virtual\pms-hoteleiro"` (pnpm não é global e os pacotes ficam fora do OneDrive).
- Supabase: projeto `gbtxgprucctjpwqswdng`. Confira `get_project` → `ACTIVE_HEALTHY` antes de qualquer teste (o plano grátis pausa sozinho).
- **Nunca digitar a senha do Gustavo.** Testes que precisam de login: ele entra no navegador do app.
- Nenhuma política de RLS muda. Migration nova: `module28_offline_sync` (padrão de nome `moduloNN_…` sem número na frente, como as últimas).
- Funções RPC recriadas: `drop function` + `create function`, `security definer`, `set search_path to 'public','private'`, a mesma checagem de cargo de antes, `revoke … from public, anon` e `grant execute … to authenticated`.
- Prazo offline: **3 dias** sem contato com o servidor (`OFFLINE_LIMIT_MS = 3 * 24 * 60 * 60 * 1000`). A hora real enviada pelo aparelho é aceita de `now() − 3 dias` até `now() + 5 min`.
- Download: a cada **60 s** com internet, sobra de **2 min** no marcador, páginas de **1000** linhas, conferência de ids a cada **24 h**.
- Textos de tela em português simples. Rótulos fixos: `Precisa de internet`, `Aguardando envio`, `Recusada`, `Pendências`, `Instalar app`, `Nova versão disponível`, `Atualizar`.
- Ícones: símbolo **sólido** sobre fundo Pinho `#002E2F`, **nunca** com contorno branco.
- Commits: mensagem em português sem acento, no estilo dos anteriores, terminando com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Um commit por tarefa, só com os arquivos da tarefa.
- `pnpm build` e `pnpm test` precisam passar ao fim de cada tarefa que mexe em código. `pnpm lint` não pode ganhar erro novo (hoje há 2 antigos: interface vazia em `ui/input.tsx` e `require()` no `tailwind.config.ts`).

## Mapa de arquivos

**Novos (lógica offline, `src/offline/`):**

| Arquivo | Responsabilidade |
|---|---|
| `db.ts` | banco local Dexie, tabelas espelhadas, `meta`, chaves de entidade, apagar a cópia, dono da cópia |
| `ids.ts` | `newId()` (UUID do aparelho) |
| `events.ts` | avisos "a cópia mudou" e "o servidor mudou" (sem React) |
| `outbox-types.ts` | tipos do caderninho (um formato de dados por tipo de ação) |
| `transport.ts` | interface do que o caderninho precisa do servidor |
| `outbox.ts` | colocar no caderninho, classificar respostas, enviar, juntar hóspede repetido, descartar, recolocar na fila |
| `pull.ts` | download do que mudou, exclusões, conferência de ids, rebusca de linhas marcadas |
| `actions.ts` | ações offline com as regras locais (reserva, hóspede, check-in/out, cancelar, nota, limpeza, pagamento) |
| `queries.ts` | leituras da cópia no mesmo formato que as telas usam hoje |
| `identity.ts` | identidade guardada e último contato com o servidor |
| `auth-mode.ts` | decisão pura: com sessão, offline, bloqueado ou deslogado |
| `connectivity.ts` | modo de teste offline, `fetch` do Supabase, "o site responde?" |
| `server.ts` | implementações reais (Supabase) de `Transport` e `PullSource` |
| `sync-engine.ts` | motor de sincronização (sem React, testável) |
| `sync-context.tsx` | provider React: liga o motor, timers, `useSync`, `useIsOnline` |
| `use-actor.ts` | `useActor()`: quem está fazendo a ação (id e cargo) |
| `__tests__/setup.ts`, `__tests__/fakes.ts` e `__tests__/*.test.ts` | testes |

**Novos (tela e PWA):** `src/components/SyncStatus.tsx`, `src/components/PendingBadge.tsx`, `src/components/InstallAppButton.tsx`, `src/components/UpdatePrompt.tsx`, `src/components/OfflineLockScreen.tsx`, `src/pages/PendenciasPage.tsx`, `src/pwa/install.ts`, `scripts/gerar-icones.py`, `public/pwa-192.png`, `public/pwa-512.png`, `public/pwa-maskable-512.png`, `public/apple-touch-icon.png`, `vitest.config.ts`, `supabase/module28_offline_sync.sql`, `supabase/tests/module28_offline_sync_test.sql`.

**Alterados:** `package.json`, `vite.config.ts`, `index.html`, `netlify.toml`, `src/main.tsx`, `src/App.tsx`, `src/vite-env.d.ts`, `src/lib/supabase.ts`, `src/lib/auth-context.tsx`, `src/lib/hotel.ts`, `src/router/index.tsx`, `src/components/{ProtectedRoute,AppLayout,Sidebar,GuestDialog,NotesDialog,GlobalSearchDialog}.tsx`, `src/pages/{Login,Dashboard,Reservations,Guests,Rooms,OccupancyMap,Governanca,Financeiro,Maintenance,HotelSettings,UsersList,Audit,TrocarSenha}Page.tsx`, `src/types/{payment,seasonalRate,maintenance,note}.ts`, `docs/STATUS.md`.

---

### Tarefa 1: Ferramentas (dependências e testes)

**Arquivos:** modificar `package.json`; criar `vitest.config.ts`, `src/offline/__tests__/setup.ts` e `src/offline/__tests__/smoke.test.ts`.

**Interfaces:** produz o comando `pnpm test` (Vitest, ambiente node, IndexedDB falso, `localStorage` em memória).

- [ ] **Passo 1: Instalar as dependências**

```bash
npx -y pnpm@10 add dexie @fontsource/saira @fontsource/public-sans --virtual-store-dir "C:\Users\Gustavo Pereira\.pnpm-virtual\pms-hoteleiro"
npx -y pnpm@10 add -D vite-plugin-pwa vitest@^3 fake-indexeddb --virtual-store-dir "C:\Users\Gustavo Pereira\.pnpm-virtual\pms-hoteleiro"
```

Se o app recusar a instalação ("Untrusted Code Integration"), não contornar: passar os dois comandos para o Gustavo rodar no painel Terminal.

- [ ] **Passo 2: Script de teste.** Em `package.json`, dentro de `"scripts"`, acrescentar `"test": "vitest run"`.

- [ ] **Passo 3: Criar `vitest.config.ts`**

```ts
import path from 'path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    setupFiles: ['./src/offline/__tests__/setup.ts'],
  },
})
```

- [ ] **Passo 4: Criar `src/offline/__tests__/setup.ts`**

```ts
import 'fake-indexeddb/auto'

// localStorage em memória (o Node não tem um confiável sem flags)
const store = new Map<string, string>()
const memoryStorage = {
  get length() {
    return store.size
  },
  clear: () => store.clear(),
  getItem: (key: string) => store.get(key) ?? null,
  key: (index: number) => Array.from(store.keys())[index] ?? null,
  removeItem: (key: string) => {
    store.delete(key)
  },
  setItem: (key: string, value: string) => {
    store.set(key, String(value))
  },
}
Object.defineProperty(globalThis, 'localStorage', { value: memoryStorage as unknown as Storage, configurable: true })
```

- [ ] **Passo 5: Teste de fumaça `src/offline/__tests__/smoke.test.ts`**

```ts
import { describe, expect, it } from 'vitest'

describe('ambiente de teste', () => {
  it('tem IndexedDB falso e localStorage', () => {
    expect(typeof indexedDB.open).toBe('function')
    localStorage.setItem('x', '1')
    expect(localStorage.getItem('x')).toBe('1')
  })
})
```

- [ ] **Passo 6: Rodar.** Comandos: `npx -y pnpm@10 test` e `npx -y pnpm@10 build`. Esperado: 1 teste passando e o build sem erros.

- [ ] **Passo 7: Commit:** `git add package.json pnpm-lock.yaml vitest.config.ts src/offline/__tests__/setup.ts src/offline/__tests__/smoke.test.ts`. Mensagem: `Ferramentas do modo offline: Dexie, PWA, Vitest`.

---

### Tarefa 2: Banco — migration `module28_offline_sync` e testes desfeitos no fim

**Arquivos:** criar `supabase/module28_offline_sync.sql` e `supabase/tests/module28_offline_sync_test.sql`. A migration é aplicada no Supabase.

**Interfaces:** produz as colunas `updated_at` em `payments`, `maintenance_requests`, `internal_notes` e `seasonal_rates`, a tabela `public.sync_deletions(id, table_name, row_id, deleted_at)` e as RPCs `checkin_reservation(p_reservation_id uuid, p_at timestamptz default null)`, `checkout_reservation(p_reservation_id uuid, p_at timestamptz default null)`, `cancel_reservation(p_reservation_id, p_reason, p_notes)` (repetição sem erro), `mark_room_clean(p_room_id)` (repetição sem erro) e `register_payment(p_reservation_id, p_amount, p_method, p_notes, p_id uuid default null, p_paid_at timestamptz default null) returns uuid`.

- [ ] **Passo 1: Conferir o projeto:** `get_project gbtxgprucctjpwqswdng` → `ACTIVE_HEALTHY`.

- [ ] **Passo 2: Escrever o teste do banco** (`supabase/tests/module28_offline_sync_test.sql`). Ele roda tudo num bloco que termina com `raise exception`, então **nada fica gravado**: a mensagem do erro é o resultado.

```sql
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
```

- [ ] **Passo 3: Rodar o teste antes da migration** (`execute_sql`). Esperado: **erro** de função inexistente ou de assinatura (por exemplo, `function public.checkin_reservation(uuid, timestamp with time zone) does not exist`). Isso confirma que o teste exercita o que é novo.

- [ ] **Passo 4: Escrever `supabase/module28_offline_sync.sql`**

```sql
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
```

`cancel_reservation` e `mark_room_clean` mantêm a mesma assinatura (`create or replace`), então os grants atuais continuam valendo.

- [ ] **Passo 5: Aplicar a migration** com `apply_migration` (nome `module28_offline_sync`, conteúdo do arquivo). Depois conferir com `list_migrations` que ela aparece.

- [ ] **Passo 6: Rodar o teste de novo.** Esperado: erro com a mensagem `RESULTADO: tudo certo (…)`. Qualquer outra mensagem é falha: corrigir a migration (nova migration `module28_offline_sync_fix…`) e repetir.

- [ ] **Passo 7: Conferir que nada ficou gravado e checar alertas.**
  - `execute_sql`: `select count(*) from reservations where notes = 'TESTE OFFLINE'` deve dar `0`.
  - `get_advisors` (security): nenhum alerta novo sobre `sync_deletions` ou `client_time`. Se aparecer "function search_path mutable" para `private.client_time`, acrescentar `set search_path to 'public'` numa migration de correção.

- [ ] **Passo 8: Commit:** `git add supabase/module28_offline_sync.sql supabase/tests/module28_offline_sync_test.sql`. Mensagem: `Banco: migration module28_offline_sync (updated_at, exclusoes, RPCs que aceitam repeticao)`.

---

### Tarefa 3: Cópia local e download

**Arquivos:** criar `src/offline/db.ts`, `src/offline/ids.ts`, `src/offline/events.ts`, `src/offline/outbox-types.ts`, `src/offline/transport.ts`, `src/offline/pull.ts`, `src/offline/__tests__/fakes.ts` e `src/offline/__tests__/pull.test.ts`. Modificar `src/types/payment.ts`, `src/types/seasonalRate.ts`, `src/types/maintenance.ts` e `src/types/note.ts`, acrescentando `updated_at?: string` às interfaces `Payment`, `SeasonalRate`, `MaintenanceRequest` e `InternalNote`.

**Interfaces:**
- **Produz em `db.ts`:**
  - `db: HotelFlowDB`
  - `MIRRORED_TABLES`, `type MirroredTable`, `type EntityKey`, `entityKey(table, id): EntityKey`
  - `getMeta<T>(key): Promise<T | undefined>`, `setMeta(key, value): Promise<void>`
  - `wipeLocalData()`, `wipeLocalDataSafely()`, `ensureOwner(userId)`, `SYNC_LOCK`
- **Produz em `ids.ts`:** `newId(): string`.
- **Produz em `events.ts`:** `onLocalChange(fn)`, `emitLocalChange()`, `onServerChange(fn)`, `emitServerChange()`.
- **Produz em `pull.ts`:**
  - `type ServerRow`, `type DeletionRow`, `class PullError`, `interface PullSource`, `PAGE_SIZE`
  - `pullChanges(source): Promise<number>`
  - `refetchMarked(source): Promise<void>`
  - `reconcileIfDue(source, now?): Promise<number>`
- **Produz em `outbox-types.ts` e `transport.ts`:** os tipos usados pelas Tarefas 4 e 5.

- [ ] **Passo 1: `src/offline/ids.ts`**

```ts
/** Etiqueta única criada no próprio aparelho (vira o id do registro no banco). */
export function newId(): string {
  return crypto.randomUUID()
}
```

- [ ] **Passo 2: `src/offline/events.ts`**

```ts
type Listener = () => void

const localListeners = new Set<Listener>()
const serverListeners = new Set<Listener>()

/** A cópia local mudou por uma ação do usuário (as telas precisam reler). */
export function onLocalChange(listener: Listener): () => void {
  localListeners.add(listener)
  return () => {
    localListeners.delete(listener)
  }
}

export function emitLocalChange(): void {
  localListeners.forEach((listener) => listener())
}

/** Uma ação só-online mudou o banco: vale baixar as novidades agora. */
export function onServerChange(listener: Listener): () => void {
  serverListeners.add(listener)
  return () => {
    serverListeners.delete(listener)
  }
}

export function emitServerChange(): void {
  serverListeners.forEach((listener) => listener())
}
```

- [ ] **Passo 3: `src/offline/outbox-types.ts`**

```ts
import type { EntityKey } from '@/offline/db'
import type { Guest } from '@/types/guest'
import type { PaymentMethod } from '@/types/payment'
import type { CancellationReason, Reservation } from '@/types/reservation'

export type NewGuestRow = Omit<Guest, 'created_at' | 'updated_at'>
export type NewReservationRow = Omit<Reservation, 'created_at' | 'updated_at'>
export type GuestPatch = Partial<Omit<Guest, 'id' | 'created_at' | 'updated_at'>>
export type ReservationPatch = Partial<
  Pick<
    Reservation,
    'guest_id' | 'room_id' | 'check_in' | 'check_out' | 'adults' | 'children' | 'daily_rate' | 'occupant_name' | 'notes'
  >
>

/** Formato dos dados de cada tipo de ação do caderninho. */
export interface PayloadByKind {
  'guest.create': { row: NewGuestRow }
  'guest.update': { id: string; patch: GuestPatch }
  'reservation.create': { row: NewReservationRow }
  'reservation.update': { id: string; patch: ReservationPatch }
  'reservation.invoice': { id: string; invoice_issued: boolean; invoice_issued_at: string | null }
  'reservation.checkin': { id: string; at: string }
  'reservation.checkout': { id: string; at: string }
  'reservation.cancel': { id: string; reason: CancellationReason; notes: string | null }
  'room.clean': { id: string }
  'payment.create': {
    id: string
    reservation_id: string
    amount: number
    method: PaymentMethod
    notes: string | null
    at: string
  }
}

export type OutboxKind = keyof PayloadByKind
export type OutboxStatus = 'pendente' | 'enviando' | 'recusado'
export type RejectReason = 'conflito_quarto' | 'sem_permissao' | 'regra' | 'nao_encontrado' | 'dependencia' | 'erro'

export interface OutboxError {
  reason: RejectReason
  message: string
}

interface OutboxBase {
  /** Ordem no caderninho (gerada pelo banco local). */
  seq?: number
  /** Etiqueta do item. */
  id: string
  /** Registros que o item cria ou altera (o download não sobrescreve esses). */
  entityIds: EntityKey[]
  /** Registros que precisam existir no servidor antes deste item. */
  dependsOn: EntityKey[]
  /** Texto para a tela Pendências, montado na hora da ação. */
  description: string
  createdAt: string
  userId: string
  status: OutboxStatus
  error: OutboxError | null
  attempts: number
}

export type OutboxItem = {
  [K in OutboxKind]: OutboxBase & { kind: K; payload: PayloadByKind[K] }
}[OutboxKind]

export type NewOutboxItem = {
  [K in OutboxKind]: Omit<OutboxBase, 'seq' | 'id' | 'status' | 'error' | 'attempts' | 'createdAt'> & {
    kind: K
    payload: PayloadByKind[K]
  }
}[OutboxKind]
```

- [ ] **Passo 4: `src/offline/transport.ts`**

```ts
import type { Guest } from '@/types/guest'

export interface TransportError {
  code?: string
  message: string
  details?: string
}

/** status 0 = sem resposta (rede). */
export type TransportResult = { ok: true } | { ok: false; status: number; error: TransportError }
export type TransportFailure = Extract<TransportResult, { ok: false }>

export type RpcName =
  | 'checkin_reservation'
  | 'checkout_reservation'
  | 'cancel_reservation'
  | 'mark_room_clean'
  | 'register_payment'

/** O que o caderninho precisa do servidor (a versão real fica em server.ts; os testes usam uma falsa). */
export interface Transport {
  insert(table: 'guests' | 'reservations', row: object): Promise<TransportResult>
  update(table: 'guests' | 'reservations', id: string, patch: object): Promise<TransportResult>
  rpc(fn: RpcName, args: Record<string, unknown>): Promise<TransportResult>
  /** Lança erro se não houver rede. */
  findGuestByDocument(documentType: string, documentNumber: string): Promise<Guest | null>
}
```

- [ ] **Passo 5: `src/offline/db.ts`**

```ts
import Dexie, { type Table } from 'dexie'

import type { OutboxItem } from '@/offline/outbox-types'
import type { Profile } from '@/types/auth'
import type { Guest } from '@/types/guest'
import type { Hotel } from '@/types/hotel'
import type { MaintenanceRequest } from '@/types/maintenance'
import type { InternalNote } from '@/types/note'
import type { Payment } from '@/types/payment'
import type { Reservation } from '@/types/reservation'
import type { Room, RoomType } from '@/types/room'
import type { SeasonalRate } from '@/types/seasonalRate'

/** Tabelas do Supabase que cada aparelho guarda (o RLS decide quais linhas vêm). */
export const MIRRORED_TABLES = [
  'hotels',
  'room_types',
  'rooms',
  'guests',
  'reservations',
  'payments',
  'seasonal_rates',
  'maintenance_requests',
  'internal_notes',
  'profiles',
] as const
export type MirroredTable = (typeof MIRRORED_TABLES)[number]

/** Chave de um registro no caderninho: "reservations:<uuid>". */
export type EntityKey = `${MirroredTable}:${string}`

export function entityKey(table: MirroredTable, id: string): EntityKey {
  return `${table}:${id}`
}

export interface MetaRow {
  key: string
  value: unknown
}

export class HotelFlowDB extends Dexie {
  hotels!: Table<Hotel, string>
  room_types!: Table<RoomType, string>
  rooms!: Table<Room, string>
  guests!: Table<Guest, string>
  reservations!: Table<Reservation, string>
  payments!: Table<Payment, string>
  seasonal_rates!: Table<SeasonalRate, string>
  maintenance_requests!: Table<MaintenanceRequest, string>
  internal_notes!: Table<InternalNote, string>
  profiles!: Table<Profile, string>
  outbox!: Table<OutboxItem, number>
  meta!: Table<MetaRow, string>

  constructor() {
    super('hotelflow')
    this.version(1).stores({
      hotels: 'id',
      room_types: 'id',
      rooms: 'id',
      guests: 'id, [document_type+document_number]',
      reservations: 'id, guest_id, room_id',
      payments: 'id, reservation_id',
      seasonal_rates: 'id, room_type_id',
      maintenance_requests: 'id, room_id',
      internal_notes: 'id, guest_id, room_id',
      profiles: 'id',
      outbox: '++seq, id, status, *entityIds',
      meta: 'key',
    })
  }
}

export const db = new HotelFlowDB()

/** Nome da trava entre abas: só uma aba sincroniza por vez, e "Sair" espera a sincronização terminar. */
export const SYNC_LOCK = 'hotelflow-sync'

export async function getMeta<T>(key: string): Promise<T | undefined> {
  return (await db.meta.get(key))?.value as T | undefined
}

export async function setMeta(key: string, value: unknown): Promise<void> {
  await db.meta.put({ key, value })
}

/** Apaga a cópia inteira deste aparelho, inclusive o caderninho. */
export async function wipeLocalData(): Promise<void> {
  await db.transaction('rw', db.tables, async () => {
    await Promise.all(db.tables.map((table) => table.clear()))
  })
}

/** Igual a wipeLocalData, mas espera uma sincronização em andamento terminar antes. */
export async function wipeLocalDataSafely(): Promise<void> {
  const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined
  if (locks) await locks.request(SYNC_LOCK, () => wipeLocalData())
  else await wipeLocalData()
}

/** Garante que a cópia é desta pessoa; se for de outra (ou de ninguém), começa do zero. */
export async function ensureOwner(userId: string): Promise<void> {
  const owner = await getMeta<string>('owner')
  if (owner === userId) return
  await wipeLocalDataSafely()
  await setMeta('owner', userId)
}
```

- [ ] **Passo 6: Ajustar os tipos.** Acrescentar `updated_at?: string` em `Payment` (`src/types/payment.ts`), `SeasonalRate` (`src/types/seasonalRate.ts`), `MaintenanceRequest` (`src/types/maintenance.ts`) e `InternalNote` (`src/types/note.ts`).

- [ ] **Passo 7: Ajudantes de teste `src/offline/__tests__/fakes.ts`**

```ts
import type { NewGuestRow, NewReservationRow } from '@/offline/outbox-types'
import type { Transport, TransportResult } from '@/offline/transport'
import type { Guest } from '@/types/guest'
import type { Payment } from '@/types/payment'
import type { Reservation } from '@/types/reservation'
import type { Room, RoomType } from '@/types/room'

export const STAMP = '2026-10-01T12:00:00.000000+00:00'

export function makeRoomType(over: Partial<RoomType> = {}): RoomType {
  return {
    id: 't1',
    name: 'Standard',
    description: null,
    capacity_adults: 2,
    capacity_children: 1,
    base_price: 150,
    created_at: STAMP,
    updated_at: STAMP,
    ...over,
  }
}

export function makeRoom(over: Partial<Room> = {}): Room {
  return {
    id: 'r1',
    room_type_id: 't1',
    number: '1',
    floor: null,
    status: 'disponivel',
    notes: null,
    created_at: STAMP,
    updated_at: STAMP,
    ...over,
  }
}

export function makeGuest(over: Partial<Guest> = {}): Guest {
  return {
    id: 'g1',
    full_name: 'Maria Souza',
    document_type: 'cpf',
    document_number: '529.982.247-25',
    email: null,
    phone: null,
    birth_date: null,
    nationality: 'Brasileira',
    notes: null,
    active: true,
    created_at: STAMP,
    updated_at: STAMP,
    ...over,
  }
}

export function makeReservation(over: Partial<Reservation> = {}): Reservation {
  return {
    id: 'res1',
    guest_id: 'g1',
    room_id: 'r1',
    check_in: '2026-10-20',
    check_out: '2026-10-22',
    adults: 1,
    children: 0,
    daily_rate: 150,
    status: 'confirmada',
    notes: null,
    occupant_name: null,
    checked_in_at: null,
    checked_out_at: null,
    invoice_issued: false,
    invoice_issued_at: null,
    cancellation_reason: null,
    cancellation_notes: null,
    created_at: STAMP,
    updated_at: STAMP,
    ...over,
  }
}

export function makePayment(over: Partial<Payment> = {}): Payment {
  return {
    id: 'p1',
    reservation_id: 'res1',
    amount: 100,
    method: 'pix',
    notes: null,
    registered_by: 'u1',
    created_at: STAMP,
    updated_at: STAMP,
    ...over,
  }
}

export function guestRow(guest: Guest): NewGuestRow {
  const { created_at: _c, updated_at: _u, ...row } = guest
  void _c
  void _u
  return row
}

export function reservationRow(reservation: Reservation): NewReservationRow {
  const { created_at: _c, updated_at: _u, ...row } = reservation
  void _c
  void _u
  return row
}

export const OK: TransportResult = { ok: true }
export const NETWORK: TransportResult = { ok: false, status: 0, error: { message: 'TypeError: Failed to fetch' } }
export function pgError(status: number, code: string, message: string): TransportResult {
  return { ok: false, status, error: { code, message } }
}

export interface Call {
  method: 'insert' | 'update' | 'rpc'
  target: string
  body: Record<string, unknown>
}

export function fakeTransport(respond: (call: Call) => TransportResult, serverGuests: Guest[] = []) {
  const calls: Call[] = []
  const record = (call: Call) => {
    calls.push(call)
    return Promise.resolve(respond(call))
  }
  const transport: Transport = {
    insert: (table, row) => record({ method: 'insert', target: table, body: { ...row } as Record<string, unknown> }),
    update: (table, id, patch) => record({ method: 'update', target: `${table}:${id}`, body: { ...patch } as Record<string, unknown> }),
    rpc: (fn, args) => record({ method: 'rpc', target: fn, body: args }),
    findGuestByDocument: async (type, number) =>
      serverGuests.find((g) => g.document_type === type && g.document_number === number) ?? null,
  }
  return { transport, calls }
}
```

- [ ] **Passo 8: Escrever o teste do download `src/offline/__tests__/pull.test.ts`** (primeiro só o teste, que vai falhar por falta de `pull.ts`)

```ts
import { beforeEach, describe, expect, it } from 'vitest'

import { db, getMeta, setMeta, wipeLocalData, type MirroredTable } from '@/offline/db'
import { pullChanges, reconcileIfDue, refetchMarked, type DeletionRow, type PullSource, type ServerRow } from '@/offline/pull'

import { makeReservation, makeRoom, makeRoomType } from './fakes'

function fakeSource(tables: Partial<Record<MirroredTable, ServerRow[]>>, deletions: DeletionRow[] = []) {
  const requestedSince: Array<string | null> = []
  const source: PullSource = {
    async fetchChanged(table, since, offset, limit) {
      if (table === 'rooms') requestedSince.push(since)
      const rows = (tables[table] ?? []).filter((r) => !since || Date.parse(r.updated_at) > Date.parse(since))
      return rows.slice(offset, offset + limit)
    },
    async fetchDeletions(since, offset, limit) {
      return deletions.filter((d) => !since || Date.parse(d.deleted_at) > Date.parse(since)).slice(offset, offset + limit)
    },
    async fetchIds(table) {
      return (tables[table] ?? []).map((r) => r.id)
    },
    async fetchByIds(table, ids) {
      return (tables[table] ?? []).filter((r) => ids.includes(r.id))
    },
  }
  return { source, requestedSince }
}

beforeEach(async () => {
  await wipeLocalData()
})

describe('pullChanges', () => {
  it('no primeiro download grava tudo e guarda o marcador', async () => {
    const rooms = [makeRoom({ id: 'r1', updated_at: '2026-10-01T10:00:00+00:00' }), makeRoom({ id: 'r2', number: '2', updated_at: '2026-10-02T10:00:00+00:00' })]
    const { source, requestedSince } = fakeSource({ rooms, room_types: [makeRoomType()] })
    const changed = await pullChanges(source)
    expect(changed).toBe(3)
    expect(await db.rooms.count()).toBe(2)
    expect(requestedSince).toEqual([null])
    expect(await getMeta('cursor:rooms')).toBe('2026-10-02T10:00:00+00:00')
  })

  it('depois pede só o que mudou, com 2 minutos de sobra', async () => {
    const { source, requestedSince } = fakeSource({ rooms: [makeRoom({ updated_at: '2026-10-02T10:00:00+00:00' })] })
    await pullChanges(source)
    await pullChanges(source)
    expect(requestedSince[1]).toBe('2026-10-02T09:58:00.000Z')
  })

  it('não sobrescreve um registro citado no caderninho', async () => {
    await db.rooms.put(makeRoom({ status: 'ocupado' }))
    await db.outbox.add({
      id: 'x', kind: 'room.clean', payload: { id: 'r1' }, entityIds: ['rooms:r1'], dependsOn: [],
      description: 't', createdAt: '', userId: 'u1', status: 'pendente', error: null, attempts: 0,
    })
    const { source } = fakeSource({ rooms: [makeRoom({ status: 'disponivel', updated_at: '2026-10-05T00:00:00+00:00' })] })
    await pullChanges(source)
    expect((await db.rooms.get('r1'))?.status).toBe('ocupado')
  })

  it('aplica exclusões, menos as de registros protegidos', async () => {
    await db.reservations.bulkPut([makeReservation({ id: 'a' }), makeReservation({ id: 'b' })])
    await db.outbox.add({
      id: 'x', kind: 'reservation.checkin', payload: { id: 'b', at: '' }, entityIds: ['reservations:b'], dependsOn: [],
      description: 't', createdAt: '', userId: 'u1', status: 'pendente', error: null, attempts: 0,
    })
    const deletions: DeletionRow[] = [
      { id: 1, table_name: 'reservations', row_id: 'a', deleted_at: '2026-10-05T00:00:00+00:00' },
      { id: 2, table_name: 'reservations', row_id: 'b', deleted_at: '2026-10-05T00:00:00+00:00' },
    ]
    const { source } = fakeSource({}, deletions)
    await pullChanges(source)
    expect(await db.reservations.get('a')).toBeUndefined()
    expect(await db.reservations.get('b')).toBeDefined()
    expect(await getMeta('cursor:sync_deletions')).toBe('2026-10-05T00:00:00+00:00')
  })
})

describe('reconcileIfDue', () => {
  it('remove da cópia o que não existe mais no servidor', async () => {
    await db.rooms.bulkPut([makeRoom({ id: 'r1' }), makeRoom({ id: 'sumiu', number: '9' })])
    const { source } = fakeSource({ rooms: [makeRoom({ id: 'r1' })] })
    expect(await reconcileIfDue(source)).toBe(1)
    expect(await db.rooms.get('sumiu')).toBeUndefined()
  })

  it('só roda uma vez a cada 24 h', async () => {
    await setMeta('lastReconcileAt', Date.now())
    await db.rooms.put(makeRoom({ id: 'sumiu' }))
    const { source } = fakeSource({ rooms: [] })
    expect(await reconcileIfDue(source)).toBe(0)
    expect(await db.rooms.get('sumiu')).toBeDefined()
  })
})

describe('refetchMarked', () => {
  it('busca de novo as linhas marcadas e apaga as que sumiram', async () => {
    await db.reservations.bulkPut([makeReservation({ id: 'a', status: 'em_andamento' }), makeReservation({ id: 'b' })])
    await setMeta('refetch', ['reservations:a', 'reservations:b'])
    const { source } = fakeSource({ reservations: [makeReservation({ id: 'a', status: 'confirmada' })] })
    await refetchMarked(source)
    expect((await db.reservations.get('a'))?.status).toBe('confirmada')
    expect(await db.reservations.get('b')).toBeUndefined()
    expect(await getMeta('refetch')).toEqual([])
  })
})
```

- [ ] **Passo 9: Rodar e ver falhar.** Comando: `npx -y pnpm@10 test`. Esperado: FAIL, porque `@/offline/pull` não existe.

- [ ] **Passo 10: `src/offline/pull.ts`**

```ts
import { db, entityKey, getMeta, MIRRORED_TABLES, setMeta, type EntityKey, type MirroredTable } from '@/offline/db'
import type { TransportError } from '@/offline/transport'

export interface ServerRow {
  id: string
  updated_at: string
}

export interface DeletionRow {
  id: number
  table_name: string
  row_id: string
  deleted_at: string
}

/** Falha ao falar com o servidor durante o download. status 0 = sem rede. */
export class PullError extends Error {
  constructor(
    readonly status: number,
    readonly detail: TransportError
  ) {
    super(detail.message)
  }
}

/** O que o download precisa do servidor (a versão real fica em server.ts). Os métodos lançam PullError. */
export interface PullSource {
  fetchChanged(table: MirroredTable, since: string | null, offset: number, limit: number): Promise<ServerRow[]>
  fetchDeletions(since: string | null, offset: number, limit: number): Promise<DeletionRow[]>
  fetchIds(table: MirroredTable): Promise<string[]>
  fetchByIds(table: MirroredTable, ids: string[]): Promise<ServerRow[]>
}

export const PAGE_SIZE = 1000
const OVERLAP_MS = 2 * 60 * 1000
const RECONCILE_EVERY_MS = 24 * 60 * 60 * 1000

function isMirrored(name: string): name is MirroredTable {
  return (MIRRORED_TABLES as readonly string[]).includes(name)
}

function sinceFrom(cursor: string | undefined): string | null {
  return cursor ? new Date(Date.parse(cursor) - OVERLAP_MS).toISOString() : null
}

function later(current: string | undefined, candidate: string): string {
  return !current || Date.parse(candidate) > Date.parse(current) ? candidate : current
}

/** Chaves citadas em qualquer item do caderninho: o download não mexe nelas. */
export async function protectedEntityKeys(): Promise<Set<EntityKey>> {
  const keys = await db.outbox.orderBy('entityIds').uniqueKeys()
  return new Set(keys as EntityKey[])
}

async function putUnprotected(table: MirroredTable, rows: ServerRow[]): Promise<void> {
  if (rows.length === 0) return
  await db.transaction('rw', db.table(table), db.outbox, async () => {
    const keep = await protectedEntityKeys()
    await db.table(table).bulkPut(rows.filter((row) => !keep.has(entityKey(table, row.id))))
  })
}

/** Baixa o que mudou desde a última vez (na primeira, tudo) e aplica as exclusões. Devolve quantas linhas mudaram. */
export async function pullChanges(source: PullSource): Promise<number> {
  let changed = 0
  for (const table of MIRRORED_TABLES) {
    let cursor = await getMeta<string>(`cursor:${table}`)
    const since = sinceFrom(cursor)
    for (let offset = 0; ; offset += PAGE_SIZE) {
      const rows = await source.fetchChanged(table, since, offset, PAGE_SIZE)
      await putUnprotected(table, rows)
      for (const row of rows) cursor = later(cursor, row.updated_at)
      changed += rows.length
      if (rows.length < PAGE_SIZE) break
    }
    if (cursor) await setMeta(`cursor:${table}`, cursor)
  }

  let deletionCursor = await getMeta<string>('cursor:sync_deletions')
  const deletionSince = sinceFrom(deletionCursor)
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const deletions = await source.fetchDeletions(deletionSince, offset, PAGE_SIZE)
    for (const deletion of deletions) {
      deletionCursor = later(deletionCursor, deletion.deleted_at)
      if (!isMirrored(deletion.table_name)) continue
      const table = deletion.table_name
      await db.transaction('rw', db.table(table), db.outbox, async () => {
        const keep = await protectedEntityKeys()
        if (keep.has(entityKey(table, deletion.row_id))) return
        if (await db.table(table).get(deletion.row_id)) {
          await db.table(table).delete(deletion.row_id)
          changed++
        }
      })
    }
    if (deletions.length < PAGE_SIZE) break
  }
  if (deletionCursor) await setMeta('cursor:sync_deletions', deletionCursor)
  return changed
}

/** Busca de novo no servidor as linhas marcadas (ex.: depois de um "Descartar"). */
export async function refetchMarked(source: PullSource): Promise<void> {
  const marked = (await getMeta<EntityKey[]>('refetch')) ?? []
  if (marked.length === 0) return
  const byTable = new Map<MirroredTable, string[]>()
  for (const key of marked) {
    const separator = key.indexOf(':')
    const table = key.slice(0, separator)
    if (!isMirrored(table)) continue
    byTable.set(table, [...(byTable.get(table) ?? []), key.slice(separator + 1)])
  }
  for (const [table, ids] of byTable) {
    const rows = await source.fetchByIds(table, ids)
    const found = new Set(rows.map((row) => row.id))
    await db.transaction('rw', db.table(table), db.outbox, async () => {
      const keep = await protectedEntityKeys()
      await db.table(table).bulkPut(rows.filter((row) => !keep.has(entityKey(table, row.id))))
      await db.table(table).bulkDelete(ids.filter((id) => !found.has(id) && !keep.has(entityKey(table, id))))
    })
  }
  await setMeta('refetch', [])
}

/** Uma vez a cada 24 h: remove da cópia o que não existe mais no servidor (rede de segurança). */
export async function reconcileIfDue(source: PullSource, now = Date.now()): Promise<number> {
  const last = await getMeta<number>('lastReconcileAt')
  if (last !== undefined && now - last < RECONCILE_EVERY_MS) return 0
  let removed = 0
  for (const table of MIRRORED_TABLES) {
    const serverIds = new Set(await source.fetchIds(table))
    await db.transaction('rw', db.table(table), db.outbox, async () => {
      const keep = await protectedEntityKeys()
      const localIds = (await db.table(table).toCollection().primaryKeys()) as string[]
      const gone = localIds.filter((id) => !serverIds.has(id) && !keep.has(entityKey(table, id)))
      await db.table(table).bulkDelete(gone)
      removed += gone.length
    })
  }
  await setMeta('lastReconcileAt', now)
  return removed
}
```

- [ ] **Passo 11: Rodar.** Comando: `npx -y pnpm@10 test`. Esperado: todos os testes passando.

- [ ] **Passo 12: `npx -y pnpm@10 build`.** Esperado: sem erros.

- [ ] **Passo 13: Commit.** `git add src/offline src/types`. Mensagem: `Copia local (Dexie) e download do que mudou`.

---

### Tarefa 4: Caderninho (envio, classificação, dependências, descarte)

**Arquivos:** criar `src/offline/outbox.ts` e `src/offline/__tests__/outbox.test.ts`.

**Interfaces:**
- **Consome:** `db`, `entityKey`, `getMeta` e `setMeta` (Tarefa 3); `Transport` (Tarefa 3).
- **Produz em `outbox.ts`:**
  - `type Outcome`, `classify(failure): Outcome`
  - `enqueue(item: NewOutboxItem): Promise<OutboxItem>`
  - `outboxCounts(): Promise<{ pending; rejected }>`, `outboxEntityStatus(): Promise<Map<EntityKey, 'pendente' | 'recusado'>>`
  - `interface ProcessResult { sent; rejected; stoppedBy: 'rede' | 'login' | null }`, `processOutbox(transport): Promise<ProcessResult>`
  - `discardItem(seq): Promise<EntityKey[]>`
  - `requeue(seq, fix: (item) => OutboxItem): Promise<void>`

- [ ] **Passo 1: Escrever o teste `src/offline/__tests__/outbox.test.ts`**

```ts
import { beforeEach, describe, expect, it } from 'vitest'

import { db, getMeta, wipeLocalData, type EntityKey } from '@/offline/db'
import { classify, discardItem, enqueue, outboxCounts, processOutbox, requeue } from '@/offline/outbox'
import type { TransportFailure, TransportResult } from '@/offline/transport'

import {
  NETWORK,
  OK,
  fakeTransport,
  guestRow,
  makeGuest,
  makePayment,
  makeReservation,
  pgError,
  reservationRow,
} from './fakes'

const base = { entityIds: [] as EntityKey[], dependsOn: [] as EntityKey[], description: 'teste', userId: 'u1' }

function failure(result: TransportResult): TransportFailure {
  if (result.ok) throw new Error('esperava falha')
  return result
}

beforeEach(async () => {
  await wipeLocalData()
})

describe('classify', () => {
  it('rede e erro 5xx: tentar de novo', () => {
    expect(classify(failure(NETWORK))).toEqual({ type: 'retry' })
    expect(classify(failure(pgError(503, '', 'Service Unavailable')))).toEqual({ type: 'retry' })
  })
  it('login vencido', () => {
    expect(classify(failure(pgError(401, 'PGRST301', 'JWT expired')))).toEqual({ type: 'auth' })
  })
  it('etiqueta repetida conta como já enviada', () => {
    const result = pgError(409, '23505', 'duplicate key value violates unique constraint "reservations_pkey"')
    expect(classify(failure(result))).toEqual({ type: 'ok' })
  })
  it('documento de hóspede repetido: juntar com o existente', () => {
    const result = pgError(409, '23505', 'duplicate key value violates unique constraint "guests_document_type_document_number_key"')
    expect(classify(failure(result))).toEqual({ type: 'remap-guest' })
  })
  it('quarto ocupado vira conflito', () => {
    const result = pgError(409, '23P01', 'conflicting key value violates exclusion constraint "reservations_no_overlap"')
    expect(classify(failure(result))).toMatchObject({ type: 'reject', reason: 'conflito_quarto' })
  })
  it('sem permissão', () => {
    expect(classify(failure(pgError(403, '42501', 'new row violates row-level security policy')))).toMatchObject({ reason: 'sem_permissao' })
    expect(classify(failure(pgError(400, 'P0001', 'Sem permissão para fazer check-in')))).toMatchObject({ reason: 'sem_permissao' })
  })
  it('registro sumido', () => {
    expect(classify(failure(pgError(409, '23503', 'violates foreign key constraint')))).toMatchObject({ reason: 'nao_encontrado' })
    expect(classify(failure(pgError(404, 'NAO_ENCONTRADO', 'Registro não encontrado.')))).toMatchObject({ reason: 'nao_encontrado' })
    expect(classify(failure(pgError(400, 'P0001', 'Reserva não encontrada')))).toMatchObject({ reason: 'nao_encontrado' })
  })
  it('regra da função mostra a mensagem do banco', () => {
    const message = 'Só é possível fazer check-out de uma reserva em andamento'
    expect(classify(failure(pgError(400, 'P0001', message)))).toEqual({ type: 'reject', reason: 'regra', message })
  })
})

describe('processOutbox', () => {
  it('envia na ordem e esvazia o caderninho', async () => {
    await enqueue({ ...base, kind: 'room.clean', payload: { id: 'r1' }, entityIds: ['rooms:r1'] })
    await enqueue({ ...base, kind: 'room.clean', payload: { id: 'r2' }, entityIds: ['rooms:r2'] })
    const { transport, calls } = fakeTransport(() => OK)
    expect(await processOutbox(transport)).toEqual({ sent: 2, rejected: 0, stoppedBy: null })
    expect(calls.map((c) => c.body)).toEqual([{ p_room_id: 'r1' }, { p_room_id: 'r2' }])
    expect(await db.outbox.count()).toBe(0)
  })

  it('para na queda de rede e retoma sem duplicar', async () => {
    await enqueue({ ...base, kind: 'room.clean', payload: { id: 'r1' }, entityIds: ['rooms:r1'] })
    await enqueue({ ...base, kind: 'room.clean', payload: { id: 'r2' }, entityIds: ['rooms:r2'] })
    let online = false
    const { transport, calls } = fakeTransport(() => (online ? OK : NETWORK))
    expect(await processOutbox(transport)).toEqual({ sent: 0, rejected: 0, stoppedBy: 'rede' })
    expect(await outboxCounts()).toEqual({ pending: 2, rejected: 0 })
    online = true
    expect(await processOutbox(transport)).toEqual({ sent: 2, rejected: 0, stoppedBy: null })
    expect(calls.filter((c) => c.body.p_room_id === 'r2')).toHaveLength(1)
  })

  it('reenvia um item que ficou "enviando" (app fechou no meio)', async () => {
    const item = await enqueue({ ...base, kind: 'room.clean', payload: { id: 'r1' }, entityIds: ['rooms:r1'] })
    await db.outbox.update(item.seq!, { status: 'enviando' })
    const { transport } = fakeTransport(() => OK)
    expect((await processOutbox(transport)).sent).toBe(1)
  })

  it('pagamento leva a etiqueta e a hora real', async () => {
    await enqueue({
      ...base,
      kind: 'payment.create',
      payload: { id: 'p1', reservation_id: 'res1', amount: 50, method: 'pix', notes: null, at: '2026-10-19T12:00:00.000Z' },
      entityIds: ['payments:p1'],
    })
    const { transport, calls } = fakeTransport(() => OK)
    await processOutbox(transport)
    expect(calls[0]).toEqual({
      method: 'rpc',
      target: 'register_payment',
      body: { p_reservation_id: 'res1', p_amount: 50, p_method: 'pix', p_notes: null, p_id: 'p1', p_paid_at: '2026-10-19T12:00:00.000Z' },
    })
  })

  it('conflito vai para recusados e o resto continua', async () => {
    await enqueue({ ...base, kind: 'reservation.create', payload: { row: reservationRow(makeReservation({ id: 'A' })) }, entityIds: ['reservations:A'] })
    await enqueue({ ...base, kind: 'room.clean', payload: { id: 'r9' }, entityIds: ['rooms:r9'] })
    const { transport } = fakeTransport((call) =>
      call.method === 'insert' ? pgError(409, '23P01', 'exclusion constraint "reservations_no_overlap"') : OK
    )
    expect(await processOutbox(transport)).toEqual({ sent: 1, rejected: 1, stoppedBy: null })
    const [rejected] = await db.outbox.where('status').equals('recusado').toArray()
    expect(rejected.error?.reason).toBe('conflito_quarto')
  })

  it('quem depende de um item recusado também é recusado, sem ser enviado', async () => {
    await enqueue({ ...base, kind: 'reservation.create', payload: { row: reservationRow(makeReservation({ id: 'A' })) }, entityIds: ['reservations:A'] })
    await enqueue({
      ...base,
      kind: 'payment.create',
      payload: { id: 'P', reservation_id: 'A', amount: 10, method: 'pix', notes: null, at: '' },
      entityIds: ['payments:P'],
      dependsOn: ['reservations:A'],
    })
    const { transport, calls } = fakeTransport(() => pgError(409, '23P01', 'reservations_no_overlap'))
    expect(await processOutbox(transport)).toEqual({ sent: 0, rejected: 2, stoppedBy: null })
    expect(calls).toHaveLength(1)
    const payment = await db.outbox.where('entityIds').equals('payments:P').first()
    expect(payment?.error?.reason).toBe('dependencia')
  })

  it('hóspede com documento repetido é juntado ao que já existe', async () => {
    const local = makeGuest({ id: 'g-local' })
    const server = makeGuest({ id: 'g-server' })
    await db.guests.add(local)
    await db.reservations.add(makeReservation({ id: 'res1', guest_id: 'g-local' }))
    await enqueue({ ...base, kind: 'guest.create', payload: { row: guestRow(local) }, entityIds: ['guests:g-local'] })
    await enqueue({
      ...base,
      kind: 'reservation.create',
      payload: { row: reservationRow(makeReservation({ id: 'res1', guest_id: 'g-local' })) },
      entityIds: ['reservations:res1'],
      dependsOn: ['guests:g-local'],
    })
    const { transport, calls } = fakeTransport(
      (call) =>
        call.target === 'guests'
          ? pgError(409, '23505', 'duplicate key value violates unique constraint "guests_document_type_document_number_key"')
          : OK,
      [server]
    )
    expect((await processOutbox(transport)).sent).toBe(2)
    expect(await db.guests.get('g-local')).toBeUndefined()
    expect(await db.guests.get('g-server')).toBeDefined()
    expect((await db.reservations.get('res1'))?.guest_id).toBe('g-server')
    expect(calls[1].body.guest_id).toBe('g-server')
  })

  it('edição sem linha no servidor vira "não encontrado"', async () => {
    await enqueue({ ...base, kind: 'reservation.update', payload: { id: 'A', patch: { notes: 'x' } }, entityIds: ['reservations:A'] })
    const { transport } = fakeTransport(() => pgError(404, 'NAO_ENCONTRADO', 'Registro não encontrado.'))
    await processOutbox(transport)
    const [item] = await db.outbox.toArray()
    expect(item.error?.reason).toBe('nao_encontrado')
  })

  it('login vencido para o envio e mantém o item', async () => {
    await enqueue({ ...base, kind: 'room.clean', payload: { id: 'r1' }, entityIds: ['rooms:r1'] })
    const { transport } = fakeTransport(() => pgError(401, 'PGRST301', 'JWT expired'))
    expect((await processOutbox(transport)).stoppedBy).toBe('login')
    expect(await outboxCounts()).toEqual({ pending: 1, rejected: 0 })
  })
})

describe('discardItem e requeue', () => {
  it('descartar uma criação apaga a linha local e as ações que dependem dela', async () => {
    await db.reservations.add(makeReservation({ id: 'A' }))
    await db.payments.add(makePayment({ id: 'P', reservation_id: 'A' }))
    const create = await enqueue({ ...base, kind: 'reservation.create', payload: { row: reservationRow(makeReservation({ id: 'A' })) }, entityIds: ['reservations:A'] })
    await enqueue({
      ...base,
      kind: 'payment.create',
      payload: { id: 'P', reservation_id: 'A', amount: 10, method: 'pix', notes: null, at: '' },
      entityIds: ['payments:P'],
      dependsOn: ['reservations:A'],
    })
    await discardItem(create.seq!)
    expect(await db.outbox.count()).toBe(0)
    expect(await db.reservations.get('A')).toBeUndefined()
    expect(await db.payments.get('P')).toBeUndefined()
  })

  it('descartar uma edição marca a linha para buscar de novo, sem levar junto quem não depende dela', async () => {
    const update = await enqueue({ ...base, kind: 'reservation.update', payload: { id: 'A', patch: { notes: 'x' } }, entityIds: ['reservations:A'], dependsOn: ['reservations:A'] })
    await enqueue({ ...base, kind: 'reservation.checkin', payload: { id: 'A', at: '' }, entityIds: ['reservations:A'], dependsOn: ['reservations:A'] })
    expect(await discardItem(update.seq!)).toEqual(['reservations:A'])
    expect(await getMeta('refetch')).toEqual(['reservations:A'])
    expect(await db.outbox.count()).toBe(1)
  })

  it('recolocar na fila leva junto os itens travados por dependência, na mesma ordem', async () => {
    const create = await enqueue({ ...base, kind: 'reservation.create', payload: { row: reservationRow(makeReservation({ id: 'A' })) }, entityIds: ['reservations:A'] })
    const pay = await enqueue({
      ...base,
      kind: 'payment.create',
      payload: { id: 'P', reservation_id: 'A', amount: 10, method: 'pix', notes: null, at: '' },
      entityIds: ['payments:P'],
      dependsOn: ['reservations:A'],
    })
    await db.outbox.update(create.seq!, { status: 'recusado', error: { reason: 'conflito_quarto', message: 'x' } })
    await db.outbox.update(pay.seq!, { status: 'recusado', error: { reason: 'dependencia', message: 'x' } })
    await requeue(create.seq!, (item) =>
      item.kind === 'reservation.create' ? { ...item, payload: { row: { ...item.payload.row, room_id: 'r2' } } } : item
    )
    const items = await db.outbox.orderBy('seq').toArray()
    expect(items.map((i) => [i.kind, i.status])).toEqual([
      ['reservation.create', 'pendente'],
      ['payment.create', 'pendente'],
    ])
    expect(items[0].kind === 'reservation.create' && items[0].payload.row.room_id).toBe('r2')
  })
})
```

- [ ] **Passo 2: Rodar e ver falhar** (`npx -y pnpm@10 test`). Esperado: FAIL, porque `@/offline/outbox` não existe.

- [ ] **Passo 3: `src/offline/outbox.ts`**

```ts
import { db, entityKey, getMeta, setMeta, type EntityKey } from '@/offline/db'
import { newId } from '@/offline/ids'
import type { NewOutboxItem, OutboxItem, RejectReason } from '@/offline/outbox-types'
import type { Transport, TransportFailure, TransportResult } from '@/offline/transport'

export type Outcome =
  | { type: 'ok' }
  | { type: 'retry' }
  | { type: 'auth' }
  | { type: 'remap-guest' }
  | { type: 'reject'; reason: RejectReason; message: string }

const MESSAGES = {
  conflito_quarto: 'O quarto já foi reservado nesse período por outro aparelho.',
  sem_permissao: 'Seu usuário não tem mais permissão para isso.',
  nao_encontrado: 'O registro não existe mais (foi excluído em outro aparelho) ou seu usuário não pode mais alterá-lo.',
  duplicado: 'Já existe um registro igual no sistema.',
  documento: 'Já existe um hóspede com esse documento.',
  erro: 'O banco recusou sem explicar o motivo.',
} as const

/** Traduz a resposta de erro do Supabase no que o caderninho deve fazer. */
export function classify(failure: TransportFailure): Outcome {
  const { status, error } = failure
  const code = error.code ?? ''
  const text = `${error.message ?? ''} ${error.details ?? ''}`
  if (status === 0 || status >= 500) return { type: 'retry' }
  if (status === 401 || code === 'PGRST301' || code === 'PGRST303') return { type: 'auth' }
  if (code === '23505') {
    if (text.includes('guests_document_type_document_number_key')) return { type: 'remap-guest' }
    if (text.includes('_pkey')) return { type: 'ok' }
    return { type: 'reject', reason: 'regra', message: MESSAGES.duplicado }
  }
  if (code === '23P01') return { type: 'reject', reason: 'conflito_quarto', message: MESSAGES.conflito_quarto }
  if (code === '42501' || (code === 'P0001' && /permiss/i.test(text))) {
    return { type: 'reject', reason: 'sem_permissao', message: MESSAGES.sem_permissao }
  }
  if (code === '23503' || code === 'NAO_ENCONTRADO' || (code === 'P0001' && /não encontrad/i.test(text))) {
    return { type: 'reject', reason: 'nao_encontrado', message: MESSAGES.nao_encontrado }
  }
  if (code === 'P0001') return { type: 'reject', reason: 'regra', message: error.message }
  return { type: 'reject', reason: 'erro', message: error.message || MESSAGES.erro }
}

export async function enqueue(item: NewOutboxItem): Promise<OutboxItem> {
  const full = {
    ...item,
    id: newId(),
    createdAt: new Date().toISOString(),
    status: 'pendente',
    error: null,
    attempts: 0,
  } as OutboxItem
  full.seq = await db.outbox.add(full)
  return full
}

export async function outboxCounts(): Promise<{ pending: number; rejected: number }> {
  const [pending, rejected] = await Promise.all([
    db.outbox.where('status').anyOf('pendente', 'enviando').count(),
    db.outbox.where('status').equals('recusado').count(),
  ])
  return { pending, rejected }
}

/** Situação de cada registro citado no caderninho (para as etiquetas "Aguardando envio"/"Recusada"). */
export async function outboxEntityStatus(): Promise<Map<EntityKey, 'pendente' | 'recusado'>> {
  const map = new Map<EntityKey, 'pendente' | 'recusado'>()
  for (const item of await db.outbox.toArray()) {
    for (const key of item.entityIds) {
      if (item.status === 'recusado') map.set(key, 'recusado')
      else if (!map.has(key)) map.set(key, 'pendente')
    }
  }
  return map
}

function withoutSeq(item: OutboxItem): OutboxItem {
  const copy = { ...item }
  delete copy.seq
  return copy
}

function send(transport: Transport, item: OutboxItem): Promise<TransportResult> {
  switch (item.kind) {
    case 'guest.create':
      return transport.insert('guests', item.payload.row)
    case 'reservation.create':
      return transport.insert('reservations', item.payload.row)
    case 'guest.update':
      return transport.update('guests', item.payload.id, item.payload.patch)
    case 'reservation.update':
      return transport.update('reservations', item.payload.id, item.payload.patch)
    case 'reservation.invoice':
      return transport.update('reservations', item.payload.id, {
        invoice_issued: item.payload.invoice_issued,
        invoice_issued_at: item.payload.invoice_issued_at,
      })
    case 'reservation.checkin':
      return transport.rpc('checkin_reservation', { p_reservation_id: item.payload.id, p_at: item.payload.at })
    case 'reservation.checkout':
      return transport.rpc('checkout_reservation', { p_reservation_id: item.payload.id, p_at: item.payload.at })
    case 'reservation.cancel':
      return transport.rpc('cancel_reservation', {
        p_reservation_id: item.payload.id,
        p_reason: item.payload.reason,
        p_notes: item.payload.notes,
      })
    case 'room.clean':
      return transport.rpc('mark_room_clean', { p_room_id: item.payload.id })
    case 'payment.create':
      return transport.rpc('register_payment', {
        p_reservation_id: item.payload.reservation_id,
        p_amount: item.payload.amount,
        p_method: item.payload.method,
        p_notes: item.payload.notes,
        p_id: item.payload.id,
        p_paid_at: item.payload.at,
      })
  }
}

async function nextItem(): Promise<OutboxItem | undefined> {
  const items = await db.outbox.where('status').anyOf('pendente', 'enviando').sortBy('seq')
  return items[0]
}

async function rejectedParent(item: OutboxItem): Promise<OutboxItem | undefined> {
  for (const key of item.dependsOn) {
    const parent = await db.outbox
      .where('entityIds')
      .equals(key)
      .filter((other) => other.status === 'recusado' && other.seq !== item.seq)
      .first()
    if (parent) return parent
  }
  return undefined
}

async function markRejected(item: OutboxItem, reason: RejectReason, message: string): Promise<void> {
  await db.outbox.update(item.seq!, { status: 'recusado', error: { reason, message } })
}

/** O banco já tem um hóspede com o mesmo documento: troca o id local pelo dele em tudo. */
async function remapGuest(
  item: Extract<OutboxItem, { kind: 'guest.create' }>,
  transport: Transport
): Promise<'ok' | 'nao-achou' | 'rede'> {
  const row = item.payload.row
  let found
  try {
    found = await transport.findGuestByDocument(row.document_type, row.document_number)
  } catch {
    return 'rede'
  }
  if (!found) return 'nao-achou'
  const existing = found
  const fromKey = entityKey('guests', row.id)
  const toKey = entityKey('guests', existing.id)
  await db.transaction('rw', db.guests, db.reservations, db.outbox, async () => {
    await db.guests.delete(row.id)
    await db.guests.put(existing)
    await db.reservations.where('guest_id').equals(row.id).modify({ guest_id: existing.id })
    await db.outbox.delete(item.seq!)
    await db.outbox.toCollection().modify((other) => {
      other.entityIds = other.entityIds.map((key) => (key === fromKey ? toKey : key))
      other.dependsOn = other.dependsOn.map((key) => (key === fromKey ? toKey : key))
      if (other.kind === 'reservation.create' && other.payload.row.guest_id === row.id) other.payload.row.guest_id = existing.id
      if (other.kind === 'reservation.update' && other.payload.patch.guest_id === row.id) other.payload.patch.guest_id = existing.id
      if (other.kind === 'guest.update' && other.payload.id === row.id) other.payload.id = existing.id
    })
  })
  return 'ok'
}

export interface ProcessResult {
  sent: number
  rejected: number
  stoppedBy: 'rede' | 'login' | null
}

/** Envia o caderninho, um item por vez, na ordem. Para na falta de rede ou de login. */
export async function processOutbox(transport: Transport): Promise<ProcessResult> {
  const result: ProcessResult = { sent: 0, rejected: 0, stoppedBy: null }
  for (let item = await nextItem(); item; item = await nextItem()) {
    const parent = await rejectedParent(item)
    if (parent) {
      await markRejected(item, 'dependencia', `Depende de "${parent.description}", que foi recusada.`)
      result.rejected++
      continue
    }

    await db.outbox.update(item.seq!, { status: 'enviando', attempts: item.attempts + 1 })
    let response: TransportResult
    try {
      response = await send(transport, item)
    } catch (error) {
      response = { ok: false, status: 0, error: { message: String(error) } }
    }
    const outcome: Outcome = response.ok ? { type: 'ok' } : classify(response)

    if (outcome.type === 'ok') {
      await db.outbox.delete(item.seq!)
      result.sent++
      continue
    }
    if (outcome.type === 'retry' || outcome.type === 'auth') {
      await db.outbox.update(item.seq!, { status: 'pendente' })
      result.stoppedBy = outcome.type === 'retry' ? 'rede' : 'login'
      return result
    }
    if (outcome.type === 'remap-guest') {
      if (item.kind === 'guest.create') {
        const remapped = await remapGuest(item, transport)
        if (remapped === 'rede') {
          await db.outbox.update(item.seq!, { status: 'pendente' })
          result.stoppedBy = 'rede'
          return result
        }
        if (remapped === 'ok') {
          result.sent++
          continue
        }
      }
      await markRejected(item, 'regra', MESSAGES.documento)
      result.rejected++
      continue
    }
    await markRejected(item, outcome.reason, outcome.message)
    result.rejected++
  }
  return result
}

/**
 * Tira do caderninho um item recusado. Se era uma criação, apaga o registro local e, em cascata,
 * as ações que dependiam dele. Nos outros casos, marca os registros para buscar de novo no servidor.
 * Devolve as chaves marcadas.
 */
export async function discardItem(seq: number): Promise<EntityKey[]> {
  const toRefetch: EntityKey[] = []
  await db.transaction('rw', [db.outbox, db.guests, db.reservations, db.payments, db.meta], async () => {
    const queue = [seq]
    while (queue.length > 0) {
      const current = await db.outbox.get(queue.shift()!)
      if (!current) continue
      await db.outbox.delete(current.seq!)
      if (current.kind === 'guest.create') await db.guests.delete(current.payload.row.id)
      else if (current.kind === 'reservation.create') await db.reservations.delete(current.payload.row.id)
      else if (current.kind === 'payment.create') await db.payments.delete(current.payload.id)
      else toRefetch.push(...current.entityIds)

      if (current.kind === 'guest.create' || current.kind === 'reservation.create' || current.kind === 'payment.create') {
        const dependents = await db.outbox
          .filter((other) => other.dependsOn.some((key) => current.entityIds.includes(key)))
          .toArray()
        queue.push(...dependents.map((dependent) => dependent.seq!))
      }
    }
    const previous = (await getMeta<EntityKey[]>('refetch')) ?? []
    await setMeta('refetch', Array.from(new Set([...previous, ...toRefetch])))
  })
  return toRefetch
}

/** Recoloca no fim da fila um item recusado já corrigido e, logo depois dele, os que estavam travados por ele. */
export async function requeue(seq: number, fix: (item: OutboxItem) => OutboxItem): Promise<void> {
  await db.transaction('rw', db.outbox, async () => {
    const item = await db.outbox.get(seq)
    if (!item) return
    await db.outbox.delete(seq)
    await db.outbox.add({ ...withoutSeq(fix(item)), status: 'pendente', error: null, attempts: 0 } as OutboxItem)
    const blocked = await db.outbox
      .where('status')
      .equals('recusado')
      .filter((other) => other.error?.reason === 'dependencia' && other.dependsOn.some((key) => item.entityIds.includes(key)))
      .sortBy('seq')
    for (const dependent of blocked) {
      await db.outbox.delete(dependent.seq!)
      await db.outbox.add({ ...withoutSeq(dependent), status: 'pendente', error: null, attempts: 0 } as OutboxItem)
    }
  })
}
```

- [ ] **Passo 4: Rodar** (`npx -y pnpm@10 test`). Esperado: todos passando. Se a ordem `seq` de `requeue` falhar, conferir que `db.outbox.add` sem `seq` gera um número novo (é `++seq`).

- [ ] **Passo 5: `npx -y pnpm@10 build`.** Esperado: sem erros.

- [ ] **Passo 6: Commit.** `git add src/offline`. Mensagem: `Caderninho: envio em ordem, classificacao das respostas, dependencias e descarte`.

---

### Tarefa 5: Ações locais (regras no aparelho)

**Arquivos:** criar `src/offline/actions.ts` e `src/offline/__tests__/actions.test.ts`.

**Interfaces:**
- **Consome:** `db`, `entityKey`, `enqueue`, `requeue`, `newId`, `emitLocalChange`, os tipos de `outbox-types.ts` e `toLocalIsoDate`/`formatCurrency` (`@/lib/format`).
- **Produz:**
  - `class ActionError`
  - `interface Actor { id: string; role: Role }`, `requireActor(actor: Actor | null): Actor`
  - `actionErrorMessage(error, fallback): string`
  - `interface GuestFields`, `interface ReservationFields`
  - `createGuest(actor, fields): Promise<Guest>`, `updateGuest(actor, id, fields): Promise<Guest>`
  - `createReservation(actor, fields): Promise<Reservation>`
  - `createGroupReservations(actor, { guest_id, check_in, check_out, rooms: { room_id; occupant_name; daily_rate }[] }): Promise<number>`
  - `updateReservation(actor, id, fields): Promise<Reservation>`
  - `setInvoiceIssued(actor, id, issued): Promise<void>`
  - `checkinReservation(actor, id)`, `checkoutReservation(actor, id)`, `cancelReservation(actor, id, reason, notes)`
  - `markRoomClean(actor, roomId)`
  - `registerPayment(actor, { reservation_id, amount, method, notes }): Promise<Payment>`
  - `resolveReservationConflict(actor, seq, { room_id, check_in, check_out, daily_rate }): Promise<void>`

- [ ] **Passo 1: Escrever o teste `src/offline/__tests__/actions.test.ts`**

```ts
import { beforeEach, describe, expect, it } from 'vitest'

import { toLocalIsoDate } from '@/lib/format'
import * as actions from '@/offline/actions'
import { db, wipeLocalData } from '@/offline/db'

import { makeGuest, makeReservation, makeRoom, makeRoomType } from './fakes'

const recepcao: actions.Actor = { id: 'u1', role: 'recepcao' }
const governanca: actions.Actor = { id: 'u2', role: 'governanca' }
const financeiro: actions.Actor = { id: 'u3', role: 'financeiro' }

function day(offset: number): string {
  const date = new Date()
  date.setDate(date.getDate() + offset)
  return toLocalIsoDate(date)
}

function fields(over: Partial<actions.ReservationFields> = {}): actions.ReservationFields {
  return {
    guest_id: 'g1',
    room_id: 'r1',
    check_in: day(0),
    check_out: day(2),
    adults: 1,
    children: 0,
    daily_rate: 150,
    occupant_name: null,
    notes: null,
    ...over,
  }
}

beforeEach(async () => {
  await wipeLocalData()
  await db.room_types.put(makeRoomType())
  await db.rooms.bulkPut([makeRoom({ id: 'r1', number: '1' }), makeRoom({ id: 'r2', number: '2' })])
  await db.guests.put(makeGuest())
})

describe('reservas', () => {
  it('criar grava na cópia e no caderninho', async () => {
    const reservation = await actions.createReservation(recepcao, fields())
    expect(await db.reservations.get(reservation.id)).toMatchObject({ status: 'confirmada', room_id: 'r1' })
    const [item] = await db.outbox.toArray()
    expect(item).toMatchObject({ kind: 'reservation.create', entityIds: [`reservations:${reservation.id}`], dependsOn: ['guests:g1'] })
    expect(item.description).toContain('quarto 1')
  })

  it('não deixa reservar quarto ocupado no período, mas libera depois de cancelada', async () => {
    const first = await actions.createReservation(recepcao, fields())
    await expect(actions.createReservation(recepcao, fields({ check_in: day(1), check_out: day(3) }))).rejects.toThrow('já está reservado')
    await actions.cancelReservation(recepcao, first.id, 'hospede_avisou', '')
    await expect(actions.createReservation(recepcao, fields({ check_in: day(1), check_out: day(3) }))).resolves.toBeDefined()
  })

  it('governança não cria reserva', async () => {
    await expect(actions.createReservation(governanca, fields())).rejects.toBeInstanceOf(actions.ActionError)
  })

  it('editar uma reserva ainda não enviada junta na criação', async () => {
    const reservation = await actions.createReservation(recepcao, fields())
    await actions.updateReservation(recepcao, reservation.id, fields({ room_id: 'r2', notes: 'janela' }))
    const items = await db.outbox.toArray()
    expect(items).toHaveLength(1)
    expect(items[0].kind === 'reservation.create' && items[0].payload.row).toMatchObject({ room_id: 'r2', notes: 'janela' })
  })

  it('editar uma reserva que já está no servidor envia só os campos mudados', async () => {
    await db.reservations.put(makeReservation({ id: 'S', check_in: day(5), check_out: day(7) }))
    await actions.updateReservation(recepcao, 'S', fields({ check_in: day(5), check_out: day(7), notes: 'andar alto' }))
    const [item] = await db.outbox.toArray()
    expect(item.kind === 'reservation.update' && item.payload).toEqual({ id: 'S', patch: { notes: 'andar alto' } })
  })
})

describe('check-in, check-out, limpeza e cancelamento', () => {
  it('check-in antes da data é recusado', async () => {
    await db.reservations.put(makeReservation({ id: 'F', check_in: day(1), check_out: day(3) }))
    await expect(actions.checkinReservation(recepcao, 'F')).rejects.toThrow('a partir da data marcada')
  })

  it('check-in no dia ocupa o quarto e protege os dois registros', async () => {
    await db.reservations.put(makeReservation({ id: 'H', check_in: day(0), check_out: day(2) }))
    await actions.checkinReservation(recepcao, 'H')
    expect((await db.reservations.get('H'))?.status).toBe('em_andamento')
    expect((await db.rooms.get('r1'))?.status).toBe('ocupado')
    const [item] = await db.outbox.toArray()
    expect(item.entityIds).toEqual(['reservations:H', 'rooms:r1'])
  })

  it('check-out deixa o quarto em limpeza e a governança libera', async () => {
    await db.reservations.put(makeReservation({ id: 'H', status: 'em_andamento' }))
    await db.rooms.update('r1', { status: 'ocupado' })
    await actions.checkoutReservation(recepcao, 'H')
    expect((await db.rooms.get('r1'))?.status).toBe('limpeza')
    await actions.markRoomClean(governanca, 'r1')
    expect((await db.rooms.get('r1'))?.status).toBe('disponivel')
    await expect(actions.markRoomClean(governanca, 'r1')).rejects.toThrow('não está aguardando limpeza')
  })

  it('cancelar uma reserva em andamento manda o quarto para limpeza', async () => {
    await db.reservations.put(makeReservation({ id: 'H', status: 'em_andamento' }))
    await db.rooms.update('r1', { status: 'ocupado' })
    await actions.cancelReservation(recepcao, 'H', 'outro', '  ')
    expect(await db.reservations.get('H')).toMatchObject({ status: 'cancelada', cancellation_reason: 'outro', cancellation_notes: null })
    expect((await db.rooms.get('r1'))?.status).toBe('limpeza')
  })
})

describe('pagamento e hóspede', () => {
  it('pagamento entra na cópia com a mesma etiqueta do caderninho', async () => {
    await db.reservations.put(makeReservation({ id: 'H' }))
    const payment = await actions.registerPayment(financeiro, { reservation_id: 'H', amount: 80, method: 'pix', notes: '' })
    expect(await db.payments.get(payment.id)).toMatchObject({ amount: 80, registered_by: 'u3', notes: null })
    const [item] = await db.outbox.toArray()
    expect(item.kind === 'payment.create' && item.payload.id).toBe(payment.id)
    await expect(actions.registerPayment(governanca, { reservation_id: 'H', amount: 1, method: 'pix', notes: '' })).rejects.toBeInstanceOf(actions.ActionError)
  })

  it('documento já cadastrado na cópia é recusado', async () => {
    await expect(
      actions.createGuest(recepcao, {
        full_name: 'Outra Pessoa', document_type: 'cpf', document_number: '529.982.247-25',
        email: null, phone: null, birth_date: null, nationality: 'Brasileira', notes: null,
      })
    ).rejects.toThrow('Já existe um hóspede com esse documento')
  })
})

describe('resolver conflito', () => {
  it('trocar o quarto recoloca a criação na fila', async () => {
    const reservation = await actions.createReservation(recepcao, fields())
    const [item] = await db.outbox.toArray()
    await db.outbox.update(item.seq!, { status: 'recusado', error: { reason: 'conflito_quarto', message: 'x' } })
    await actions.resolveReservationConflict(recepcao, item.seq!, { room_id: 'r2', check_in: reservation.check_in, check_out: reservation.check_out, daily_rate: 150 })
    const [fixed] = await db.outbox.toArray()
    expect(fixed.status).toBe('pendente')
    expect(fixed.kind === 'reservation.create' && fixed.payload.row.room_id).toBe('r2')
    expect((await db.reservations.get(reservation.id))?.room_id).toBe('r2')
  })
})
```

- [ ] **Passo 2: Rodar e ver falhar.** Esperado: FAIL, porque `@/offline/actions` não existe.

- [ ] **Passo 3: `src/offline/actions.ts`**

```ts
import { formatCurrency, toLocalIsoDate } from '@/lib/format'
import { db, entityKey, type EntityKey } from '@/offline/db'
import { emitLocalChange } from '@/offline/events'
import { newId } from '@/offline/ids'
import { enqueue, requeue } from '@/offline/outbox'
import type { GuestPatch, NewGuestRow, NewReservationRow, OutboxItem, ReservationPatch } from '@/offline/outbox-types'
import type { Role } from '@/types/auth'
import type { DocumentType, Guest } from '@/types/guest'
import type { Payment, PaymentMethod } from '@/types/payment'
import type { CancellationReason, Reservation } from '@/types/reservation'

/** Regra conferida no aparelho. A mensagem vai direto para a tela. */
export class ActionError extends Error {}

export interface Actor {
  id: string
  role: Role
}

export function requireActor(actor: Actor | null): Actor {
  if (!actor) throw new ActionError('Seu login não está carregado. Entre de novo.')
  return actor
}

export function actionErrorMessage(error: unknown, fallback: string): string {
  return error instanceof ActionError ? error.message : fallback
}

const STAFF: Role[] = ['admin', 'gerente', 'recepcao']
const CLEANING: Role[] = ['admin', 'gerente', 'governanca']
const PAYMENT: Role[] = ['admin', 'gerente', 'recepcao', 'financeiro']

function requireRole(actor: Actor, roles: Role[], what: string): void {
  if (!roles.includes(actor.role)) throw new ActionError(`Seu cargo não permite ${what}.`)
}

const nowIso = () => new Date().toISOString()
const shortDate = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString('pt-BR')

function diff<T extends object>(current: T, next: Partial<T>): Partial<T> {
  const patch: Partial<T> = {}
  for (const key of Object.keys(next) as (keyof T)[]) {
    if (next[key] !== current[key]) patch[key] = next[key]
  }
  return patch
}

async function reservationLabel(
  r: Pick<Reservation, 'guest_id' | 'room_id' | 'check_in' | 'check_out' | 'occupant_name'>
): Promise<string> {
  const [guest, room] = await Promise.all([db.guests.get(r.guest_id), db.rooms.get(r.room_id)])
  const who = r.occupant_name || guest?.full_name || 'hóspede'
  return `${who}, quarto ${room?.number ?? '?'}, ${shortDate(r.check_in)} a ${shortDate(r.check_out)}`
}

async function assertRoomFree(roomId: string, checkIn: string, checkOut: string, ignoreId?: string): Promise<void> {
  const clash = await db.reservations
    .where('room_id')
    .equals(roomId)
    .filter((r) => r.id !== ignoreId && r.status !== 'cancelada' && r.check_in < checkOut && r.check_out > checkIn)
    .first()
  if (clash) throw new ActionError('Esse quarto já está reservado nesse período.')
}

async function getReservation(id: string): Promise<Reservation> {
  const reservation = await db.reservations.get(id)
  if (!reservation) throw new ActionError('Reserva não encontrada neste aparelho.')
  return reservation
}

/** Criação ainda não enviada (pendente ou recusada) de um registro, para juntar edições nela. */
async function unsentCreate(key: EntityKey): Promise<OutboxItem | undefined> {
  return db.outbox
    .where('entityIds')
    .equals(key)
    .filter((o) => (o.kind === 'reservation.create' || o.kind === 'guest.create') && o.status !== 'enviando')
    .first()
}

/** Troca os dados de uma criação ainda não enviada; se ela estava recusada, volta para a fila. */
async function rewriteCreate(item: OutboxItem, fix: (item: OutboxItem) => OutboxItem): Promise<void> {
  if (item.status === 'recusado') await requeue(item.seq!, fix)
  else await db.outbox.put(fix(item))
}

/* ---------- Hóspedes ---------- */

export interface GuestFields {
  full_name: string
  document_type: DocumentType
  document_number: string
  email: string | null
  phone: string | null
  birth_date: string | null
  nationality: string
  notes: string | null
}

async function assertDocumentFree(type: DocumentType, number: string, ignoreId?: string): Promise<void> {
  const same = await db.guests
    .where('[document_type+document_number]')
    .equals([type, number])
    .filter((g) => g.id !== ignoreId)
    .first()
  if (same) throw new ActionError('Já existe um hóspede com esse documento.')
}

export async function createGuest(actor: Actor, fields: GuestFields): Promise<Guest> {
  requireRole(actor, STAFF, 'cadastrar hóspedes')
  await assertDocumentFree(fields.document_type, fields.document_number)
  const now = nowIso()
  const row: NewGuestRow = { id: newId(), ...fields, active: true }
  const guest: Guest = { ...row, created_at: now, updated_at: now }
  await db.transaction('rw', db.guests, db.outbox, async () => {
    await db.guests.add(guest)
    await enqueue({
      kind: 'guest.create',
      payload: { row },
      entityIds: [entityKey('guests', row.id)],
      dependsOn: [],
      description: `Novo hóspede: ${row.full_name}`,
      userId: actor.id,
    })
  })
  emitLocalChange()
  return guest
}

export async function updateGuest(actor: Actor, id: string, fields: GuestFields): Promise<Guest> {
  requireRole(actor, STAFF, 'editar hóspedes')
  const current = await db.guests.get(id)
  if (!current) throw new ActionError('Hóspede não encontrado neste aparelho.')
  await assertDocumentFree(fields.document_type, fields.document_number, id)
  const patch = diff(current, fields) as GuestPatch
  if (Object.keys(patch).length === 0) return current
  const updated: Guest = { ...current, ...patch, updated_at: nowIso() }
  const key = entityKey('guests', id)
  await db.transaction('rw', db.guests, db.outbox, async () => {
    await db.guests.put(updated)
    const create = await unsentCreate(key)
    if (create?.kind === 'guest.create') {
      await rewriteCreate(create, (item) =>
        item.kind === 'guest.create' ? { ...item, payload: { row: { ...item.payload.row, ...patch } } } : item
      )
    } else {
      await enqueue({
        kind: 'guest.update',
        payload: { id, patch },
        entityIds: [key],
        dependsOn: [key],
        description: `Edição do hóspede ${updated.full_name}`,
        userId: actor.id,
      })
    }
  })
  emitLocalChange()
  return updated
}

/* ---------- Reservas ---------- */

export interface ReservationFields {
  guest_id: string
  room_id: string
  check_in: string
  check_out: string
  adults: number
  children: number
  daily_rate: number
  occupant_name: string | null
  notes: string | null
}

function assertDates(fields: Pick<ReservationFields, 'check_in' | 'check_out'>): void {
  if (!(fields.check_out > fields.check_in)) throw new ActionError('A data de saída precisa ser depois da entrada.')
}

async function assertGuestAndRoom(guestId: string, roomId: string): Promise<void> {
  const [guest, room] = await Promise.all([db.guests.get(guestId), db.rooms.get(roomId)])
  if (!guest || !guest.active) throw new ActionError('Hóspede não encontrado ou inativo.')
  if (!room) throw new ActionError('Quarto não encontrado.')
}

function newReservationRow(fields: ReservationFields): NewReservationRow {
  return {
    id: newId(),
    ...fields,
    status: 'confirmada',
    checked_in_at: null,
    checked_out_at: null,
    invoice_issued: false,
    invoice_issued_at: null,
    cancellation_reason: null,
    cancellation_notes: null,
  }
}

async function addReservation(actor: Actor, row: NewReservationRow): Promise<Reservation> {
  const now = nowIso()
  const reservation: Reservation = { ...row, created_at: now, updated_at: now }
  const description = `Nova reserva: ${await reservationLabel(row)}`
  await db.transaction('rw', db.reservations, db.outbox, async () => {
    await assertRoomFree(row.room_id, row.check_in, row.check_out)
    await db.reservations.add(reservation)
    await enqueue({
      kind: 'reservation.create',
      payload: { row },
      entityIds: [entityKey('reservations', row.id)],
      dependsOn: [entityKey('guests', row.guest_id)],
      description,
      userId: actor.id,
    })
  })
  return reservation
}

export async function createReservation(actor: Actor, fields: ReservationFields): Promise<Reservation> {
  requireRole(actor, STAFF, 'criar reservas')
  assertDates(fields)
  await assertGuestAndRoom(fields.guest_id, fields.room_id)
  await assertRoomFree(fields.room_id, fields.check_in, fields.check_out)
  const reservation = await addReservation(actor, newReservationRow(fields))
  emitLocalChange()
  return reservation
}

export async function createGroupReservations(
  actor: Actor,
  group: {
    guest_id: string
    check_in: string
    check_out: string
    rooms: { room_id: string; occupant_name: string | null; daily_rate: number }[]
  }
): Promise<number> {
  requireRole(actor, STAFF, 'criar reservas')
  assertDates(group)
  for (const room of group.rooms) {
    await assertGuestAndRoom(group.guest_id, room.room_id)
    await assertRoomFree(room.room_id, group.check_in, group.check_out)
  }
  for (const room of group.rooms) {
    await addReservation(
      actor,
      newReservationRow({
        guest_id: group.guest_id,
        room_id: room.room_id,
        check_in: group.check_in,
        check_out: group.check_out,
        adults: 1,
        children: 0,
        daily_rate: room.daily_rate,
        occupant_name: room.occupant_name,
        notes: null,
      })
    )
  }
  emitLocalChange()
  return group.rooms.length
}

export async function updateReservation(actor: Actor, id: string, fields: ReservationFields): Promise<Reservation> {
  requireRole(actor, STAFF, 'editar reservas')
  assertDates(fields)
  const current = await getReservation(id)
  await assertGuestAndRoom(fields.guest_id, fields.room_id)
  if (fields.room_id !== current.room_id || fields.check_in !== current.check_in || fields.check_out !== current.check_out) {
    await assertRoomFree(fields.room_id, fields.check_in, fields.check_out, id)
  }
  const patch = diff(current, fields) as ReservationPatch
  if (Object.keys(patch).length === 0) return current
  const updated: Reservation = { ...current, ...patch, updated_at: nowIso() }
  const key = entityKey('reservations', id)
  const description = `Edição da reserva: ${await reservationLabel(updated)}`
  await db.transaction('rw', db.reservations, db.outbox, async () => {
    await db.reservations.put(updated)
    const create = await unsentCreate(key)
    if (create?.kind === 'reservation.create') {
      await rewriteCreate(create, (item) =>
        item.kind === 'reservation.create'
          ? { ...item, description: `Nova reserva: ${description.replace('Edição da reserva: ', '')}`, payload: { row: { ...item.payload.row, ...patch } } }
          : item
      )
    } else {
      await enqueue({ kind: 'reservation.update', payload: { id, patch }, entityIds: [key], dependsOn: [key], description, userId: actor.id })
    }
  })
  emitLocalChange()
  return updated
}

export async function setInvoiceIssued(actor: Actor, id: string, issued: boolean): Promise<void> {
  requireRole(actor, STAFF, 'marcar nota fiscal')
  const current = await getReservation(id)
  const at = issued ? nowIso() : null
  const key = entityKey('reservations', id)
  const description = `Nota fiscal ${issued ? 'emitida' : 'pendente'}: ${await reservationLabel(current)}`
  await db.transaction('rw', db.reservations, db.outbox, async () => {
    await db.reservations.put({ ...current, invoice_issued: issued, invoice_issued_at: at })
    await enqueue({
      kind: 'reservation.invoice',
      payload: { id, invoice_issued: issued, invoice_issued_at: at },
      entityIds: [key],
      dependsOn: [key],
      description,
      userId: actor.id,
    })
  })
  emitLocalChange()
}

export async function checkinReservation(actor: Actor, id: string): Promise<void> {
  requireRole(actor, STAFF, 'fazer check-in')
  const reservation = await getReservation(id)
  if (reservation.status !== 'confirmada') throw new ActionError('Só é possível fazer check-in de uma reserva confirmada.')
  if (reservation.check_in > toLocalIsoDate(new Date())) throw new ActionError('Check-in só pode ser feito a partir da data marcada.')
  const at = nowIso()
  const key = entityKey('reservations', id)
  const description = `Check-in: ${await reservationLabel(reservation)}`
  await db.transaction('rw', db.reservations, db.rooms, db.outbox, async () => {
    await db.reservations.put({ ...reservation, status: 'em_andamento', checked_in_at: at })
    await db.rooms.update(reservation.room_id, { status: 'ocupado' })
    await enqueue({
      kind: 'reservation.checkin',
      payload: { id, at },
      entityIds: [key, entityKey('rooms', reservation.room_id)],
      dependsOn: [key],
      description,
      userId: actor.id,
    })
  })
  emitLocalChange()
}

export async function checkoutReservation(actor: Actor, id: string): Promise<void> {
  requireRole(actor, STAFF, 'fazer check-out')
  const reservation = await getReservation(id)
  if (reservation.status !== 'em_andamento') throw new ActionError('Só é possível fazer check-out de uma reserva em andamento.')
  const at = nowIso()
  const key = entityKey('reservations', id)
  const description = `Check-out: ${await reservationLabel(reservation)}`
  await db.transaction('rw', db.reservations, db.rooms, db.outbox, async () => {
    await db.reservations.put({ ...reservation, status: 'finalizada', checked_out_at: at })
    await db.rooms.update(reservation.room_id, { status: 'limpeza' })
    await enqueue({
      kind: 'reservation.checkout',
      payload: { id, at },
      entityIds: [key, entityKey('rooms', reservation.room_id)],
      dependsOn: [key],
      description,
      userId: actor.id,
    })
  })
  emitLocalChange()
}

export async function cancelReservation(actor: Actor, id: string, reason: CancellationReason, notes: string): Promise<void> {
  requireRole(actor, STAFF, 'cancelar reservas')
  const reservation = await getReservation(id)
  if (reservation.status !== 'confirmada' && reservation.status !== 'em_andamento') {
    throw new ActionError('Só é possível cancelar reservas confirmadas ou em andamento.')
  }
  const wasHosted = reservation.status === 'em_andamento'
  const cleanNotes = notes.trim() || null
  const key = entityKey('reservations', id)
  const description = `Cancelamento: ${await reservationLabel(reservation)}`
  await db.transaction('rw', db.reservations, db.rooms, db.outbox, async () => {
    await db.reservations.put({ ...reservation, status: 'cancelada', cancellation_reason: reason, cancellation_notes: cleanNotes })
    if (wasHosted) await db.rooms.update(reservation.room_id, { status: 'limpeza' })
    await enqueue({
      kind: 'reservation.cancel',
      payload: { id, reason, notes: cleanNotes },
      entityIds: wasHosted ? [key, entityKey('rooms', reservation.room_id)] : [key],
      dependsOn: [key],
      description,
      userId: actor.id,
    })
  })
  emitLocalChange()
}

/* ---------- Governança ---------- */

export async function markRoomClean(actor: Actor, roomId: string): Promise<void> {
  requireRole(actor, CLEANING, 'marcar quarto como limpo')
  const room = await db.rooms.get(roomId)
  if (!room) throw new ActionError('Quarto não encontrado.')
  if (room.status !== 'limpeza') throw new ActionError('Esse quarto não está aguardando limpeza.')
  await db.transaction('rw', db.rooms, db.outbox, async () => {
    await db.rooms.put({ ...room, status: 'disponivel' })
    await enqueue({
      kind: 'room.clean',
      payload: { id: roomId },
      entityIds: [entityKey('rooms', roomId)],
      dependsOn: [],
      description: `Quarto ${room.number} marcado como limpo`,
      userId: actor.id,
    })
  })
  emitLocalChange()
}

/* ---------- Financeiro ---------- */

export async function registerPayment(
  actor: Actor,
  input: { reservation_id: string; amount: number; method: PaymentMethod; notes: string }
): Promise<Payment> {
  requireRole(actor, PAYMENT, 'registrar pagamentos')
  const reservation = await getReservation(input.reservation_id)
  if (!(input.amount > 0)) throw new ActionError('O valor precisa ser maior que zero.')
  const id = newId()
  const at = nowIso()
  const notes = input.notes.trim() || null
  const payment: Payment = {
    id,
    reservation_id: input.reservation_id,
    amount: input.amount,
    method: input.method,
    notes,
    registered_by: actor.id,
    created_at: at,
    updated_at: at,
  }
  const description = `Pagamento de ${formatCurrency(input.amount)}: ${await reservationLabel(reservation)}`
  await db.transaction('rw', db.payments, db.outbox, async () => {
    await db.payments.add(payment)
    await enqueue({
      kind: 'payment.create',
      payload: { id, reservation_id: input.reservation_id, amount: input.amount, method: input.method, notes, at },
      entityIds: [entityKey('payments', id)],
      dependsOn: [entityKey('reservations', input.reservation_id)],
      description,
      userId: actor.id,
    })
  })
  emitLocalChange()
  return payment
}

/* ---------- Pendências ---------- */

export async function resolveReservationConflict(
  actor: Actor,
  seq: number,
  change: Pick<ReservationFields, 'room_id' | 'check_in' | 'check_out' | 'daily_rate'>
): Promise<void> {
  const item = await db.outbox.get(seq)
  if (!item || item.kind !== 'reservation.create') throw new ActionError('Pendência não encontrada.')
  const current = await getReservation(item.payload.row.id)
  const next: ReservationFields = {
    guest_id: current.guest_id,
    room_id: change.room_id,
    check_in: change.check_in,
    check_out: change.check_out,
    adults: current.adults,
    children: current.children,
    daily_rate: change.daily_rate,
    occupant_name: current.occupant_name,
    notes: current.notes,
  }
  if (Object.keys(diff(current, next)).length === 0) throw new ActionError('Escolha outro quarto ou outras datas.')
  await updateReservation(actor, current.id, next)
}
```

> Observação para quem executa: `reservationLabel` lê `guests` e `rooms`. Por isso ela é sempre chamada **antes** de abrir a transação, que só inclui as tabelas que a ação grava.

- [ ] **Passo 4: Rodar** (`npx -y pnpm@10 test`). Esperado: todos passando.

- [ ] **Passo 5: `npx -y pnpm@10 build`.** Esperado: sem erros.

- [ ] **Passo 6: Commit.** `git add src/offline`. Mensagem: `Acoes offline com as regras do banco aplicadas no aparelho`.

---

### Tarefa 6: Leituras da cópia

**Arquivos:** criar `src/offline/queries.ts` e `src/offline/__tests__/queries.test.ts`.

**Interfaces:**
- **Consome:** `db` e `compareRoomNumbers` (`@/lib/format`).
- **Produz:**
  - `listReservationsWithRelations(): Promise<ReservationWithRelations[]>` (entrada mais recente primeiro)
  - `listGuests(): Promise<Guest[]>` (por nome), `listActiveGuestsForSelect(): Promise<Pick<Guest,'id'|'full_name'>[]>`
  - `interface RoomOption extends Room { room_types: { id; name; base_price } | null }`, `listRoomsWithType(): Promise<RoomOption[]>` (ordem numérica), `countRooms(): Promise<number>`
  - `listRoomTypes(): Promise<RoomType[]>`, `listSeasonalRatesWithType(): Promise<SeasonalRateWithType[]>`
  - `seasonalRateFor(roomTypeId, date): Promise<number | null>`, `seasonalRatesForDate(roomTypeIds, date): Promise<Map<string, number>>`
  - `overlappingRoomIds(checkIn, checkOut, ignoreReservationId?): Promise<Set<string>>`
  - `listPaymentsWithReservation(): Promise<PaymentWithReservation[]>` (mais recente primeiro)
  - `getHotel(): Promise<Hotel | null>`
  - `listMaintenanceWithRoom(): Promise<MaintenanceRequestWithRoom[]>`
  - `listNotes(subjectType: 'guest' | 'room', subjectId): Promise<InternalNote[]>`
  - `listProfiles(): Promise<Profile[]>`
  - tipos `GuestResult`, `RoomResult`, `ReservationResult`, `GlobalSearchResults`, e `searchEverything(term): Promise<GlobalSearchResults>`

- [ ] **Passo 1: Escrever o teste `src/offline/__tests__/queries.test.ts`**

```ts
import { beforeEach, describe, expect, it } from 'vitest'

import { db, wipeLocalData } from '@/offline/db'
import {
  listPaymentsWithReservation,
  listReservationsWithRelations,
  listRoomsWithType,
  overlappingRoomIds,
  searchEverything,
  seasonalRateFor,
} from '@/offline/queries'

import { makeGuest, makePayment, makeReservation, makeRoom, makeRoomType } from './fakes'

beforeEach(async () => {
  await wipeLocalData()
  await db.room_types.put(makeRoomType({ id: 't1', name: 'Standard' }))
  await db.rooms.bulkPut([
    makeRoom({ id: 'r10', number: '10' }),
    makeRoom({ id: 'r2', number: '2' }),
    makeRoom({ id: 'r1', number: '1' }),
  ])
  await db.guests.bulkPut([makeGuest({ id: 'g1', full_name: 'Maria Souza' }), makeGuest({ id: 'g2', full_name: 'João Lima', document_number: '111.444.777-35' })])
  await db.reservations.bulkPut([
    makeReservation({ id: 'a', guest_id: 'g1', room_id: 'r1', check_in: '2026-10-20', check_out: '2026-10-22' }),
    makeReservation({ id: 'b', guest_id: 'g2', room_id: 'r2', check_in: '2026-10-25', check_out: '2026-10-27', status: 'cancelada' }),
  ])
})

describe('consultas locais', () => {
  it('quartos em ordem numérica, com o tipo', async () => {
    const rooms = await listRoomsWithType()
    expect(rooms.map((r) => r.number)).toEqual(['1', '2', '10'])
    expect(rooms[0].room_types).toEqual({ id: 't1', name: 'Standard', base_price: 150 })
  })

  it('reservas com hóspede e quarto juntados, mais recente primeiro', async () => {
    const reservations = await listReservationsWithRelations()
    expect(reservations.map((r) => r.id)).toEqual(['b', 'a'])
    expect(reservations[1].guests?.full_name).toBe('Maria Souza')
    expect(reservations[1].rooms).toEqual({ id: 'r1', number: '1', room_types: { id: 't1', name: 'Standard' } })
  })

  it('sobreposição ignora reservas canceladas', async () => {
    expect(await overlappingRoomIds('2026-10-21', '2026-10-26')).toEqual(new Set(['r1']))
    expect(await overlappingRoomIds('2026-10-21', '2026-10-26', 'a')).toEqual(new Set())
  })

  it('tarifa sazonal cobre a data', async () => {
    await db.seasonal_rates.put({ id: 's1', room_type_id: 't1', label: 'Réveillon', start_date: '2026-12-28', end_date: '2027-01-02', daily_rate: 300, created_at: '' })
    expect(await seasonalRateFor('t1', '2026-12-31')).toBe(300)
    expect(await seasonalRateFor('t1', '2026-11-01')).toBeNull()
  })

  it('pagamentos com reserva, hóspede e quarto', async () => {
    await db.payments.put(makePayment({ id: 'p1', reservation_id: 'a' }))
    const [payment] = await listPaymentsWithReservation()
    expect(payment.reservations).toEqual({
      id: 'a', check_in: '2026-10-20', check_out: '2026-10-22',
      guests: { id: 'g1', full_name: 'Maria Souza' }, rooms: { id: 'r1', number: '1' },
    })
  })

  it('busca global por nome, documento e quarto', async () => {
    const byName = await searchEverything('maria')
    expect(byName.guests.map((g) => g.id)).toEqual(['g1'])
    expect(byName.reservations.map((r) => r.id)).toEqual(['a'])
    expect((await searchEverything('111.444')).guests.map((g) => g.id)).toEqual(['g2'])
    expect((await searchEverything('10')).rooms.map((r) => r.number)).toEqual(['10'])
  })
})
```

- [ ] **Passo 2: Rodar e ver falhar.** Esperado: FAIL, porque `@/offline/queries` não existe.

- [ ] **Passo 3: `src/offline/queries.ts`**

```ts
import { compareRoomNumbers } from '@/lib/format'
import { db } from '@/offline/db'
import type { Profile } from '@/types/auth'
import type { DocumentType, Guest } from '@/types/guest'
import type { Hotel } from '@/types/hotel'
import type { MaintenanceRequestWithRoom } from '@/types/maintenance'
import type { InternalNote } from '@/types/note'
import type { PaymentWithReservation } from '@/types/payment'
import type { ReservationStatus, ReservationWithRelations } from '@/types/reservation'
import type { Room, RoomStatus, RoomType } from '@/types/room'
import type { SeasonalRateWithType } from '@/types/seasonalRate'

/* Leituras da cópia local, no mesmo formato que as telas recebiam do Supabase. */

export interface RoomOption extends Room {
  room_types: { id: string; name: string; base_price: number } | null
}

async function lookups() {
  const [guests, rooms, roomTypes] = await Promise.all([db.guests.toArray(), db.rooms.toArray(), db.room_types.toArray()])
  return {
    guestById: new Map(guests.map((g) => [g.id, g])),
    roomById: new Map(rooms.map((r) => [r.id, r])),
    typeById: new Map(roomTypes.map((t) => [t.id, t])),
  }
}

export async function listReservationsWithRelations(): Promise<ReservationWithRelations[]> {
  const [reservations, { guestById, roomById, typeById }] = await Promise.all([db.reservations.toArray(), lookups()])
  return reservations
    .map((r) => {
      const guest = guestById.get(r.guest_id)
      const room = roomById.get(r.room_id)
      const type = room ? typeById.get(room.room_type_id) : undefined
      return {
        ...r,
        guests: guest
          ? {
              id: guest.id,
              full_name: guest.full_name,
              document_type: guest.document_type,
              document_number: guest.document_number,
              nationality: guest.nationality,
              birth_date: guest.birth_date,
            }
          : null,
        rooms: room ? { id: room.id, number: room.number, room_types: type ? { id: type.id, name: type.name } : null } : null,
      }
    })
    .sort((a, b) => b.check_in.localeCompare(a.check_in))
}

export async function listGuests(): Promise<Guest[]> {
  return (await db.guests.toArray()).sort((a, b) => a.full_name.localeCompare(b.full_name, 'pt-BR'))
}

export async function listActiveGuestsForSelect(): Promise<Pick<Guest, 'id' | 'full_name'>[]> {
  return (await listGuests()).filter((g) => g.active).map(({ id, full_name }) => ({ id, full_name }))
}

export async function listRoomsWithType(): Promise<RoomOption[]> {
  const [rooms, types] = await Promise.all([db.rooms.toArray(), db.room_types.toArray()])
  const typeById = new Map(types.map((t) => [t.id, t]))
  return rooms
    .map((room) => {
      const type = typeById.get(room.room_type_id)
      return { ...room, room_types: type ? { id: type.id, name: type.name, base_price: Number(type.base_price) } : null }
    })
    .sort((a, b) => compareRoomNumbers(a.number, b.number))
}

export async function countRooms(): Promise<number> {
  return db.rooms.count()
}

export async function listRoomTypes(): Promise<RoomType[]> {
  return (await db.room_types.toArray()).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
}

export async function listSeasonalRatesWithType(): Promise<SeasonalRateWithType[]> {
  const [rates, types] = await Promise.all([db.seasonal_rates.toArray(), db.room_types.toArray()])
  const typeById = new Map(types.map((t) => [t.id, t]))
  return rates
    .map((rate) => {
      const type = typeById.get(rate.room_type_id)
      return { ...rate, room_types: type ? { id: type.id, name: type.name } : null }
    })
    .sort((a, b) => a.start_date.localeCompare(b.start_date))
}

export async function seasonalRateFor(roomTypeId: string, date: string): Promise<number | null> {
  const rate = await db.seasonal_rates
    .where('room_type_id')
    .equals(roomTypeId)
    .filter((s) => s.start_date <= date && s.end_date >= date)
    .first()
  return rate ? Number(rate.daily_rate) : null
}

export async function seasonalRatesForDate(roomTypeIds: string[], date: string): Promise<Map<string, number>> {
  const map = new Map<string, number>()
  for (const id of roomTypeIds) {
    const rate = await seasonalRateFor(id, date)
    if (rate !== null) map.set(id, rate)
  }
  return map
}

/** Quartos com reserva ativa (não cancelada) que cruza [checkIn, checkOut). */
export async function overlappingRoomIds(checkIn: string, checkOut: string, ignoreReservationId?: string): Promise<Set<string>> {
  const reservations = await db.reservations
    .filter((r) => r.id !== ignoreReservationId && r.status !== 'cancelada' && r.check_in < checkOut && r.check_out > checkIn)
    .toArray()
  return new Set(reservations.map((r) => r.room_id))
}

export async function listPaymentsWithReservation(): Promise<PaymentWithReservation[]> {
  const [payments, reservations, { guestById, roomById }] = await Promise.all([
    db.payments.toArray(),
    db.reservations.toArray(),
    lookups(),
  ])
  const reservationById = new Map(reservations.map((r) => [r.id, r]))
  return payments
    .map((payment) => {
      const r = reservationById.get(payment.reservation_id)
      const guest = r ? guestById.get(r.guest_id) : undefined
      const room = r ? roomById.get(r.room_id) : undefined
      return {
        ...payment,
        reservations: r
          ? {
              id: r.id,
              check_in: r.check_in,
              check_out: r.check_out,
              guests: guest ? { id: guest.id, full_name: guest.full_name } : null,
              rooms: room ? { id: room.id, number: room.number } : null,
            }
          : null,
      }
    })
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
}

export async function getHotel(): Promise<Hotel | null> {
  return (await db.hotels.toCollection().first()) ?? null
}

export async function listMaintenanceWithRoom(): Promise<MaintenanceRequestWithRoom[]> {
  const [requests, rooms] = await Promise.all([db.maintenance_requests.toArray(), db.rooms.toArray()])
  const roomById = new Map(rooms.map((r) => [r.id, r]))
  return requests
    .map((request) => {
      const room = roomById.get(request.room_id)
      return { ...request, rooms: room ? { id: room.id, number: room.number } : null }
    })
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
}

export async function listNotes(subjectType: 'guest' | 'room', subjectId: string): Promise<InternalNote[]> {
  const column = subjectType === 'guest' ? 'guest_id' : 'room_id'
  return (await db.internal_notes.where(column).equals(subjectId).toArray()).sort((a, b) => b.created_at.localeCompare(a.created_at))
}

export async function listProfiles(): Promise<Profile[]> {
  return db.profiles.toArray()
}

/* ---------- Busca global ---------- */

export interface GuestResult {
  id: string
  full_name: string
  document_type: DocumentType
  document_number: string
}

export interface RoomResult {
  id: string
  number: string
  status: RoomStatus
  room_types: { name: string } | null
}

export interface ReservationResult {
  id: string
  check_in: string
  check_out: string
  status: ReservationStatus
  guests: { full_name: string } | null
  rooms: { number: string } | null
}

export interface GlobalSearchResults {
  guests: GuestResult[]
  rooms: RoomResult[]
  reservations: ReservationResult[]
}

export async function searchEverything(term: string): Promise<GlobalSearchResults> {
  const t = term.trim().toLowerCase()
  if (!t) return { guests: [], rooms: [], reservations: [] }
  const [guests, rooms, reservations] = await Promise.all([listGuests(), listRoomsWithType(), listReservationsWithRelations()])
  const nameMatches = guests.filter((g) => g.full_name.toLowerCase().includes(t))
  const roomMatches = rooms.filter((r) => r.number.toLowerCase().includes(t))
  const guestIds = new Set(nameMatches.map((g) => g.id))
  const roomIds = new Set(roomMatches.map((r) => r.id))
  return {
    guests: guests
      .filter((g) => g.full_name.toLowerCase().includes(t) || g.document_number.toLowerCase().includes(t))
      .slice(0, 6)
      .map(({ id, full_name, document_type, document_number }) => ({ id, full_name, document_type, document_number })),
    rooms: roomMatches.slice(0, 6).map((r) => ({
      id: r.id,
      number: r.number,
      status: r.status,
      room_types: r.room_types ? { name: r.room_types.name } : null,
    })),
    reservations: reservations
      .filter((r) => guestIds.has(r.guest_id) || roomIds.has(r.room_id))
      .slice(0, 8)
      .map((r) => ({
        id: r.id,
        check_in: r.check_in,
        check_out: r.check_out,
        status: r.status,
        guests: r.guests ? { full_name: r.guests.full_name } : null,
        rooms: r.rooms ? { number: r.rooms.number } : null,
      })),
  }
}
```

- [ ] **Passo 4: Rodar** (`npx -y pnpm@10 test`). Esperado: todos passando.
- [ ] **Passo 5: `npx -y pnpm@10 build`.** Esperado: sem erros.
- [ ] **Passo 6: Commit.** `git add src/offline`. Mensagem: `Leituras da copia local no formato das telas`.

---

### Tarefa 7: Conexão, identidade e servidor real

**Arquivos:**
- **Criar:** `src/offline/connectivity.ts`, `src/offline/identity.ts`, `src/offline/auth-mode.ts`, `src/offline/server.ts` e `src/offline/__tests__/identity.test.ts`.
- **Modificar:** `src/lib/supabase.ts`.

**Interfaces:**
- **Produz em `connectivity.ts`:** `isSimulatedOffline()`, `setSimulatedOffline(on)`, `offlineAwareFetch`, `browserSaysOffline()`, `siteReachable(): Promise<boolean>`, `exposeTestHelpers()`.
- **Produz em `identity.ts`:** `OFFLINE_LIMIT_MS`, `interface OfflineIdentity { userId; email; profile }`, `saveIdentity`, `loadIdentity`, `clearIdentity`, `markServerContact(at?)`, `lastServerContact()`, `offlineAccessExpired(now?)`.
- **Produz em `auth-mode.ts`:** `type AuthMode = 'sessao' | 'offline' | 'bloqueado' | 'deslogado'`, `decideStartupMode(input): AuthMode`.
- **Produz em `server.ts`:** `supabaseTransport: Transport`, `supabasePullSource: PullSource`.

- [ ] **Passo 1: Teste `src/offline/__tests__/identity.test.ts`**

```ts
import { beforeEach, describe, expect, it } from 'vitest'

import { decideStartupMode } from '@/offline/auth-mode'
import { clearIdentity, loadIdentity, markServerContact, offlineAccessExpired, saveIdentity } from '@/offline/identity'
import type { Profile } from '@/types/auth'

const DAY = 24 * 60 * 60 * 1000
const profile: Profile = { id: 'u1', full_name: 'Ana', role: 'recepcao', active: true, hotel_id: null, created_at: '', updated_at: '' }

beforeEach(() => {
  localStorage.clear()
})

describe('identidade guardada', () => {
  it('salva, lê e apaga', () => {
    saveIdentity({ userId: 'u1', email: 'ana@hotel.com', profile })
    expect(loadIdentity()?.profile.role).toBe('recepcao')
    clearIdentity()
    expect(loadIdentity()).toBeNull()
  })

  it('3 dias sem falar com o servidor travam o acesso offline', () => {
    const now = Date.now()
    expect(offlineAccessExpired(now)).toBe(true)
    markServerContact(now - 2 * DAY)
    expect(offlineAccessExpired(now)).toBe(false)
    markServerContact(now - 4 * DAY)
    expect(offlineAccessExpired(now)).toBe(true)
  })
})

describe('decideStartupMode', () => {
  const identity = { userId: 'u1', email: null, profile }
  it('sessão válida vence tudo', () => {
    expect(decideStartupMode({ hasSession: true, networkError: false, identity: null, expired: true })).toBe('sessao')
  })
  it('sem rede e com identidade recente: offline', () => {
    expect(decideStartupMode({ hasSession: false, networkError: true, identity, expired: false })).toBe('offline')
  })
  it('sem rede e identidade velha: bloqueado', () => {
    expect(decideStartupMode({ hasSession: false, networkError: true, identity, expired: true })).toBe('bloqueado')
  })
  it('sem identidade, ou sem erro de rede: deslogado', () => {
    expect(decideStartupMode({ hasSession: false, networkError: true, identity: null, expired: false })).toBe('deslogado')
    expect(decideStartupMode({ hasSession: false, networkError: false, identity, expired: false })).toBe('deslogado')
  })
})
```

- [ ] **Passo 2: Rodar e ver falhar.**

- [ ] **Passo 3: `src/offline/identity.ts`**

```ts
import type { Profile } from '@/types/auth'

const IDENTITY_KEY = 'hotelflow:identidade'
const CONTACT_KEY = 'hotelflow:ultimo-contato'

/** Depois disso sem falar com o servidor, o app pede internet para continuar. */
export const OFFLINE_LIMIT_MS = 3 * 24 * 60 * 60 * 1000

export interface OfflineIdentity {
  userId: string
  email: string | null
  profile: Profile
}

function read(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function write(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch {
    // armazenamento bloqueado: o modo offline só não fica disponível
  }
}

export function saveIdentity(identity: OfflineIdentity): void {
  write(IDENTITY_KEY, JSON.stringify(identity))
}

export function loadIdentity(): OfflineIdentity | null {
  const raw = read(IDENTITY_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as OfflineIdentity
  } catch {
    return null
  }
}

export function clearIdentity(): void {
  write(IDENTITY_KEY, null)
  write(CONTACT_KEY, null)
}

export function markServerContact(at = Date.now()): void {
  write(CONTACT_KEY, String(at))
}

export function lastServerContact(): number | null {
  const raw = read(CONTACT_KEY)
  return raw ? Number(raw) : null
}

export function offlineAccessExpired(now = Date.now()): boolean {
  const last = lastServerContact()
  return last === null || now - last > OFFLINE_LIMIT_MS
}
```

- [ ] **Passo 4: `src/offline/auth-mode.ts`**

```ts
import type { OfflineIdentity } from '@/offline/identity'

/** sessao = login válido; offline = sem rede, usando a última pessoa; bloqueado = offline há mais de 3 dias. */
export type AuthMode = 'sessao' | 'offline' | 'bloqueado' | 'deslogado'

export function decideStartupMode(input: {
  hasSession: boolean
  networkError: boolean
  identity: OfflineIdentity | null
  expired: boolean
}): AuthMode {
  if (input.hasSession) return 'sessao'
  if (input.networkError && input.identity) return input.expired ? 'bloqueado' : 'offline'
  return 'deslogado'
}
```

- [ ] **Passo 5: `src/offline/connectivity.ts`**

```ts
const SIMULATE_KEY = 'hotelflow:simular-offline'

/** Modo de teste: o navegador do app não tem botão de desligar a internet. */
export function isSimulatedOffline(): boolean {
  try {
    return localStorage.getItem(SIMULATE_KEY) === '1'
  } catch {
    return false
  }
}

export function setSimulatedOffline(on: boolean): void {
  try {
    if (on) localStorage.setItem(SIMULATE_KEY, '1')
    else localStorage.removeItem(SIMULATE_KEY)
  } catch {
    // sem armazenamento, sem modo de teste
  }
  window.dispatchEvent(new Event(on ? 'offline' : 'online'))
}

/** fetch usado pelo cliente Supabase: no modo de teste, falha como se não houvesse rede. */
export const offlineAwareFetch: typeof fetch = (input, init) => {
  if (isSimulatedOffline()) return Promise.reject(new TypeError('Failed to fetch (modo de teste offline)'))
  return fetch(input, init)
}

export function browserSaysOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false
}

/** O próprio site (Netlify) responde? Separa "sem internet" de "banco fora do ar". */
export async function siteReachable(): Promise<boolean> {
  if (isSimulatedOffline() || browserSaysOffline()) return false
  try {
    const response = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' })
    return response.ok
  } catch {
    return false
  }
}

declare global {
  interface Window {
    hotelflowTeste?: { offline: (on: boolean) => void }
  }
}

/** No console: hotelflowTeste.offline(true) corta a "internet" do app; offline(false) devolve. */
export function exposeTestHelpers(): void {
  window.hotelflowTeste = { offline: setSimulatedOffline }
}
```

- [ ] **Passo 6: `src/lib/supabase.ts`.** Trocar a última linha por:

```ts
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  global: { fetch: offlineAwareFetch },
})
```

Acrescentar no topo: `import { offlineAwareFetch } from '@/offline/connectivity'`.

- [ ] **Passo 7: `src/offline/server.ts`**

```ts
import { supabase } from '@/lib/supabase'
import { PAGE_SIZE, PullError, type DeletionRow, type PullSource, type ServerRow } from '@/offline/pull'
import type { Transport, TransportResult } from '@/offline/transport'
import type { Guest } from '@/types/guest'

interface SupabaseErrorLike {
  code?: string
  message: string
  details?: string
}

function toResult(error: SupabaseErrorLike | null, status: number): TransportResult {
  return error ? { ok: false, status, error: { code: error.code, message: error.message, details: error.details } } : { ok: true }
}

export const supabaseTransport: Transport = {
  async insert(table, row) {
    const { error, status } = await supabase
      .from(table)
      .upsert(row as Record<string, unknown>, { onConflict: 'id', ignoreDuplicates: true })
    return toResult(error, status)
  },
  async update(table, id, patch) {
    const { data, error, status } = await supabase.from(table).update(patch as Record<string, unknown>).eq('id', id).select('id')
    if (error) return toResult(error, status)
    if (!data || data.length === 0) {
      return { ok: false, status: 404, error: { code: 'NAO_ENCONTRADO', message: 'Registro não encontrado.' } }
    }
    return { ok: true }
  },
  async rpc(fn, args) {
    const { error, status } = await supabase.rpc(fn, args)
    return toResult(error, status)
  },
  async findGuestByDocument(documentType, documentNumber) {
    const { data, error, status } = await supabase
      .from('guests')
      .select('*')
      .eq('document_type', documentType)
      .eq('document_number', documentNumber)
      .maybeSingle()
    if (error) throw new PullError(status, error)
    return (data as Guest | null) ?? null
  },
}

async function rows<T>(query: PromiseLike<{ data: unknown; error: SupabaseErrorLike | null; status: number }>): Promise<T[]> {
  const { data, error, status } = await query
  if (error) throw new PullError(status, { code: error.code, message: error.message, details: error.details })
  return (data as T[] | null) ?? []
}

export const supabasePullSource: PullSource = {
  fetchChanged(table, since, offset, limit) {
    let query = supabase.from(table).select('*')
    if (since) query = query.gt('updated_at', since)
    return rows<ServerRow>(query.order('updated_at', { ascending: true }).order('id', { ascending: true }).range(offset, offset + limit - 1))
  },
  fetchDeletions(since, offset, limit) {
    let query = supabase.from('sync_deletions').select('*')
    if (since) query = query.gt('deleted_at', since)
    return rows<DeletionRow>(query.order('deleted_at', { ascending: true }).order('id', { ascending: true }).range(offset, offset + limit - 1))
  },
  async fetchIds(table) {
    const ids: string[] = []
    for (let offset = 0; ; offset += PAGE_SIZE) {
      const page = await rows<{ id: string }>(supabase.from(table).select('id').order('id').range(offset, offset + PAGE_SIZE - 1))
      ids.push(...page.map((row) => row.id))
      if (page.length < PAGE_SIZE) break
    }
    return ids
  },
  fetchByIds(table, ids) {
    return rows<ServerRow>(supabase.from(table).select('*').in('id', ids))
  },
}
```

- [ ] **Passo 8: Rodar** os testes e o build. Esperado: tudo passando.
- [ ] **Passo 9: Commit.** `git add src/offline src/lib/supabase.ts`. Mensagem: `Conexao, identidade offline e acesso real ao Supabase`.

---

### Tarefa 8: Motor de sincronização e provider React

**Arquivos:**
- **Criar:** `src/offline/sync-engine.ts`, `src/offline/sync-context.tsx`, `src/offline/use-actor.ts` e `src/offline/__tests__/sync-engine.test.ts`.
- **Modificar:** `src/App.tsx`.

**Interfaces:**
- **Consome:** tudo das Tarefas 3 a 7.
- **Produz em `sync-engine.ts`:**
  - `type Connection = 'online' | 'sem-internet' | 'servidor-fora'`
  - `interface SyncState { connection; busy; pending; rejected; ready; lastServerContactAt }`
  - `class SyncEngine` com `getState`, `subscribe`, `syncNow()`, `refreshCounts()`, `stop()`
- **Produz em `sync-context.tsx`:** `SyncProvider`, `useSync(): { state, entityStatus, syncNow }`, `useIsOnline(): boolean`, `OFFLINE_HINT`.
- **Produz em `use-actor.ts`:** `useActor(): Actor | null`.

- [ ] **Passo 1: Teste `src/offline/__tests__/sync-engine.test.ts`**

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { db, getMeta, wipeLocalData } from '@/offline/db'
import { enqueue } from '@/offline/outbox'
import { PullError, type PullSource } from '@/offline/pull'
import { SyncEngine, type SyncDeps } from '@/offline/sync-engine'

import { NETWORK, OK, fakeTransport, makeRoom } from './fakes'

const engines: SyncEngine[] = []

function source(fail = false): PullSource {
  return {
    async fetchChanged(table) {
      if (fail) throw new PullError(0, { message: 'Failed to fetch' })
      return table === 'rooms' ? [makeRoom()] : []
    },
    fetchDeletions: async () => [],
    fetchIds: async () => [],
    fetchByIds: async () => [],
  }
}

function engine(over: Partial<SyncDeps>): SyncEngine {
  const created = new SyncEngine({
    transport: fakeTransport(() => OK).transport,
    source: source(),
    hasSession: async () => 'sim',
    refreshSession: async () => 'ok',
    onDataChanged: () => {},
    onRejected: () => {},
    ...over,
  })
  engines.push(created)
  return created
}

beforeEach(async () => {
  await wipeLocalData()
})

afterEach(() => {
  engines.splice(0).forEach((e) => e.stop())
})

describe('SyncEngine', () => {
  it('envia, baixa e fica pronto', async () => {
    await enqueue({ kind: 'room.clean', payload: { id: 'r1' }, entityIds: ['rooms:r1'], dependsOn: [], description: 't', userId: 'u1' })
    let changes = 0
    const sync = engine({ onDataChanged: () => changes++ })
    await sync.syncNow()
    expect(sync.getState()).toMatchObject({ connection: 'online', pending: 0, rejected: 0, ready: true, busy: false })
    expect(await db.rooms.count()).toBe(1)
    expect(await getMeta('initialDownloadDone')).toBe(true)
    expect(changes).toBeGreaterThan(0)
  })

  it('sem rede no envio: fica "sem internet" e guarda o caderninho', async () => {
    await enqueue({ kind: 'room.clean', payload: { id: 'r1' }, entityIds: ['rooms:r1'], dependsOn: [], description: 't', userId: 'u1' })
    const sync = engine({ transport: fakeTransport(() => NETWORK).transport })
    await sync.syncNow()
    expect(sync.getState()).toMatchObject({ connection: 'sem-internet', pending: 1 })
  })

  it('sem rede no download: fica "sem internet"', async () => {
    const sync = engine({ source: source(true) })
    await sync.syncNow()
    expect(sync.getState().connection).toBe('sem-internet')
    expect(sync.getState().ready).toBe(false)
  })

  it('sem sessão não envia nada', async () => {
    await enqueue({ kind: 'room.clean', payload: { id: 'r1' }, entityIds: ['rooms:r1'], dependsOn: [], description: 't', userId: 'u1' })
    const fake = fakeTransport(() => OK)
    const sync = engine({ transport: fake.transport, hasSession: async () => 'nao' })
    await sync.syncNow()
    expect(fake.calls).toHaveLength(0)
    expect(sync.getState().pending).toBe(1)
  })
})
```

- [ ] **Passo 2: Rodar e ver falhar.**

- [ ] **Passo 3: `src/offline/sync-engine.ts`**

```ts
import { browserSaysOffline, isSimulatedOffline, siteReachable } from '@/offline/connectivity'
import { getMeta, setMeta, SYNC_LOCK } from '@/offline/db'
import { lastServerContact, markServerContact } from '@/offline/identity'
import { outboxCounts, processOutbox } from '@/offline/outbox'
import { PullError, pullChanges, reconcileIfDue, refetchMarked, type PullSource } from '@/offline/pull'
import type { Transport } from '@/offline/transport'

export type Connection = 'online' | 'sem-internet' | 'servidor-fora'

export interface SyncState {
  connection: Connection
  /** Enviando ou baixando agora. */
  busy: boolean
  pending: number
  rejected: number
  /** A cópia deste aparelho já foi baixada inteira pelo menos uma vez. */
  ready: boolean
  lastServerContactAt: number | null
}

export interface SyncDeps {
  transport: Transport
  source: PullSource
  hasSession: () => Promise<'sim' | 'rede' | 'nao'>
  refreshSession: () => Promise<'ok' | 'rede' | 'recusada'>
  onDataChanged: () => void
  onRejected: (count: number) => void
}

const RETRY_DELAYS_MS = [5_000, 15_000, 30_000, 60_000]

/** Envia o caderninho e depois baixa as novidades. Uma rodada por vez (inclusive entre abas). */
export class SyncEngine {
  private state: SyncState = {
    connection: 'online',
    busy: false,
    pending: 0,
    rejected: 0,
    ready: false,
    lastServerContactAt: lastServerContact(),
  }
  private listeners = new Set<() => void>()
  private running = false
  private rerun = false
  private retryIndex = 0
  private retryTimer: ReturnType<typeof setTimeout> | null = null

  constructor(private readonly deps: SyncDeps) {}

  getState = (): SyncState => this.state

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  private set(partial: Partial<SyncState>): void {
    this.state = { ...this.state, ...partial }
    this.listeners.forEach((listener) => listener())
  }

  async refreshCounts(): Promise<void> {
    const { pending, rejected } = await outboxCounts()
    const ready = (await getMeta<boolean>('initialDownloadDone')) === true
    this.set({ pending, rejected, ready })
  }

  async syncNow(): Promise<void> {
    if (this.running) {
      this.rerun = true
      return
    }
    this.running = true
    try {
      await this.withLock(() => this.cycle())
    } catch (error) {
      console.error('[sincronização]', error)
    } finally {
      this.running = false
      if (this.rerun) {
        this.rerun = false
        void this.syncNow()
      }
    }
  }

  stop(): void {
    if (this.retryTimer) clearTimeout(this.retryTimer)
    this.retryTimer = null
  }

  private async withLock(fn: () => Promise<void>): Promise<void> {
    const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined
    if (!locks) return fn()
    await locks.request(SYNC_LOCK, { ifAvailable: true }, async (lock) => {
      if (lock) await fn()
    })
  }

  private async cycle(): Promise<void> {
    if (browserSaysOffline() || isSimulatedOffline()) {
      this.set({ connection: 'sem-internet' })
      await this.refreshCounts()
      return
    }
    const session = await this.deps.hasSession()
    if (session === 'rede') return this.wentOffline()
    if (session === 'nao') {
      await this.refreshCounts()
      return
    }

    this.set({ busy: true })
    try {
      const result = await processOutbox(this.deps.transport)
      if (result.sent > 0 || result.rejected > 0) this.deps.onDataChanged()
      if (result.rejected > 0) this.deps.onRejected(result.rejected)
      if (result.stoppedBy === 'rede') return await this.wentOffline()
      if (result.stoppedBy === 'login') return await this.afterAuthFailure()

      await refetchMarked(this.deps.source)
      const changed = await pullChanges(this.deps.source)
      const firstDownload = (await getMeta<boolean>('initialDownloadDone')) !== true
      if (firstDownload) {
        await setMeta('initialDownloadDone', true)
        await setMeta('lastReconcileAt', Date.now())
      } else {
        await reconcileIfDue(this.deps.source)
      }
      markServerContact()
      this.retryIndex = 0
      this.set({ connection: 'online', lastServerContactAt: lastServerContact() })
      if (changed > 0 || firstDownload) this.deps.onDataChanged()
    } catch (error) {
      if (error instanceof PullError && (error.status === 0 || error.status >= 500)) return await this.wentOffline()
      if (error instanceof PullError && error.status === 401) return await this.afterAuthFailure()
      throw error
    } finally {
      this.set({ busy: false })
      await this.refreshCounts()
    }
  }

  private async afterAuthFailure(): Promise<void> {
    const refreshed = await this.deps.refreshSession()
    if (refreshed === 'ok') this.rerun = true
    else if (refreshed === 'rede') await this.wentOffline()
    // 'recusada': o AuthProvider recebe SIGNED_OUT e pede login; o caderninho fica guardado
  }

  private async wentOffline(): Promise<void> {
    this.set({ connection: (await siteReachable()) ? 'servidor-fora' : 'sem-internet' })
    if (this.retryTimer) return
    const delay = RETRY_DELAYS_MS[Math.min(this.retryIndex, RETRY_DELAYS_MS.length - 1)]
    this.retryIndex++
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null
      void this.syncNow()
    }, delay)
  }
}
```

- [ ] **Passo 4: `src/offline/use-actor.ts`**

```ts
import { useAuth } from '@/lib/auth-context'
import type { Actor } from '@/offline/actions'

/** Quem está fazendo a ação (id e cargo), com ou sem internet. */
export function useActor(): Actor | null {
  const { profile } = useAuth()
  return profile ? { id: profile.id, role: profile.role } : null
}
```

- [ ] **Passo 5: `src/offline/sync-context.tsx`.** Ele usa `useAuth()` com `userId` e `isAuthenticated`, que a Tarefa 9 acrescenta. Por isso o build desta tarefa só passa depois do Passo 1 da Tarefa 9: faça as duas tarefas seguidas e um commit só, se preferir.

```tsx
import { isAuthRetryableFetchError } from '@supabase/supabase-js'
import { useQueryClient } from '@tanstack/react-query'
import * as React from 'react'
import { toast } from 'sonner'

import { useAuth } from '@/lib/auth-context'
import { supabase } from '@/lib/supabase'
import { ensureOwner, type EntityKey } from '@/offline/db'
import { onLocalChange, onServerChange } from '@/offline/events'
import { outboxEntityStatus } from '@/offline/outbox'
import { supabasePullSource, supabaseTransport } from '@/offline/server'
import { SyncEngine, type SyncState } from '@/offline/sync-engine'

const SYNC_INTERVAL_MS = 60_000
const LOCAL_CHANGE_DEBOUNCE_MS = 300

export const OFFLINE_HINT = 'Precisa de internet'

interface SyncContextValue {
  state: SyncState
  entityStatus: Map<EntityKey, 'pendente' | 'recusado'>
  syncNow: () => void
}

const SyncContext = React.createContext<SyncContextValue | null>(null)

async function hasSession(): Promise<'sim' | 'rede' | 'nao'> {
  const { data, error } = await supabase.auth.getSession()
  if (data.session) return 'sim'
  if (error && isAuthRetryableFetchError(error)) return 'rede'
  return 'nao'
}

async function refreshSession(): Promise<'ok' | 'rede' | 'recusada'> {
  const { data, error } = await supabase.auth.refreshSession()
  if (data.session) return 'ok'
  if (error && isAuthRetryableFetchError(error)) return 'rede'
  return 'recusada'
}

export function SyncProvider({ children }: { children: React.ReactNode }) {
  const { userId, isAuthenticated } = useAuth()
  const queryClient = useQueryClient()
  const [entityStatus, setEntityStatus] = React.useState(() => new Map<EntityKey, 'pendente' | 'recusado'>())

  const refreshLocalViews = React.useCallback(async () => {
    setEntityStatus(await outboxEntityStatus())
    await queryClient.invalidateQueries()
  }, [queryClient])

  const engine = React.useMemo(
    () =>
      new SyncEngine({
        transport: supabaseTransport,
        source: supabasePullSource,
        hasSession,
        refreshSession,
        onDataChanged: () => {
          void refreshLocalViews()
        },
        onRejected: (count) =>
          toast.warning(
            count === 1
              ? '1 ação foi recusada pelo banco. Veja em Pendências.'
              : `${count} ações foram recusadas pelo banco. Veja em Pendências.`
          ),
      }),
    [refreshLocalViews]
  )

  const state = React.useSyncExternalStore(engine.subscribe, engine.getState)

  React.useEffect(() => {
    if (!isAuthenticated || !userId) return
    let cancelled = false
    let debounce: ReturnType<typeof setTimeout> | undefined
    const run = () => {
      if (!cancelled) void engine.syncNow()
    }
    void (async () => {
      await ensureOwner(userId)
      if (cancelled) return
      await engine.refreshCounts()
      await refreshLocalViews()
      if (typeof navigator !== 'undefined') void navigator.storage?.persist?.()
      run()
    })()
    const interval = setInterval(run, SYNC_INTERVAL_MS)
    const onVisible = () => {
      if (document.visibilityState === 'visible') run()
    }
    window.addEventListener('online', run)
    window.addEventListener('offline', run)
    document.addEventListener('visibilitychange', onVisible)
    const offLocal = onLocalChange(() => {
      void refreshLocalViews()
      void engine.refreshCounts()
      clearTimeout(debounce)
      debounce = setTimeout(run, LOCAL_CHANGE_DEBOUNCE_MS)
    })
    const offServer = onServerChange(run)
    return () => {
      cancelled = true
      clearInterval(interval)
      clearTimeout(debounce)
      window.removeEventListener('online', run)
      window.removeEventListener('offline', run)
      document.removeEventListener('visibilitychange', onVisible)
      offLocal()
      offServer()
      engine.stop()
    }
  }, [engine, isAuthenticated, userId, refreshLocalViews])

  const value = React.useMemo<SyncContextValue>(
    () => ({ state, entityStatus, syncNow: () => void engine.syncNow() }),
    [state, entityStatus, engine]
  )
  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>
}

export function useSync(): SyncContextValue {
  const ctx = React.useContext(SyncContext)
  if (!ctx) throw new Error('useSync precisa estar dentro de <SyncProvider>.')
  return ctx
}

/** Para os botões só-online: falso quando a última tentativa de falar com o servidor falhou. */
export function useIsOnline(): boolean {
  return useSync().state.connection === 'online'
}
```

- [ ] **Passo 6: `src/App.tsx`.** Consultas e mutações rodam mesmo sem rede (elas leem a cópia):

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from 'react-router-dom'
import { Toaster } from 'sonner'

import { ConfirmProvider } from '@/components/ConfirmDialog'
import { UpdatePrompt } from '@/components/UpdatePrompt'
import { AuthProvider } from '@/lib/auth-context'
import { SyncProvider } from '@/offline/sync-context'
import { router } from '@/router'

// networkMode 'always': as telas leem da cópia local, então não devem esperar a internet voltar.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: { networkMode: 'always', retry: 1 },
    mutations: { networkMode: 'always' },
  },
})

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <SyncProvider>
          <ConfirmProvider>
            <RouterProvider router={router} />
          </ConfirmProvider>
        </SyncProvider>
        <UpdatePrompt />
        <Toaster richColors position="top-right" />
      </AuthProvider>
    </QueryClientProvider>
  )
}
```

`UpdatePrompt` vem na Tarefa 12. Até lá, deixe essa importação e a tag comentadas e descomente na Tarefa 12.

- [ ] **Passo 7: Rodar os testes.** Esperado: os do `sync-engine` passando. O build passa depois da Tarefa 9.
- [ ] **Passo 8: Commit, junto com a Tarefa 9.**

---

### Tarefa 9: Login sem internet, "Sair" seguro e tela de bloqueio

**Arquivos:**
- **Modificar:** `src/lib/auth-context.tsx`, `src/components/ProtectedRoute.tsx`, `src/pages/LoginPage.tsx`, `src/components/AppLayout.tsx` (só o "Sair") e `src/pages/TrocarSenhaPage.tsx`.
- **Criar:** `src/components/OfflineLockScreen.tsx`.

**Interfaces:**
- **Produz em `useAuth()`:** `{ session, userId, profile, mode: AuthMode, isAuthenticated, needsLogin, loading, signOut, refreshProfile }`.
- **Atenção:** quem usava `session` para saber se está logado passa a usar `isAuthenticated`. São apenas `ProtectedRoute` e `LoginPage`; o campo `user` some, porque ninguém usava.

- [ ] **Passo 1: Reescrever `src/lib/auth-context.tsx`**

```tsx
import { isAuthRetryableFetchError, type Session } from '@supabase/supabase-js'
import * as React from 'react'

import { supabase } from '@/lib/supabase'
import { decideStartupMode, type AuthMode } from '@/offline/auth-mode'
import { wipeLocalDataSafely } from '@/offline/db'
import { clearIdentity, loadIdentity, markServerContact, offlineAccessExpired, saveIdentity } from '@/offline/identity'
import type { Profile } from '@/types/auth'

interface AuthContextValue {
  session: Session | null
  userId: string | null
  profile: Profile | null
  /** sessao = login válido; offline = sem rede com a última pessoa; bloqueado = offline há mais de 3 dias. */
  mode: AuthMode
  isAuthenticated: boolean
  /** O servidor recusou a sessão (ex.: senha trocada). A cópia e o caderninho continuam guardados. */
  needsLogin: boolean
  loading: boolean
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
}

const AuthContext = React.createContext<AuthContextValue | undefined>(undefined)

const STARTUP_TIMEOUT_MS = 5000

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | 'timeout'> {
  return Promise.race([promise, new Promise<'timeout'>((resolve) => setTimeout(() => resolve('timeout'), ms))])
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = React.useState<Session | null>(null)
  const [profile, setProfile] = React.useState<Profile | null>(null)
  const [mode, setMode] = React.useState<AuthMode>('deslogado')
  const [needsLogin, setNeedsLogin] = React.useState(false)
  const [loading, setLoading] = React.useState(true)
  const signingOut = React.useRef(false)

  const loadProfile = React.useCallback(async (current: Session) => {
    const { data, error, status } = await supabase.from('profiles').select('*').eq('id', current.user.id).maybeSingle()
    if (error && (status === 0 || status >= 500)) {
      // sem rede: usa o perfil guardado, se for a mesma pessoa
      const identity = loadIdentity()
      setProfile(identity?.userId === current.user.id ? identity.profile : null)
      return
    }
    const loaded = (data as Profile | null) ?? null
    setProfile(loaded)
    if (loaded) {
      saveIdentity({ userId: current.user.id, email: current.user.email ?? null, profile: loaded })
      markServerContact()
    }
  }, [])

  React.useEffect(() => {
    let active = true

    void (async () => {
      const result = await withTimeout(supabase.auth.getSession(), STARTUP_TIMEOUT_MS)
      if (!active) return
      const identity = loadIdentity()
      if (result === 'timeout') {
        const next = decideStartupMode({ hasSession: false, networkError: true, identity, expired: offlineAccessExpired() })
        setMode(next)
        setProfile(next === 'offline' ? identity?.profile ?? null : null)
        setLoading(false)
        return
      }
      const { data, error } = result
      const next = decideStartupMode({
        hasSession: !!data.session,
        networkError: !!error && isAuthRetryableFetchError(error),
        identity,
        expired: offlineAccessExpired(),
      })
      setMode(next)
      if (next === 'sessao' && data.session) {
        setSession(data.session)
        await loadProfile(data.session)
      } else if (next === 'offline') {
        setProfile(identity?.profile ?? null)
      } else if (next === 'deslogado' && identity) {
        setNeedsLogin(true) // a sessão sumiu sem a pessoa clicar em Sair
      }
      if (active) setLoading(false)
    })()

    const { data: listener } = supabase.auth.onAuthStateChange((event, newSession) => {
      if (event === 'SIGNED_OUT') {
        setSession(null)
        setMode('deslogado')
        if (signingOut.current) {
          signingOut.current = false
          setProfile(null)
          setNeedsLogin(false)
        } else if (loadIdentity()) {
          setNeedsLogin(true) // servidor recusou: guarda tudo e pede login
        } else {
          setProfile(null)
        }
        return
      }
      if (!newSession) return // eventos sem sessão (ex.: falha de rede ao renovar) não derrubam o modo offline
      setSession(newSession)
      setMode('sessao')
      setNeedsLogin(false)
      markServerContact()
      // Não chamar o Supabase dentro deste callback (recomendação do supabase-js); por isso o setTimeout.
      if (event === 'TOKEN_REFRESHED') {
        setTimeout(() => void loadProfile(newSession), 0)
      } else {
        setLoading(true)
        setTimeout(async () => {
          await loadProfile(newSession)
          setLoading(false)
        }, 0)
      }
    })

    return () => {
      active = false
      listener.subscription.unsubscribe()
    }
  }, [loadProfile])

  const signOut = React.useCallback(async () => {
    signingOut.current = true
    try {
      // só neste aparelho; funciona sem internet
      await supabase.auth.signOut({ scope: 'local' })
    } catch {
      // mesmo com erro, a cópia é apagada abaixo
    }
    await wipeLocalDataSafely()
    clearIdentity()
    setSession(null)
    setProfile(null)
    setMode('deslogado')
    setNeedsLogin(false)
  }, [])

  const refreshProfile = React.useCallback(async () => {
    if (session) await loadProfile(session)
  }, [session, loadProfile])

  const value: AuthContextValue = {
    session,
    userId: session?.user.id ?? profile?.id ?? null,
    profile,
    mode,
    isAuthenticated: mode === 'sessao' || mode === 'offline',
    needsLogin,
    loading,
    signOut,
    refreshProfile,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = React.useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth precisa ser usado dentro de um AuthProvider.')
  }
  return ctx
}
```

- [ ] **Passo 2: `src/components/OfflineLockScreen.tsx`**

```tsx
import { WifiOff } from 'lucide-react'

import { AuthHeading, AuthShell } from '@/components/AuthShell'
import { Button } from '@/components/ui/button'

/** Mais de 3 dias sem falar com o servidor: a cópia fica guardada, mas travada até a internet voltar. */
export function OfflineLockScreen() {
  return (
    <AuthShell>
      <AuthHeading
        title="Conecte-se à internet"
        description="Este aparelho está há mais de 3 dias sem falar com o servidor. Os dados continuam guardados aqui; assim que houver internet, o sistema volta a abrir."
      />
      <Button className="h-11 w-full" onClick={() => window.location.reload()}>
        <WifiOff className="h-4 w-4" />
        Tentar de novo
      </Button>
    </AuthShell>
  )
}
```

- [ ] **Passo 3: `src/components/ProtectedRoute.tsx`.** Trocar `const { session, loading } = useAuth()` por `const { isAuthenticated, mode, loading } = useAuth()`. Depois do bloco de `loading`, acrescentar `if (mode === 'bloqueado') return <OfflineLockScreen />`. Trocar `if (!session)` por `if (!isAuthenticated)`. Importar `OfflineLockScreen`.

- [ ] **Passo 4: `src/pages/LoginPage.tsx`**
  - **Redirecionar:** `const { session } = useAuth()` vira `const { isAuthenticated, needsLogin } = useAuth()`, e `if (session)` vira `if (isAuthenticated)`.
  - **Avisos:** depois do `<AuthHeading …/>` do formulário de login, acrescentar:

```tsx
{(isSimulatedOffline() || !navigator.onLine) && (
  <p className="rounded-lg border border-status-cleaning/40 bg-status-cleaning/10 px-3 py-2 text-sm">
    Sem internet. O primeiro acesso neste aparelho precisa de internet.
  </p>
)}
{needsLogin && (
  <p className="rounded-lg border border-status-confirmed/30 bg-status-confirmed/5 px-3 py-2 text-sm">
    Sua sessão expirou. Entre de novo: o que foi feito neste aparelho continua guardado e será enviado em seguida.
  </p>
)}
```

  - **Outra pessoa entrando:** em `onSubmit`, antes do `signInWithPassword`, acrescentar:

```ts
const identity = loadIdentity()
if (identity && identity.email && identity.email.toLowerCase() !== values.email.toLowerCase()) {
  const { pending, rejected } = await outboxCounts()
  if (pending + rejected > 0) {
    const ok = await confirm({
      title: 'Entrar com outro usuário?',
      description: `Este aparelho tem ${pending + rejected} ação(ões) de ${identity.profile.full_name} que ainda não chegaram ao banco. Entrar com outro usuário apaga essas ações.`,
      confirmLabel: 'Entrar e apagar',
      destructive: true,
    })
    if (!ok) {
      setSubmitting(false)
      return
    }
  }
}
```

  - **Importações:** `useConfirm` de `@/components/ConfirmDialog`, `loadIdentity` de `@/offline/identity`, `outboxCounts` de `@/offline/outbox` e `isSimulatedOffline` de `@/offline/connectivity`. Declarar `const confirm = useConfirm()` dentro de `LoginPage`. A limpeza da cópia acontece sozinha: no `SIGNED_IN`, o `SyncProvider` chama `ensureOwner`, que apaga a cópia de outro dono.

- [ ] **Passo 5: "Sair" em `src/components/AppLayout.tsx`.**

```tsx
const { state } = useSync()
const confirm = useConfirm()

async function handleSignOut() {
  const unsent = state.pending + state.rejected
  if (unsent > 0) {
    const ok = await confirm({
      title: 'Sair e perder o que não foi enviado?',
      description: `${unsent === 1 ? '1 ação ainda não foi enviada' : `${unsent} ações ainda não foram enviadas`} ao banco e ${unsent === 1 ? 'será apagada' : 'serão apagadas'} deste aparelho. Se puder, conecte-se à internet e espere o envio antes de sair.`,
      confirmLabel: 'Sair mesmo assim',
      destructive: true,
    })
    if (!ok) return
  }
  await signOut()
}
```

Trocar `onClick={() => signOut()}` por `onClick={() => void handleSignOut()}`. Importar `useSync` de `@/offline/sync-context` e `useConfirm` de `@/components/ConfirmDialog`. O `AppLayout` está dentro do `ConfirmProvider`, via router.

- [ ] **Passo 6: `src/pages/TrocarSenhaPage.tsx`.** Pegar `const online = useIsOnline()`. No botão de enviar: `disabled={submitting || !online}` e `title={online ? undefined : OFFLINE_HINT}`. Acima do formulário: `{!online && <p className="text-sm text-muted-foreground">Precisa de internet para trocar a senha.</p>}`. Conferir o nome real da variável de envio no arquivo.

- [ ] **Passo 7: Build e testes.** `npx -y pnpm@10 build` e `npx -y pnpm@10 test`. Esperado: tudo passando. Se o build acusar uso de `user` ou `session` de `useAuth()` em outro arquivo, trocar por `userId` ou `isAuthenticated`.

- [ ] **Passo 8: Commit das Tarefas 8 e 9.** `git add src/offline src/App.tsx src/lib/auth-context.tsx src/components/ProtectedRoute.tsx src/components/OfflineLockScreen.tsx src/pages/LoginPage.tsx src/components/AppLayout.tsx src/pages/TrocarSenhaPage.tsx`. Mensagem: `Motor de sincronizacao e login sem internet`.

---

### Tarefa 10: Telas leem da cópia

**Arquivos:** `src/lib/hotel.ts`, `src/pages/DashboardPage.tsx`, `ReservationsPage.tsx`, `GuestsPage.tsx`, `RoomsPage.tsx`, `OccupancyMapPage.tsx`, `GovernancaPage.tsx`, `FinanceiroPage.tsx`, `MaintenancePage.tsx`, e `src/components/NotesDialog.tsx`, `GlobalSearchDialog.tsx`.

**Regra:** só troca a função que busca os dados. As chaves do `useQuery` e o JSX continuam iguais. Onde a importação de `supabase` ficar sem uso, ela sai.

- [ ] **Passo 1: `src/lib/hotel.ts`**

```ts
import { getHotel } from '@/offline/queries'
import type { Hotel } from '@/types/hotel'

export async function fetchHotel(): Promise<Hotel | null> {
  return getHotel()
}
```

- [ ] **Passo 2: `DashboardPage.tsx`.** Substituir as funções (não mexer em `fetchAuditLog`):

```ts
async function fetchUserStats(): Promise<{ role: Role; active: boolean }[]> {
  return (await listProfiles()).map(({ role, active }) => ({ role, active }))
}

async function fetchRoomStats(): Promise<DashboardRoom[]> {
  return (await listRoomsWithType()).map(({ id, number, floor, status }) => ({ id, number, floor, status }))
}

async function fetchRevenueStats(): Promise<{
  reservations: { daily_rate: number; check_in: string; check_out: string }[]
  payments: { amount: number }[]
}> {
  const [reservations, payments] = await Promise.all([listReservationsWithRelations(), listPaymentsWithReservation()])
  return {
    reservations: reservations
      .filter((r) => r.status !== 'cancelada')
      .map(({ daily_rate, check_in, check_out }) => ({ daily_rate, check_in, check_out })),
    payments: payments.map(({ amount }) => ({ amount })),
  }
}

async function fetchTodayReservations(): Promise<TodayReservation[]> {
  return (await listReservationsWithRelations())
    .filter((r) => r.status === 'confirmada' || r.status === 'em_andamento')
    .sort((a, b) => a.check_in.localeCompare(b.check_in))
    .map((r) => ({
      id: r.id,
      guest_id: r.guest_id,
      check_in: r.check_in,
      check_out: r.check_out,
      status: r.status,
      guests: r.guests ? { full_name: r.guests.full_name, birth_date: r.guests.birth_date ?? null } : null,
      rooms: r.rooms ? { number: r.rooms.number } : null,
    }))
}
```

Importar `listPaymentsWithReservation`, `listProfiles`, `listReservationsWithRelations` e `listRoomsWithType` de `@/offline/queries`.

No card "Atividade recente":
- trocar `const { data: auditLog } = useQuery({` por `const { data: auditLog, isError: auditError } = useQuery({`;
- logo abaixo do `<CardTitle>Atividade recente</CardTitle>` (dentro do conteúdo do card), acrescentar `{auditError && <p className="text-sm text-muted-foreground">Precisa de internet para mostrar a atividade recente.</p>}`;
- trocar a condição de lista vazia `(auditLog ?? []).length === 0 &&` por `!auditError && (auditLog ?? []).length === 0 &&`.

- [ ] **Passo 3: `ReservationsPage.tsx`.** Apagar as seis funções `fetchReservations`, `fetchGuestsForSelect`, `fetchRoomsForSelect`, `fetchSeasonalRate`, `fetchSeasonalRatesForDate` e `fetchOverlappingRoomIds`, e a `interface RoomOption`. No lugar:

```ts
const fetchReservations = listReservationsWithRelations
const fetchGuestsForSelect = listActiveGuestsForSelect
const fetchRoomsForSelect = listRoomsWithType
const fetchSeasonalRate = seasonalRateFor
const fetchSeasonalRatesForDate = seasonalRatesForDate
const fetchOverlappingRoomIds = (checkIn: string, checkOut: string) => overlappingRoomIds(checkIn, checkOut)
```

Importar de `@/offline/queries`: `listActiveGuestsForSelect`, `listReservationsWithRelations`, `listRoomsWithType`, `overlappingRoomIds`, `seasonalRateFor`, `seasonalRatesForDate` e `type RoomOption`.

- [ ] **Passo 4: `GuestsPage.tsx`**

```ts
const fetchGuests = listGuests

async function fetchGuestReservations(): Promise<GuestReservation[]> {
  return (await listReservationsWithRelations()).map((r) => ({
    id: r.id,
    guest_id: r.guest_id,
    check_in: r.check_in,
    check_out: r.check_out,
    daily_rate: r.daily_rate,
    status: r.status,
    rooms: r.rooms ? { number: r.rooms.number } : null,
  }))
}
```

- [ ] **Passo 5: `RoomsPage.tsx`.** `fetchRoomTypes = listRoomTypes`, `fetchRooms = listRoomsWithType` e `fetchSeasonalRates = listSeasonalRatesWithType`. Apagar os corpos antigos.

- [ ] **Passo 6: `OccupancyMapPage.tsx`**

```ts
const fetchRooms = listRoomsWithType

async function fetchWindowReservations(start: string, end: string): Promise<MapReservation[]> {
  return (await listReservationsWithRelations())
    .filter((r) => r.status !== 'cancelada' && r.check_in < end && r.check_out > start)
    .map((r) => ({
      room_id: r.room_id,
      check_in: r.check_in,
      check_out: r.check_out,
      status: r.status,
      occupant_name: r.occupant_name,
      guests: r.guests ? { full_name: r.guests.full_name } : null,
    }))
}
```

- [ ] **Passo 7: `GovernancaPage.tsx`**

```ts
async function fetchRoomsAwaitingCleaning(): Promise<RoomWithType[]> {
  return (await listRoomsWithType()).filter((room) => room.status === 'limpeza')
}
```

- [ ] **Passo 8: `FinanceiroPage.tsx`**

```ts
async function fetchBillableReservations(): Promise<ReservationWithRelations[]> {
  return (await listReservationsWithRelations()).filter((r) => r.status !== 'cancelada')
}

const fetchPayments = listPaymentsWithReservation

async function fetchKpiReservations(start: string, end: string): Promise<KpiReservation[]> {
  const windowEnd = addDays(end, 1)
  return (await listReservationsWithRelations())
    .filter((r) => r.status !== 'cancelada' && r.check_in < windowEnd && r.check_out > start)
    .map(({ check_in, check_out, daily_rate }) => ({ check_in, check_out, daily_rate }))
}

const fetchTotalRooms = countRooms

async function fetchReservationsForMonth(start: string, end: string): Promise<ReservationStatusRow[]> {
  return (await listReservationsWithRelations())
    .filter((r) => r.check_in >= start && r.check_in <= end)
    .map(({ status, cancellation_reason }) => ({ status, cancellation_reason }))
}

/** Hóspedes cadastrados no mês (pela data local do cadastro). */
async function fetchNewGuestsCount(start: string, end: string): Promise<number> {
  return (await listGuests()).filter((g) => {
    const day = toIsoDate(new Date(g.created_at))
    return day >= start && day <= end
  }).length
}
```

O `toIsoDate` já existe no arquivo (alias de `toLocalIsoDate`). Conferir antes de usar.

- [ ] **Passo 9: `MaintenancePage.tsx`**

```ts
const fetchMaintenanceRequests = listMaintenanceWithRoom

async function fetchRoomsForSelect(): Promise<{ id: string; number: string }[]> {
  return (await listRoomsWithType()).map(({ id, number }) => ({ id, number }))
}
```

- [ ] **Passo 10: `NotesDialog.tsx`.** `fetchNotes` passa a ser `(subjectType, subjectId) => listNotes(subjectType, subjectId)`.

- [ ] **Passo 11: `GlobalSearchDialog.tsx`.**
  - Apagar as interfaces `GuestResult`, `RoomResult`, `ReservationResult` e `GlobalSearchResults`, e as funções `sanitizeTerm` e `fetchGlobalSearch`.
  - Importar `searchEverything` e os tipos `GlobalSearchResults`, `GuestResult`, `RoomResult` e `ReservationResult` de `@/offline/queries`, mas só os tipos que o JSX realmente usa.
  - No `useQuery`, trocar `queryFn: () => fetchGlobalSearch(trimmed)` por `queryFn: () => searchEverything(trimmed)`.

- [ ] **Passo 12: Build.** Esperado: sem erros. Lint: sem erros novos.

- [ ] **Passo 13: Conferência rápida no navegador do app** (servidor de dev `hotelflow-dev`, com o Gustavo logado). Painel, Reservas, Mapa, Hóspedes, Quartos, Governança, Financeiro e Ctrl+K mostram os mesmos dados de antes. No console, nenhum erro. Na primeira abertura aparece o download inicial: pode levar alguns segundos e depois as telas se enchem sozinhas.

- [ ] **Passo 14: Commit.** `git add src/lib/hotel.ts src/pages src/components/NotesDialog.tsx src/components/GlobalSearchDialog.tsx`. Mensagem: `Telas passam a ler da copia local`.

---

### Tarefa 11: Ações offline nas telas e botões só-online

**Arquivos:** `ReservationsPage.tsx`, `GuestDialog.tsx`, `GovernancaPage.tsx`, `FinanceiroPage.tsx`, `GuestsPage.tsx`, `RoomsPage.tsx`, `MaintenancePage.tsx`, `NotesDialog.tsx`, `HotelSettingsPage.tsx`, `UsersListPage.tsx` e `AuditPage.tsx`; criar `src/components/PendingBadge.tsx`.

**Interfaces:**
- **Consome:** `actions.*` e `useActor` (Tarefas 5 e 8), `useIsOnline`, `useSync` e `OFFLINE_HINT` (Tarefa 8), `emitServerChange` (Tarefa 3).
- **Produz:** `<PendingBadge entity={EntityKey} />`.

- [ ] **Passo 1: `src/components/PendingBadge.tsx`**

```tsx
import { AlertTriangle, Clock } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import type { EntityKey } from '@/offline/db'
import { useSync } from '@/offline/sync-context'

/** "Aguardando envio" (ainda no caderninho) ou "Recusada" (está em Pendências). */
export function PendingBadge({ entity }: { entity: EntityKey }) {
  const status = useSync().entityStatus.get(entity)
  if (!status) return null
  return status === 'recusado' ? (
    <Badge variant="destructive">
      <AlertTriangle className="h-3 w-3" />
      Recusada
    </Badge>
  ) : (
    <Badge variant="outline">
      <Clock className="h-3 w-3" />
      Aguardando envio
    </Badge>
  )
}
```

- [ ] **Passo 2: `ReservationsPage.tsx`, mutações.** Em `ReservationsPage`: `const actor = useActor()` e `const online = useIsOnline()`. Importar `* as actions from '@/offline/actions'`, `useActor`, `useIsOnline`, `OFFLINE_HINT`, `emitServerChange` e `PendingBadge`. Depois:

```ts
const cancelReservation = useMutation({
  mutationFn: ({ id, reason, notes }: { id: string; reason: CancellationReason; notes: string }) =>
    actions.cancelReservation(actions.requireActor(actor), id, reason, notes),
  onSuccess: () => toast.success('Reserva cancelada.'),
  onError: (error) => toast.error(actions.actionErrorMessage(error, 'Não foi possível cancelar a reserva.')),
})

const checkinReservation = useMutation({
  mutationFn: (id: string) => actions.checkinReservation(actions.requireActor(actor), id),
  onSuccess: () => toast.success('Check-in realizado.'),
  onError: (error) => toast.error(actions.actionErrorMessage(error, 'Não foi possível fazer o check-in.')),
})

const checkoutReservation = useMutation({
  mutationFn: (id: string) => actions.checkoutReservation(actions.requireActor(actor), id),
  onSuccess: () => toast.success('Check-out realizado.'),
  onError: (error) => toast.error(actions.actionErrorMessage(error, 'Não foi possível fazer o check-out.')),
})

const toggleInvoiceIssued = useMutation({
  mutationFn: ({ id, invoiceIssued }: { id: string; invoiceIssued: boolean }) =>
    actions.setInvoiceIssued(actions.requireActor(actor), id, invoiceIssued),
  onSuccess: (_data, { invoiceIssued }) =>
    toast.success(invoiceIssued ? 'Nota fiscal marcada como emitida.' : 'Nota fiscal marcada como pendente.'),
  onError: (error) => toast.error(actions.actionErrorMessage(error, 'Não foi possível atualizar a nota fiscal.')),
})
```

Conferir a mensagem `onError` original de `toggleInvoiceIssued` e manter o mesmo texto.

**Excluir** continua online: no `onSuccess` de `deleteReservation`, acrescentar `emitServerChange()`. No botão "Excluir", `disabled={!online}` e `title={online ? undefined : OFFLINE_HINT}`.

**Etiqueta:** logo depois do `<Badge variant={reservationStatusVariant(reservation.status)}>…</Badge>` da linha, acrescentar `<PendingBadge entity={`reservations:${reservation.id}`} />`.

- [ ] **Passo 3: `ReservationDialog`, no mesmo arquivo.** Declarar `const actor = useActor()`. Trocar `saveReservation`:

```ts
const saveReservation = useMutation({
  mutationFn: async (values: ReservationInput) => {
    const fields: actions.ReservationFields = {
      guest_id: values.guest_id,
      room_id: values.room_id,
      check_in: values.check_in,
      check_out: values.check_out,
      adults: values.adults,
      children: values.children,
      daily_rate: values.daily_rate,
      occupant_name: values.occupant_name || null,
      notes: values.notes || null,
    }
    const who = actions.requireActor(actor)
    if (isEdit) await actions.updateReservation(who, reservation.id, fields)
    else await actions.createReservation(who, fields)
  },
  onSuccess: () => {
    toast.success(isEdit ? 'Reserva atualizada.' : 'Reserva criada.')
    reset()
    setOpen(false)
  },
  onError: (error) => toast.error(actions.actionErrorMessage(error, 'Não foi possível salvar a reserva.')),
})
```

Se `reservation` não for reconhecido como definido dentro de `mutationFn` (erro de TS), usar `reservation!.id`, como o código atual já faz implicitamente com `isEdit`.

- [ ] **Passo 4: `GroupReservationDialog`.** Declarar `const actor = useActor()`. Trocar o `mutationFn` de `createGroup`:

```ts
mutationFn: async (values: GroupReservationInput) => {
  const roomTypeIds = Array.from(
    new Set(
      Array.from(selectedRooms.keys())
        .map((roomId) => rooms.find((r) => r.id === roomId)?.room_types?.id)
        .filter((id): id is string => !!id)
    )
  )
  const seasonalRates = await fetchSeasonalRatesForDate(roomTypeIds, values.check_in)
  const groupRooms = Array.from(selectedRooms.entries()).map(([roomId, occupantName]) => {
    const room = rooms.find((r) => r.id === roomId)
    const roomTypeId = room?.room_types?.id
    const rate = (roomTypeId ? seasonalRates.get(roomTypeId) : undefined) ?? room?.room_types?.base_price ?? 0
    return { room_id: roomId, occupant_name: occupantName.trim() || null, daily_rate: rate }
  })
  return actions.createGroupReservations(actions.requireActor(actor), {
    guest_id: values.guest_id,
    check_in: values.check_in,
    check_out: values.check_out,
    rooms: groupRooms,
  })
},
```

No `onSuccess`, remover a linha `invalidateQueries`. O `onError` vira `toast.error(actions.actionErrorMessage(error, 'Não foi possível criar as reservas do grupo.'))`.

- [ ] **Passo 5: `GuestDialog.tsx`**

```ts
const actor = useActor()

const saveGuest = useMutation({
  mutationFn: async (values: GuestInput): Promise<Guest> => {
    const fields: actions.GuestFields = {
      full_name: values.full_name,
      document_type: values.document_type,
      document_number: values.document_number,
      email: values.email || null,
      phone: values.phone || null,
      birth_date: values.birth_date || null,
      nationality: values.nationality,
      notes: values.notes || null,
    }
    const who = actions.requireActor(actor)
    return isEdit ? actions.updateGuest(who, guest!.id, fields) : actions.createGuest(who, fields)
  },
  onSuccess: (savedGuest) => {
    toast.success(isEdit ? 'Hóspede atualizado.' : 'Hóspede cadastrado.')
    reset()
    setOpen(false)
    onSaved?.(savedGuest)
  },
  onError: (error) => toast.error(actions.actionErrorMessage(error, 'Não foi possível salvar o hóspede.')),
})
```

Remover `errorCode`, `supabase` e `useQueryClient` se ficarem sem uso.

- [ ] **Passo 6: `GovernancaPage.tsx`**

```ts
const actor = useActor()
const markClean = useMutation({
  mutationFn: (roomId: string) => actions.markRoomClean(actions.requireActor(actor), roomId),
  onSuccess: () => toast.success('Quarto marcado como limpo.'),
  onError: (error) => toast.error(actions.actionErrorMessage(error, 'Não foi possível marcar o quarto como limpo.')),
})
```

Remover `rpcErrorMessage`, `supabase` e `useQueryClient` se ficarem sem uso.

- [ ] **Passo 7: `FinanceiroPage.tsx`**
  - **`RegisterPaymentDialog`:**

```ts
const actor = useActor()
const registerPayment = useMutation({
  mutationFn: (values: PaymentInput) =>
    actions.registerPayment(actions.requireActor(actor), {
      reservation_id: reservationId,
      amount: values.amount,
      method: values.method,
      notes: values.notes ?? '',
    }),
  onSuccess: () => {
    toast.success('Pagamento registrado.')
    setOpen(false)
  },
  onError: (error) => toast.error(actions.actionErrorMessage(error, 'Não foi possível registrar o pagamento.')),
})
```

  - **Editar e excluir pagamento** continuam online: acrescentar `emitServerChange()` no `onSuccess`, e nos botões que abrem ou executam essas ações, `disabled={!online}` e `title={online ? undefined : OFFLINE_HINT}`.
  - **Etiqueta:** na linha do Histórico de pagamentos, ao lado da data ou do valor, `<PendingBadge entity={`payments:${payment.id}`} />`.

- [ ] **Passo 8: Botões só-online nas outras telas.** Em cada componente: `const online = useIsOnline()`. Nos botões listados abaixo, `disabled={<condição atual> || !online}` e `title={online ? undefined : OFFLINE_HINT}`. Em cada `onSuccess` das mutações que continuam no Supabase, `emitServerChange()`.
  - `GuestsPage.tsx`: botão Inativar/Reativar. E `<PendingBadge entity={`guests:${guest.id}`} />` ao lado do nome.
  - `RoomsPage.tsx`: gatilhos de `RoomTypeDialog`, `RoomDialog` e `SeasonalRateDialog` (novo e editar), e os três botões Excluir.
  - `MaintenancePage.tsx`: "Reportar problema" e "Resolver".
  - `NotesDialog.tsx`: botão de adicionar observação e "Excluir" (o histórico continua visível).
  - `HotelSettingsPage.tsx`: botão Salvar.
  - `UsersListPage.tsx`: "Novo usuário" e "Editar". Se a lista der erro (`isError` do `useQuery`), mostrar `<p className="text-sm text-muted-foreground">Precisa de internet para abrir esta tela.</p>`.
  - `AuditPage.tsx`: mesma mensagem com `isError`.

- [ ] **Passo 9: Build, lint e testes.** Esperado: sem erros novos.

- [ ] **Passo 10: Conferência no navegador do app** (dev, Gustavo logado):
  - criar uma reserva e conferir que aparece "Aguardando envio" por instantes e depois some;
  - check-in, pagamento e "marcar limpo" funcionam como antes;
  - no console, `hotelflowTeste.offline(true)` deixa os botões só-online apagados;
  - `hotelflowTeste.offline(false)` devolve.

- [ ] **Passo 11: Commit.** `git add src/pages src/components`. Mensagem: `Acoes offline nas telas, etiqueta de envio e botoes so-online`.

---

### Tarefa 12: Barra de conexão, Pendências, menu e atualização

**Arquivos:**
- **Criar:** `src/components/SyncStatus.tsx`, `src/pages/PendenciasPage.tsx`, `src/components/InstallAppButton.tsx`, `src/components/UpdatePrompt.tsx` e `src/pwa/install.ts`.
- **Modificar:** `src/router/index.tsx`, `src/components/AppLayout.tsx`, `src/components/Sidebar.tsx`, `src/App.tsx` (descomentar `UpdatePrompt`), `src/main.tsx` e `src/vite-env.d.ts`.

Esta tarefa e a 13 dependem de `vite-plugin-pwa` configurado (`virtual:pwa-register/react`). Faça o **Passo 1 da Tarefa 13 (vite.config.ts) antes do Passo 6 desta**.

- [ ] **Passo 1: `src/components/SyncStatus.tsx`**

```tsx
import { AlertTriangle, CloudOff, Loader2, ServerCrash, Wifi } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

import { useSync } from '@/offline/sync-context'
import { cn } from '@/lib/utils'

function elapsed(since: number | null): string {
  if (!since) return 'muito tempo'
  const minutes = Math.max(1, Math.round((Date.now() - since) / 60_000))
  if (minutes < 60) return `${minutes} min`
  const hours = Math.round(minutes / 60)
  if (hours < 48) return `${hours} h`
  return `${Math.round(hours / 24)} dias`
}

/** Aviso de conexão na barra de cima. Clicar abre Pendências. */
export function SyncStatus() {
  const { state } = useSync()
  const navigate = useNavigate()
  const waiting = state.pending > 0 ? ` · ${state.pending} aguardando envio` : ''

  let Icon = Wifi
  let label = 'Online'
  let tone = 'text-mint-strong'
  if (state.rejected > 0) {
    Icon = AlertTriangle
    label = state.rejected === 1 ? '1 pendência' : `${state.rejected} pendências`
    tone = 'text-destructive'
  } else if (state.busy && state.pending > 0) {
    Icon = Loader2
    label = 'Enviando…'
    tone = 'text-muted-foreground'
  } else if (state.connection === 'sem-internet') {
    Icon = CloudOff
    label = `Sem internet${waiting}`
    tone = 'text-[hsl(30_80%_32%)]'
  } else if (state.connection === 'servidor-fora') {
    Icon = ServerCrash
    label = `Sem falar com o servidor há ${elapsed(state.lastServerContactAt)}${waiting}`
    tone = 'text-[hsl(30_80%_32%)]'
  } else if (state.pending > 0) {
    label = `${state.pending} aguardando envio`
  }

  return (
    <button
      type="button"
      onClick={() => navigate('/pendencias')}
      className={cn(
        'flex max-w-[16rem] items-center gap-1.5 truncate rounded-full border px-3 py-1 text-xs font-medium transition-colors hover:bg-accent',
        tone
      )}
      title="Ver o que está aguardando envio"
    >
      <Icon className={cn('h-3.5 w-3.5 shrink-0', Icon === Loader2 && 'animate-spin')} />
      <span className="truncate">{label}</span>
    </button>
  )
}
```

- [ ] **Passo 2: `src/pages/PendenciasPage.tsx`**

```tsx
import { useQuery } from '@tanstack/react-query'
import * as React from 'react'
import { toast } from 'sonner'

import { useConfirm } from '@/components/ConfirmDialog'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import * as actions from '@/offline/actions'
import { db } from '@/offline/db'
import { emitLocalChange, emitServerChange } from '@/offline/events'
import { discardItem } from '@/offline/outbox'
import type { OutboxItem } from '@/offline/outbox-types'
import { listRoomsWithType, overlappingRoomIds } from '@/offline/queries'
import { useActor } from '@/offline/use-actor'

function when(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
}

export function PendenciasPage() {
  const confirm = useConfirm()
  const { data: items = [] } = useQuery({
    queryKey: ['outbox-items'],
    queryFn: () => db.outbox.orderBy('seq').toArray(),
  })
  const rejected = items.filter((item) => item.status === 'recusado')
  const waiting = items.filter((item) => item.status !== 'recusado')

  async function discard(item: OutboxItem) {
    const ok = await confirm({
      title: 'Descartar esta ação?',
      description: `"${item.description}" será desfeita neste aparelho. Se outras ações dependiam dela, também serão descartadas.`,
      confirmLabel: 'Descartar',
      destructive: true,
    })
    if (!ok) return
    await discardItem(item.seq!)
    emitLocalChange()
    emitServerChange()
    toast.success('Ação descartada.')
  }

  return (
    <div className="page">
      <PageHeader
        title="Pendências"
        description="O que foi feito neste aparelho e ainda não chegou ao banco, ou foi recusado por ele."
      />

      <Card>
        <CardHeader>
          <CardTitle>Recusadas pelo banco</CardTitle>
          <CardDescription>Resolva ou descarte cada uma. Elas existem só neste aparelho.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {rejected.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma ação recusada.</p>}
          {rejected.map((item) => (
            <div key={item.seq} className="flex flex-wrap items-start justify-between gap-3 rounded-lg border p-3">
              <div className="min-w-0 space-y-1">
                <p className="font-medium">{item.description}</p>
                <p className="text-sm text-destructive">{item.error?.message}</p>
                <p className="text-xs text-muted-foreground">Feita em {when(item.createdAt)}</p>
              </div>
              <div className="flex shrink-0 gap-2">
                {item.kind === 'reservation.create' && item.error?.reason === 'conflito_quarto' && (
                  <ResolveReservationDialog item={item} />
                )}
                <Button variant="outline" size="sm" onClick={() => void discard(item)}>
                  Descartar
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Aguardando envio</CardTitle>
          <CardDescription>Serão enviadas sozinhas quando houver internet, na ordem em que foram feitas.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {waiting.length === 0 && <p className="text-sm text-muted-foreground">Tudo enviado.</p>}
          {waiting.map((item) => (
            <div key={item.seq} className="flex items-center justify-between gap-3 text-sm">
              <span className="min-w-0 truncate">{item.description}</span>
              <span className="shrink-0 text-xs text-muted-foreground">{when(item.createdAt)}</span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}

function ResolveReservationDialog({ item }: { item: Extract<OutboxItem, { kind: 'reservation.create' }> }) {
  const actor = useActor()
  const [open, setOpen] = React.useState(false)
  const row = item.payload.row
  const [roomId, setRoomId] = React.useState(row.room_id)
  const [checkIn, setCheckIn] = React.useState(row.check_in)
  const [checkOut, setCheckOut] = React.useState(row.check_out)
  const [dailyRate, setDailyRate] = React.useState(String(row.daily_rate))
  const [saving, setSaving] = React.useState(false)

  const { data: rooms = [] } = useQuery({ queryKey: ['rooms-select'], queryFn: listRoomsWithType, enabled: open })
  const { data: busy = new Set<string>() } = useQuery({
    queryKey: ['resolve-busy-rooms', row.id, checkIn, checkOut],
    queryFn: () => overlappingRoomIds(checkIn, checkOut, row.id),
    enabled: open && checkOut > checkIn,
  })
  const freeRooms = rooms.filter((room) => !busy.has(room.id))

  async function save() {
    setSaving(true)
    try {
      await actions.resolveReservationConflict(actions.requireActor(actor), item.seq!, {
        room_id: roomId,
        check_in: checkIn,
        check_out: checkOut,
        daily_rate: Number(dailyRate),
      })
      toast.success('Reserva corrigida. Ela será enviada de novo.')
      setOpen(false)
    } catch (error) {
      toast.error(actions.actionErrorMessage(error, 'Não foi possível corrigir a reserva.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        Resolver
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Escolher outro quarto ou outras datas</DialogTitle>
            <DialogDescription>{item.description}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="resolver-entrada">Entrada</Label>
              <Input id="resolver-entrada" type="date" value={checkIn} onChange={(e) => setCheckIn(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="resolver-saida">Saída</Label>
              <Input id="resolver-saida" type="date" value={checkOut} onChange={(e) => setCheckOut(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Quarto livre</Label>
              <Select value={roomId} onValueChange={setRoomId}>
                <SelectTrigger>
                  <SelectValue placeholder="Escolha" />
                </SelectTrigger>
                <SelectContent>
                  {freeRooms.map((room) => (
                    <SelectItem key={room.id} value={room.id}>
                      Quarto {room.number}
                      {room.room_types ? ` · ${room.room_types.name}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="resolver-diaria">Diária (R$)</Label>
              <Input id="resolver-diaria" type="number" min="0" step="0.01" value={dailyRate} onChange={(e) => setDailyRate(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Voltar
            </Button>
            <Button onClick={() => void save()} disabled={saving || !(checkOut > checkIn)}>
              Salvar e reenviar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
```

- [ ] **Passo 3: Rota.** Em `src/router/index.tsx`, dentro dos filhos de `AppLayout`, acrescentar `{ path: '/pendencias', element: <PendenciasPage /> },` e importar `PendenciasPage`.

- [ ] **Passo 4: `src/pwa/install.ts`.** Guarda o convite de instalação mesmo se ele chegar antes do React montar.

```ts
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let deferred: BeforeInstallPromptEvent | null = null
const listeners = new Set<() => void>()
const notify = () => listeners.forEach((listener) => listener())

export function captureInstallPrompt(): void {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault()
    deferred = event as BeforeInstallPromptEvent
    notify()
  })
  window.addEventListener('appinstalled', () => {
    deferred = null
    notify()
  })
}

export function hasInstallPrompt(): boolean {
  return deferred !== null
}

export function subscribeInstallPrompt(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export async function promptInstall(): Promise<void> {
  if (!deferred) return
  await deferred.prompt()
  deferred = null
  notify()
}

export function isStandalone(): boolean {
  const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true
  return window.matchMedia('(display-mode: standalone)').matches || iosStandalone
}

export function isIos(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
}
```

- [ ] **Passo 5: `src/components/InstallAppButton.tsx`**

```tsx
import { Download, Share } from 'lucide-react'
import * as React from 'react'

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { hasInstallPrompt, isIos, isStandalone, promptInstall, subscribeInstallPrompt } from '@/pwa/install'

const ITEM_CLASS =
  'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-[14px] text-sidebar-foreground/70 transition-colors hover:bg-white/[0.05] hover:text-white'

/** "Instalar app" no menu: convite do navegador (Chrome/Edge/Android) ou passo a passo do iPhone. */
export function InstallAppButton() {
  const canPrompt = React.useSyncExternalStore(subscribeInstallPrompt, hasInstallPrompt)
  const [iosHelp, setIosHelp] = React.useState(false)

  if (isStandalone()) return null

  if (canPrompt) {
    return (
      <button type="button" className={ITEM_CLASS} onClick={() => void promptInstall()}>
        <Download className="h-[18px] w-[18px] shrink-0 text-mint" />
        Instalar app
      </button>
    )
  }

  if (!isIos()) return null

  return (
    <>
      <button type="button" className={ITEM_CLASS} onClick={() => setIosHelp(true)}>
        <Download className="h-[18px] w-[18px] shrink-0 text-mint" />
        Instalar no iPhone
      </button>
      <Dialog open={iosHelp} onOpenChange={setIosHelp}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Instalar no iPhone</DialogTitle>
            <DialogDescription>Três toques, no Safari:</DialogDescription>
          </DialogHeader>
          <ol className="list-decimal space-y-2 pl-5 text-sm">
            <li>
              Toque em <Share className="inline h-4 w-4" /> <strong>Compartilhar</strong>, na barra de baixo.
            </li>
            <li>
              Escolha <strong>Adicionar à Tela de Início</strong>.
            </li>
            <li>
              Toque em <strong>Adicionar</strong>. O ícone do HotelFlow aparece junto dos outros apps.
            </li>
          </ol>
        </DialogContent>
      </Dialog>
    </>
  )
}
```

- [ ] **Passo 6: `src/components/UpdatePrompt.tsx`**

```tsx
import * as React from 'react'
import { toast } from 'sonner'
import { useRegisterSW } from 'virtual:pwa-register/react'

const UPDATE_CHECK_MS = 60 * 60 * 1000

/** Avisa quando há versão nova publicada; não recarrega sozinho no meio de um cadastro. */
export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      if (registration) setInterval(() => void registration.update(), UPDATE_CHECK_MS)
    },
  })

  React.useEffect(() => {
    if (!needRefresh) return
    toast('Nova versão disponível.', {
      duration: Infinity,
      action: { label: 'Atualizar', onClick: () => void updateServiceWorker(true) },
    })
  }, [needRefresh, updateServiceWorker])

  return null
}
```

Em `src/vite-env.d.ts`, acrescentar na primeira linha: `/// <reference types="vite-plugin-pwa/react" />`. Em `src/App.tsx`, descomentar `UpdatePrompt`.

- [ ] **Passo 7: `src/main.tsx`**

```tsx
import '@fontsource/public-sans/latin-400.css'
import '@fontsource/public-sans/latin-500.css'
import '@fontsource/public-sans/latin-600.css'
import '@fontsource/public-sans/latin-700.css'
import '@fontsource/saira/latin-500.css'
import '@fontsource/saira/latin-600.css'
import '@fontsource/saira/latin-700.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { App } from './App'
import './index.css'
import { exposeTestHelpers } from '@/offline/connectivity'
import { captureInstallPrompt } from '@/pwa/install'

captureInstallPrompt()
exposeTestHelpers()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
```

Se `@fontsource/…/latin-500.css` não existir na versão instalada, usar `@fontsource/saira/500.css`, que traz todos os alfabetos.

- [ ] **Passo 8: `AppLayout.tsx` e `Sidebar.tsx`**
  - **`AppLayout`:**
    - `<SyncStatus />` antes do bloco do avatar, dentro de `<div className="flex shrink-0 items-center gap-3">`, envolto em `<div className="hidden sm:block">` (no celular o aviso fica no menu, item Pendências).
    - Passar `pendingCount={state.pending + state.rejected}` para `<Sidebar … />`.
    - Guardar o primeiro download:

```tsx
<main className="flex-1">
  {state.ready ? (
    <Outlet />
  ) : (
    <div className="page">
      <p className="text-sm text-muted-foreground">
        {state.connection === 'online'
          ? 'Preparando o app neste aparelho (baixando os dados do hotel)…'
          : 'Este aparelho ainda não tem a cópia dos dados. Conecte-se à internet para baixá-la.'}
      </p>
    </div>
  )}
</main>
```

  - **`Sidebar`:**
    - Acrescentar `pendingCount: number` em `SidebarProps` e repassar até `SidebarContent`.
    - No grupo "Operação", item `{ to: '/pendencias', label: 'Pendências', icon: AlertTriangle }`, mostrado só quando `pendingCount > 0`, com um contador `<span className="ml-auto rounded-full bg-mint px-1.5 text-[11px] font-semibold text-pine">{pendingCount}</span>`. Para não mexer no `NAV_GROUPS`, renderizar esse item à parte, logo depois da lista do grupo Operação.
    - `<InstallAppButton />` no rodapé, acima de "Minha conta".

- [ ] **Passo 9: Build e lint.** Esperado: sem erros novos.
- [ ] **Passo 10: Commit.** `git add src`. Mensagem: `Barra de conexao, tela Pendencias, instalar app e aviso de versao nova`.

---

### Tarefa 13: PWA (manifesto, service worker, ícones, fontes, Netlify)

**Arquivos:**
- **Modificar:** `vite.config.ts`, `index.html` e `netlify.toml`.
- **Criar:** `scripts/gerar-icones.py`, além dos PNGs gerados em `public/`.

- [ ] **Passo 1: `vite.config.ts`**

```ts
import react from '@vitejs/plugin-react'
import path from 'path'
import { defineConfig, type Plugin } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

/** /version.json: diz qual commit está no ar e serve para testar se o site responde. */
function versionFile(): Plugin {
  const body = () => JSON.stringify({ commit: process.env.COMMIT_REF ?? 'local', builtAt: new Date().toISOString() })
  return {
    name: 'hotelflow-version-file',
    configureServer(server) {
      server.middlewares.use('/version.json', (_req, res) => {
        res.setHeader('Content-Type', 'application/json')
        res.setHeader('Cache-Control', 'no-store')
        res.end(body())
      })
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'version.json', source: body() })
    },
  }
}

export default defineConfig({
  plugins: [
    react(),
    versionFile(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['favicon.png', 'apple-touch-icon.png'],
      manifest: {
        name: 'Millenium Hotel · HotelFlow',
        short_name: 'HotelFlow',
        description: 'Sistema de gestão do Millenium Hotel',
        lang: 'pt-BR',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        theme_color: '#002E2F',
        background_color: '#002E2F',
        icons: [
          { src: '/pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,woff,woff2}'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/version\.json$/],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
```

- [ ] **Passo 2: Ícones (`scripts/gerar-icones.py`)**
  - O símbolo atual tem 256 px.
  - **Fonte maior:** conferir se `OneDrive\Documentos\hotel\300ppi` tem o símbolo maior. Se tiver, e ele vier com o anel branco, recortar o anel com uma máscara circular no script e usar essa versão. Se não, usar `src/assets/brand/millenium-simbolo.png`.
  - **Conferência visual:** abrir os PNGs e confirmar o círculo menta sólido sobre Pinho, **sem anel branco**.

```python
"""Gera os ícones do app instalável a partir do símbolo do hotel (sólido, sem contorno branco)."""
from pathlib import Path

from PIL import Image

RAIZ = Path(__file__).resolve().parent.parent
SIMBOLO = RAIZ / 'src' / 'assets' / 'brand' / 'millenium-simbolo.png'
PUBLICO = RAIZ / 'public'
PINHO = (0x00, 0x2E, 0x2F, 255)


def icone(tamanho: int, fracao: float, destino: str) -> None:
    fundo = Image.new('RGBA', (tamanho, tamanho), PINHO)
    lado = round(tamanho * fracao)
    simbolo = Image.open(SIMBOLO).convert('RGBA').resize((lado, lado), Image.LANCZOS)
    posicao = ((tamanho - lado) // 2, (tamanho - lado) // 2)
    fundo.alpha_composite(simbolo, posicao)
    fundo.convert('RGB').save(PUBLICO / destino, optimize=True)


icone(192, 0.78, 'pwa-192.png')
icone(512, 0.78, 'pwa-512.png')
icone(512, 0.62, 'pwa-maskable-512.png')  # o Android recorta: o símbolo precisa caber no círculo de 80%
icone(180, 0.78, 'apple-touch-icon.png')
```

Rodar com `python scripts/gerar-icones.py` (Python 3.12 com Pillow, já instalado).

- [ ] **Passo 3: `index.html`.**
  - Remover as três linhas do Google Fonts (`preconnect` x2 e o `stylesheet`).
  - Depois do `<link rel="icon" …>`, acrescentar:

```html
<link rel="apple-touch-icon" href="/apple-touch-icon.png" />
<meta name="description" content="Sistema de gestão do Millenium Hotel" />
<meta name="mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-title" content="HotelFlow" />
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
```

  O `<link rel="manifest">` é inserido pelo vite-plugin-pwa no build.

- [ ] **Passo 4: `netlify.toml`.** Acrescentar ao final:

```toml
[[headers]]
  for = "/sw.js"
  [headers.values]
    Cache-Control = "no-cache"

[[headers]]
  for = "/index.html"
  [headers.values]
    Cache-Control = "no-cache"

[[headers]]
  for = "/version.json"
  [headers.values]
    Cache-Control = "no-store"
```

- [ ] **Passo 5: Build.** Rodar `npx -y pnpm@10 build`. Esperado: o log do vite-plugin-pwa lista `sw.js` e `manifest.webmanifest`, com N entradas pré-carregadas. Conferir que `dist/` tem `sw.js`, `manifest.webmanifest`, `version.json` e os quatro PNGs.

- [ ] **Passo 6: Conferir as fontes.** Na tela de login, os títulos estão em Saira e o texto em Public Sans, como antes. Comparar com o site no ar.

- [ ] **Passo 7: Commit.** `git add vite.config.ts index.html netlify.toml scripts/gerar-icones.py public`. Mensagem: `PWA: manifesto, service worker, icones e fontes dentro do app`.

---

### Tarefa 14: Verificação completa com prova

**Arquivos:** nenhum código novo, só correções se algo falhar (cada correção vira um commit `Corrige …`). Os prints ficam na conversa.

- [ ] **Passo 1:** `get_project` mostra `ACTIVE_HEALTHY`.
- [ ] **Passo 2:** `npx -y pnpm@10 test` (todos passando), `npx -y pnpm@10 build` (sem erros) e `npx -y pnpm@10 lint` (só os 2 erros antigos).
- [ ] **Passo 3: Servidor de prévia.**
  - **Configuração:** criar `hotelflow-preview` no `.claude/launch.json` da pasta da sessão: `npx.cmd -y pnpm@10 --dir "C:\Users\Gustavo Pereira\OneDrive\Documentos\claude\pms-hoteleiro" preview --port 4173 --strictPort`, porta 4173.
  - **Abrir:** `preview_start hotelflow-preview`.
  - **Login:** pedir ao Gustavo para entrar no painel do navegador. **Não digitar a senha.**
- [ ] **Passo 4: Instalação.** Via `javascript_tool`:
  - `navigator.serviceWorker.controller !== null`, depois de recarregar uma vez;
  - `fetch('/manifest.webmanifest').then(r => r.json())` traz nome, ícones e `display: standalone`;
  - os quatro ícones respondem 200.
- [ ] **Passo 5: Abrir sem internet.**
  - `hotelflowTeste.offline(true)`, depois `preview_stop` do servidor e recarregar a página.
  - O app abre pelo service worker e mostra o aviso "Sem internet".
  - Print.
- [ ] **Passo 6: Trabalhar offline.** Ainda offline:
  - criar o hóspede "TESTE OFFLINE Hóspede" (CPF válido de teste, por exemplo `529.982.247-25`, se não existir);
  - criar uma reserva para hoje no quarto livre de menor número;
  - fazer o check-in;
  - registrar um pagamento de R$ 10.
  - Conferir a etiqueta "Aguardando envio" e "Sem internet · 4 aguardando envio" na barra. Print.
- [ ] **Passo 7: Conflito simulado.** Ainda offline, criar uma segunda reserva no app, para amanhã, num quarto X. Direto no banco (`execute_sql`), criar uma reserva **no mesmo quarto X e período**, com `notes = 'TESTE OFFLINE outro aparelho'`. Ela faz o papel do outro aparelho que sincronizou primeiro.
- [ ] **Passo 8: Volta da internet.**
  - Subir o preview de novo (`preview_start`), rodar `hotelflowTeste.offline(false)` e esperar o envio.
  - Na tela: a barra mostra "⚠ 1 pendência"; Pendências lista a reserva de amanhã com "O quarto já foi reservado…". Print.
  - No banco (`execute_sql`): o hóspede, a reserva de hoje (em andamento), o pagamento (1 linha, com `id` igual ao do recibo e `created_at` na hora em que foi feito) e o quarto ocupado existem **uma vez só**. Conferir com `count(*)`.
- [ ] **Passo 9: Resolver.** Em Pendências, "Resolver", escolher outro quarto e salvar. A pendência some e a reserva aparece no banco com o novo quarto. Print.
- [ ] **Passo 10: Repetição sem duplicar.**
  - No console: `hotelflowTeste.offline(true)`, marcar "nota fiscal emitida" numa reserva, `hotelflowTeste.offline(false)`.
  - Logo em seguida, recarregar a página no meio do envio.
  - O item é reenviado e o banco fica com 1 alteração só (conferir `invoice_issued`).
- [ ] **Passo 11: Celular (375 px, `resize_window mobile`).** Barra, Pendências e menu (com "Pendências" e "Instalar app") cabem sem rolagem lateral. Print. Depois `resize_window desktop`.
- [ ] **Passo 12: Limpeza.** Listar os registros de teste (`notes` ou nome com `TESTE OFFLINE`, e os pagamentos deles) e **pedir o OK do Gustavo** antes de apagar. Com o OK, apagar pelo próprio app (admin) ou via SQL, pagamentos primeiro.
- [ ] **Passo 13: Commits das correções**, se houver.

---

### Tarefa 15: Publicação, aparelhos reais e documentação

**Arquivos:** `docs/STATUS.md` e a memória `projeto-pms-hotelflow.md`.

- [ ] **Passo 1:** `git status` mostra só os arquivos esperados. `git log --oneline` mostra um commit por tarefa.
- [ ] **Passo 2: Push.** Pedir o OK do Gustavo, porque o push publica em produção, e então rodar `git push origin main`. Se pedir login, rodar no painel Terminal do app (`run_in_terminal`).
- [ ] **Passo 3: Deploy.** Conferir o deploy no Netlify (conector Netlify: último deploy `ready`).
- [ ] **Passo 4: Site no ar** (navegador do app, https://gustavo-hotelflow-pms.netlify.app):
  - `/version.json` mostra o commit novo;
  - `/manifest.webmanifest` e `/sw.js` respondem;
  - depois de recarregar, o service worker controla a página;
  - o Gustavo entra e o download inicial termina;
  - as telas abrem.
- [ ] **Passo 5: Windows.** O Gustavo abre o site no Chrome ou Edge e clica em "Instalar app" (no menu do sistema ou no ícone da barra de endereço). Claude tira o print da janela instalada (`computer-use` só lê o navegador; a janela do app instalado aparece no print).
- [ ] **Passo 6: Android e iPhone.** O Gustavo instala (Android: "Instalar app"; iPhone: Safari → Compartilhar → Adicionar à Tela de Início), abre em modo avião e manda os prints. Sem iPhone disponível, registrar no STATUS como "não testado em iPhone de verdade".
- [ ] **Passo 7: `docs/STATUS.md`:**
  - na lista de migrations, `27. module28_offline_sync`;
  - nova seção **"Módulo 28 — App offline e instalável ✅"**, com o que foi feito, como funciona em poucas linhas, os testes (com o que foi e o que não foi testado em aparelho real) e os limites aceitos (os do design §6);
  - em "Limitações conhecidas", acrescentar: "Sair" agora desconecta só aquele aparelho (`scope: 'local'`), e o modo de teste `hotelflowTeste.offline(true)` existe;
  - atualizar a data no topo;
  - item novo em "Próximos passos".
- [ ] **Passo 8: Memória.** Atualizar `projeto-pms-hotelflow.md`: app offline publicado em (data), onde fica o design e o plano, o modo de teste no console e o lembrete de que o Supabase pausado aparece como "Sem falar com o servidor".
- [ ] **Passo 9: Commit e push.** `git add docs/STATUS.md`. Mensagem: `Atualiza STATUS: modulo 28, app offline e instalavel`. Depois o push, que já foi autorizado no Passo 2 desta mesma entrega.

---

## Conferência do plano contra o design

| Design | Tarefa |
|---|---|
| §1 Consultar offline (todas as telas listadas) | 10 |
| §1 Fazer offline (reserva, grupo, edição, cancelamento, nota, check-in/out, limpeza, hóspede, pagamento, PDFs) | 5, 11 (os PDFs já são gerados no navegador e passam a usar a cópia) |
| §1 Precisa de internet (botões apagados com "Precisa de internet") | 11 |
| §2 Aviso na barra, etiquetas, Pendências (Resolver e Descartar), Instalar app, versão nova, Sair com pendências, login sem internet | 9, 11, 12 |
| §3.2 Cópia, download incremental, exclusões, conferência diária, proteção, armazenamento persistente | 3, 8 |
| §3.3 Caderninho: ordem, trava entre abas, classificação, dependências, hóspede duplicado, edição sobre criação, Resolver, Descartar | 4, 5, 8 |
| §3.4 Regras locais e cargos | 5 |
| §3.5 Login offline (3 dias, bloqueio, sessão recusada, outra pessoa, Sair local) | 7, 9 |
| §3.6 Conexão, servidor fora do ar, modo de teste | 7, 8, 12 |
| §3.7 Telas trocam só a fonte | 10, 11 |
| §4 Migration | 2 |
| §5 PWA, ícones, iPhone, fontes, Netlify | 12, 13 |
| §7 Testes e prova | 1 a 8 (automáticos), 2 (banco), 14 (navegador), 15 (aparelhos) |
| §8 Publicação e STATUS | 15 |
