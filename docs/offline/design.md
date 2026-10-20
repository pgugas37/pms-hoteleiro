# HotelFlow offline e instalável — design

_19/10/2026 · combinado com o Gustavo na conversa, parte por parte · aguardando a revisão final antes do plano_

## Resumo em linguagem simples

O sistema vira um app instalável (Windows, Android e iPhone) que continua funcionando quando a internet do hotel cai.

O banco no Supabase continua sendo o **livro oficial**. Cada aparelho guarda uma **cópia** dos dados do hotel e anota num **caderninho** tudo o que foi feito. Com internet, o caderninho é enviado na hora e quase não se percebe. Sem internet, ele vai acumulando e é enviado sozinho quando a conexão volta. O banco aceita ou recusa cada anotação, e o que for recusado aparece numa tela de **Pendências** para alguém resolver.

Cada ação leva uma **etiqueta única** criada no aparelho. Se ela chegar duas vezes ao banco, a segunda é ignorada: nada duplica.

## Decisões tomadas na conversa

| Pergunta | Decisão |
|---|---|
| Como a internet costuma faltar? | **Quedas curtas** (minutos, às vezes uma ou duas horas) |
| O que precisa funcionar offline? | **Consultar tudo**, **check-in/check-out/limpeza**, **criar e editar reservas** (com cadastro de hóspede) e **registrar pagamentos** |
| Quantos aparelhos ao mesmo tempo? | **2 ou 3** |
| Dois aparelhos pegaram o mesmo quarto offline | **Quem envia primeiro fica com o quarto**; a outra reserva vai para **Pendências**, sem sumir |
| Como instalar? | **Só pelo navegador** (PWA), sem lojas e sem instalador `.exe` |
| Aparelhos compartilhados? | **Não**: cada pessoa usa o seu |
| Caminho técnico | **B: cópia completa no aparelho + caderninho** (descartados: "lembrar só o que já foi aberto", que não atende o pedido, e serviço pronto tipo PowerSync, exagerado para o tamanho do hotel) |

## 1. O que funciona sem internet

**Consultar:** Painel (menos os cards "Atividade recente" e "Equipe", que dependem da Auditoria), Reservas (com a aba Notas fiscais), Mapa, Hóspedes, Quartos (só ver), Governança, Financeiro inteiro (Faturamento, Histórico, Indicadores, Relatório mensal, PDFs e CSV), busca global (Ctrl+K) e Configurações (só ver).

**Fazer:**
- criar reserva (individual e em grupo), editar reserva, cancelar reserva (com motivo), marcar nota fiscal emitida/pendente;
- check-in, check-out, marcar quarto como limpo;
- cadastrar e editar hóspede (inclusive pelo "+ Novo hóspede" da reserva);
- registrar pagamento; gerar recibo, ficha (FNRH) e relatório em PDF.

**Precisa de internet** (o botão fica apagado, com o aviso "Precisa de internet"): excluir qualquer coisa, inativar/reativar hóspede, editar/excluir pagamento, cadastro de quartos/tipos/tarifas, salvar Configurações do hotel, Usuários, Auditoria, Manutenção (reportar e resolver), Observações internas (ver continua funcionando, adicionar não), login, esqueci/trocar senha, configuração inicial.

## 2. Como aparece na tela

- **Aviso de conexão na barra de cima**, sempre visível:
  - `● Online`, quando está tudo enviado;
  - `Enviando…`, com o caderninho sendo enviado;
  - `Sem internet · 3 aguardando envio`;
  - `Sem falar com o servidor há 2 h` (quando a internet existe mas o banco não responde, por exemplo com o Supabase pausado);
  - `⚠ 1 pendência`.

  Clicar abre Pendências.
- **Etiqueta "aguardando envio"** (ícone de relógio) na linha da reserva, do hóspede ou do pagamento feito offline, até chegar ao banco.
- **Tela Pendências** (`/pendencias`, item no menu com contador quando houver algo). Tem duas listas:
  - **Recusadas pelo banco**: cada item vem explicado em português (o quê, por quê, quando), com os botões:
    - **Resolver** (para reserva recusada por quarto ocupado: abre a reserva para trocar quarto ou datas e reenviar);
    - **Descartar** (desfaz no aparelho o que foi feito offline).
  - **Aguardando envio**: só leitura, para saber o que ainda está no caderninho.
