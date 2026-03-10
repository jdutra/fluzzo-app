-- ============================================================
-- 009 — Checklist de migrações pendentes
-- Execute no Supabase SQL Editor (cada bloco é idempotente)
-- ============================================================

-- ── DEPENDE DE: 006_leads_improvements.sql ──────────────────
-- Se ainda não executou a migration 006, rode este bloco:

create table if not exists lead_products (
  id uuid primary key default uuid_generate_v4(),
  lead_id uuid references leads(id) on delete cascade,
  product_id uuid references products(id) on delete cascade,
  created_at timestamptz default now(),
  unique(lead_id, product_id)
);

alter table lead_products enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'lead_products'
      and policyname = 'Authenticated users manage lead_products'
  ) then
    execute $policy$
      create policy "Authenticated users manage lead_products"
        on lead_products for all
        using (auth.role() = 'authenticated')
        with check (auth.role() = 'authenticated')
    $policy$;
  end if;
end $$;

-- Migra product_id existente para a nova tabela
insert into lead_products (lead_id, product_id)
select id, product_id from leads
where product_id is not null
on conflict (lead_id, product_id) do nothing;

-- ── DEPENDE DE: 007_projects_improvements.sql ───────────────

alter table projects
  add column if not exists billing_start_date date;

create table if not exists project_products (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid references projects(id) on delete cascade,
  product_id uuid references products(id) on delete cascade,
  created_at timestamptz default now(),
  unique(project_id, product_id)
);

alter table project_products enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'project_products'
      and policyname = 'Authenticated users manage project_products'
  ) then
    execute $policy$
      create policy "Authenticated users manage project_products"
        on project_products for all
        using (auth.role() = 'authenticated')
        with check (auth.role() = 'authenticated')
    $policy$;
  end if;
end $$;

-- ── DEPENDE DE: 008_classifications.sql ─────────────────────

create table if not exists classifications (
  id uuid primary key default uuid_generate_v4(),
  company_id uuid references companies(id),
  name text not null,
  type text check (type in ('entrada', 'saida', 'ambos')) default 'ambos',
  active boolean default true,
  created_at timestamptz default now(),
  unique(company_id, name)
);

alter table classifications enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'classifications'
      and policyname = 'Authenticated users manage classifications'
  ) then
    execute $policy$
      create policy "Authenticated users manage classifications"
        on classifications for all
        using (auth.role() = 'authenticated')
        with check (auth.role() = 'authenticated')
    $policy$;
  end if;
end $$;
