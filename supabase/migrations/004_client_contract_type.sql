-- ============================================================
-- 004 — Clientes: campo tipo de contrato (livre)
-- Execute no Supabase SQL Editor
-- ============================================================

-- Adicionar campo tipo_contrato na tabela clients (texto livre)
alter table clients
  add column if not exists contract_type text;