- **Botão "Instalar app"** no menu, quando o navegador oferecer (Chrome, Edge, Android). No iPhone, um passo a passo: Safari → Compartilhar → "Adicionar à Tela de Início".
- **Versão nova publicada:** aviso "Nova versão disponível · Atualizar". O app não recarrega sozinho no meio de um cadastro.
- **Sair com coisas não enviadas:** o app avisa ("3 ações ainda não foram enviadas") e só sai, perdendo essas ações, se a pessoa confirmar.
- **Tela de login sem internet:** mensagem "Sem internet. O primeiro acesso neste aparelho precisa de internet."

## 3. Como funciona por dentro

### 3.1 Peças

```
Telas (React, TanStack Query)
  │ leem de ──────────────► consultas locais (src/offline/queries.ts)
  │ ações offline ────────► ações locais (src/offline/actions.ts)
  │                           │ 1) confere as regras  2) muda a cópia  3) anota no caderninho
  │ ações só-online ──────► supabase direto (como hoje) + baixar novidades em seguida
  ▼
Cópia local (IndexedDB via Dexie, src/offline/db.ts)
  ▲                         │
  │ download (pull.ts)      │ envio (outbox.ts)
  └──────── Supabase ◄──────┘
SyncProvider (src/offline/sync-context.tsx): conexão, quando baixar/enviar, estado para a barra de cima
AuthProvider (src/lib/auth-context.tsx): login offline com a última identidade
Service worker (vite-plugin-pwa): guarda as telas para abrir sem internet
```

Regra que simplifica tudo: **com ou sem internet, as ações offline-capazes seguem o mesmo caminho** (muda a cópia → caderninho → envio). Com internet, o envio é imediato. Assim, o que é testado online também vale offline.

Depois de cada mudança na cópia (ação local ou download), o SyncProvider chama `queryClient.invalidateQueries()` (todas as consultas). Como as consultas leem da cópia local, isso é instantâneo e evita controlar chave por chave.

### 3.2 Cópia local

- **Banco local** `hotelflow` (Dexie). Tabelas espelhadas: `hotels`, `room_types`, `rooms`, `guests`, `reservations`, `payments`, `seasonal_rates`, `maintenance_requests`, `internal_notes`, `profiles`. Mais `outbox` (o caderninho) e `meta` (dono da cópia, marcadores de download).
- **Primeiro download** (logo após o login, com internet): todas as linhas que a pessoa pode ler (o RLS decide; por exemplo, `profiles` traz só o próprio perfil, ou todos para admin), paginando de 1000 em 1000.
- **Download do que mudou:** com internet, a cada 60 s, quando o app volta para a frente da tela e logo depois de cada envio. Por tabela: `updated_at > marcador − 2 min` (a sobra de 2 min cobre transações que terminam fora de ordem; regravar uma linha igual não faz mal). O marcador é o maior `updated_at` recebido, que é a hora do servidor, nunca a do aparelho.
- **Exclusões:** tabela nova `sync_deletions` no banco (ver §4); o aparelho baixa as exclusões desde o último marcador e apaga da cópia.
- **Conferência diária:** uma vez a cada 24 h (e quando marcada como necessária, por exemplo depois de um "Descartar"), o aparelho baixa só os `id`s de cada tabela e remove da cópia o que não existe mais no servidor. É a rede de segurança.
- **Proteção do que ainda não foi enviado:** o download **não sobrescreve nem apaga** linhas citadas no caderninho (itens aguardando, enviando ou recusados). A ordem normal é sempre **enviar primeiro e baixar depois**.
- **Armazenamento persistente:** depois do login, o app pede `navigator.storage.persist()` para o navegador não limpar a cópia sozinho.

### 3.3 Caderninho (outbox)

Cada item tem: `seq` (ordem), `id` (etiqueta), `kind`, `payload`, `entityIds` (ids que ele cria ou mexe), `dependsOn` (ids de que ele depende), `description` (texto para Pendências, montado na hora da ação), `createdAt`, `userId`, `status` (`pendente` | `enviando` | `recusado`), `error` e `attempts`.

