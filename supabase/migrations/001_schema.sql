-- ============================================================
-- FLUZZO — Schema completo v1.0
-- Executar no Supabase > SQL Editor
-- ============================================================

-- Habilitar UUID
create extension if not exists "uuid-ossp";

-- ────────────────────────────────────────────────────────────
-- PARÂMETROS DA EMPRESA (única empresa no free tier)
-- ────────────────────────────────────────────────────────────
create table if not exists companies (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  cnpj text,
  encargo_simples numeric(5,4) default 0.15,   -- 15%
  encargo_retirada numeric(5,4) default 0.19,  -- 19%
  created_at timestamptz default now()
);

-- ────────────────────────────────────────────────────────────
-- PRODUTOS / SERVIÇOS
-- PS = Pesquisa Patrocinada, AS = Assinatura, Ou = Outros
-- ────────────────────────────────────────────────────────────
create table if not exists products (
  id uuid primary key default uuid_generate_v4(),
  company_id uuid references companies(id),
  sigla text not null,
  name text not null,
  type text check (type in ('PS', 'AS', 'Ou')),
  active boolean default true,
  created_at timestamptz default now()
);

-- ────────────────────────────────────────────────────────────
-- CLIENTES
-- ────────────────────────────────────────────────────────────
create table if not exists clients (
  id uuid primary key default uuid_generate_v4(),
  company_id uuid references companies(id),
  type text check (type in ('Fluzzo', 'Cliente')) default 'Cliente',
  name text not null,
  contact text,
  start_date date,
  year integer,
  segment_macro text,
  segment text,
  state char(2),
  size text check (size in ('Pequeno', 'Médio', 'Grande')),
  indicator_id uuid,  -- FK para partners (adicionada via alter abaixo)
  active boolean default true,
  created_at timestamptz default now()
);

-- ────────────────────────────────────────────────────────────
-- CONSULTORES
-- ────────────────────────────────────────────────────────────
create table if not exists consultants (
  id uuid primary key default uuid_generate_v4(),
  company_id uuid references companies(id),
  name text not null,
  active boolean default true,
  pix text,
  notes text,
  amount_due numeric(12,2) default 0,
  amount_paid numeric(12,2) default 0,
  created_at timestamptz default now()
);

-- Histórico mensal de pagamentos de consultores
create table if not exists consultant_payments (
  id uuid primary key default uuid_generate_v4(),
  consultant_id uuid references consultants(id) on delete cascade,
  period date not null,
  amount numeric(12,2) default 0,
  paid_at date,
  notes text
);

-- ────────────────────────────────────────────────────────────
-- PARCEIROS COMERCIAIS
-- ────────────────────────────────────────────────────────────
create table if not exists partners (
  id uuid primary key default uuid_generate_v4(),
  company_id uuid references companies(id),
  name text not null,
  area text,
  partner_company text,
  total_referrals integer default 0,
  total_revenue numeric(12,2) default 0,
  fee_avg numeric(5,4),
  fee_paid numeric(12,2) default 0,
  fee_due numeric(12,2) default 0,
  created_at timestamptz default now()
);

-- Adicionar FK de clients.indicator_id para partners
alter table clients
  add constraint clients_indicator_id_fkey
  foreign key (indicator_id) references partners(id)
  not valid;

