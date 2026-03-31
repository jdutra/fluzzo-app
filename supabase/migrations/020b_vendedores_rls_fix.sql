-- Migration 020b: Corrige RLS da tabela vendedores
-- Executar no Supabase SQL Editor APÓS a migration 020

-- Remove a policy problemática
drop policy if exists "vendedores_company_all" on vendedores;

-- Recria com política simples: qualquer usuário autenticado pode gerenciar vendedores
-- (padrão de tabelas internas deste app — mesma abordagem das demais tabelas)
create policy "vendedores_authenticated_all"
  on vendedores for all
  using (auth.uid() is not null)
  with check (auth.uid() is not null);

notify pgrst, 'reload schema';
