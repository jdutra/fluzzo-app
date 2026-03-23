-- ============================================================
-- 018 — Novos campos: CNPJ em clientes, PIX em parceiros,
--       valor por produto em lead_products
-- ============================================================

-- CNPJ no cadastro de clientes
alter table clients add column if not exists cnpj text;

-- PIX no cadastro de parceiros
alter table partners add column if not exists pix text;

-- Valor individual por produto no lead
alter table lead_products add column if not exists value numeric(12,2);

notify pgrst, 'reload schema';
