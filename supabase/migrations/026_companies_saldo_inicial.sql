-- Adiciona saldo inicial de caixa no cadastro da empresa
alter table companies
  add column if not exists saldo_inicial numeric(12,2) default 0,
  add column if not exists data_saldo_inicial date;
