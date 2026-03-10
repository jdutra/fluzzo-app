'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { PageHeader } from '@/components/shared/page-header'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { EmptyState } from '@/components/shared/empty-state'
import { ProjectSheet } from '@/components/forms/project-sheet'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { toast } from '@/components/ui/use-toast'
import { Toaster } from '@/components/ui/toaster'
import {
  FolderKanban, MoreHorizontal, Pencil, Trash2, Eye,
} from 'lucide-react'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  formatCurrency, formatDate,
  PROJECT_STATUS_LABELS, PROJECT_STATUS_COLORS,
} from '@/lib/utils'
import type { Project, ProjectStatus } from '@/lib/supabase/types'
import Link from 'next/link'

type ProjectWithClient = Project & {
  client: { id: string; name: string } | null
}

const ALL_STATUSES: ProjectStatus[] = ['ativo', 'on-hold', 'concluido', 'cancelado']

export default function ProjetosPage() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  const [sheetOpen, setSheetOpen] = useState(false)
  const [selectedProject, setSelectedProject] = useState<Project | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null)
  const [statusFilter, setStatusFilter] = useState<ProjectStatus | 'all'>('all')

  const { data: projects = [], isLoading } = useQuery<ProjectWithClient[]>({
    queryKey: ['projects'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('projects')
        .select('*, client:clients(id, name)')
        .order('code', { ascending: false })
      if (error) throw error
      return (data ?? []) as ProjectWithClient[]
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('projects').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      toast({ title: 'Projeto removido.' })
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      setDeleteTarget(null)
    },
    onError: (e: Error) => toast({ title: 'Erro ao remover.', description: e.message, variant: 'destructive' }),
  })

  const filtered = statusFilter === 'all'
    ? projects
    : projects.filter((p) => p.status === statusFilter)

  const countByStatus = ALL_STATUSES.reduce<Record<string, number>>((acc, s) => {
    acc[s] = projects.filter((p) => p.status === s).length
    return acc
  }, {})

  // Totals
  const totalRevenue = filtered.reduce((sum, p) => sum + (p.revenue ?? 0), 0)

  function openCreate() {
    setSelectedProject(null)
    setSheetOpen(true)
  }

  function openEdit(project: Project) {
    setSelectedProject(project)
    setSheetOpen(true)
  }

  function handleRefresh() {
    queryClient.invalidateQueries({ queryKey: ['projects'] })
    setSheetOpen(false)
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Projetos"
        description="Contratos e projetos ativos"
        action={{ label: 'Novo Projeto', onClick: openCreate }}
      />

      {/* Status filter tabs */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setStatusFilter('all')}
          className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors border ${
            statusFilter === 'all'
              ? 'bg-slate-900 text-white border-slate-900'
              : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'
          }`}
        >
          Todos ({projects.length})
        </button>
        {ALL_STATUSES.map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors border ${
              statusFilter === s
                ? 'bg-slate-900 text-white border-slate-900'
                : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'
            }`}
          >
            {PROJECT_STATUS_LABELS[s]} ({countByStatus[s] ?? 0})
          </button>
        ))}
      </div>

      {/* Summary strip */}
      {filtered.length > 0 && (
        <div className="flex items-center gap-6 px-4 py-3 rounded-lg bg-slate-50 border border-slate-100 text-sm">
          <div>
            <span className="text-slate-500">Projetos: </span>
            <span className="font-semibold text-slate-800">{filtered.length}</span>
          </div>
          <div>
            <span className="text-slate-500">Receita total: </span>
            <span className="font-semibold text-slate-800">{formatCurrency(totalRevenue)}</span>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        {isLoading ? (
          <div className="p-8 space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-10 rounded-md bg-slate-100 animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={FolderKanban}
            title="Nenhum projeto encontrado"
            description={
              statusFilter !== 'all'
                ? `Não há projetos com status "${PROJECT_STATUS_LABELS[statusFilter]}".`
                : 'Cadastre o primeiro projeto ou converta um lead em projeto.'
            }
            action={statusFilter === 'all' ? { label: 'Novo Projeto', onClick: openCreate } : undefined}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide w-16">Cód.</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Cliente</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">GP</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Venda</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Receita</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Faturado</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Status</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((project) => (
                  <tr key={project.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3">
                      <Link
                        href={`/projetos/${project.id}`}
                        className="font-mono text-sky-600 hover:text-sky-800 font-medium"
                      >
                        #{project.code}
                      </Link>
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-800">
                      {project.client?.name ?? <span className="text-slate-400">—</span>}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {project.gp ?? <span className="text-slate-400">—</span>}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {project.sale_date ? formatDate(project.sale_date) : <span className="text-slate-400">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-slate-700">
                      {formatCurrency(project.revenue)}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-600">
                      {formatCurrency(project.invoiced)}
                    </td>
                    <td className="px-4 py-3">
                      <Badge className={PROJECT_STATUS_COLORS[project.status]}>
                        {PROJECT_STATUS_LABELS[project.status]}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal size={15} />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem asChild>
                            <Link href={`/projetos/${project.id}`} className="flex items-center gap-2 cursor-pointer">
                              <Eye size={14} /> Ver detalhes
                            </Link>
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => openEdit(project)} className="gap-2">
                            <Pencil size={14} /> Editar
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => setDeleteTarget(project)}
                            className="gap-2 text-red-500 focus:text-red-600"
                          >
                            <Trash2 size={14} /> Remover
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ProjectSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        project={selectedProject}
        onSuccess={handleRefresh}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(v) => !v && setDeleteTarget(null)}
        title="Remover projeto"
        description={`Remover o projeto #${deleteTarget?.code}? Os lançamentos associados também serão removidos.`}
        confirmLabel="Remover"
        loading={deleteMutation.isPending}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
      />

      <Toaster />
    </div>
  )
}
