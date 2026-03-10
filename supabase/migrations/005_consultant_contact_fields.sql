-- ============================================================
-- 005 — Consultores: contato + PIX separado PF/PJ
-- Execute no Supabase SQL Editor
-- ============================================================

-- Renomear campo 'pix' existente para 'pix_pf' e adicionar novos campos
alter table consultants
  rename column pix to pix_pf;

alter table consultants
  add column if not exists email text,
  add column if not exists phone text,
  add column if not exists pix_pj text;
