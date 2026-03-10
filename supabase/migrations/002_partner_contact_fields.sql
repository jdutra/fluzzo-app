-- ============================================================
-- 002 — Campos de contato e status em parceiros
-- Execute no Supabase SQL Editor
-- ============================================================

-- Adicionar campos de contato e status na tabela partners
alter table partners
  add column if not exists email text,
  add column if not exists phone text,
  add column if not exists status text not null default 'ativo' check (status in ('ativo', 'inativo'));

-- Índice para filtrar por status
create index if not exists partners_status_idx on partners(status);
