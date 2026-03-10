'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { Project, ProjectWithRelations } from '@/lib/supabase/types'

export function useProjects() {
  const supabase = createClient()

  return useQuery<ProjectWithRelations[]>({
    queryKey: ['projects'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('projects')
        .select(`
          *,
          client:clients(id, name),
          consultants:project_consultants(*, consultant:consultants(id, name)),
          partners:project_partners(*, partner:partners(id, name))
        `)
        .order('code', { ascending: false })

      if (error) throw error
      return (data as ProjectWithRelations[]) ?? []
    },
  })
}

export function useProject(id: string) {
  const supabase = createClient()

  return useQuery<ProjectWithRelations | null>({
    queryKey: ['projects', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('projects')
        .select(`
          *,
          client:clients(id, name),
          consultants:project_consultants(*, consultant:consultants(id, name)),
          partners:project_partners(*, partner:partners(id, name)),
          entries(*)
        `)
        .eq('id', id)
        .single()

      if (error && error.code !== 'PGRST116') throw error
      return (data as unknown as ProjectWithRelations) ?? null
    },
    enabled: !!id,
  })
}

export function useCreateProject() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (
      project: Omit<Project, 'id' | 'code' | 'created_at' | 'updated_at'>
    ) => {
      const { data, error } = await supabase
        .from('projects')
        .insert(project)
        .select()
        .single()

      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] })
    },
  })
}

export function useUpdateProject() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      id,
      ...updates
    }: Partial<Project> & { id: string }) => {
      const { data, error } = await supabase
        .from('projects')
        .update(updates)
        .eq('id', id)
        .select()
        .single()

      if (error) throw error
      return data
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      queryClient.invalidateQueries({ queryKey: ['projects', variables.id] })
    },
  })
}
