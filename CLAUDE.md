# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # start dev server at localhost:3000
npm run build    # production build (validates TypeScript + Next.js)
npm run lint     # ESLint via next lint
```

There are no automated tests. Validation is done manually via the UI or Vercel preview deployments.

## Environment

```env
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
ANTHROPIC_API_KEY=sk-ant-...   # used by the in-app help chat (/api/chat)
```

## Architecture Overview

**Fluzzo** is a single-tenant SaaS for managing the full commercial cycle of a consulting firm: leads → projects → billing entries → cash flow.

### Stack

- **Next.js 14 App Router** — all dashboard routes are `'use client'`; mutations go through Next.js Server Actions
- **Supabase** — PostgreSQL + Auth (email/password). One company per database instance.
- **TanStack Query** — all client-side data fetching and cache invalidation
- **shadcn/ui** + **Tailwind CSS** — UI components
- **react-hook-form** + **zod** — form validation

### Key Directory Structure

```
app/
  (dashboard)/          # all authenticated pages (layout has Sidebar + Topbar + FluzzoHelp)
    leads/              # CRM pipeline
    projetos/[id]/      # project detail (consultants, partners, entries)
    lancamentos/        # monthly billing entries table
    fluxo/              # annual cash flow spreadsheet
    classificacoes/     # classification hierarchy for entries
    empresa/            # company settings (encargos, defaults, saldo inicial)
    clientes/ consultores/ parceiros/ produtos/ vendedores/ metas/ extrato/ indicadores/
  api/chat/route.ts     # streaming AI help chat (claude-haiku-4-5)
  login/                # public auth page

lib/
  supabase/
    client.ts           # browser Supabase client
    server.ts           # server-side Supabase client (for Server Actions + Server Components)
    types.ts            # ⚠️ MANUALLY maintained TypeScript types — update here when adding DB columns
  actions/
    entries.ts          # create/update/delete financial entries (Server Actions)
    projects.ts         # addProjectConsultant, addProjectPartner (auto-generate entries)
    leads.ts            # convertLeadToProject (copies products, generates entries, promotes client)
    audit.ts            # writes to audit_log on status/amount changes
  utils.ts              # formatCurrency, formatDate, status label/color maps

components/
  forms/                # Sheet-based forms (client-sheet, lead-sheet, project-sheet, etc.)
  shared/fluzzo-help.tsx # floating AI help widget (calls /api/chat)
  layout/               # Sidebar, Topbar
  ui/                   # shadcn/ui primitives

supabase/migrations/    # numbered SQL migration files (001–030)
```

### Core Data Model

The central flow is:

**Lead** → (convert) → **Project** → (auto-generate) → **Entries** → (status flow) → paid

- **entries** is the core financial table. Every revenue and expense line is an entry.
  - `status`: `previsto → faturado → pago` (or `previsto → pago` directly) — or `cancelado`
  - `classification`: string matching a row in the `classifications` table
  - `consultant_id` / `partner_id`: nullable — identifies who the payment is for
  - `is_manual`: false = auto-generated; true = created manually in the UI

- **companies** is a single row (single-tenant). It stores:
  - `encargo_simples`, `encargo_retirada` — used to calculate net revenue
  - `default_class_recebimento/fee/consultor` — classification names used when auto-generating entries
  - `saldo_inicial`, `data_saldo_inicial` — cash flow starting balance

- **classifications** hierarchy (parent → child). `is_totalizador = true` = group header, never used on entries. `type` = `entrada | saida | ambos`.

### Supabase Type System — Important Warning

`lib/supabase/types.ts` is **manually maintained** (not Supabase CLI generated). It exports plain TypeScript types (`Company`, `Client`, `Lead`, etc.) — **not** a `Database` type in the format `supabase-js` v2 expects.

This causes a persistent TypeScript error on all `.insert()` / `.update()` calls:
```
Argument of type '{...}' is not assignable to parameter of type 'never'
```

**This is a known, pre-existing, non-blocking error.** Do not try to fix it by regenerating types. To suppress it in a specific call, cast the payload: `supabase.from('table').insert(payload as any)`.

The app builds and runs correctly despite these TS errors — Vercel deploys successfully.

### Data Fetching Pattern

All dashboard pages use TanStack Query for reads and Server Actions for writes:

```tsx
// Read
const { data } = useQuery({ queryKey: ['entries', period], queryFn: async () => { ... } })

// Write (Server Action)
const mutation = useMutation({
  mutationFn: async () => await someServerAction(params),
  onSuccess: () => queryClient.invalidateQueries({ queryKey: ['entries'] }),
})
```

Server Actions live in `lib/actions/` and are called directly from client components. They use `createClient()` from `lib/supabase/server.ts` and call `revalidatePath()` after mutations.

### Auto-generated Entries

Three actions auto-generate `entries` rows:

| Trigger | Action | Entry type |
|---------|--------|------------|
| Create project with installments | `generateProjectEntries` | Revenue (client) |
| Add consultant to project | `addProjectConsultant` | Debit (consultant_id) |
| Add partner to project | `addProjectPartner` | Debit (partner_id) |
| Convert lead to project | `convertLeadToProject` | Revenue + fee entries |

Fee for partners is calculated on **net revenue**: `revenue × (1 − encargo_simples)`.

### Cash Flow Page (`/fluxo`)

The spreadsheet computes everything client-side in a single `useMemo` from:
- `entries` (filtered by year, split by classification `type`)
- `cash_forecast_manual` (manual non-operational items)
- `company.saldo_inicial`

Toggle between **Previsto** (uses `forecast_payment`, all non-cancelled) and **Realizado** (uses `paid_at`, only `status = 'pago'`).

Classification rows are rendered in `sort_order` from the `classifications` table.

### Migrations

SQL migrations live in `supabase/migrations/` numbered sequentially (001–030). Apply them manually in the Supabase Dashboard SQL Editor. The project is not linked with `supabase link`.

### In-app Help Chat

`components/shared/fluzzo-help.tsx` renders a floating chat button present on all dashboard pages. It streams responses from `/api/chat/route.ts`, which calls `claude-haiku-4-5` with a detailed system prompt describing all modules. To update what the assistant knows, edit the `SYSTEM_PROMPT` constant in `app/api/chat/route.ts`.
