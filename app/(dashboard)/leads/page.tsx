'use client'

import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { PageHeader } from '@/components/shared/page-header'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { EmptyState } from '@/components/shared/empty-state'
import { LeadSheet } from '@/components/forms/lead-sheet'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { toast } from '@/components/ui/use-toast'
import {
  TrendingUp, MoreHorizontal, Pencil, Trash2, Eye,
  ArrowRightCircle, AlertTriangle, LayoutGrid, List, CalendarClock, Search,
} from 'lucide-react'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  formatCurrencyCompact, formatDate, daysSince,
  LEAD_STAGE_LABELS, LEAD_STAGE_COLORS,
} from '@/lib/utils'
import type { Lead, LeadStage } from '@/lib/supabase/types'
import Link from 'next/link'
import { convertLeadToProject } from '@/lib/actions/leads'
import { Input } from '@/components/ui/input'

type LeadWithRelations = Lead & {
  client: { id: string; name: string } | null
  lead_products: { product: { id: string; name: string; sigla: string } | null }[]
}

const ALL_STAGES: LeadStage[] = [
  'qualificacao', 'diagnostico', 'proposta', 'negociacao', 'fechado', 'perdido',
]
const ACTIVE_STAGES: LeadStage[] = ['qualificacao', 'diagnostico', 'proposta', 'negociacao']
const FINAL_STAGES: LeadStage[] = ['fechado', 'perdido']

const STALE_DAYS = 7

const KANBAN_COLORS: Record<string, string> = {
  qualificacao: 'border-t-slate-400',
  diagnostico: 'border-t-blue-400',
  proposta: 'border-t-yellow-400',
  negociacao: 'border-t-orange-400',
  fechado: 'border-t-green-500',
  perdido: 'border-t-red-400',
}

type ViewMode = 'list' | 'kanban' | 'followup'

// ─── Kanban Column ─────────────────────────────────────────────────────────

