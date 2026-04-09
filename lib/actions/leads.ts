'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

/**
 * Converte um lead em projeto.
 * Regra #2: Projeto pode nascer de lead convertido (lead_id).
 */
export async function convertLeadToProject(leadId: string) {
  const supabase = createClient()

  // Busca dados do lead (incluindo produtos vinculados)
  const { data: lead, error: leadError } = await supabase
    .from('leads')
    .select('*, client:clients(id, name)')
    .eq('id', leadId)
    .single()

  if (leadError || !lead) throw leadError ?? new Error('Lead não encontrado')

  // Busca produtos do lead
  const { data: leadProducts } = await supabase
    .from('lead_products')
    .select('product_id')
    .eq('lead_id', leadId)

  // Cria o projeto
  const { data: project, error: projectError } = await supabase
    .from('projects')
    .insert({
      company_id: lead.company_id,
      client_id: lead.client_id,
      lead_id: leadId,
      revenue: lead.estimated_value ?? 0,
      sale_date: new Date().toISOString().split('T')[0],
      year: new Date().getFullYear(),
      status: 'ativo',
    })
    .select()
    .single()

  if (projectError) throw projectError

  // Copia os produtos do lead para o projeto
  if (leadProducts && leadProducts.length > 0) {
    await supabase.from('project_products').insert(
      leadProducts.map((lp) => ({
        project_id: project.id,
        product_id: lp.product_id,
      }))
    )
  }

  // Atualiza o lead como fechado e vincula ao projeto
  const { error: updateError } = await supabase
    .from('leads')
    .update({
      stage: 'fechado',
      converted_project_id: project.id,
    })
    .eq('id', leadId)

  if (updateError) throw updateError

  revalidatePath('/leads')
  revalidatePath('/projetos')

  return project
}
