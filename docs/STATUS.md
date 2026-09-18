# Status do projeto — PMS Hoteleiro (HotelFlow)

_Última atualização: 17/09/2026_

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
- Tabelas: `public.profiles`, `public.hotels`, `public.audit_log`, `public.room_types`, `public.rooms`, `public.guests` (todas com RLS habilitado).

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

- Todos os usuários: card de boas-vindas (nome, papel) e resumo do hotel (nome, cidade/UF), com link para "Configurações".
- Só admin (única role com permissão de leitura nessas tabelas via RLS): contagem de usuários por papel e por status (ativo/inativo), com link para "Usuários"; feed das últimas atividades em `audit_log` (quem fez o quê, quando), com nome do autor resolvido via `profiles`.
- Aviso fixo informando que indicadores operacionais (ocupação, reservas, receita) chegam com os módulos de Quartos e Reservas.
- Observação: hoje o `audit_log` só registra criação/edição de usuário (não há trigger de auditoria em `hotels`), então o feed de atividade começa com poucos registros — isso é esperado, não é bug.

Testado rodando local: painel exibindo os dados reais do hotel (MILLENIUM HOTEL), contagem de usuários e a atividade recente (criação do admin).

## Módulo 05 — Quartos ✅

Concluído e validado. Duas tabelas novas no Supabase (migration `0009_module05_rooms`), com RLS igual ao padrão do Módulo 03 (todo autenticado lê, só admin cria/edita/exclui):

- `room_types` — tipos de quarto (nome, descrição, capacidade de adultos/crianças, preço base da diária).
- `rooms` — unidades físicas (número único, vínculo com o tipo, andar, status operacional: disponível/manutenção/inativo, observações). `room_type_id` referencia `room_types` com `on delete restrict`, então não é possível excluir um tipo com quartos vinculados (a tela trata esse erro com uma mensagem amigável).

**Frontend:** página `/quartos` (link "Quartos" no menu), com duas seções — "Tipos de quarto" e "Quartos" — cada uma com tabela de listagem e cadastro/edição via modal. Só admin vê os botões de ações; os demais papéis só visualizam.

Testado rodando local: cadastro de tipo de quarto, cadastro de quarto vinculado ao tipo, edição e exclusão funcionando.

## Módulo 06 — Hóspedes

Especificado e implementado. Nova tabela `guests` no Supabase (migration `0010_module06_guests`), com RLS diferente do padrão anterior: leitura para todo autenticado; criação/edição para **admin, gerente e recepção** (via nova função `private.has_role(roles)`, generalização de `private.is_admin()`); exclusão só admin.

- Campos: nome completo, documento (CPF, CNPJ ou passaporte + número, único por tipo — CNPJ cobre hóspede/empresa com faturamento via CNPJ), e-mail e telefone (opcionais), data de nascimento (opcional), nacionalidade (padrão "Brasileira"), observações. Sem campo de profissão (decisão do Gustavo).
- Máscara de CPF/CNPJ no formulário conforme o tipo de documento selecionado.

**Frontend:** página `/hospedes` (link "Hóspedes" no menu), com busca por nome ou documento e cadastro/edição via modal. Delete bloqueado se houver reservas vinculadas (`on delete restrict`, tratado com mensagem amigável), preparando o terreno pro Módulo 07.

Falta validar rodando localmente.

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
8. ~~Especificar e implementar o Módulo 06 (Hóspedes).~~ **Implementado — falta validar rodando localmente (`pnpm dev`, acessar `/hospedes`).**
9. Módulo 07 — Reservas (próximo).
