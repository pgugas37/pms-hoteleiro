# PMS Hoteleiro (HotelFlow) — guia de orientação para o Claude Code

Este arquivo é lido automaticamente pelo Claude Code ao abrir este repositório. Ele existe para que qualquer sessão nova (neste computador, em outro computador, ou depois de uma reinstalação) consiga entender o estado atual do projeto sem precisar que o Gustavo reexplique tudo do zero.

## Regra nº 1: leia `docs/STATUS.md` inteiro antes de fazer qualquer coisa

`docs/STATUS.md` é a fonte da verdade do projeto: todas as decisões de arquitetura, os 27 módulos já concluídos e validados (com o que cada um faz, as tabelas/migrations que criou, e como foi testado), a fase de "Finalização" (layout + deploy), limitações conhecidas e os próximos passos. Antes de sugerir ou implementar qualquer mudança, leia esse arquivo do início ao fim. Não repita trabalho que já existe, e siga os mesmos padrões já estabelecidos (veja "Convenções" abaixo).

Se em algum momento o `docs/STATUS.md` deste repositório parecer desatualizado ou incompleto em relação ao que você vê no código, confie no código e avise o Gustavo da divergência — não presuma que o código está errado.

## O que é o sistema

PMS (Property Management System) sob medida para o **Millenium Hotel**, feito módulo por módulo a pedido do Gustavo Pereira. Sistema completo de gestão hoteleira: autenticação/RBAC, quartos, hóspedes, reservas (com trava anti-overbooking no banco), check-in/check-out, governança (limpeza), manutenção, financeiro/faturamento, relatórios (CSV, PDF), mapa de ocupação, indicadores (ocupação/ADR/RevPAR), auditoria, busca global, lembretes automáticos, e mais. Todos os 27 módulos planejados estão concluídos e validados, e o sistema está em produção.

## Stack e fatos-chave

- **Frontend:** React 18 + TypeScript + Vite + Tailwind CSS + shadcn/ui + React Router + TanStack Query + Zod + React Hook Form, gerenciado com `pnpm`.
- **Backend:** Supabase (Postgres + Auth + RLS + Edge Functions). Projeto `pms-hoteleiro`, org "GUSTAVO PEREIRA NETWORK", região `sa-east-1`, ref `gbtxgprucctjpwqswdng`.
- **Deploy:** Netlify, deploy contínuo a partir deste repositório (branch `main`). URL de produção: **https://gustavo-hotelflow-pms.netlify.app**. Config em `netlify.toml`.
- **Repositório:** `https://github.com/pgugas37/pms-hoteleiro` (branch `main`).
- **Rodando localmente:** `pnpm install && pnpm dev` (precisa de um `.env.local` com `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` — veja `.env.example`; são credenciais públicas/anon, protegidas por RLS).

## Convenções já estabelecidas (siga estas ao continuar o projeto)

- **Migrations**: nomeadas por módulo (`moduloNN_descrição`). RLS habilitado em toda tabela nova. Padrão de permissão mais comum: leitura para todo autenticado, escrita para admin/gerente/recepção conforme o caso (via `private.has_role(roles)`), exclusão restrita a admin. Operações que precisam manter duas tabelas sincronizadas na mesma transação (ex.: reserva + status do quarto) usam funções RPC `security definer` com checagem de papel manual dentro da função, não update direto.
- **Exclusão de registros com histórico** (hóspedes, reservas): nunca exclusão física quando há dependências — usa-se `active`/soft-delete ou RLS que só libera exclusão em status terminal (ex.: reserva só pode ser excluída se `cancelada` ou `finalizada`).
- **Auditoria**: mudanças em `profiles`, `reservations` e `payments` são logadas automaticamente em `audit_log` via triggers (`private.log_*_change()`), visível em `/auditoria` (admin) e no card "Atividade recente" do Dashboard.
- **Geração de PDF** (recibo, FNRH, relatório mensal): tudo client-side via `jspdf`, utilitários em `src/lib/` (`receipt.ts`, `registration.ts`, `monthlyReport.ts`).
- **Depois de qualquer mudança relevante**: atualize `docs/STATUS.md` (nova seção de módulo, ou nota em "Limitações conhecidas"/"Próximos passos") no mesmo commit ou em um commit separado logo em seguida — é assim que o projeto sobrevive a reinícios de sessão/ambiente.
- **Gotchas de tooling do pnpm no computador do Gustavo** (já resolvidos, mas documentados em `docs/STATUS.md` módulos 08/16/18 caso reapareçam): política `minimumReleaseAge` do pnpm pode bloquear instalação de pacotes recém-publicados (`pnpm config set minimumReleaseAge 0`); avisos `ERR_PNPM_IGNORED_BUILDS` em dependências como `core-js` são inofensivos.

## O que NÃO presumir

- As limitações de sandbox descritas no final de `docs/STATUS.md` ("Limitações conhecidas — sandbox de nuvem do Claude") eram específicas do ambiente de nuvem usado em sessões anteriores do Cowork/Claude — **não se aplicam ao Claude Code rodando no computador do Gustavo**. Aqui, `git push` e conexões diretas ao Supabase devem funcionar normalmente.
- Não existe mais nenhum módulo "pendente de autorização" — o projeto está funcionalmente completo. Qualquer novo módulo é uma decisão nova do Gustavo (ele definiu, a partir do Módulo 09, que a escolha de novos módulos fica a critério do Claude quando ele pedir sugestões — mas isso não significa que falta algo hoje).
