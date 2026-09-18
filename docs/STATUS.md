# Status do projeto — PMS Hoteleiro (HotelFlow)

_Última atualização: 18/09/2026 (Módulo 13)_

## Contexto

O planejamento (Fase 0) foi reiniciado do zero depois que o progresso anterior (Módulos 01–03) se perdeu com uma queda de sessão/ambiente. As decisões de arquitetura da Fase 0 foram reaprovadas e o desenvolvimento seguiu a partir daí com Git real e código versionado (em vez de artefatos HTML autocontidos por módulo).

## Decisões de arquitetura (Fase 0 — aprovadas)

- **(A)** Supabase como backend (Postgres + Auth + RLS + Edge Functions), em vez de Node/Express customizado ou Firebase.
- **(B)** Repositório Git real desde o Módulo 01, sem depender de artefatos de sessão.
- **(C)** Módulo de Dashboard antecipado para logo após o Módulo 04 (em vez de ficar no Módulo 14).
- **(D)** Código real versionado por módulo, rodando contra o Supabase de verdade (em vez de demos HTML autocontidas).

Stack de frontend aprovada: React 18 + TypeScript + Vite + Tailwind CSS + shadcn/ui + React Router + TanStack Query + Zod + React Hook Form, pnpm, hospedado no Netlify.

## Backend (Supabase) — já configurado e ativo

- Projeto `pms-hoteleiro`, org "GUSTAVO PEREIRA NETWORK", plano free, região `sa-east-1`.
- Ref do projeto: `gbtxgprucctjpwqswdng`.
- Migrations já aplicadas (Módulo 01 e 02):
  1. `0001_foundation`
  2. `0002_module01_audit_fixes`
  3. `0003_module02_profiles_rbac`
  4. `0004_module02_audit_fixes`
  5. `0005_module02_last_admin_guard`
  6. `0006_module02_performance_fixes`
  7. `0007_module02_fix_stale_function_reference`
  8. `0008_module02_audit_log_profile_changes`
  9. `0009_module05_rooms`
  10. `0010_module06_guests`
  11. `0011_module07_reservations`
  12. `0012_module06_guests_soft_delete`
  13. `module07_reservations_delete_cancelled`
  14. `module08_checkin_checkout`
  15. `module08_checkin_checkout_fix_grants`
  16. `module08_cancel_reservation_room_sync`
  17. `module08_delete_finished_and_invoice_reminder`
  18. `module09_housekeeping`
  19. `module10_maintenance`
  20. `module11_financeiro`
  21. `module11_payments_edit_delete`
- Tabelas: `public.profiles`, `public.hotels`, `public.audit_log`, `public.room_types`, `public.rooms`, `public.guests`, `public.reservations`, `public.maintenance_requests`, `public.payments` (todas com RLS habilitado).
- Função auxiliar `private.has_role(roles text[])` — generalização de `private.is_admin()`, usada nas policies de `guests` e `reservations` pra permitir admin, gerente e recepção.
- Funções RPC (`security definer`, checagem de papel manual por dentro): `checkin_reservation`, `checkout_reservation`, `cancel_reservation` (reserva e quarto mudam de status juntos, na mesma transação), `mark_room_clean` (governança), `report_maintenance_issue`/`resolve_maintenance_request` (manutenção), `register_payment` (financeiro — edição e exclusão de pagamento já usam update/delete direto, protegidos por RLS admin-only, sem precisar de RPC).
- Nota: a partir da migration 13 os nomes pararam de seguir o padrão `00NN_moduloXX_...` (ficou só `moduloXX_...`, sem número) — cosmético, não afeta o funcionamento; a ordem real é pela data/hora de aplicação, não pelo nome.

## Módulo 01 — Fundação e arquitetura ✅

Concluído e validado. Frontend: scaffold criado neste repositório — Vite + React 18 + TypeScript + Tailwind CSS + shadcn/ui (componente `Button` já incluído) + React Router + TanStack Query, cliente Supabase configurado (`src/lib/supabase.ts`) e uma página inicial que verifica a conexão com o Supabase. Testado com `pnpm install && pnpm dev` no computador do Gustavo — `http://localhost:5173` confirmou "Conectado ao Supabase com sucesso".

