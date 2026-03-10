'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

/**
 * Vincula uma transação do extrato a um lançamento (entry).
 */
export async function reconcileExtract(extractId: string, entryId: string) {
  const supabase = createClient()

  const { error } = await supabase
    .from('bank_extract')
    .update({ reconciled: true, reconciled_entry_id: entryId })
    .eq('id', extractId)

  if (error) throw error
  revalidatePath('/extrato')
}

/**
 * Remove a vinculação de uma transação do extrato.
 */
export async function unreconcileExtract(extractId: string) {
  const supabase = createClient()

  const { error } = await supabase
    .from('bank_extract')
    .update({ reconciled: false, reconciled_entry_id: null })
    .eq('id', extractId)

  if (error) throw error
  revalidatePath('/extrato')
}
