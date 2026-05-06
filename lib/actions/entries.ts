'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { logAudit } from './audit'
import type { Entry } from '@/lib/supabase/types'

/**
 * Gera lançamentos (entries) automáticos ao criar/atualizar projeto.
 * Regra #5: Ao salvar projeto com N parcelas, gerar N registros em entries.
 * - forecast_payment = último dia do mês corrente + N meses
 * - status = 'previsto'
 * - is_manual = false
 */
export async function generateProjectEntries(params: {
  project_id: string
  company_id: string | null
  client_id: string
  revenue: number
  installments: number
  billing_start_date?: string | null
  classification?: string
}) {
  const supabase = createClient()

  const {
    project_id,
    company_id,
    client_id,
    revenue,
    installments,
    billing_start_date,
    classification = 'Receita',
  } = params

  const amountPerInstallment = revenue / installments
  // Se billing_start_date informado, primeira parcela cai naquele mês;
  // caso contrário, usa o mês corrente (parcela 1 = último dia do mês atual)
  const baseDate = billing_start_date
    ? new Date(billing_start_date + 'T12:00:00')
    : new Date()

  const entries = Array.from({ length: installments }, (_, i) => {
    // new Date(year, month+1, 0) = último dia do mês `month` (0-based)
    const paymentDate = new Date(baseDate.getFullYear(), baseDate.getMonth() + i + 1, 0)
    return {
      project_id,
      company_id,
      client_id,
      classification,
      installment: i + 1,
      order_num: i + 1,
      amount: amountPerInstallment,
      forecast_payment: paymentDate.toISOString().split('T')[0],
      status: 'previsto' as const,
      is_manual: false,
    }
  })

  const { error } = await supabase.from('entries').insert(entries)

  if (error) throw error

  revalidatePath('/lancamentos')
  revalidatePath('/fluxo')
}

/**
 * Atualiza status de um lançamento e grava auditoria.
 * Regra #7: Alterações em entries.status devem gravar em audit_log.
 */
export async function updateEntryStatus(
  id: string,
  newStatus: Entry['status'],
  oldStatus: Entry['status']
) {
  const supabase = createClient()

  const { error } = await supabase
    .from('entries')
    .update({ status: newStatus })
    .eq('id', id)

  if (error) throw error

  await logAudit({
    entity: 'entries',
    entity_id: id,
    field: 'status',
    old_value: oldStatus,
    new_value: newStatus,
  })

  revalidatePath('/lancamentos')
}

/**
 * Cria um lançamento manual em um projeto.
 */
export async function createManualEntry(params: {
  project_id: string
  company_id: string | null
  client_id: string | null
  classification: string
  amount: number
  forecast_payment: string | null
  forecast_billing: string | null
  notes: string | null
}) {
  const supabase = createClient()

  const { error } = await supabase.from('entries').insert({
    project_id: params.project_id,
    company_id: params.company_id,
    client_id: params.client_id,
    classification: params.classification,
    amount: params.amount,
    forecast_payment: params.forecast_payment || null,
    forecast_billing: params.forecast_billing || null,
    notes: params.notes || null,
    status: 'previsto',
    is_manual: true,
  })

  if (error) throw error
  revalidatePath(`/projetos/${params.project_id}`)
  revalidatePath('/lancamentos')
}

/**
 * Cria N lançamentos manuais recorrentes (mensais) em um projeto.
 * Cada lançamento incrementa forecast_payment e forecast_billing em 1 mês.
 */
export async function createManualEntries(params: {
  project_id: string
  company_id: string | null
  client_id: string | null
  classification: string
  amount: number
  forecast_payment: string | null
  forecast_billing: string | null
  notes: string | null
  repetitions: number
}) {
  const supabase = createClient()

  const addMonths = (dateStr: string | null, months: number): string | null => {
    if (!dateStr) return null
    const d = new Date(dateStr + 'T00:00:00')
    const targetYear = d.getFullYear() + Math.floor((d.getMonth() + months) / 12)
    const targetMonth = ((d.getMonth() + months) % 12 + 12) % 12
    // Clamp day para evitar overflow (ex: 31 jan + 1 mês = 28 fev)
    const lastDay = new Date(targetYear, targetMonth + 1, 0).getDate()
    const day = Math.min(d.getDate(), lastDay)
    return new Date(targetYear, targetMonth, day).toISOString().split('T')[0]
  }

  const entries = Array.from({ length: params.repetitions }, (_, i) => ({
    project_id: params.project_id,
    company_id: params.company_id,
    client_id: params.client_id,
    classification: params.classification,
    amount: params.amount,
    forecast_payment: addMonths(params.forecast_payment, i),
    forecast_billing: addMonths(params.forecast_billing, i),
    notes: params.notes || null,
    status: 'previsto' as const,
    is_manual: true,
    installment: i + 1,
    order_num: i + 1,
  }))

  const { error } = await supabase.from('entries').insert(entries)
  if (error) throw error

  revalidatePath(`/projetos/${params.project_id}`)
  revalidatePath('/lancamentos')
}

/**
 * Atualiza dados de um lançamento (valor, classificação, datas, notas).
 */
export async function updateEntry(
  id: string,
  params: {
    classification: string
    amount: number
    forecast_payment: string | null
    forecast_billing: string | null
    notes: string | null
  },
  projectId: string
) {
  const supabase = createClient()
  const { error } = await supabase.from('entries').update({
    classification: params.classification,
    amount: params.amount,
    forecast_payment: params.forecast_payment || null,
    forecast_billing: params.forecast_billing || null,
    notes: params.notes || null,
  }).eq('id', id)

  if (error) throw error
  revalidatePath(`/projetos/${projectId}`)
  revalidatePath('/lancamentos')
}

/**
 * Remove um lançamento.
 */
export async function deleteEntry(id: string, projectId: string) {
  const supabase = createClient()
  const { error } = await supabase.from('entries').delete().eq('id', id)
  if (error) throw error
  revalidatePath(`/projetos/${projectId}`)
  revalidatePath('/lancamentos')
}

/**
 * Atualiza data de faturamento ou pagamento de um lançamento.
 */
export async function updateEntryDate(
  id: string,
  field: 'forecast_payment' | 'forecast_billing',
  value: string | null
) {
  const supabase = createClient()
  const { error } = await supabase
    .from('entries')
    .update({ [field]: value } as any)
    .eq('id', id)
  if (error) throw error
  revalidatePath('/lancamentos')
  revalidatePath('/fluxo')
}

/**
 * Atualiza classificação de um lançamento e grava auditoria.
 */
export async function updateEntryClassification(
  id: string,
  newClassification: string,
  oldClassification: string
) {
  const supabase = createClient()

  const { error } = await supabase
    .from('entries')
    .update({ classification: newClassification })
    .eq('id', id)

  if (error) throw error

  await logAudit({
    entity: 'entries',
    entity_id: id,
    field: 'classification',
    old_value: oldClassification,
    new_value: newClassification,
  })

  revalidatePath('/lancamentos')
  revalidatePath('/fluxo')
}

/**
 * Atualiza valor de um lançamento e grava auditoria.
 * Regra #7: Alterações em entries.amount devem gravar em audit_log.
 */
export async function updateEntryAmount(
  id: string,
  newAmount: number,
  oldAmount: number
) {
  const supabase = createClient()

  const { error } = await supabase
    .from('entries')
    .update({ amount: newAmount })
    .eq('id', id)

  if (error) throw error

  await logAudit({
    entity: 'entries',
    entity_id: id,
    field: 'amount',
    old_value: String(oldAmount),
    new_value: String(newAmount),
  })

  revalidatePath('/lancamentos')
}
