'use server'

import { createClient } from '@/lib/supabase/server'
import { KpiComponent } from '@/lib/supabase/types'

// ─── Fetch all active indicators for the company ──────────────────────────────
export async function getKpiIndicators() {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('kpi_indicators')
    .select('*')
    .eq('active', true)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })
  if (error) throw error
  return data ?? []
}

// ─── Create ───────────────────────────────────────────────────────────────────
export async function createKpiIndicator(payload: {
  name: string
  color: string
  components: KpiComponent[]
  show_percent: boolean
  percent_base_components: KpiComponent[]
  sort_order?: number
}) {
  const supabase = createClient()

  // Resolve company_id from session context
  const { data: companies } = await supabase
    .from('companies')
    .select('id')
    .limit(1)
    .single() as { data: { id: string } | null; error: unknown }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('kpi_indicators')
    .insert({
      company_id: companies?.id ?? null,
      name: payload.name,
      color: payload.color,
      components: payload.components,
      show_percent: payload.show_percent,
      percent_base_components: payload.percent_base_components,
      sort_order: payload.sort_order ?? 0,
    })
    .select()
    .single()

  if (error) throw error
  return data
}

// ─── Update ───────────────────────────────────────────────────────────────────
export async function updateKpiIndicator(
  id: string,
  payload: {
    name?: string
    color?: string
    components?: KpiComponent[]
    show_percent?: boolean
    percent_base_components?: KpiComponent[]
    sort_order?: number
  }
) {
  const supabase = createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('kpi_indicators')
    .update(payload)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

// ─── Delete (soft) ────────────────────────────────────────────────────────────
export async function deleteKpiIndicator(id: string) {
  const supabase = createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from('kpi_indicators')
    .update({ active: false })
    .eq('id', id)
  if (error) throw error
}
