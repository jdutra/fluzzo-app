-- Adiciona valor negociado por produto no projeto (populado na conversão do lead)
alter table project_products
  add column if not exists value numeric(12,2);