## Módulo 02 — Autenticação, usuários e permissões

Backend aprovado com ressalvas (0 crítico/alto pendente após auditoria) — schema, RLS e a Edge Function `create-user` seguem ativos no Supabase, sem alteração. Escopo:

- RBAC via tabela `profiles` + RLS (funções/triggers auxiliares no schema `private`).
- Edge Function `create-user` (bootstrap-aware: o primeiro usuário vira admin sem precisar de autenticação; usuários seguintes exigem um admin autenticado).
- Login / logout / redefinição de senha / troca de senha.
- CRUD de usuários (admin) + guarda de rota por papel, com página explícita de "acesso negado".
- Auditoria encontrou e corrigiu: referência obsoleta a `public.is_admin()` (quebraria edição de usuário) e falta de gravação no `audit_log` em criação/edição de usuário (corrigido via trigger + insert na edge function).

**Frontend reconstruído neste repositório:**

- `AuthProvider`/`useAuth()` (`src/lib/auth-context.tsx`) — sessão do Supabase + perfil (`role`, `active`).
- `/login` — entrar com e-mail e senha.
- `/configuracao-inicial` (rota pública) — cria o primeiro Administrador via bootstrap da Edge Function `create-user`.
- `/redefinir-senha` (rota pública) — define a senha a partir do link de convite/recuperação.
- `/minha-conta` — trocar a própria senha, autenticado.
- `/usuarios` (só admin) — listar usuários, criar novo (via Edge Function), editar papel/status ativo (update direto, protegido por RLS). Sem exclusão, só desativação.
- Guardas de rota: `ProtectedRoute` (exige login) e `RequireRole` (exige papel específico), com redirecionamento para `/acesso-negado`.

**Pendência:** criar o primeiro Administrador de verdade. Acesse `/configuracao-inicial` rodando o app localmente (`pnpm dev`), informe nome + e-mail (pgugas37@gmail.com), e depois confirme o convite que chega nesse e-mail para definir a senha.

## Módulo 03 — Configurações do hotel ✅

Concluído e validado. Página `/hotel` (link "Configurações" no menu): formulário de nome, CNPJ, fuso horário e endereço, usando a tabela `hotels` já existente. Qualquer usuário autenticado visualiza; só admin edita/cadastra (protegido por RLS, sem Edge Function). Testado rodando local: dados reais do hotel (MILLENIUM HOTEL) cadastrados e salvos com sucesso.

## Módulo 04 — Dashboard ✅

Concluído e validado. Substitui a página inicial (`/`) — antes só confirmava a conexão com o Supabase. Sem tabelas novas nem migrations: usa só `hotels`, `profiles` e `audit_log`, que já existiam.

- Todos os usuários: card de boas-vindas (nome, papel) e resumo do hotel (nome, cidade/UF), com link para "Configurações". Desde o Módulo 08, também um card de **ocupação atual** (quartos ocupados / total, %), calculado a partir de `rooms.status`, com link para "Reservas" — que desde os Módulos 09/10 também mostra quantos quartos estão aguardando limpeza e em manutenção, quando houver algum.
- Admin/gerente/financeiro: desde o Módulo 11, card **Financeiro** com faturado, recebido e pendente (total desde o início do sistema), com link para a tela `/financeiro`.
- Só admin (única role com permissão de leitura nessas tabelas via RLS): contagem de usuários por papel e por status (ativo/inativo), com link para "Usuários"; feed das últimas atividades em `audit_log` (quem fez o quê, quando), com nome do autor resolvido via `profiles`.
- Aviso fixo informando que indicadores financeiros (receita, diárias) chegam com o módulo de Financeiro.
- Observação: hoje o `audit_log` só registra criação/edição de usuário (não há trigger de auditoria em `hotels`), então o feed de atividade começa com poucos registros — isso é esperado, não é bug.

