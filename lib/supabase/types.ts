// ============================================================
// FLUZZO — Tipos TypeScript do banco de dados Supabase
// Gerado manualmente baseado no schema SQL
// ============================================================

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

// ─── Enums ───────────────────────────────────────────────────

// ProductType agora aceita qualquer string (tipo é editável pelo usuário)
export type ProductType = string

export type ClientType = 'Fluzzo' | 'Cliente' | 'Lead'

export type ClientSize = 'Pequeno' | 'Médio' | 'Grande'

export type LeadStage =
  | 'qualificacao'
  | 'diagnostico'
  | 'proposta'
  | 'negociacao'
  | 'fechado'
  | 'perdido'

export type InteractionType =
  | 'contato'
  | 'reuniao'
  | 'proposta'
  | 'email'
  | 'outro'

export type ProjectStatus = 'ativo' | 'on-hold' | 'concluido' | 'cancelado'

export type EntryStatus = 'previsto' | 'faturado' | 'pago' | 'cancelado'

export type BankSource = 'import' | 'manual'

export type CashFlowType = 'entrada' | 'saida'

// ─── Tabelas (type aliases para compatibilidade com Record<string, unknown>) ──

export type Company = {
  id: string
  name: string
  cnpj: string | null
  city: string | null
  state: string | null
  encargo_simples: number
  encargo_retirada: number
  default_class_recebimento: string | null
  default_class_fee: string | null
  default_class_imposto: string | null
  default_class_consultor: string | null
  created_at: string
}

export type CompanyContact = {
  id: string
  company_id: string
  name: string
  role: string | null
  email: string | null
  phone: string | null
  is_primary: boolean
  created_at: string
}

export type Product = {
  id: string
  company_id: string | null
  sigla: string
  name: string
  type: ProductType | null
  active: boolean
  created_at: string
}

export type Client = {
  id: string
  company_id: string | null
  type: ClientType
  name: string
  cnpj: string | null
  contact: string | null
  contract_type: string | null
  start_date: string | null
  year: number | null
  segment_macro: string | null
  segment: string | null
  state: string | null
  size: ClientSize | null
  indicator_id: string | null
  active: boolean
  created_at: string
}

export type ClientContact = {
  id: string
  client_id: string
  name: string
  role: string | null
  email: string | null
  phone: string | null
  is_primary: boolean
  created_at: string
}

export type Consultant = {
  id: string
  company_id: string | null
  name: string
  active: boolean
  email: string | null
  phone: string | null
  pix_pf: string | null
  pix_pj: string | null
  notes: string | null
  amount_due: number
  amount_paid: number
  created_at: string
}

export type ConsultantPayment = {
  id: string
  consultant_id: string
  period: string
  amount: number
  paid_at: string | null
  notes: string | null
}

export type PartnerStatus = 'ativo' | 'inativo'

export type Partner = {
  id: string
  company_id: string | null
  name: string
  area: string | null
  partner_company: string | null
  email: string | null
  phone: string | null
  pix: string | null
  status: PartnerStatus
  total_referrals: number
  total_revenue: number
  fee_avg: number | null
  fee_paid: number
  fee_due: number
  created_at: string
}

export type Vendedor = {
  id: string
  company_id: string | null
  name: string
  email: string | null
  phone: string | null
  role: string | null
  active: boolean
  notes: string | null
  created_at: string
}

export type Lead = {
  id: string
  company_id: string | null
  client_id: string | null
  product_id: string | null
  title: string
  estimated_value: number | null
  stage: LeadStage
  responsible: string | null
  lost_reason: string | null
  notes: string | null
  next_step: string | null
  next_step_date: string | null
  converted_project_id: string | null
  created_at: string
  updated_at: string
}

export type LeadProduct = {
  id: string
  lead_id: string
  product_id: string
  value: number | null
  created_at: string
}

export type LeadInteraction = {
  id: string
  lead_id: string
  type: InteractionType | null
  description: string
  interaction_date: string
  created_at: string
}

export type Goal = {
  id: string
  company_id: string | null
  product_id: string | null
  year: number
  qty_budget: number
  ticket_budget: number
  total_budget: number // generated always
  qty_sold: number
  ticket_sold: number
  total_sold: number
  notes: string | null
}

