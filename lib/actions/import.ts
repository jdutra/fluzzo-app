'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

// ─── Types para os dados vindos do parser ────────────────────

export interface ImportedCliente {
  tipo: string
  nome: string
  contato: string | null
  data_inicio: string | null
  ano: number | null
  segmento_macro: string | null
  segmento: string | null
  estado: string | null
  porte: string | null
  indicador: string | null
}

export interface ImportedConsultor {
  nome: string
  ativo: boolean
  observacoes: string | null
  pix: string | null
}

export interface ImportedParceiro {
  nome: string
  area: string | null
  empresa: string | null
}

export interface ImportedProjeto {
  cliente_nome: string
  codigo: number
  gp: string | null
  data_venda: string | null
  ano: number | null
  status: string
  ordem_compra: string | null
  receita: number
  faturado: number
}

export interface ImportedLancamento {
  cod_projeto: number
  cliente_nome: string
  classificacao: string
  parcela: number | null
  ordem: number
  valor: number
  previsao_faturamento: string | null
  data_faturamento: string | null
  previsao_pagamento: string | null
  data_pagamento: string | null
}

export interface ImportResult {
  entity: string
  imported: number
  skipped: number
  errors: string[]
}

// ─── Helper: status mapping ───────────────────────────────────

function mapStatus(status: string): 'ativo' | 'on-hold' | 'concluido' | 'cancelado' {
  const map: Record<string, 'ativo' | 'on-hold' | 'concluido' | 'cancelado'> = {
    'ativo': 'ativo',
    'Ativo': 'ativo',
    'on-hold': 'on-hold',
    'On Hold': 'on-hold',
    'concluido': 'concluido',
    'concluído': 'concluido',
    'Concluído': 'concluido',
    'Concluido': 'concluido',
    'cancelado': 'cancelado',
    'Cancelado': 'cancelado',
  }
  return map[status] ?? 'ativo'
}

function mapSize(porte: string | null): 'Pequeno' | 'Médio' | 'Grande' | null {
  if (!porte) return null
  const map: Record<string, 'Pequeno' | 'Médio' | 'Grande'> = {
    'pequeno': 'Pequeno', 'Pequeno': 'Pequeno',
    'médio': 'Médio', 'Médio': 'Médio', 'medio': 'Médio', 'Medio': 'Médio',
    'grande': 'Grande', 'Grande': 'Grande',
  }
  return map[porte] ?? null
}

// ─── Import Clientes ──────────────────────────────────────────

export async function importClientes(rows: ImportedCliente[]): Promise<ImportResult> {
  const supabase = createClient()
  const result: ImportResult = { entity: 'Clientes', imported: 0, skipped: 0, errors: [] }

  const { data: company } = await supabase.from('companies').select('id').single()
  if (!company) return { ...result, errors: ['Empresa não encontrada'] }

  for (const row of rows) {
    if (!row.nome?.trim()) { result.skipped++; continue }

    try {
      // Check if already exists
      const { data: existing } = await supabase
        .from('clients')
        .select('id')
        .eq('company_id', company.id)
        .eq('name', row.nome.trim())
        .maybeSingle()

      if (existing) {
        result.skipped++
        continue
      }

      const { error } = await supabase.from('clients').insert({
        company_id: company.id,
        type: (row.tipo === 'Fluzzo' ? 'Fluzzo' : 'Cliente') as 'Fluzzo' | 'Cliente',
        name: row.nome.trim(),
        contact: row.contato || null,
        start_date: row.data_inicio || null,
        year: row.ano || null,
        segment_macro: row.segmento_macro || null,
        segment: row.segmento || null,
        state: row.estado || null,
        size: mapSize(row.porte),
        active: true,
      })

      if (error) result.errors.push(`${row.nome}: ${error.message}`)
      else result.imported++
    } catch (e: unknown) {
      result.errors.push(`${row.nome}: ${e instanceof Error ? e.message : 'Erro desconhecido'}`)
    }
  }

  revalidatePath('/clientes')
  return result
}

// ─── Import Consultores ───────────────────────────────────────

export async function importConsultores(rows: ImportedConsultor[]): Promise<ImportResult> {
  const supabase = createClient()
  const result: ImportResult = { entity: 'Consultores', imported: 0, skipped: 0, errors: [] }

  const { data: company } = await supabase.from('companies').select('id').single()
  if (!company) return { ...result, errors: ['Empresa não encontrada'] }

  for (const row of rows) {
    if (!row.nome?.trim()) { result.skipped++; continue }

    try {
      const { data: existing } = await supabase
        .from('consultants')
        .select('id')
        .eq('company_id', company.id)
        .eq('name', row.nome.trim())
        .maybeSingle()

      if (existing) { result.skipped++; continue }

      const { error } = await supabase.from('consultants').insert({
        company_id: company.id,
        name: row.nome.trim(),
        active: row.ativo,
        notes: row.observacoes || null,
        pix: row.pix || null,
        amount_due: 0,
        amount_paid: 0,
      })

      if (error) result.errors.push(`${row.nome}: ${error.message}`)
      else result.imported++
    } catch (e: unknown) {
      result.errors.push(`${row.nome}: ${e instanceof Error ? e.message : 'Erro desconhecido'}`)
    }
  }

  revalidatePath('/consultores')
  return result
}

// ─── Import Parceiros ─────────────────────────────────────────