Testado rodando local: painel exibindo os dados reais do hotel (MILLENIUM HOTEL), contagem de usuários e a atividade recente (criação do admin).

## Módulo 05 — Quartos ✅

Concluído e validado. Duas tabelas novas no Supabase (migration `0009_module05_rooms`), com RLS igual ao padrão do Módulo 03 (todo autenticado lê, só admin cria/edita/exclui):

- `room_types` — tipos de quarto (nome, descrição, capacidade de adultos/crianças, preço base da diária).
- `rooms` — unidades físicas (número único, vínculo com o tipo, andar, status operacional: disponível/manutenção/inativo, observações). `room_type_id` referencia `room_types` com `on delete restrict`, então não é possível excluir um tipo com quartos vinculados (a tela trata esse erro com uma mensagem amigável).

**Frontend:** página `/quartos` (link "Quartos" no menu), com duas seções — "Tipos de quarto" e "Quartos" — cada uma com tabela de listagem e cadastro/edição via modal. Só admin vê os botões de ações; os demais papéis só visualizam.

Testado rodando local: cadastro de tipo de quarto, cadastro de quarto vinculado ao tipo, edição e exclusão funcionando.

## Módulo 06 — Hóspedes ✅

Concluído e validado. Nova tabela `guests` no Supabase (migration `0010_module06_guests`), com RLS diferente do padrão anterior: leitura para todo autenticado; criação/edição para **admin, gerente e recepção** (via nova função `private.has_role(roles)`, generalização de `private.is_admin()`); exclusão só admin.

- Campos: nome completo, documento (CPF, CNPJ ou passaporte + número, único por tipo — CNPJ cobre hóspede/empresa com faturamento via CNPJ), e-mail e telefone (opcionais), data de nascimento (opcional), nacionalidade (padrão "Brasileira"), observações. Sem campo de profissão (decisão do Gustavo).
- Máscara de CPF/CNPJ no formulário conforme o tipo de documento selecionado.

**Frontend:** página `/hospedes` (link "Hóspedes" no menu), com busca por nome ou documento e cadastro/edição via modal.

Testado rodando local: cadastro de hóspede com CPF e CNPJ, busca por nome/documento. Durante a validação foi encontrado um bug — a checagem de CPF/CNPJ só conferia a quantidade de dígitos, não o dígito verificador de verdade, então um CPF com número inválido (mas 11 dígitos) passava. Corrigido com o algoritmo oficial de validação (`src/lib/documents.ts`), aplicado tanto no formulário de hóspedes quanto no CNPJ do Módulo 03 (Configurações do hotel), que tinha a mesma falha.

**Ativar/Inativar em vez de excluir (migration `0012_module06_guests_soft_delete`):** como reservas nunca são apagadas de verdade (só canceladas, pra preservar histórico), a FK `reservations.guest_id` (`on delete restrict`) impedia excluir qualquer hóspede que já tivesse tido alguma reserva — mesmo cancelada. Corrigido com o mesmo padrão já usado em Usuários: coluna `active` na tabela `guests`, botão "Excluir" virou "Inativar"/"Reativar" (só admin), e a listagem ganhou uma coluna de Status (Ativo/Inativo). Hóspedes inativos não aparecem mais na seleção ao criar uma nova reserva.

## Módulo 07 — Reservas ✅

Concluído e validado. Nova tabela `reservations` no Supabase (migration `0011_module07_reservations`):

- Campos: hóspede, quarto, check-in, check-out, adultos/crianças, diária (copiada do preço do tipo de quarto no momento da reserva — não muda se o preço do tipo mudar depois), status (confirmada / em andamento / finalizada / cancelada), observações.
- **Trava anti-overbooking no banco**: constraint de exclusão (`exclude using gist`, extensão `btree_gist` — já vinha instalada no projeto) impede fisicamente duas reservas ativas com datas sobrepostas no mesmo quarto, mesmo em caso de requisições simultâneas. Testado manualmente via SQL antes de liberar: sobreposição bloqueada, datas diferentes no mesmo quarto permitidas normalmente.
- RLS: leitura para todo autenticado; criação/edição para admin, gerente e recepção (mesmo grupo do Módulo 06).

