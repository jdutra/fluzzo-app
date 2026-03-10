# Fluzzo

SaaS gerencial de leads e financeiro para consultoras e empresas de serviço.

## Stack

- **Next.js 14** (App Router)
- **Supabase** (PostgreSQL + Auth)
- **Tailwind CSS** + **shadcn/ui**
- **TanStack Query**

## Setup rápido

### 1. Banco de dados (Supabase)

1. Acesse [supabase.com](https://supabase.com) e abra seu projeto
2. Vá em **SQL Editor** e rode (nesta ordem):
   - `supabase/migrations/001_schema.sql`
   - `supabase/seed.sql`

### 2. Variáveis de ambiente

```bash
cp .env.local.example .env.local
```

Preencha no `.env.local` com os dados de **Settings > API** do seu projeto Supabase:

```env
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
```

> **Atenção:** A senha do banco de dados Supabase **não vai aqui**.
> O `.env.local` usa apenas a URL e a Anon Key públicas.

### 3. Rodar localmente

```bash
npm install
npm run dev
```

Acesse: [http://localhost:3000](http://localhost:3000)

## Estrutura de sprints

| Sprint | Módulos |
|--------|---------|
| ✅ Sprint 1 | Fundação: auth, layout, dashboard, schema SQL |
| Sprint 2 | CRUDs: Clientes, Consultores, Parceiros, Produtos |
| Sprint 3 | CRM: Leads, Pipeline, Interações |
| Sprint 4 | Projetos: criação, consultores, parceiros, lançamentos |
| Sprint 5 | Lançamentos, Fluxo de Caixa, Metas |
| Sprint 6 | Dashboards gerenciais |

## Deploy (Vercel)

1. Push para GitHub
2. Import no [vercel.com](https://vercel.com)
3. Adicionar env vars nas configurações do projeto
4. Deploy automático a cada `git push main`