export async function importParceiros(rows: ImportedParceiro[]): Promise<ImportResult> {
  const supabase = createClient()
  const result: ImportResult = { entity: 'Parceiros', imported: 0, skipped: 0, errors: [] }

  const { data: company } = await supabase.from('companies').select('id').single()
  if (!company) return { ...result, errors: ['Empresa não encontrada'] }

  for (const row of rows) {
    if (!row.nome?.trim()) { result.skipped++; continue }

    try {
      const { data: existing } = await supabase
        .from('partners')
        .select('id')
        .eq('company_id', company.id)
        .eq('name', row.nome.trim())
        .maybeSingle()

      if (existing) { result.skipped++; continue }

      const { error } = await supabase.from('partners').insert({
        company_id: company.id,
        name: row.nome.trim(),
        area: row.area || null,
        partner_company: row.empresa || null,
        total_referrals: 0,
        total_revenue: 0,
        fee_avg: null,
        fee_paid: 0,
        fee_due: 0,
      })

      if (error) result.errors.push(`${row.nome}: ${error.message}`)
      else result.imported++
    } catch (e: unknown) {
      result.errors.push(`${row.nome}: ${e instanceof Error ? e.message : 'Erro desconhecido'}`)
    }
  }

  revalidatePath('/parceiros')
  return result
}

// ─── Import Projetos ──────────────────────────────────────────

export async function importProjetos(rows: ImportedProjeto[]): Promise<ImportResult> {
  const supabase = createClient()
  const result: ImportResult = { entity: 'Projetos', imported: 0, skipped: 0, errors: [] }

  const { data: company } = await supabase.from('companies').select('id').single()
  if (!company) return { ...result, errors: ['Empresa não encontrada'] }

  const { data: clients } = await supabase
    .from('clients')
    .select('id, name')
    .eq('company_id', company.id)

  const clientMap = new Map((clients ?? []).map(c => [c.name.toLowerCase(), c.id]))

  for (const row of rows) {
    if (!row.codigo) { result.skipped++; continue }

    try {
      const { data: existing } = await supabase
        .from('projects')
        .select('id')
        .eq('company_id', company.id)
        .eq('code', row.codigo)
        .maybeSingle()

      if (existing) { result.skipped++; continue }

      const clientId = clientMap.get(row.cliente_nome?.toLowerCase() ?? '') ?? null

      const { error } = await supabase.from('projects').insert({
        company_id: company.id,
        client_id: clientId,
        gp: row.gp || null,
        sale_date: row.data_venda || null,
        year: row.ano || null,
        status: mapStatus(row.status),
        purchase_order: row.ordem_compra || null,
        revenue: row.receita ?? 0,
        invoiced: row.faturado ?? 0,
      })

      if (error) result.errors.push(`Proj #${row.codigo}: ${error.message}`)
      else result.imported++
    } catch (e: unknown) {
      result.errors.push(`Proj #${row.codigo}: ${e instanceof Error ? e.message : 'Erro desconhecido'}`)
    }
  }

  revalidatePath('/projetos')
  return result
}

// ─── Import Lançamentos ───────────────────────────────────────

export async function importLancamentos(rows: ImportedLancamento[]): Promise<ImportResult> {
  const supabase = createClient()
  const result: ImportResult = { entity: 'Lançamentos', imported: 0, skipped: 0, errors: [] }

  const { data: company } = await supabase.from('companies').select('id').single()
  if (!company) return { ...result, errors: ['Empresa não encontrada'] }

  const { data: projects } = await supabase
    .from('projects')
    .select('id, code')
    .eq('company_id', company.id)

  const { data: clients } = await supabase
    .from('clients')
    .select('id, name')
    .eq('company_id', company.id)

  const projectMap = new Map((projects ?? []).map(p => [p.code, p.id]))
  const clientMap = new Map((clients ?? []).map(c => [c.name.toLowerCase(), c.id]))

  // Determine status from dates
  function inferStatus(row: ImportedLancamento): 'previsto' | 'faturado' | 'pago' {
    if (row.data_pagamento) return 'pago'
    if (row.data_faturamento) return 'faturado'
    return 'previsto'
  }

  // Batch insert for performance
  const toInsert = []

  for (const row of rows) {
    if (!row.valor || !row.cod_projeto) { result.skipped++; continue }

    const projectId = projectMap.get(row.cod_projeto) ?? null
    const clientId = clientMap.get(row.cliente_nome?.toLowerCase() ?? '') ?? null
    const status = inferStatus(row)

    toInsert.push({
      project_id: projectId,
      company_id: company.id,
      client_id: clientId,
      classification: row.classificacao || 'Geral',
      installment: row.parcela ?? null,
      order_num: row.ordem ?? 0,
      amount: row.valor,
      forecast_billing: row.previsao_faturamento || null,
      billed_at: row.data_faturamento || null,
      forecast_payment: row.previsao_pagamento || null,
      paid_at: row.data_pagamento || null,
      status,
      is_manual: false,
    })
  }

  // Insert in chunks of 100
  const CHUNK = 100
  for (let i = 0; i < toInsert.length; i += CHUNK) {
    const chunk = toInsert.slice(i, i + CHUNK)
    const { error } = await supabase.from('entries').insert(chunk)
    if (error) {
      result.errors.push(`Chunk ${i / CHUNK + 1}: ${error.message}`)
    } else {
      result.imported += chunk.length
    }
  }

  revalidatePath('/lancamentos')
  revalidatePath('/projetos')
  return result
}
