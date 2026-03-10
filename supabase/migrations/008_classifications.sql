-- ============================================================
-- 008 — Classificações: tabela de categorias editáveis
-- Execute no Supabase SQL Editor
-- ============================================================

create table if not exists classifications (
  id uuid primary key default uuid_generate_v4(),
  company_id uuid references companies(id) on delete cascade,
  name text not null,
  type text default 'ambos',   -- 'entrada' | 'saida' | 'ambos'
  description text,
  active boolean default true,
  created_at timestamptz default now(),
  unique(company_id, name)
);

alter table classifications enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'classifications'
      and policyname = 'Authenticated users manage classifications'
  ) then
    execute $policy$
      create policy "Authenticated users manage classifications"
        on classifications for all
        using (auth.role() = 'authenticated')
        with check (auth.role() = 'authenticated')
    $policy$;
  end if;
end $$;
