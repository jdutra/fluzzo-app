-- ============================================================
-- 021 — Histórico de estágios de leads + fix RLS projetos
-- Execute no Supabase SQL Editor
-- ============================================================

-- ── 1. Tabela de histórico de estágios ───────────────────────
create table if not exists lead_stage_history (
  id          uuid primary key default uuid_generate_v4(),
  lead_id     uuid references leads(id) on delete cascade not null,
  from_stage  text,                          -- null = criação do lead
  to_stage    text not null,
  changed_at  timestamptz default now()
);

alter table lead_stage_history enable row level security;

create policy "Authenticated full access"
  on lead_stage_history for all
  using  (auth.uid() is not null)
  with check (auth.uid() is not null);

-- Índice para consultas por lead
create index if not exists lead_stage_history_lead_id_idx
  on lead_stage_history (lead_id, changed_at);

-- ── 2. Trigger: registra transições de estágio ───────────────
create or replace function fn_record_lead_stage_change()
returns trigger
language plpgsql
security definer
as $$
begin
  if TG_OP = 'INSERT' then
    -- Registra o estágio inicial ao criar o lead
    insert into lead_stage_history (lead_id, from_stage, to_stage, changed_at)
    values (new.id, null, new.stage, now());

  elsif TG_OP = 'UPDATE' then
    -- Só registra se o estágio realmente mudou
    if old.stage is distinct from new.stage then
      insert into lead_stage_history (lead_id, from_stage, to_stage, changed_at)
      values (new.id, old.stage, new.stage, now());
    end if;
  end if;

  return new;
end;
$$;

-- Remove trigger antigo se existir e recria
drop trigger if exists leads_stage_history on leads;

create trigger leads_stage_history
  after insert or update on leads
  for each row execute function fn_record_lead_stage_change();

-- ── 3. Backfill: cria registro inicial para leads existentes ──
-- (apenas leads que ainda não têm nenhum registro no histórico)
insert into lead_stage_history (lead_id, from_stage, to_stage, changed_at)
select l.id, null, l.stage, l.created_at
from leads l
where not exists (
  select 1 from lead_stage_history h where h.lead_id = l.id
);

-- ── 4. Fix RLS da tabela projects: garante WITH CHECK ─────────
-- A política original (001_schema) não tinha WITH CHECK explícito.
-- Recria corretamente para garantir INSERT/UPDATE via server actions.
do $$
declare
  pol record;
begin
  for pol in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'projects'
  loop
    execute format('drop policy if exists %I on projects', pol.policyname);
  end loop;
end $$;

create policy "Authenticated full access"
  on projects for all
  using  (auth.uid() is not null)
  with check (auth.uid() is not null);

-- Mesmo fix para project_consultants e project_partners
do $$
declare
  pol record;
  tbl text;
  tbls text[] := array['project_consultants', 'project_partners', 'project_products'];
begin
  foreach tbl in array tbls loop
    for pol in
      select policyname from pg_policies
      where schemaname = 'public' and tablename = tbl
    loop
      execute format('drop policy if exists %I on %I', pol.policyname, tbl);
    end loop;
    execute format(
      'create policy "Authenticated full access" on %I for all using (auth.uid() is not null) with check (auth.uid() is not null)',
      tbl
    );
  end loop;
end $$;

notify pgrst, 'reload schema';
