-- ============================================================
-- 022 — Indicadores KPI configuráveis
-- ============================================================

create table if not exists kpi_indicators (
  id          uuid primary key default uuid_generate_v4(),
  company_id  uuid references companies(id) on delete cascade,
  name        text not null,
  color       text default 'teal',          -- teal | blue | violet | amber | rose | emerald
  components  jsonb not null default '[]',  -- array de { type, category?, sign }
  show_percent       boolean default false,
  percent_base_components jsonb default '[]',
  sort_order  int  default 0 not null,
  active      boolean default true not null,
  created_at  timestamptz default now()
);

-- RLS
alter table kpi_indicators enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename  = 'kpi_indicators'
      and policyname = 'Authenticated users manage kpi_indicators'
  ) then
    execute $policy$
      create policy "Authenticated users manage kpi_indicators"
        on kpi_indicators for all
        using  (auth.uid() is not null)
        with check (auth.uid() is not null)
    $policy$;
  end if;
end $$;

-- Seed: indicadores-padrão (margem operacional e cobertura de saídas)
-- serão inseridos apenas se não existirem registros na tabela ainda.
-- (Ajuste company_id conforme necessário; NULL = todos)

notify pgrst, 'reload schema';