**Tipos:** `guest.create`, `guest.update`, `reservation.create`, `reservation.update`, `reservation.cancel`, `reservation.invoice`, `reservation.checkin`, `reservation.checkout`, `room.clean`, `payment.create`.

**Como cada um chega ao banco:**

| Tipo | Chamada |
|---|---|
| `guest.create`, `reservation.create` | `insert` com o `id` do aparelho, `on conflict (id) do nothing` (upsert com `ignoreDuplicates`) |
| `guest.update`, `reservation.update`, `reservation.invoice` | `update` **só dos campos alterados** `… where id = …`, com `select` para saber se achou a linha |
| `reservation.checkin` / `checkout` / `cancel`, `room.clean` | RPCs existentes, agora aceitando repetição e a hora real (§4) |
| `payment.create` | RPC `register_payment` com `p_id` (a etiqueta) e `p_paid_at` |

**Envio:** um de cada vez, na ordem de `seq`, com uma trava entre abas do mesmo aparelho (`navigator.locks`) para nunca enviar duas vezes ao mesmo tempo. Dispara quando a internet volta, depois de cada ação (se online), a cada 60 s, ao voltar para a tela e logo depois do login.

**Como cada resposta é tratada:**

| Resposta do banco | O que o app faz |
|---|---|
| sucesso | tira o item do caderninho |
| `id` já existe (`23505` em `*_pkey`) | trata como sucesso: já tinha chegado |
| mesmo documento de hóspede já cadastrado (`23505` em `guests_document_type_document_number_key`) | busca o hóspede existente pelo documento, troca o id local pelo do servidor na cópia e nos itens seguintes do caderninho, e trata como sucesso |
| quarto já reservado no período (`23P01` em `reservations_no_overlap`) | **recusado**: "O quarto 12 já foi reservado de 20/10 a 22/10 por outro aparelho." |
| sem permissão (`42501`, ou RPC "Sem permissão…") | **recusado**: "Seu usuário não tem mais permissão para isso." |
| regra da função (`P0001`, ex.: "Só é possível fazer check-out de uma reserva em andamento") | **recusado**, com a mensagem do banco (a situação mudou em outro aparelho) |
| registro sumiu (`23503`, ou `update` sem nenhuma linha) | **recusado**: "Esse registro foi excluído em outro aparelho." |
| falha de rede, tempo esgotado, erro 5xx | para o envio, mantém o item, tenta de novo (espera 5 s, 15 s, 30 s, 60 s…) |
| login vencido (`401`) | tenta renovar a sessão. Se a renovação for recusada de vez, para e pede para entrar de novo, sem perder o caderninho |

**Dependências:** um item que depende de um id cujo item foi recusado também vai para Recusadas ("Depende da reserva de Fulano, que foi recusada"). Quando o item pai é resolvido, os dependentes voltam para a fila, logo depois dele e na mesma ordem.

**Edição de algo que ainda não foi enviado:** se a reserva ou o hóspede ainda está num `create` pendente, a edição atualiza o próprio `create` em vez de criar um `update`.

**Resolver uma reserva recusada:** a pessoa troca o quarto ou as datas. Como a reserva nunca chegou ao banco, o mesmo `id` volta para o fim da fila como `create`.

**Descartar:** apaga o item. Se era um `create`, apaga a linha da cópia. Nos outros casos, busca a versão do servidor das linhas afetadas (ou marca a conferência, se estiver offline).

**Conflito de edição:** como só vão os campos alterados, edições em campos diferentes não se atrapalham. No mesmo campo, vale quem enviar por último (aceito na conversa).

### 3.4 Ações locais (as regras que o aparelho confere sozinho)

As mesmas regras do banco, aplicadas na cópia para dar resposta imediata. O banco continua sendo o juiz final.

- **Cargos** (iguais ao RLS e às RPCs):
  - reserva, hóspede, check-in/out, cancelamento e nota fiscal: admin, gerente e recepção;
  - limpeza: admin, gerente e governança;
  - pagamento: admin, gerente, recepção e financeiro.
