# PMS Hoteleiro (HotelFlow)

Sistema de gestão hoteleira (PMS — Property Management System) sob medida, desenvolvido módulo por módulo.

## Stack aprovada (Fase 0)

- **Frontend:** React 18 + TypeScript + Vite + Tailwind CSS + shadcn/ui + React Router + TanStack Query + Zod + React Hook Form
- **Gerenciador de pacotes:** pnpm
- **Backend:** Supabase (Postgres + Auth + RLS + Edge Functions)
- **Hospedagem do frontend:** Netlify
- **Versionamento:** Git real desde o Módulo 01 (sem depender de artefatos de sessão)

## Backend (Supabase)

- Projeto: `pms-hoteleiro`
- Região: `sa-east-1` (São Paulo)
- Ref do projeto: `gbtxgprucctjpwqswdng`
- URL: `https://gbtxgprucctjpwqswdng.supabase.co`

As credenciais de desenvolvimento local ficam em `.env.local` (não versionado — veja `.env.example`).

## Rodando localmente

```bash
npm install -g pnpm   # se ainda não tiver o pnpm instalado
pnpm install
pnpm dev
```

Abra o endereço que aparecer no terminal (normalmente `http://localhost:5173`). A página inicial confirma a conexão com o Supabase.

## Status

Veja [`docs/STATUS.md`](./docs/STATUS.md) para o histórico de decisões, módulos concluídos e próximos passos.

## Módulos

- [x] Módulo 01 — Fundação e arquitetura (concluído e validado)
- [x] Módulo 02 — Autenticação, usuários e permissões (concluído e validado)
- [x] Módulo 03 — Configurações do hotel (concluído e validado)
- [x] Módulo 04 — Dashboard (concluído e validado)
- [x] Módulo 05 — Quartos (concluído e validado)
- [x] Módulo 06 — Hóspedes (concluído e validado)
- [x] Módulo 07 — Reservas (concluído e validado)
- [x] Módulo 08 — Check-in/Check-out (concluído e validado)
- [x] Módulo 09 — Governança / limpeza de quartos (concluído e validado)
- [x] Módulo 10 — Manutenção (concluído e validado)
- [x] Módulo 11 — Financeiro / Faturamento (concluído e validado)
- [x] Módulo 12 — Filtros e período (concluído e validado)
- [x] Módulo 13 — Exportação de relatórios em CSV (concluído e validado)
- [x] Módulo 14 — Histórico de estadias por hóspede (concluído e validado)
- [x] Módulo 15 — Painel do dia (concluído e validado)
- [x] Módulo 16 — Recibo de pagamento em PDF (concluído e validado)
- [x] Módulo 17 — Observações internas por quarto/hóspede (concluído e validado)
- [x] Módulo 18 — Reserva em grupo (multi-quarto) e nome do ocupante (concluído e validado)
- [x] Módulo 19 — Mapa de ocupação (concluído e validado)
- [x] Módulo 20 — Indicadores de desempenho: ocupação, ADR e RevPAR (concluído e validado)
- [x] Módulo 21 — Ficha Nacional de Registro de Hóspede (FNRH) em PDF (concluído e validado)

> O schema do banco (Módulos 01 e 02) já está aplicado no Supabase. O código do frontend está sendo reconstruído neste repositório a partir do zero, usando o schema existente como referência.
