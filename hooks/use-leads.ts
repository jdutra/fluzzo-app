'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { Lead, LeadWithRelations } from '@/lib/supabase/types'

export function useLeads() {
  const supabase = createClient()

  return useQuery<LeadWithRelations[]>({
    queryKey: ['leads'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('leads')
        .select(`
          *,
          client:clients(id, name),
          product:products(id, name, sigla),
          lead_interactions(interaction_date)
        `)
        .order('updated_at', { ascending: false })

      if (error) throw error
      return (data as LeadWithRelations[]) ?? []
    },
  })
}

export function useLead(id: string) {
  const supabase = createClient()

  return useQuery<LeadWithRelations | null>({
    queryKey: ['leads', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('leads')
        .select(`
          *,
          client:clients(id, name),
          product:products(id, name, sigla),
          interactions:lead_interactions(*)
        `)
        .eq('id', id)
        .single()

      if (error && error.code !== 'PGRST116') throw error
      return (data as unknown as LeadWithRelations) ?? null
    },
    enabled: !!id,
  })
}

export function useCreateLead() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (lead: Omit<Lead, 'id' | 'created_at' | 'updated_at'>) => {
      const { data, error } = await supabase
        .from('leads')
        .insert(lead)
        .select()
        .single()

      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] })
    },
  })
}

export function useUpdateLead() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      id,
      ...updates
    }: Partial<Lead> & { id: string }) => {
      const { data, error } = await supabase
        .from('leads')
        .update(updates)
        .eq('id', id)
        .select()
        .single()

      if (error) throw error
      return data
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['leads'] })
      queryClient.invalidateQueries({ queryKey: ['leads', variables.id] })
    },
  })
}