export type Project = {
  id: string
  company_id: string | null
  client_id: string | null
  code: number
  gp: string | null
  sale_date: string | null
  billing_start_date: string | null
  year: number | null
  status: ProjectStatus
  purchase_order: string | null
  revenue: number
  invoiced: number
  lead_id: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export type ProjectProduct = {
  id: string
  project_id: string
  product_id: string
  created_at: string
}

export type ProjectConsultant = {
  id: string
  project_id: string
  consultant_id: string
  role: string | null
  fee_pct: number
  amount_due: number
  amount_paid: number
  balance: number // generated always
  installments: number
  monthly_value: number
}

export type ProjectPartner = {
  id: string
  project_id: string
  partner_id: string
  fee_pct: number
  fee_amount: number
  fee_paid: number
  balance: number // generated always
}

export type Entry = {
  id: string
  project_id: string | null
  company_id: string | null
  client_id: string | null
  consultant_id: string | null
  classification: string
  installment: number | null
  order_num: number
  amount: number
  forecast_billing: string | null
  billed_at: string | null
  forecast_payment: string | null
  paid_at: string | null
  nf_sent_to: string | null
  status: EntryStatus
  notes: string | null
  is_manual: boolean
  created_at: string
  updated_at: string
}

export type BankExtract = {
  id: string
  company_id: string | null
  transaction_date: string
  description: string | null
  amount: number
  balance: number | null
  classification: string | null
  reconciled: boolean
  reconciled_entry_id: string | null
  source: BankSource
  raw_description: string | null
  created_at: string
}

export type CashForecastManual = {
  id: string
  company_id: string | null
  period: string
  category: string
  description: string | null
  amount: number
  type: CashFlowType | null
  recurring: boolean
  notes: string | null
  created_at: string
}

export type Classification = {
  id: string
  company_id: string | null
  name: string
  type: 'entrada' | 'saida' | 'ambos'
  description: string | null
  active: boolean
  parent_id: string | null
  is_totalizador: boolean
  sort_order: number
  created_at: string
}

export type LeadStageHistory = {
  id: string
  lead_id: string
  from_stage: string | null
  to_stage: string
  changed_at: string
}

export type AuditLog = {
  id: string
  entity: string
  entity_id: string
  field: string
  old_value: string | null
  new_value: string | null
  user_id: string | null
  changed_at: string
}

// ─── Views ────────────────────────────────────────────────────

export type VwCashForecast = {
  company_id: string | null
  period: string | null
  category: string | null
  total_in: number | null
  total_out: number | null
  entry_count: number | null
}

export type VwPipeline = {
  company_id: string | null
  stage: LeadStage | null
  lead_count: number | null
  total_value: number | null
  avg_ticket: number | null
}

export type VwReceivables = {
  project_id: string | null
  code: number | null
  company_id: string | null
  client_name: string | null
  total_billed: number | null
  balance_due: number | null
}

// ─── Joins úteis (tipos compostos para queries com joins) ─────

export type LeadWithRelations = Lead & {
  client: Pick<Client, 'id' | 'name'> | null
  product?: Pick<Product, 'id' | 'name' | 'sigla'> | null
  lead_products?: { product: Pick<Product, 'id' | 'name' | 'sigla'> | null }[]
  interactions?: LeadInteraction[]
}

export type ProjectWithRelations = Project & {
  client: Pick<Client, 'id' | 'name'> | null
  consultants?: (ProjectConsultant & { consultant: Pick<Consultant, 'id' | 'name'> })[]
  partners?: (ProjectPartner & { partner: Pick<Partner, 'id' | 'name'> })[]
  entries?: Entry[]
  project_products?: (ProjectProduct & { product: Pick<Product, 'id' | 'sigla' | 'name'> })[]
}

export type EntryWithRelations = Entry & {
  project: Pick<Project, 'id' | 'code'> | null
  client: Pick<Client, 'id' | 'name'> | null
  consultant: Pick<Consultant, 'id' | 'name'> | null
}

// ─── Database type (para uso com createClient<Database>()) ────

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: '12'
  }
  public: {
    Tables: {
      companies: {
        Row: Company
        Insert: Omit<Company, 'id' | 'created_at'>
        Update: Partial<Omit<Company, 'id' | 'created_at'>>
        Relationships: []
      }
      products: {
        Row: Product
        Insert: Omit<Product, 'id' | 'created_at'>
        Update: Partial<Omit<Product, 'id' | 'created_at'>>
        Relationships: []
      }
      clients: {
        Row: Client
        Insert: Omit<Client, 'id' | 'created_at'>
        Update: Partial<Omit<Client, 'id' | 'created_at'>>
        Relationships: []
      }
      consultants: {
        Row: Consultant
        Insert: Omit<Consultant, 'id' | 'created_at'>
        Update: Partial<Omit<Consultant, 'id' | 'created_at'>>
        Relationships: []
      }
      consultant_payments: {
        Row: ConsultantPayment
        Insert: Omit<ConsultantPayment, 'id'>
        Update: Partial<Omit<ConsultantPayment, 'id'>>
        Relationships: []
      }
      partners: {
        Row: Partner
        Insert: Omit<Partner, 'id' | 'created_at'>
        Update: Partial<Omit<Partner, 'id' | 'created_at'>>
        Relationships: []
      }
      leads: {
        Row: Lead
        Insert: Omit<Lead, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<Lead, 'id' | 'created_at'>>
        Relationships: []
      }
      lead_interactions: {
        Row: LeadInteraction
        Insert: Omit<LeadInteraction, 'id' | 'created_at'>
        Update: Partial<Omit<LeadInteraction, 'id' | 'created_at'>>
        Relationships: []
      }
      goals: {
        Row: Goal
        Insert: Omit<Goal, 'id' | 'total_budget' | 'total_sold'>
        Update: Partial<Omit<Goal, 'id' | 'total_budget' | 'total_sold'>>
        Relationships: []
      }
      projects: {
        Row: Project
        Insert: Omit<Project, 'id' | 'code' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<Project, 'id' | 'code' | 'created_at'>>
        Relationships: []
      }
      project_consultants: {
        Row: ProjectConsultant
        Insert: Omit<ProjectConsultant, 'id' | 'balance'>
        Update: Partial<Omit<ProjectConsultant, 'id' | 'balance'>>
        Relationships: []
      }
      project_partners: {
        Row: ProjectPartner
        Insert: Omit<ProjectPartner, 'id' | 'balance'>
        Update: Partial<Omit<ProjectPartner, 'id' | 'balance'>>
        Relationships: []
      }
      entries: {
        Row: Entry
        Insert: Omit<Entry, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<Entry, 'id' | 'created_at'>>
        Relationships: []
      }
      bank_extract: {
        Row: BankExtract
        Insert: Omit<BankExtract, 'id' | 'created_at'>
        Update: Partial<Omit<BankExtract, 'id' | 'created_at'>>
        Relationships: []
      }
      cash_forecast_manual: {
        Row: CashForecastManual
        Insert: Omit<CashForecastManual, 'id' | 'created_at'>
        Update: Partial<Omit<CashForecastManual, 'id' | 'created_at'>>
        Relationships: []
      }
      lead_stage_history: {
        Row: LeadStageHistory
        Insert: Omit<LeadStageHistory, 'id' | 'changed_at'>
        Update: never
        Relationships: []
      }
      audit_log: {
        Row: AuditLog
        Insert: Omit<AuditLog, 'id' | 'changed_at'>
        Update: never
        Relationships: []
      }
    }
    Views: {
      vw_cash_forecast: {
        Row: VwCashForecast
        Relationships: []
      }
      vw_pipeline: {
        Row: VwPipeline
        Relationships: []
      }
      vw_receivables: {
        Row: VwReceivables
        Relationships: []
      }
    }
    Functions: Record<string, { Args: Record<string, unknown>; Returns: unknown }>
    Enums: {
      product_type: ProductType
      client_type: ClientType
      client_size: ClientSize
      lead_stage: LeadStage
      interaction_type: InteractionType
      project_status: ProjectStatus
      entry_status: EntryStatus
      bank_source: BankSource
      cash_flow_type: CashFlowType
    }
  }
}
