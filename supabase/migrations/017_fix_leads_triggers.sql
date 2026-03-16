-- ============================================================
-- 017 — Remove todos os triggers legados da tabela leads
--       e recria apenas o trigger de updated_at (Fluzzo)
-- ============================================================

-- 1. Remove TODOS os triggers existentes na tabela leads
do $$
declare
  trig record;
begin
  for trig in
    select trigger_name
    from information_schema.triggers
    where event_object_schema = 'public'
      and event_object_table = 'leads'
  loop
    execute format('drop trigger if exists %I on leads', trig.trigger_name);
    raise notice 'Dropped trigger: %', trig.trigger_name;
  end loop;
end $$;

-- 2. Recria a função de updated_at (limpa, sem referências legadas)
create or replace function update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- 3. Recria apenas o trigger de updated_at
create trigger leads_updated_at
  before update on leads
  for each row execute function update_updated_at_column();

notify pgrst, 'reload schema';
