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

> O schema do banco (Módulos 01 e 02) já está aplicado no Supabase. O código do frontend está sendo reconstruído neste repositório a partir do zero, usando o schema existente como referência.
