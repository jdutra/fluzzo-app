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
