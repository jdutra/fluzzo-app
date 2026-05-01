-- Adiciona parcelamento no pagamento de fee de parceiros
alter table project_partners
  add column if not exists installments integer not null default 1;
