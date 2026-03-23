-- ============================================================
-- 019 — Hierarquia em classificações + mapeamentos padrão de projeto
-- ============================================================

-- Hierarquia e totalizador nas classificações
alter table classifications
  add column if not exists parent_id uuid references classifications(id) on delete set null;

alter table classifications
  add column if not exists is_totalizador boolean default false not null;

alter table classifications
  add column if not exists sort_order int default 0 not null;

-- Classificações padrão para os tipos de lançamento gerados por projetos
alter table companies
  add column if not exists default_class_recebimento text;  -- ex: "Receita de Projetos"

alter table companies
  add column if not exists default_class_fee text;          -- ex: "Fee Parceiro"

alter table companies
  add column if not exists default_class_imposto text;      -- ex: "Impostos sobre NF"

alter table companies
  add column if not exists default_class_consultor text;    -- ex: "Pagamento Consultor"

notify pgrst, 'reload schema';