-- ────────────────────────────────────────────────────────────
-- LEADS
-- ────────────────────────────────────────────────────────────
create table if not exists leads (
  id uuid primary key default uuid_generate_v4(),
  company_id uuid references companies(id),
  client_id uuid references clients(id),
  product_id uuid references products(id),
  title text not null,
  estimated_value numeric(12,2),
  stage text check (stage in (
    'qualificacao', 'diagnostico', 'proposta',
    'negociacao', 'fechado', 'perdido'
  )) default 'qualificacao',
  responsible text,
  lost_reason text,
  notes text,
  next_step text,
  next_step_date date,
  converted_project_id uuid,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Interações de lead
create table if not exists lead_interactions (
  id uuid primary key default uuid_generate_v4(),
  lead_id uuid references leads(id) on delete cascade,
  type text check (type in ('contato', 'reuniao', 'proposta', 'email', 'outro')),
  description text not null,
  interaction_date date default current_date,
  created_at timestamptz default now()
);

-- ────────────────────────────────────────────────────────────
-- METAS ANUAIS
-- ────────────────────────────────────────────────────────────
create table if not exists goals (
  id uuid primary key default uuid_generate_v4(),
  company_id uuid references companies(id),
  product_id uuid references products(id),
  year integer not null,
  qty_budget integer default 0,
  ticket_budget numeric(12,2) default 0,
  total_budget numeric(12,2) generated always as (qty_budget * ticket_budget) stored,
  qty_sold integer default 0,
  ticket_sold numeric(12,2) default 0,
  total_sold numeric(12,2) default 0,
  notes text,
  unique(company_id, product_id, year)
);

-- ────────────────────────────────────────────────────────────
-- PROJETOS
-- ────────────────────────────────────────────────────────────
create table if not exists projects (
  id uuid primary key default uuid_generate_v4(),
  company_id uuid references companies(id),
  client_id uuid references clients(id),
  code serial,
  gp text,
  sale_date date,
  year integer,
  status text check (status in ('ativo', 'on-hold', 'concluido', 'cancelado')) default 'ativo',
  purchase_order text,
  revenue numeric(12,2) default 0,
  invoiced numeric(12,2) default 0,
  lead_id uuid references leads(id),
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- FK circular: leads.converted_project_id → projects
alter table leads
  add constraint leads_converted_project_id_fkey
  foreign key (converted_project_id) references projects(id)
  not valid;

-- Consultores no projeto (N:N)
create table if not exists project_consultants (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid references projects(id) on delete cascade,
  consultant_id uuid references consultants(id),
  role text,
  fee_pct numeric(5,4) default 0,
  amount_due numeric(12,2) default 0,
  amount_paid numeric(12,2) default 0,
  balance numeric(12,2) generated always as (amount_due - amount_paid) stored,
  installments integer default 1,
  monthly_value numeric(12,2) default 0
);

-- Parceiros no projeto (N:N)
create table if not exists project_partners (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid references projects(id) on delete cascade,
  partner_id uuid references partners(id),
  fee_pct numeric(5,4) default 0,
  fee_amount numeric(12,2) default 0,
  fee_paid numeric(12,2) default 0,
  balance numeric(12,2) generated always as (fee_amount - fee_paid) stored
);

-- ────────────────────────────────────────────────────────────
-- LANÇAMENTOS PREVISTOS
-- ────────────────────────────────────────────────────────────
create table if not exists entries (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid references projects(id),
  company_id uuid references companies(id),
  client_id uuid references clients(id),
  consultant_id uuid references consultants(id),
  classification text not null,
  installment integer,
  order_num integer default 0,
  amount numeric(12,2) not null,
  forecast_billing date,
  billed_at date,
  forecast_payment date,
  paid_at date,
  nf_sent_to text,
  status text check (status in ('previsto', 'faturado', 'pago', 'cancelado')) default 'previsto',
  notes text,
  is_manual boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ────────────────────────────────────────────────────────────
-- EXTRATO BANCÁRIO (realizado)
-- ────────────────────────────────────────────────────────────
create table if not exists bank_extract (
  id uuid primary key default uuid_generate_v4(),
  company_id uuid references companies(id),
  transaction_date date not null,
  description text,
  amount numeric(12,2) not null,
  balance numeric(12,2),
  classification text,
  reconciled boolean default false,
  reconciled_entry_id uuid references entries(id),
  source text check (source in ('import', 'manual')) default 'manual',
  raw_description text,
  created_at timestamptz default now()
);

-- ────────────────────────────────────────────────────────────
-- FLUXO DE CAIXA MANUAL
-- ────────────────────────────────────────────────────────────
create table if not exists cash_forecast_manual (
  id uuid primary key default uuid_generate_v4(),
  company_id uuid references companies(id),
  period date not null,
  category text not null,
  description text,
  amount numeric(12,2) not null,
  type text check (type in ('entrada', 'saida')),
  recurring boolean default false,
  notes text,
  created_at timestamptz default now()
);

-- ────────────────────────────────────────────────────────────
-- TRILHA DE AUDITORIA
-- ────────────────────────────────────────────────────────────
create table if not exists audit_log (
  id uuid primary key default uuid_generate_v4(),
  entity text not null,
  entity_id uuid not null,
  field text not null,
  old_value text,
  new_value text,
  user_id uuid,
  changed_at timestamptz default now()
);

-- ────────────────────────────────────────────────────────────
-- TRIGGER: updated_at automático
-- ────────────────────────────────────────────────────────────
create or replace function update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger leads_updated_at
  before update on leads
  for each row execute function update_updated_at_column();

create trigger projects_updated_at
  before update on projects
  for each row execute function update_updated_at_column();

create trigger entries_updated_at
  before update on entries
  for each row execute function update_updated_at_column();

-- ────────────────────────────────────────────────────────────
-- VIEWS
-- ────────────────────────────────────────────────────────────

-- Fluxo previsto consolidado por mês e categoria
create or replace view vw_cash_forecast as
select
  company_id,
  date_trunc('month', forecast_payment) as period,
  classification as category,
  sum(case when amount > 0 then amount else 0 end) as total_in,
  sum(case when amount < 0 then abs(amount) else 0 end) as total_out,
  count(*) as entry_count
from entries
where status != 'cancelado'
group by company_id, date_trunc('month', forecast_payment), classification;

-- Pipeline de leads com valor por estágio
create or replace view vw_pipeline as
select
  l.company_id,
  l.stage,
  count(*) as lead_count,
  sum(l.estimated_value) as total_value,
  avg(l.estimated_value) as avg_ticket
from leads l
where l.stage not in ('fechado', 'perdido')
group by l.company_id, l.stage;

-- Saldo a receber por projeto
create or replace view vw_receivables as
select
  p.id as project_id,
  p.code,
  p.company_id,
  c.name as client_name,
  sum(e.amount) as total_billed,
  sum(case when e.paid_at is null and e.status != 'cancelado' then e.amount else 0 end) as balance_due
from projects p
join clients c on c.id = p.client_id
left join entries e on e.project_id = p.id
group by p.id, p.code, p.company_id, c.name;

-- ────────────────────────────────────────────────────────────
-- ROW LEVEL SECURITY (RLS)
-- ────────────────────────────────────────────────────────────
alter table companies enable row level security;
alter table products enable row level security;
alter table clients enable row level security;
alter table consultants enable row level security;
alter table consultant_payments enable row level security;
alter table partners enable row level security;
alter table leads enable row level security;
alter table lead_interactions enable row level security;
alter table goals enable row level security;
alter table projects enable row level security;
alter table project_consultants enable row level security;
alter table project_partners enable row level security;
alter table entries enable row level security;
alter table bank_extract enable row level security;
alter table cash_forecast_manual enable row level security;
alter table audit_log enable row level security;

-- Política: usuário autenticado tem acesso total (fase 1, 1 usuário)
do $$
declare
  t text;
  tables text[] := array[
    'companies','products','clients','consultants','consultant_payments',
    'partners','leads','lead_interactions','goals','projects',
    'project_consultants','project_partners','entries',
    'bank_extract','cash_forecast_manual','audit_log'
  ];
begin
  foreach t in array tables loop
    execute format(
      'create policy "Authenticated full access" on %I for all using (auth.role() = ''authenticated'')',
      t
    );
  end loop;
end $$;
