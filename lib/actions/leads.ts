'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

/**
 * Converte um lead em projeto.
 * Regra #2: Projeto pode nascer de lead convertido (lead_id).
 *
 * Novidades (slide 2):
 * - Aceita installments + billing_start_date para gerar lançamentos automáticos
 * - Se client.type === 'lead', atualiza para 'cliente'
 * - Copia parceiro do lead para project_partners
 * - Gera lançamentos de receita e de fee usando classificações padrão da empresa
 */
export async function convertLeadToProject(
  leadId: string,
  params?: { installments: number; billing_start_date: string }
) {
  const supabase = createClient()

  // Busca dados do lead (incluindo produtos vinculados)
  const { data: lead, error: leadError } = await supabase
    .from('leads')
    .select('*, client:clients(id, name, type)')
    .eq('id', leadId)
    .single()

  if (leadError || !lead) throw leadError ?? new Error('Lead não encontrado')

  // Guard: evitar conversão dupla
  if ((lead as any).converted_project_id) {
    throw new Error('Este lead já foi convertido em projeto.')
  }

  // Busca produtos do lead (incluindo valor negociado)
  const { data: leadProducts } = await supabase
    .from('lead_products')
    .select('product_id, value')
    .eq('lead_id', leadId)

  // Busca classificações padrão da empresa
  const { data: companyData } = await supabase
    .from('companies')
    .select('id, default_class_recebimento, default_class_fee, default_class_consultor')
    .single()

  // Cria o projeto
  const { data: project, error: projectError } = await supabase
    .from('projects')
    .insert({
      company_id: lead.company_id,
      client_id: lead.client_id,
      lead_id: leadId,
      revenue: lead.estimated_value ?? 0,
      sale_date: new Date().toISOString().split('T')[0],
      billing_start_date: params?.billing_start_date ?? null,
      year: new Date().getFullYear(),
      status: 'ativo',
    })
    .select()
    .single()

  if (projectError) throw projectError

  // Copia os produtos do lead para o projeto (incluindo valor negociado)
  if (leadProducts && leadProducts.length > 0) {
    const { error: ppError } = await supabase.from('project_products').insert(
      leadProducts.map((lp) => ({
        project_id: project.id,
        product_id: lp.product_id,
        value: (lp as any).value ?? null,
      }))
    )
    if (ppError) throw ppError
  }

  // Se o lead tem parceiro, copia para project_partners
  const partnerFee = (lead as any).partner_fee_pct ?? 0
  const partnerId = (lead as any).partner_id
  if (partnerId) {
    const feeAmount = ((lead.estimated_value ?? 0) * partnerFee) / 100
    const installments = params?.installments ?? 1
    await supabase.from('project_partners').insert({
      project_id: project.id,
      partner_id: partnerId,
      fee_pct: partnerFee / 100,
      fee_amount: feeAmount,
      fee_paid: 0,
      installments,
    })
  }

  // Gera lançamentos de receita se houver parâmetros de parcelamento
  if (params && params.installments > 0 && params.billing_start_date && lead.estimated_value) {
    const { installments, billing_start_date } = params
    const amountPerInstallment = lead.estimated_value / installments
    const classReceita = (companyData as any)?.default_class_recebimento ?? 'Receita de Projetos'

    const receitaEntries = Array.from({ length: installments }, (_, i) => {
      const base = new Date(billing_start_date + 'T00:00:00')
      const billingDate = new Date(base.getFullYear(), base.getMonth() + i, base.getDate())
      const payDate = new Date(base.getFullYear(), base.getMonth() + i + 1, base.getDate())
      return {
        project_id: project.id,
        company_id: lead.company_id,
        client_id: lead.client_id,
        classification: classReceita,
        amount: amountPerInstallment,
        forecast_billing: billingDate.toISOString().split('T')[0],
        forecast_payment: payDate.toISOString().split('T')[0],
        installment: i + 1,
        order_num: i + 1,
        status: 'previsto' as const,
        is_manual: false,
      }
    })
    await supabase.from('entries').insert(receitaEntries)

    // Gera lançamentos de fee do parceiro
    if (partnerId && partnerFee > 0) {
      const feeTotal = ((lead.estimated_value ?? 0) * partnerFee) / 100
      const feePerInstallment = feeTotal / installments
      const classFee = (companyData as any)?.default_class_fee ?? 'Fee Parceiro'

      const feeEntries = Array.from({ length: installments }, (_, i) => {
        const base = new Date(billing_start_date + 'T00:00:00')
        const payDate = new Date(base.getFullYear(), base.getMonth() + i + 1, base.getDate())
        return {
          project_id: project.id,
          company_id: lead.company_id,
          partner_id: partnerId,
          classification: classFee,
          amount: feePerInstallment,
          forecast_payment: payDate.toISOString().split('T')[0],
          installment: i + 1,
          order_num: i + 1,
          status: 'previsto' as const,
          is_manual: false,
        }
      })
      await supabase.from('entries').insert(feeEntries)
    }
  }

  // Atualiza o lead como fechado e vincula ao projeto
  await supabase
    .from('leads')
    .update({ stage: 'fechado', converted_project_id: project.id })
    .eq('id', leadId)

  // Se o cliente estava como 'lead', promove para 'cliente'
  if (lead.client_id && (lead.client as any)?.type === 'lead') {
    await supabase
      .from('clients')
      .update({ type: 'Cliente' })
      .eq('id', lead.client_id)
  }

  revalidatePath('/leads')
  revalidatePath('/projetos')
  revalidatePath('/lancamentos')

  return project
}