- **Reserva:** saída depois da entrada; hóspede ativo; quarto existe; **sem sobreposição com reservas ativas da cópia** (a mesma regra da trava do banco); diária sugerida pela tarifa sazonal ou pelo preço base (cópia); reserva em grupo vira um `reservation.create` por quarto.
- **Check-in:** só reserva `confirmada` com entrada até hoje (data do aparelho). Reserva → `em_andamento`, quarto → `ocupado`, `checked_in_at` = agora.
- **Check-out:** `em_andamento` → `finalizada`, quarto → `limpeza`.
- **Cancelar:** `confirmada` ou `em_andamento` → `cancelada` com motivo. Se estava em andamento, quarto → `limpeza`.
- **Limpo:** quarto `limpeza` → `disponivel`.
- **Pagamento:** valor > 0, forma válida, reserva existe. O recibo em PDF sai offline com o mesmo número que terá no servidor.
- **Hóspede:** validações atuais (`src/lib/validations.ts`, CPF/CNPJ com dígito) mais o documento repetido na cópia, com a mesma mensagem amigável de hoje.

### 3.5 Login sem internet

- A cada login e a cada contato bem-sucedido com o servidor, o app guarda a **identidade** (`userId`, e-mail, perfil com o cargo) e a hora do **último contato com o servidor**.
- A biblioteca do Supabase (`@supabase/auth-js` 2.116), sem internet e com a chave de 1 h vencida, devolve sessão vazia com erro de rede, mas **mantém a sessão guardada**. O `AuthProvider` passa a entender esse caso:
  - houve último contato há menos de **3 dias** → **modo offline**, com a identidade guardada (as telas e os cargos funcionam);
  - mais de 3 dias → tela "Conecte-se à internet para continuar". A cópia fica guardada, só travada.
- Quando a internet volta, a própria biblioteca renova a chave (`TOKEN_REFRESHED`). O app volta ao modo online e envia o caderninho.
- **Sessão recusada de vez pelo servidor** (por exemplo, senha trocada): o caderninho e a cópia ficam guardados. O login mostra "Entre de novo para enviar 3 ações pendentes". Se entrar a mesma pessoa, o app continua de onde parou. Se entrar outra, o app pede confirmação mostrando quantas ações serão perdidas e então limpa tudo.
- **Sair:** avisa se houver ações não enviadas. Depois, apaga a cópia e a identidade. Sem internet, usa `signOut({ scope: 'local' })`.
- Login, esqueci a senha, trocar senha e configuração inicial continuam precisando de internet.

### 3.6 Conexão

- `navigator.onLine === false` → offline com certeza.
- Fora isso, o estado vem das próprias chamadas: um erro de rede no Supabase marca offline. Para separar "sem internet" de "banco fora do ar", o app testa `/version.json` no próprio site (Netlify, sem cache do service worker). Se o site responde e o Supabase não, o aviso é "Sem falar com o servidor há X".
- **Modo de teste:** se existir `localStorage['hotelflow:simular-offline'] = '1'`, o `fetch` do cliente Supabase falha como se não houvesse rede. Serve para os testes no navegador do app, que não tem botão de desligar a internet. Não aparece em nenhuma tela.

### 3.7 Telas: só troca a fonte dos dados

As telas mantêm os mesmos `useQuery` e as mesmas chaves; só trocam a função que busca os dados. Ela deixa de chamar `supabase.from(...)` e passa a ler a cópia (`src/offline/queries.ts`), devolvendo **o mesmo formato** de hoje, inclusive os dados juntados, como `guests(...)`, `rooms(… room_types(...))` e o pagamento com reserva, hóspede e quarto. Assim a maior parte do JSX não muda.

- **Ações offline-capazes:** o `mutationFn` passa a chamar `actions.ts`.
- **Ações só-online:** continuam como hoje, com o botão desabilitado offline. Depois do sucesso, pedem um download das novidades.
- **Busca global:** procura na cópia.
- **Painel:** "Atividade recente" (lê `audit_log`) continua online e mostra "Precisa de internet" quando offline. O card "Equipe" usa a cópia de `profiles`.
- **Usuários e Auditoria:** continuam online.

## 4. Mudanças no banco: migration `module28_offline_sync`

