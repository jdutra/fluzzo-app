-- ============================================================
-- 012 — Garante todas as colunas da tabela leads
-- Execute no Supabase SQL Editor
-- ============================================================

alter table leads add column if not exists company_id         uuid references companies(id);
alter table leads add column if not exists client_id          uuid references clients(id);
alter table leads add column if not exists product_id         uuid references products(id);
alter table leads add column if not exists estimated_value    numeric(12,2);
alter table leads add column if not exists stage              text default 'qualificacao';
alter table leads add column if not exists responsible        text;
alter table leads add column if not exists lost_reason        text;
alter table leads add column if not exists notes              text;
alter table leads add column if not exists next_step          text;
alter table leads add column if not exists next_step_date     date;
alter table leads add column if not exists converted_project_id uuid;
alter table leads add column if not exists updated_at         timestamptz default now();

-- Recria trigger de updated_at (idempotente)
create or replace function update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists leads_updated_at on leads;
create trigger leads_updated_at
  before update on leads
  for each row execute function update_updated_at_column();

-- Recarrega schema cache
notify pgrst, 'reload schema';
