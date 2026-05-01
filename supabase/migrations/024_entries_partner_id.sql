-- Adiciona referência ao parceiro nos lançamentos (fee de parceiro)
alter table entries
  add column if not exists partner_id uuid references partners(id) on delete set null;