1. **`updated_at`** com o gatilho `set_updated_at` (já existe) em `payments`, `maintenance_requests`, `internal_notes` e `seasonal_rates`, preenchido com `created_at` nas linhas antigas. Índice em `updated_at` nas tabelas espelhadas.
2. **`public.sync_deletions`** (`id` bigint identity, `table_name`, `row_id` uuid, `deleted_at` timestamptz default now()), com índice em `deleted_at`. RLS: só leitura para `authenticated`; ninguém grava direto. Gatilho `private.log_sync_deletion()` (`security definer`) `AFTER DELETE` em `guests`, `reservations`, `payments`, `rooms`, `room_types`, `seasonal_rates`, `maintenance_requests`, `internal_notes` e `hotels`.
3. **`private.client_time(p_at timestamptz)`**: devolve `p_at` se estiver entre `now() − 3 dias` e `now() + 5 min`; senão, devolve `now()`. Protege contra relógio errado no aparelho.
4. **RPCs que aceitam repetição**, recriadas com `drop function` + `create` (para não deixar duas versões com o mesmo nome) e com os mesmos grants (revoga `anon`, libera `authenticated`) e as mesmas checagens de cargo:
   - `checkin_reservation(p_reservation_id, p_at default null)`: se já está `em_andamento`, termina sem erro; senão, segue como hoje, com `checked_in_at = private.client_time(p_at)`;
   - `checkout_reservation(p_reservation_id, p_at default null)`: se já está `finalizada`, termina sem erro; `checked_out_at = private.client_time(p_at)`;
   - `cancel_reservation(p_reservation_id, p_reason, p_notes)`: se já está `cancelada`, termina sem erro;
   - `mark_room_clean(p_room_id)`: se o quarto já está `disponivel`, termina sem erro;
   - `register_payment(…, p_notes, p_id uuid default null, p_paid_at timestamptz default null)`: se já existe pagamento com `p_id`, devolve `p_id` sem gravar; senão, grava com `id = coalesce(p_id, gen_random_uuid())` e `created_at = private.client_time(p_paid_at)`.
5. **Nenhuma política de RLS muda.**
6. **Compatível com o app que está no ar:** os parâmetros novos têm valor padrão e ficam no fim, então as chamadas de hoje continuam funcionando. A migration é aplicada **antes** do novo frontend.

## 5. Instalação (PWA)

- **`vite-plugin-pwa`** (Workbox, `generateSW`, `registerType: 'prompt'`):
  - guarda todos os arquivos do build (`js`, `css`, `html`, `png`, `woff2`);
  - `navigateFallback: '/index.html'`, para as rotas abrirem offline;
  - `/version.json` fica de fora do cache.
- **Manifesto:**
  - nome "Millenium Hotel · HotelFlow", nome curto "HotelFlow";
  - `display: standalone`, `start_url` e `scope` `/`, `lang: pt-BR`;
  - `theme_color: #002E2F`, `background_color: #002E2F`.
- **Ícones:** 192 e 512 px, e 512 px "maskable" (com margem para o Android recortar); `apple-touch-icon` de 180 px. Todos com o **símbolo sólido sobre fundo Pinho**, sem contorno branco (a regra da logo). Gerados com Pillow a partir de `src/assets/brand/millenium-simbolo.png`.
- **iPhone:** metatags `apple-mobile-web-app-capable`, `apple-mobile-web-app-title` e `apple-mobile-web-app-status-bar-style`.
- **Fontes dentro do app:** `@fontsource/saira` (500, 600, 700) e `@fontsource/public-sans` (400 a 700) importadas no `main.tsx`; saem os links do Google Fonts do `index.html`.
- **Netlify:** cabeçalho `Cache-Control: no-cache` para `/sw.js`, `/index.html` e `/version.json` no `netlify.toml`. O `version.json` é gerado no build, com o commit e a data.

## 6. Riscos e limites aceitos