function KanbanColumn({
  stage, stageLeads, today, onEdit, isFinal = false,
}: {
  stage: LeadStage
  stageLeads: LeadWithRelations[]
  today: string
  onEdit: (lead: LeadWithRelations) => void
  isFinal?: boolean
}) {
  const bgCard = isFinal ? 'bg-slate-50' : 'bg-white'
  return (
    <div className="flex-shrink-0 w-72">
      <div className={`${bgCard} rounded-lg border border-t-4 ${KANBAN_COLORS[stage]} shadow-sm`}>
        <div className="flex items-center justify-between px-3 py-2.5 border-b">
          <span className="text-sm font-medium text-slate-700">{LEAD_STAGE_LABELS[stage]}</span>
          <span className={`text-xs px-2 py-0.5 rounded-full ${
            stage === 'fechado' ? 'bg-green-100 text-green-600' :
            stage === 'perdido' ? 'bg-red-100 text-red-500' :
            'bg-slate-100 text-slate-500'
          }`}>{stageLeads.length}</span>
        </div>
        <div className="p-2 space-y-2 min-h-[200px] max-h-[calc(100vh-280px)] overflow-y-auto">
          {stageLeads.length === 0 && (
            <p className="text-xs text-slate-400 text-center py-6">Nenhum lead</p>
          )}
          {stageLeads.map((lead) => {
            const isStale = !isFinal && daysSince(lead.updated_at) > STALE_DAYS
            return (
              <div key={lead.id}
                className={`rounded-md border p-2.5 text-sm hover:shadow-sm transition-shadow cursor-pointer ${
                  isStale ? 'border-orange-200 bg-orange-50/50' :
                  stage === 'fechado' ? 'border-green-200 bg-white' :
                  stage === 'perdido' ? 'border-red-100 bg-white' :
                  'border-slate-200 bg-white'
                }`}
                onClick={() => onEdit(lead)}
              >
                <div className="flex items-start gap-1.5 mb-1">
                  {isStale && <AlertTriangle size={12} className="text-orange-500 mt-0.5 flex-shrink-0" />}
                  <p className="font-medium text-slate-800 leading-tight text-sm">{lead.title}</p>
                </div>
                {lead.client && (
                  <p className="text-xs text-slate-500 mb-1.5">{lead.client.name}</p>
                )}
                <div className="flex flex-wrap gap-1 mb-1.5">
                  {(lead.lead_products ?? []).map((lp) => lp.product && (
                    <span key={lp.product.id} className="font-mono text-[10px] bg-slate-100 px-1.5 py-0.5 rounded text-slate-600">
                      {lp.product.sigla}
                    </span>
                  ))}
                </div>
                <div className="flex items-center justify-between">
                  {lead.estimated_value != null ? (
                    <span className="text-xs font-semibold text-slate-700">
                      {formatCurrencyCompact(lead.estimated_value)}
                    </span>
                  ) : <span />}
                  {lead.next_step_date && !isFinal && (
                    <span className={`text-[10px] ${lead.next_step_date <= today ? 'text-red-500 font-medium' : 'text-slate-400'}`}>
                      📅 {formatDate(lead.next_step_date)}
                    </span>
                  )}
                </div>
                {lead.responsible && (
                  <p className="text-[10px] text-slate-400 mt-1">👤 {lead.responsible}</p>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export default function LeadsPage() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  const [sheetOpen, setSheetOpen] = useState(false)
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Lead | null>(null)
  const [convertTarget, setConvertTarget] = useState<Lead | null>(null)
  const [stageFilter, setStageFilter] = useState<LeadStage | 'all'>('all')
  const [viewMode, setViewMode] = useState<ViewMode>('list')
  const [search, setSearch] = useState('')

  const { data: leads = [], isLoading } = useQuery<LeadWithRelations[]>({
    queryKey: ['leads'],
    throwOnError: false,
    retry: 1,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('leads')
        .select('*, client:clients(id, name), lead_products(product:products(id, name, sigla))')
        .order('updated_at', { ascending: false })
      if (error) {
        // Fallback sem lead_products (migration 006 pode não ter sido aplicada)
        const { data: fallback, error: err2 } = await supabase
          .from('leads')
          .select('*, client:clients(id, name)')
          .order('updated_at', { ascending: false })
        if (err2) throw err2
        return (fallback ?? []).map((l) => ({ ...l, lead_products: [] })) as LeadWithRelations[]
      }
      return (data ?? []) as LeadWithRelations[]
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('leads').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      toast({ title: 'Lead removido.' })
      queryClient.invalidateQueries({ queryKey: ['leads'] })
      setDeleteTarget(null)
    },
    onError: (e: Error) => toast({ title: 'Erro ao remover.', description: e.message, variant: 'destructive' }),
  })

  const convertMutation = useMutation({
    mutationFn: async (leadId: string) => convertLeadToProject(leadId),
    onSuccess: () => {
      toast({ title: 'Lead convertido em projeto com sucesso!' })
      queryClient.invalidateQueries({ queryKey: ['leads'] })
      setConvertTarget(null)
    },
    onError: (e: Error) => toast({ title: 'Erro ao converter.', description: e.message, variant: 'destructive' }),
  })

  const today = new Date().toISOString().split('T')[0]

  // Leads com follow-up pendente (data passada ou hoje, não fechado/perdido)
  const followupLeads = useMemo(() => leads.filter(
    (l) => !['fechado', 'perdido'].includes(l.stage) &&
      l.next_step_date && l.next_step_date <= today
  ), [leads, today])

  const staleCount = leads.filter(
    (l) => !['fechado', 'perdido'].includes(l.stage) && daysSince(l.updated_at) > STALE_DAYS
  ).length

  const searchLower = search.toLowerCase()
  const filtered = (viewMode === 'followup'
    ? followupLeads
    : stageFilter === 'all'
    ? leads
    : leads.filter((l) => l.stage === stageFilter)
  ).filter((l) => {
    if (!searchLower) return true
    const productNames = (l.lead_products ?? []).map((lp) =>
      `${lp.product?.name ?? ''} ${lp.product?.sigla ?? ''}`
    ).join(' ').toLowerCase()
    return (
      l.title?.toLowerCase().includes(searchLower) ||
      l.client?.name?.toLowerCase().includes(searchLower) ||
      (l.responsible ?? '').toLowerCase().includes(searchLower) ||
      productNames.includes(searchLower)
    )
  })

  const countByStage = ALL_STAGES.reduce<Record<string, number>>((acc, s) => {
    acc[s] = leads.filter((l) => l.stage === s).length
    return acc
  }, {})

  function openCreate() { setSelectedLead(null); setSheetOpen(true) }
  function openEdit(lead: LeadWithRelations) { setSelectedLead(lead); setSheetOpen(true) }
  function handleRefresh() { queryClient.invalidateQueries({ queryKey: ['leads'] }); setSheetOpen(false) }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Leads"
        description="Pipeline de oportunidades de venda"
        action={{ label: 'Novo Lead', onClick: openCreate }}
      />

      {/* Stale alert */}
      {staleCount > 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-700">
          <AlertTriangle size={16} className="flex-shrink-0" />
          <strong>{staleCount} lead{staleCount > 1 ? 's' : ''}</strong>&nbsp;sem atualização há mais de {STALE_DAYS} dias.
        </div>
      )}

      {/* Busca */}
      {(viewMode === 'list' || viewMode === 'followup') && (
        <div className="relative max-w-sm">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input placeholder="Buscar por título, cliente, produto..." value={search}
            onChange={(e) => setSearch(e.target.value)} className="pl-9 h-9" />
        </div>
      )}

      {/* View toggle + stage filters */}
      <div className="flex flex-wrap items-center gap-2">
        {/* View mode buttons */}
        <div className="flex items-center border rounded-lg overflow-hidden">
          <button
            onClick={() => setViewMode('list')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors ${viewMode === 'list' ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
          >
            <List size={13} /> Lista
          </button>
          <button
            onClick={() => setViewMode('kanban')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border-x transition-colors ${viewMode === 'kanban' ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
          >
            <LayoutGrid size={13} /> Kanban
          </button>
          <button
            onClick={() => setViewMode('followup')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors ${viewMode === 'followup' ? 'bg-teal-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
          >
            <CalendarClock size={13} /> Follow-up
            {followupLeads.length > 0 && (
              <span className={`ml-1 px-1.5 py-0 rounded-full text-[10px] font-bold ${viewMode === 'followup' ? 'bg-white text-teal-700' : 'bg-orange-100 text-orange-700'}`}>
                {followupLeads.length}
              </span>
            )}
          </button>
        </div>

        {/* Stage filter (only in list mode) */}
        {viewMode === 'list' && (
          <>
            <div className="h-5 w-px bg-slate-200" />
            <button
              onClick={() => setStageFilter('all')}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors border ${stageFilter === 'all' ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'}`}
            >
              Todos ({leads.length})
            </button>
            {ALL_STAGES.map((s) => (
              <button key={s}
                onClick={() => setStageFilter(s)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors border ${stageFilter === s ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'}`}
              >
                {LEAD_STAGE_LABELS[s]} ({countByStage[s] ?? 0})
              </button>
            ))}
          </>
        )}

        {viewMode === 'followup' && (
          <p className="text-sm text-slate-500">
            {followupLeads.length === 0
              ? 'Nenhum follow-up pendente — tudo em dia!'
              : `${followupLeads.length} lead${followupLeads.length > 1 ? 's' : ''} com follow-up pendente ou atrasado`
            }
          </p>
        )}
      </div>

      {/* KANBAN VIEW */}
      {viewMode === 'kanban' && !isLoading && (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {/* Estágios ativos */}
          {ACTIVE_STAGES.map((stage) => {
            const stageLeads = leads.filter((l) => l.stage === stage)
            return (
              <KanbanColumn
                key={stage}
                stage={stage}
                stageLeads={stageLeads}
                today={today}
                onEdit={openEdit}
              />
            )
          })}

          {/* Divisor visual */}
          <div className="flex-shrink-0 flex items-center">
            <div className="w-px h-full min-h-[200px] bg-slate-200 mx-1" />
          </div>

          {/* Estágios finais: Aprovado e Declinado */}
          {FINAL_STAGES.map((stage) => {
            const stageLeads = leads.filter((l) => l.stage === stage)
            return (
              <KanbanColumn
                key={stage}
                stage={stage}
                stageLeads={stageLeads}
                today={today}
                onEdit={openEdit}
                isFinal
              />
            )
          })}
        </div>
      )}

      {/* LIST / FOLLOW-UP VIEW */}
      {(viewMode === 'list' || viewMode === 'followup') && (
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          {isLoading ? (
            <div className="p-8 space-y-3">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-10 rounded-md bg-slate-100 animate-pulse" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={viewMode === 'followup' ? CalendarClock : TrendingUp}
              title={viewMode === 'followup' ? 'Nenhum follow-up pendente' : 'Nenhum lead encontrado'}
              description={viewMode === 'followup' ? 'Todos os follow-ups estão em dia!' : stageFilter !== 'all' ? `Não há leads em "${LEAD_STAGE_LABELS[stageFilter]}"` : 'Cadastre o primeiro lead para iniciar o pipeline.'}
              action={stageFilter === 'all' && viewMode === 'list' ? { label: 'Novo Lead', onClick: openCreate } : undefined}
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50">
                    <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Título</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide hidden md:table-cell">Cliente</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide hidden md:table-cell">Produtos</th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide hidden md:table-cell">Valor</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Estágio</th>
                    <th className="text-center px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide hidden lg:table-cell">Dias</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide hidden lg:table-cell">Responsável</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide hidden xl:table-cell">Próximo passo</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.map((lead) => {
                    const isStale = !['fechado', 'perdido'].includes(lead.stage) && daysSince(lead.updated_at) > STALE_DAYS
                    const isOverdue = lead.next_step_date && lead.next_step_date < today
                    const canConvert = lead.stage !== 'perdido' && !lead.converted_project_id

                    return (
                      <tr key={lead.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            {isStale && <AlertTriangle size={13} className="text-orange-500 flex-shrink-0" />}
                            <Link href={`/leads/${lead.id}`} className="font-medium text-slate-900 hover:text-teal-600 truncate max-w-[180px]">
                              {lead.title}
                            </Link>
                            {lead.converted_project_id && (
                              <Badge className="bg-green-100 text-green-700 text-[10px] px-1.5 py-0">Convertido</Badge>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-slate-600 hidden md:table-cell">
                          {lead.client?.name ?? <span className="text-slate-400">—</span>}
                        </td>
                        <td className="px-4 py-3 hidden md:table-cell">
                          <div className="flex flex-wrap gap-1">
                            {(lead.lead_products ?? []).length > 0
                              ? (lead.lead_products ?? []).map((lp) => lp.product && (
                                <span key={lp.product.id} className="font-mono text-xs bg-slate-100 px-1.5 py-0.5 rounded">
                                  {lp.product.sigla}
                                </span>
                              ))
                              : <span className="text-slate-400">—</span>
                            }
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right font-medium text-slate-700 hidden md:table-cell">
                          {lead.estimated_value != null ? formatCurrencyCompact(lead.estimated_value) : <span className="text-slate-400">—</span>}
                        </td>
                        <td className="px-4 py-3">
                          <Badge className={LEAD_STAGE_COLORS[lead.stage]}>
                            {LEAD_STAGE_LABELS[lead.stage]}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-center hidden lg:table-cell">
                          {lead.created_at ? (
                            <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${
                              daysSince(lead.created_at) > 30 ? 'bg-orange-100 text-orange-700' : 'bg-slate-100 text-slate-600'
                            }`}>
                              {daysSince(lead.created_at)}d
                            </span>
                          ) : <span className="text-slate-400">—</span>}
                        </td>
                        <td className="px-4 py-3 text-slate-600 hidden lg:table-cell">
                          {lead.responsible ?? <span className="text-slate-400">—</span>}
                        </td>
                        <td className="px-4 py-3 text-slate-600 max-w-[160px] hidden xl:table-cell">
                          {lead.next_step ? (
                            <div>
                              <p className="truncate text-xs">{lead.next_step}</p>
                              {lead.next_step_date && (
                                <p className={`text-[11px] ${isOverdue ? 'text-red-500 font-medium' : 'text-slate-400'}`}>
                                  {isOverdue ? '⚠ ' : ''}{formatDate(lead.next_step_date)}
                                </p>
                              )}
                            </div>
                          ) : <span className="text-slate-400">—</span>}
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
                                <Link href={`/leads/${lead.id}`} className="flex items-center gap-2 cursor-pointer">
                                  <Eye size={14} /> Ver detalhes
                                </Link>
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => openEdit(lead)} className="gap-2">
                                <Pencil size={14} /> Editar
                              </DropdownMenuItem>
                              {canConvert && (
                                <>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem onClick={() => setConvertTarget(lead)} className="gap-2 text-teal-600 focus:text-teal-700">
                                    <ArrowRightCircle size={14} /> Converter em projeto
                                  </DropdownMenuItem>
                                </>
                              )}
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={() => setDeleteTarget(lead)} className="gap-2 text-red-500 focus:text-red-600">
                                <Trash2 size={14} /> Remover
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <LeadSheet open={sheetOpen} onOpenChange={setSheetOpen} lead={selectedLead} onSuccess={handleRefresh} />

      <ConfirmDialog open={!!deleteTarget} onOpenChange={(v) => !v && setDeleteTarget(null)}
        title="Remover lead"
        description={`Tem certeza que deseja remover o lead "${deleteTarget?.title}"?`}
        confirmLabel="Remover" loading={deleteMutation.isPending}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)} />

      <ConfirmDialog open={!!convertTarget} onOpenChange={(v) => !v && setConvertTarget(null)}
        title="Converter em projeto"
        description={`Deseja converter "${convertTarget?.title}" em um projeto?`}
        confirmLabel="Converter" loading={convertMutation.isPending}
        onConfirm={() => convertTarget && convertMutation.mutate(convertTarget.id)} />

    </div>
  )
}
