-- ============================================================
-- 006 — Leads: múltiplos produtos
-- Execute no Supabase SQL Editor
-- ============================================================

-- Tabela de produtos vinculados ao lead (múltiplos)
create table if not exists lead_products (
  id uuid primary key default uuid_generate_v4(),
  lead_id uuid references leads(id) on delete cascade,
  product_id uuid references products(id) on delete cascade,
  created_at timestamptz default now(),
  unique(lead_id, product_id)
);

alter table lead_products enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'lead_products'
      and policyname = 'Authenticated users manage lead_products'
  ) then
    execute $policy$
      create policy "Authenticated users manage lead_products"
        on lead_products for all
        using (auth.role() = 'authenticated')
        with check (auth.role() = 'authenticated')
    $policy$;
  end if;
end $$;

-- Migrar product_id existente para a nova tabela (se houver dados)
insert into lead_products (lead_id, product_id)
select id, product_id from leads
where product_id is not null
on conflict (lead_id, product_id) do nothing;
