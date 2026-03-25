-- Migration 020: Tabela de vendedores (equipe comercial)
-- Executar no Supabase SQL Editor

create table if not exists vendedores (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid references companies(id) on delete cascade,
  name        text not null,
  email       text,
  phone       text,
  role        text,          -- ex: 'Sócio', 'Consultor Comercial', 'SDR'
  active      boolean not null default true,
  notes       text,
  created_at  timestamptz not null default now()
);

-- RLS
alter table vendedores enable row level security;

create policy "vendedores_company_all"
  on vendedores for all
  using (
    company_id = (
      select company_id from profiles
      where id = auth.uid()
      limit 1
    )
  )
  with check (
    company_id = (
      select company_id from profiles
      where id = auth.uid()
      limit 1
    )
  );

notify pgrst, 'reload schema';