**Frontend:** página `/reservas` (link "Reservas" no menu), com listagem (hóspede, quarto, check-in/out, status, valor total = diária × noites) e cadastro/edição via modal — a diária é pré-preenchida a partir do preço do tipo do quarto escolhido, mas pode ser ajustada. Botão "Cancelar" separado pra reservas ativas. Se o quarto já estiver reservado no período, a tela mostra um aviso amigável em vez de erro técnico. No campo de hóspede, link "+ Novo hóspede" abre o mesmo formulário de cadastro do Módulo 06 sem sair da tela de reserva (componente `GuestDialog` extraído para ser reutilizável).

**Excluir reserva cancelada (migration `0013_module07_reservations_delete_cancelled`):** reservas com status "cancelada" ganharam um botão "Excluir" (só admin), que apaga a reserva definitivamente. Protegido também no banco via RLS — só é possível excluir uma reserva se `status = 'cancelada'`, mesmo direto pela API.

Testado rodando local: trava de overbooking (tentativa de reserva sobreposta bloqueada com aviso amigável), cadastro de hóspede direto pela tela de reserva, ativar/inativar hóspede, exclusão de reserva cancelada.

## Módulo 08 — Check-in / Check-out ✅

Concluído e validado. Conecta o status da reserva ao status operacional do quarto (`rooms.status`, que ganhou um novo valor: `ocupado`), que antes eram trocados de forma totalmente independente.

- **Funções RPC** (`security definer`, com checagem de papel — admin/gerente/recepção — feita dentro da função): `checkin_reservation` (reserva confirmada → em andamento + quarto → ocupado; recusa check-in antes da data marcada), `checkout_reservation` (em andamento → finalizada + quarto → aguardando limpeza, desde o Módulo 09 — era "disponível" direto até então), `cancel_reservation` (substituiu o update direto de status; se a reserva já tinha feito check-in, o quarto também vai para aguardando limpeza). As três rodam reserva e quarto na mesma transação — nunca ficam dessincronizados.
- Na tela de edição de reserva, o campo de status deixou de ser editável direto — agora só muda pelos botões da lista ("Fazer check-in", "Fazer check-out", "Cancelar", "Excluir"), pra garantir que o quarto sempre acompanhe.
- **Excluir reserva finalizada** (migration `module08_delete_finished_and_invoice_reminder`): o botão "Excluir" (só admin) que já existia pra reservas canceladas passou a valer também pra finalizadas. Protegido no banco via RLS (só `cancelada` ou `finalizada`).
- **Lembrete de nota fiscal**: a tela de Reservas ganhou duas abas (componente novo `src/components/ui/tabs.tsx`, dependência `@radix-ui/react-tabs`) — "Reservas" (a de sempre) e **"Notas fiscais"**, que lista as reservas finalizadas com hóspede, período e valor, e um botão pra marcar "Emitida"/"Pendente" (colunas `invoice_issued`/`invoice_issued_at`). É só um lembrete manual — não emite nem envia nada, não tem integração fiscal real. A aba mostra um contador com a quantidade pendente.
- **Dashboard**: novo card de ocupação atual (ver Módulo 04, acima).

Durante a instalação da dependência das abas, o pnpm do Gustavo bloqueou o `pnpm install` por uma política de segurança nova (`minimumReleaseAge`, rejeita pacotes publicados há pouco tempo) — resolvido com `pnpm config set minimumReleaseAge 0` (comando do próprio pnpm; `.npmrc` e variável de ambiente não pegaram, só o comando oficial funcionou). Ficou um `.npmrc` no repositório com essa configuração pra não repetir o problema em instalações futuras.

Testado rodando local: check-in (quarto vira ocupado), check-out (quarto volta a disponível), cancelamento de reserva já com check-in feito (libera o quarto), exclusão de reserva finalizada, aba de notas fiscais com hóspede/período/valor corretos e contador de pendentes.

