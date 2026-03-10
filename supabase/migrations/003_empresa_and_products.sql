-- ============================================================
-- 003 — Empresa: cidade/estado + contatos | Produtos: tipo livre
-- Execute no Supabase SQL Editor
-- ============================================================

-- 1. Remover CHECK constraint de products.type (tipo agora é livre)
alter table products drop constraint if exists products_type_check;

-- 2. Adicionar cidade e estado na tabela companies
alter table companies
  add column if not exists city text,
  add column if not exists state char(2);

-- 3. Criar tabela de contatos da empresa (múltiplos contatos)
create table if not exists company_contacts (
  id uuid primary key default uuid_generate_v4(),
  company_id uuid references companies(id) on delete cascade,
  name text not null,
  role text,         -- ex: Relacionamento, Financeiro, Comercial
  email text,
  phone text,
  is_primary boolean default false,
  created_at timestamptz default now()
);

-- RLS para company_contacts
alter table company_contacts enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'company_contacts'
      and policyname = 'Authenticated users manage company_contacts'
  ) then
    execute $policy$
      create policy "Authenticated users manage company_contacts"
        on company_contacts for all
        using (auth.role() = 'authenticated')
        with check (auth.role() = 'authenticated')
    $policy$;
  end if;
end $$;
