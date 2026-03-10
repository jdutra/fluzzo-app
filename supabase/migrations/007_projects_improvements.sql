-- ============================================================
-- 007 — Projetos: início faturamento + produtos por projeto
-- Execute no Supabase SQL Editor
-- ============================================================

-- 1. Data de início de faturamento
alter table projects
  add column if not exists billing_start_date date;

-- 2. Tabela de produtos vinculados ao projeto (múltiplos)
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