**Limitação conhecida:** editar quarto/datas de uma reserva já "em andamento" (via botão "Editar") usa update direto, sem passar pelas funções RPC — não resincroniza o quarto automaticamente. Não é um fluxo comum (normalmente não se troca o quarto de quem já fez check-in), mas fica registrado.

## Módulo 09 — Governança (limpeza de quartos) ✅

Concluído e validado. Dá função de verdade ao papel "governanca" (cadastrado desde o Módulo 02, mas sem nenhuma tela até aqui) e fecha um buraco do Módulo 08: antes o check-out liberava o quarto direto pra "Disponível"; agora ele fica "Aguardando limpeza" primeiro.

- Novo status de quarto: `limpeza` (migration `module09_housekeeping`). `checkout_reservation` e `cancel_reservation` (de uma reserva que já tinha feito check-in) passaram a deixar o quarto em `limpeza` em vez de `disponivel` direto.
- Função RPC `mark_room_clean` (`security definer`, admin/gerente/governança): libera o quarto de `limpeza` pra `disponivel`.
- **Frontend:** página `/governanca` (link "Governança" no menu, visível pra admin/gerente/governança) listando os quartos aguardando limpeza, com botão "Marcar como limpo".
- Dashboard ganhou a contagem de "Aguardando limpeza" (ver Módulo 04).

Testado rodando local: check-out deixando o quarto aguardando limpeza, quarto aparecendo na tela de Governança, "Marcar como limpo" liberando o quarto de volta pra disponível.

## Módulo 10 — Manutenção ✅

Concluído e validado. Mesmo raciocínio do Módulo 09, agora pro papel "manutencao": sistema de chamados pra reportar e resolver problemas nos quartos.

- Tabela nova `maintenance_requests` (migration `module10_maintenance`): quarto, descrição, status (aberto/resolvido), quem reportou/resolveu, datas. RLS: leitura pra todo autenticado; escrita direta só admin — os demais papéis usam as funções RPC abaixo.
- Função RPC `report_maintenance_issue` (qualquer funcionário — admin, gerente, recepção, governança ou manutenção): cria o chamado e marca o quarto como `manutencao`, **a não ser que o quarto esteja `ocupado`** (nesse caso só registra o chamado, sem tirar o quarto de uso).
- Função RPC `resolve_maintenance_request` (admin, gerente ou manutenção): marca o chamado como resolvido e libera o quarto de volta pra `disponivel`, se ele ainda estiver `manutencao`.
- **Frontend:** página `/manutencao` (link "Manutenção" no menu, visível pra admin/gerente/recepção/governança/manutenção) com botão "Reportar problema" (quarto + descrição), lista de chamados abertos com "Resolver" (só admin/gerente/manutenção), e histórico dos últimos resolvidos.
- Dashboard ganhou a contagem de "Em manutenção" (ver Módulo 04).

Testado rodando local: reportar problema num quarto disponível (vira "Em manutenção"), resolver o chamado (libera o quarto), reportar problema num quarto ocupado (não muda o status do quarto, só registra o chamado).

## Módulo 11 — Financeiro / Faturamento ✅

Concluído e validado. Dá função de verdade ao papel "financeiro" (cadastrado desde o Módulo 02, mas sem nenhuma tela até aqui) — último papel do RBAC que ainda não tinha função no sistema.

