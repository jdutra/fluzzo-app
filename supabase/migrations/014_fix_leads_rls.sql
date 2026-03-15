-- Migration 014: Fix RLS policies on leads table
-- The leads table came from a different project with incompatible policies.
-- Drop all existing policies and recreate with full authenticated access.

-- Drop all existing policies on leads
do $$
declare
  pol record;
begin
  for pol in
    select policyname
    from pg_policies
    where tablename = 'leads' and schemaname = 'public'
  loop
    execute format('drop policy if exists %I on leads', pol.policyname);
  end loop;
end $$;

-- Drop all existing policies on lead_interactions too (same root cause)
do $$
declare
  pol record;
begin
  for pol in
    select policyname
    from pg_policies
    where tablename = 'lead_interactions' and schemaname = 'public'
  loop
    execute format('drop policy if exists %I on lead_interactions', pol.policyname);
  end loop;
end $$;

-- Recreate: authenticated users have full access to leads
create policy "Authenticated full access"
  on leads for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- Recreate: authenticated users have full access to lead_interactions
create policy "Authenticated full access"
  on lead_interactions for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- Also fix lead_products if it exists
do $$
begin
  if exists (select 1 from information_schema.tables where table_name = 'lead_products' and table_schema = 'public') then
    -- Drop existing policies
    perform 1; -- placeholder, do inline below
  end if;
end $$;

do $$
declare
  pol record;
begin
  for pol in
    select policyname
    from pg_policies
    where tablename = 'lead_products' and schemaname = 'public'
  loop
    execute format('drop policy if exists %I on lead_products', pol.policyname);
  end loop;
end $$;

create policy "Authenticated full access"
  on lead_products for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

notify pgrst, 'reload schema';
