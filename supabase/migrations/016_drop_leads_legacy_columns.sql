-- ============================================================
-- 016 — Remove todas as colunas legadas do app agrícola da tabela leads
-- Colunas Fluzzo mantidas:
--   id, created_at, updated_at, title, client_id, company_id,
--   product_id, estimated_value, stage, responsible, lost_reason,
--   notes, next_step, next_step_date, converted_project_id
-- ============================================================

do $$
declare
  legacy_cols text[] := array[
    'service_id',
    'provider_id',
    'agricultor_name',
    'agricultor_phone',
    'area_hectares',
    'culture',
    'crop',
    'harvest',
    'location',
    'latitude',
    'longitude',
    'farm_name',
    'farm_id',
    'activity',
    'activity_id',
    'application_date',
    'visit_date',
    'technician_id',
    'technician_name',
    'observation',
    'status_agro',
    'tipo',
    'tipo_id',
    'quantidade',
    'unidade',
    'valor_unitario',
    'descricao',
    'safra',
    'talhao',
    'variedade',
    'dose'
  ];
  col text;
begin
  foreach col in array legacy_cols loop
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public'
        and table_name   = 'leads'
        and column_name  = col
    ) then
      execute format('alter table leads drop column %I cascade', col);
      raise notice 'Dropped column: %', col;
    end if;
  end loop;
end $$;

notify pgrst, 'reload schema';
