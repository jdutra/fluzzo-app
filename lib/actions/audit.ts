'use server'

import { createClient } from '@/lib/supabase/server'

interface AuditParams {
  entity: string
  entity_id: string
  field: string
  old_value?: string | null
  new_value?: string | null
}

/**
 * Grava uma entrada no audit_log.
 * Regra de negócio #7: Alterações em entries.amount, entries.status,
 * projects.status devem gravar em audit_log.
 */
export async function logAudit(params: AuditParams) {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { error } = await supabase.from('audit_log').insert({
    entity: params.entity,
    entity_id: params.entity_id,
    field: params.field,
    old_value: params.old_value ? String(params.old_value) : null,
    new_value: params.new_value ? String(params.new_value) : null,
    user_id: user?.id ?? null,
  })

  if (error) {
    console.error('Erro ao gravar audit_log:', error)
  }
}
