-- ============================================================
-- 011 — Corrige colunas ausentes na tabela leads
-- Execute no Supabase SQL Editor
-- ============================================================

-- Adiciona client_id caso não exista
alter table leads
  add column if not exists client_id uuid references clients(id);

-- Adiciona next_step caso não exista
alter table leads
  add column if not exists next_step text;

-- Adiciona next_step_date caso não exista
alter table leads
  add column if not exists next_step_date date;

-- Adiciona lost_reason caso não exista
alter table leads
  add column if not exists lost_reason text;

-- Adiciona responsible caso não exista
alter table leads
  add column if not exists responsible text;

-- Adiciona notes caso não exista
alter table leads
  add column if not exists notes text;

-- Adiciona converted_project_id caso não exista
alter table leads
  add column if not exists converted_project_id uuid;

-- Recarrega schema cache do PostgREST
notify pgrst, 'reload schema';
