-- ============================================================
-- 010 — Clientes: tipo 'Lead', tabela de contatos e reload schema
-- Execute no Supabase SQL Editor
-- ============================================================

-- 1. Adiciona 'Lead' ao tipo de cliente
--    (remove constraint antiga e recria com os 3 valores)
alter table clients
  drop constraint if exists clients_type_check;

alter table clients
  add constraint clients_type_check
  check (type in ('Fluzzo', 'Cliente', 'Lead'));

-- 2. Tabela de contatos do cliente (múltiplos, por área)
create table if not exists client_contacts (
  id          uuid primary key default uuid_generate_v4(),
  client_id   uuid references clients(id) on delete cascade not null,
  name        text not null,
  role        text,   -- 'Compras', 'Financeiro', 'Projetos', etc.
  email       text,
  phone       text,
  is_primary  boolean default false,
  created_at  timestamptz default now()
);

alter table client_contacts enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename  = 'client_contacts'
      and policyname = 'Authenticated full access on client_contacts'
  ) then
    execute $policy$
      create policy "Authenticated full access on client_contacts"
        on client_contacts for all
        using (auth.role() = 'authenticated')
        with check (auth.role() = 'authenticated')
    $policy$;
  end if;
end $$;

-- 3. Recarrega o schema cache do PostgREST
--    (corrige erros "column not found in schema cache")
notify pgrst, 'reload schema';
