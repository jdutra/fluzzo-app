'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { generateProjectEntries } from './entries'
import type { ProjectStatus } from '@/lib/supabase/types'

/**
 * Cria um projeto e gera lançamentos automáticos.
 * Regra #5: Ao criar projeto com N parcelas, gerar N entries previstas.
 */
export async function createProjectWithEntries(params: {
  company_id: string | null
  client_id: string | null
  gp: string | null
  sale_date: string | null
  billing_start_date: string | null
  year: number | null
  status: ProjectStatus
  revenue: number
  purchase_order: string | null
  notes: string | null
  installments: number
  lead_id?: string | null
}) {
  const supabase = createClient()

  const { installments, ...projectData } = params

  const { data: project, error } = await supabase
    .from('projects')
    .insert({
      company_id: projectData.company_id,
      client_id: projectData.client_id,
      gp: projectData.gp,
      sale_date: projectData.sale_date,
      billing_start_date: projectData.billing_start_date,
      year: projectData.year,
      status: projectData.status,
      revenue: projectData.revenue,
      purchase_order: projectData.purchase_order,
      notes: projectData.notes,
      lead_id: projectData.lead_id ?? null,
      invoiced: 0,
    })
    .select()
    .single()

  if (error || !project) throw error ?? new Error('Erro ao criar projeto')

  // Gera lançamentos se houver parcelas e receita
  if (installments > 0 && projectData.revenue > 0 && projectData.client_id) {
    await generateProjectEntries({
      project_id: project.id,
      company_id: projectData.company_id,
      client_id: projectData.client_id,
      revenue: projectData.revenue,
      installments,
      billing_start_date: projectData.billing_start_date,
    })
  }

  revalidatePath('/projetos')
  revalidatePath('/lancamentos')

  return project
}

/**
 * Atualiza dados de um projeto (sem regerar lançamentos).
 */
export async function updateProject(
  id: string,
  params: {
    client_id: string | null
    gp: string | null
    sale_date: string | null
    billing_start_date: string | null
    year: number | null
    status: ProjectStatus
    revenue: number
    purchase_order: string | null
    notes: string | null
  }
) {
  const supabase = createClient()

  const { error } = await supabase.from('projects').update(params).eq('id', id)
  if (error) throw error

  revalidatePath('/projetos')
  revalidatePath(`/projetos/${id}`)
  revalidatePath('/lancamentos')
}

/**
 * Vincula consultor a um projeto e gera lançamentos automáticos de pagamento.
 */
export async function addProjectConsultant(params: {
  project_id: string
  consultant_id: string
  role: string | null
  billing_start_date: string | null
  installments: number
  monthly_value: number
  company_id: string | null
}) {
  const supabase = createClient()
  const amount_due = params.monthly_value * params.installments

  // Busca classificação padrão para equipe
  const { data: companyData } = await supabase
    .from('companies')
    .select('default_class_consultor')
    .single()
  const classConsultor = (companyData as any)?.default_class_consultor ?? 'Pagamento Consultor'

  const { error } = await supabase.from('project_consultants').insert({
    project_id: params.project_id,
    consultant_id: params.consultant_id,
    role: params.role,
    billing_start_date: params.billing_start_date,
    fee_pct: 0,
    amount_due,
    amount_paid: 0,
    installments: params.installments,
    monthly_value: params.monthly_value,
  })

  if (error) throw error

  // Auto-gerar lançamentos de débito para o consultor
  if (amount_due > 0 && params.installments >= 1) {
    const baseDate = params.billing_start_date
      ? new Date(params.billing_start_date + 'T00:00:00')
      : new Date()
    const entries = Array.from({ length: params.installments }, (_, i) => {
      const payDate = new Date(baseDate.getFullYear(), baseDate.getMonth() + i, baseDate.getDate())
      return {
        project_id: params.project_id,
        company_id: params.company_id,
        consultant_id: params.consultant_id,
        classification: classConsultor,
        amount: params.monthly_value,
        forecast_payment: payDate.toISOString().split('T')[0],
        status: 'previsto' as const,
        is_manual: false,
      }
    })
    await supabase.from('entries').insert(entries)
  }

  revalidatePath(`/projetos/${params.project_id}`)
  revalidatePath('/lancamentos')
}

/**
 * Vincula parceiro a um projeto e gera lançamentos automáticos de fee.
 */
export async function addProjectPartner(params: {
  project_id: string
  partner_id: string
  fee_pct: number
  fee_amount: number
  installments: number
  company_id: string | null
}) {
  const supabase = createClient()

  const { error } = await supabase.from('project_partners').insert({
    project_id: params.project_id,
    partner_id: params.partner_id,
    fee_pct: params.fee_pct,
    fee_amount: params.fee_amount,
    fee_paid: 0,
    installments: params.installments,
  })

  if (error) throw error

  // Auto-gerar lançamentos de débito de fee para o parceiro
  if (params.fee_amount > 0 && params.installments >= 1) {
    const baseDate = new Date()
    const amountPerInstallment = params.fee_amount / params.installments
    const entries = Array.from({ length: params.installments }, (_, i) => {
      const payDate = new Date(baseDate.getFullYear(), baseDate.getMonth() + i, 1)
      return {
        project_id: params.project_id,
        company_id: params.company_id,
        partner_id: params.partner_id,
        classification: 'Fee Parceiro',
        amount: amountPerInstallment,
        forecast_payment: payDate.toISOString().split('T')[0],
        status: 'previsto' as const,
        is_manual: false,
      }
    })
    await supabase.from('entries').insert(entries)
  }

  revalidatePath(`/projetos/${params.project_id}`)
  revalidatePath('/lancamentos')
}
