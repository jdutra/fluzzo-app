-- ============================================================
-- FLUZZO — Dados iniciais (seed)
-- Executar APÓS o schema no Supabase > SQL Editor
-- ============================================================

-- Empresa
insert into companies (name, encargo_simples, encargo_retirada)
values ('Fluzzo', 0.15, 0.19)
on conflict do nothing;

-- Produtos / Serviços
insert into products (company_id, sigla, name, type)
select id, 'PS', 'Pesquisa Patrocinada', 'PS' from companies where name = 'Fluzzo'
union all
select id, 'AS', 'Assinatura', 'AS' from companies where name = 'Fluzzo'
union all
select id, 'Ou', 'Outros serviços', 'Ou' from companies where name = 'Fluzzo'
on conflict do nothing;
