-- ============================================================
-- 013 — Adiciona coluna title à tabela leads
-- A tabela leads existia de outro sistema, faltava apenas title
-- Execute no Supabase SQL Editor
-- ============================================================

ALTER TABLE leads ADD COLUMN IF NOT EXISTS title text;

NOTIFY pgrst, 'reload schema';