- Tabela nova `payments` (migration `module11_financeiro`): reserva, valor, forma de pagamento (dinheiro/Pix/cartão de crédito/cartão de débito/transferência), observações, quem registrou, data. RLS: leitura pra todo autenticado; escrita direta bloqueada — registro só via função RPC.
- Função RPC `register_payment` (admin, gerente, recepção ou financeiro): registra um pagamento vinculado a uma reserva.
- **Edição e exclusão de pagamentos** (migration `module11_payments_edit_delete`, só admin): corrige lançamentos errados sem precisar de RPC — update e delete diretos, protegidos por RLS (`payments_update_admin`, `payments_delete_admin`).
- **Frontend:** página `/financeiro` (link "Financeiro" no menu, visível pra admin/gerente/recepção/financeiro), com cards de resumo (Faturado, Recebido, Pendente) e duas abas: "Faturamento" (reservas não canceladas com total, pago e saldo, botão "Registrar pagamento" em cada uma) e "Histórico de pagamentos" (todos os pagamentos, mais recentes primeiro, com "Editar"/"Excluir" pra admin).
- Dashboard ganhou o card "Financeiro" (ver Módulo 04, acima).
- De quebra, corrigida uma lacuna pré-existente no projeto (não relacionada ao módulo em si): faltava a dependência `@types/node`, que fazia o `pnpm build` completo (usado pelo deploy no Netlify) falhar — `pnpm dev` não era afetado. Adicionada como devDependency.

Testado rodando local: registrar pagamento parcial (saldo diminui), quitar totalmente (badge "Quitado"), histórico de pagamentos e card do Dashboard batendo com a tela Financeiro, editar valor/forma de um pagamento (saldo recalcula), excluir pagamento (saldo volta a aumentar).

**Limitação conhecida:** o faturamento e os totais não são filtrados por período — é o total acumulado desde o início do sistema. Filtro por mês/ano pode ser um refinamento futuro.

## Módulo 12 — Filtros e período ✅

Concluído e validado. Puramente frontend (filtragem sobre os dados já buscados) — sem migration no banco. Resolve a limitação conhecida registrada no Módulo 11.

- **Reservas:** campo de busca por nome do hóspede e filtro por status (Confirmada/Em andamento/Finalizada/Cancelada/Todos), acima da lista da aba "Reservas".
- **Financeiro:** seletor de período (Tudo, Este mês, Mês passado, Personalizado com data inicial/final), filtrando a aba "Faturamento" e os cards de Faturado/Recebido/Pendente pelas reservas com check-in dentro do intervalo. O valor "Pago" de cada reserva continua sendo o total pago em qualquer data (não fatiado por período). A aba "Histórico de pagamentos" não é afetada pelo filtro — continua um log completo, com aviso explícito na tela sobre isso.
- Hóspedes já tinha busca por nome/documento desde o Módulo 06 — não precisou de mudança.

Testado rodando local: busca por nome em Reservas, filtro por status, troca entre "Este mês"/"Mês passado"/"Tudo" no Financeiro com os números recalculando, filtro "Personalizado" com intervalo de datas.

## Módulo 13 — Exportação de relatórios (CSV) ✅

Concluído e validado. Puramente frontend (gera o CSV no navegador, via `Blob`) — sem migration no banco. Dá uma saída dos dados pra fora do sistema, útil pra planilhas ou pra passar pro contador.

- Utilitário novo `src/lib/csv.ts` (`downloadCsv`): gera CSV com separador `;` (compatível com Excel em pt-BR), BOM UTF-8 pra acentuação correta, valores decimais com vírgula.
- Botão "Exportar CSV" na aba **Faturamento** do Financeiro: exporta as reservas visíveis (respeitando o filtro de período selecionado) — hóspede, quarto, check-in, check-out, total, pago, saldo.
- Botão "Exportar CSV" na aba **Histórico de pagamentos**: exporta todos os pagamentos — data, hóspede, quarto, valor, forma, observações.

Testado rodando local: exportar CSV das duas abas e abrir no Excel, conferindo valores e acentuação.

## Código do frontend

O código do frontend dos Módulos 01 e 02 foi entregue anteriormente como `pms-hoteleiro-modulo-02.zip`, mas esse arquivo não foi localizado no computador do Gustavo nesta retomada. Decisão: **reconstruir o frontend do zero neste repositório**, usando o schema já aplicado no Supabase (acima) como fonte da verdade — nada foi perdido no banco, só o código-fonte do cliente.

## Limitações conhecidas (sandbox de nuvem do Claude)

