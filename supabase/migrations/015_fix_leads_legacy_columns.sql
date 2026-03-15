-- Migration 015: Remove NOT NULL constraints from legacy columns
-- The leads table came from an agricultural app with columns like
-- service_id, provider_id, agricultor_name, area_hectares etc.
-- These are irrelevant to Fluzzo and must not block inserts.

-- Make legacy columns nullable (safe even if they don't exist)
do $$
begin
  -- service_id
  if exists (
    select 1 from information_schema.columns
    where table_name = 'leads' and column_name = 'service_id' and table_schema = 'public'
  ) then
    alter table leads alter column service_id drop not null;
  end if;

  -- provider_id
  if exists (
    select 1 from information_schema.columns
    where table_name = 'leads' and column_name = 'provider_id' and table_schema = 'public'
  ) then
    alter table leads alter column provider_id drop not null;
  end if;

  -- agricultor_name
  if exists (
    select 1 from information_schema.columns
    where table_name = 'leads' and column_name = 'agricultor_name' and table_schema = 'public'
  ) then
    alter table leads alter column agricultor_name drop not null;
  end if;

  -- area_hectares
  if exists (
    select 1 from information_schema.columns
    where table_name = 'leads' and column_name = 'area_hectares' and table_schema = 'public'
  ) then
    alter table leads alter column area_hectares drop not null;
  end if;

  -- culture (other possible legacy column)
  if exists (
    select 1 from information_schema.columns
    where table_name = 'leads' and column_name = 'culture' and table_schema = 'public'
  ) then
    alter table leads alter column culture drop not null;
  end if;
end $$;

notify pgrst, 'reload schema';
