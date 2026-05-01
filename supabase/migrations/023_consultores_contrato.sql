-- Adiciona campos de data de início e controle de contrato nos consultores
alter table consultants
  add column if not exists start_date date,
  add column if not exists has_contract boolean default false,
  add column if not exists contract_url text;