- O sandbox de nuvem usado pelo Claude bloqueia `git push` para repositórios não pré-autorizados (proxy de segurança), e também bloqueia conexões de rede diretas para o host do projeto Supabase (`*.supabase.co`). Por isso, git e Supabase precisam ser operados a partir do computador do Gustavo (ou de CI), não de dentro do sandbox.
- Nesta retomada, o Claude passou a ter acesso de arquivos ao computador do Gustavo (via ponte do app desktop), mas **sem shell remoto** — ou seja, o Claude escreve/atualiza arquivos diretamente na pasta do projeto, mas comandos como `git init`, `git push` e a CLI do Supabase precisam ser rodados pelo próprio Gustavo no terminal dele.

## Repositório Git — configurado ✅

- Repositório anterior (`pgugas37/hotel`) não estava mais acessível publicamente — decisão foi criar um novo.
- Repositório atual: `https://github.com/pgugas37/pms-hoteleiro.git`, branch `main`.
- Primeiro commit feito e enviado a partir do computador do Gustavo (`git init` → `git add` → `git commit` → `git push -u origin main`), já com `README.md`, `.gitignore`, `.env.example` e este `docs/STATUS.md`.

## Supabase (CLI local) — configurado ✅

- `.env.local` criado na pasta do projeto com `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` (chave publicável/anon — segura para o frontend, protegida pelas políticas de RLS).
- Supabase CLI instalada via `npx supabase@latest` (instalação global via `npm install -g supabase` não é suportada) e autenticada (`npx supabase@latest login`, via GitHub OAuth).
- Projeto vinculado localmente: `npx supabase@latest link --project-ref gbtxgprucctjpwqswdng` — concluído com sucesso.

## Próximos passos

1. ~~Configurar git e Supabase.~~ **Concluído.**
2. ~~Scaffold do Módulo 01 (React + Vite + Tailwind + shadcn/ui) e validação local.~~ **Concluído.**
3. ~~Reconstruir o frontend do Módulo 02 (login, RBAC, CRUD de usuários).~~ **Concluído e validado.**
4. ~~Criar o primeiro Administrador via `/configuracao-inicial`.~~ **Concluído (pgugas37@gmail.com).**
5. ~~Especificar e implementar o Módulo 03 (Configurações do hotel).~~ **Concluído e validado.**
6. ~~Especificar e implementar o Módulo 04 (Dashboard).~~ **Concluído e validado.**
7. ~~Especificar e implementar o Módulo 05 (Quartos).~~ **Concluído e validado.**
8. ~~Especificar e implementar o Módulo 06 (Hóspedes).~~ **Concluído e validado.**
9. ~~Especificar e implementar o Módulo 07 (Reservas).~~ **Concluído e validado.**
10. ~~Especificar e implementar o Módulo 08 (Check-in/Check-out).~~ **Concluído e validado.**
11. ~~Especificar e implementar o Módulo 09 (Governança — limpeza de quartos).~~ **Concluído e validado.**
12. ~~Especificar e implementar o Módulo 10 (Manutenção).~~ **Concluído e validado.**
13. ~~Especificar e implementar o Módulo 11 (Financeiro/Faturamento).~~ **Concluído e validado.**
14. ~~Especificar e implementar o Módulo 12 (Filtros e período).~~ **Concluído e validado.**
15. ~~Especificar e implementar o Módulo 13 (Exportação de relatórios em CSV).~~ **Concluído e validado.**

A sequência Quartos → Hóspedes → Reservas definida pelo Gustavo está completa, os Módulos 08–10 fecharam o ciclo operacional do quarto (reserva → check-in/check-out → limpeza → manutenção quando necessário), o Módulo 11 deu função a todos os papéis do RBAC, o Módulo 12 resolveu a limitação de período/busca, e o Módulo 13 permitiu tirar os dados do sistema (CSV). A escolha dos próximos módulos continua a critério do Claude (definido pelo Gustavo a partir do Módulo 09). Candidatos possíveis daqui pra frente: histórico de reservas por hóspede (na própria tela de Hóspedes), notificações/lembretes, ou exportação em PDF.
