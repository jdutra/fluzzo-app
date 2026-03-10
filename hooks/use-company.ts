'use client'

import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { Company } from '@/lib/supabase/types'

export function useCompany() {
  const supabase = createClient()

  return useQuery<Company | null>({
    queryKey: ['company'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('companies')
        .select('*')
        .single()

      if (error && error.code !== 'PGRST116') throw error
      return data ?? null
    },
    staleTime: 1000 * 60 * 10, // 10 minutos
  })
}