- **Dois aparelhos offline no mesmo quarto:** não dá para impedir na hora. Vai para Pendências quando a internet volta.
- **Mesmo campo editado em dois aparelhos:** vale o último a enviar.
- **Dados no aparelho (LGPD):** a cópia inclui documento e nascimento dos hóspedes, sem criptografia própria. Mitigações:
  - apagar ao sair;
  - travar depois de 3 dias sem contato com o servidor;
  - cada pessoa usa o próprio aparelho;
  - recomendação de bloqueio de tela no celular.
- **Envio só com o app aberto:** vale para todos os aparelhos, e o iPhone exige isso. Não há envio em segundo plano.
- **Auditoria:** mostra a hora do **envio**. Pagamento, check-in e check-out guardam a hora **real** (até 3 dias atrás).
- **Pendências moram no aparelho:** o admin não vê as pendências dos outros. Quem fez a ação resolve no próprio aparelho.
- **Supabase pausado (plano grátis):** o app avisa, mas não resolve. A reativação continua manual.
- **Primeiro acesso de cada aparelho:** precisa de internet.

## 7. Testes e prova

1. **Automáticos** (novos no projeto: Vitest + `fake-indexeddb`, `pnpm test`):
   - caderninho: aceito, repetido, recusado (quarto, permissão, regra, excluído), dependência, hóspede duplicado (troca de id), queda de rede no meio do envio (para e retoma sem duplicar), login vencido;
   - ações locais: regras de check-in, check-out, cancelamento, limpeza, sobreposição, pagamento e cargos;
   - download: mescla, proteção das linhas pendentes, exclusões e conferência.

   O envio é testado com um "banco de mentira" que responde os mesmos códigos do Supabase.
2. **No banco, dentro de uma transação desfeita no fim** (`begin … rollback`, como nos módulos anteriores, fazendo o papel de um usuário com `request.jwt.claims`):
   - check-in, check-out, cancelamento e limpeza repetidos não dão erro;
   - pagamento com a mesma etiqueta duas vezes grava uma só;
   - hora real é aceita até 3 dias atrás e trocada por `now()` fora disso;
   - exclusão gera `sync_deletions`;
   - o app atual (chamadas sem os parâmetros novos) continua funcionando.
3. **No navegador do app**, com o build de produção (`vite preview`) contra o Supabase de verdade. **O Gustavo faz o login, Claude não digita senha.**
   1. Instalar: manifesto válido e service worker ativo.
   2. Cortar a internet (modo de teste + servidor parado) e recarregar: o app abre.
   3. Offline: check-in, nova reserva (com hóspede novo), pagamento. Conferir o "aguardando envio" e o aviso na barra.
   4. **Conflito:** com o app offline, Claude cria direto no banco uma reserva no mesmo quarto e período, fazendo o papel do outro aparelho que sincronizou primeiro.
   5. Voltar a internet: o envio é automático. No banco, cada ação entrou **uma vez só**. A reserva em conflito aparece em Pendências, e "Resolver" troca o quarto e envia.

   Print de cada passo. Registros de teste com "TESTE OFFLINE" no nome; apagados no fim, com o OK do Gustavo.
4. **Aparelhos reais:**
   - **Windows:** Claude confere os critérios de instalação; o Gustavo clica em "Instalar" no Chrome ou Edge; Claude tira o print da janela do app instalado.
   - **Android e iPhone:** o Gustavo instala e manda um print. O Claude não controla o celular.
5. **Build e lint:** `pnpm build` sem erros; `pnpm lint` sem erros novos (os 2 antigos continuam registrados no STATUS).

## 8. Publicação

1. Commit por tarefa do plano.
2. Migration aplicada no Supabase e conferida.
3. Push na `main`. O Netlify publica sozinho.
4. Conferência no site no ar: abre, instala, o service worker ativa e o `version.json` bate com o commit.
5. `docs/STATUS.md` ganha a seção "Módulo 28 — App offline e instalável", e a memória do projeto é atualizada.

## 9. Fora do escopo (pode virar pedido futuro)

- Lojas (Play Store, App Store) e instalador `.exe`.
- Envio em segundo plano com o app fechado.
- Manutenção e Observações internas offline.
- Tempo real (ver na hora o que o outro aparelho fez, sem esperar o download de 60 s).
- Criptografia própria da cópia local.
- Integração com o Launcher (abrir o app instalado em vez de `npm run dev`).
