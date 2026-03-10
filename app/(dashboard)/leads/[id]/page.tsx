'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { toast } from '@/components/ui/use-toast'
import { Toaster } from '@/components/ui/toaster'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { LeadSheet } from '@/components/forms/lead-sheet'
import { InteractionSheet } from '@/components/forms/interaction-sheet'
import {
  Pencil, ArrowLeft, ArrowRightCircle, AlertTriangle,
  MessageSquarePlus, CalendarClock, User, Tag, DollarSign,
  FileText, Phone, Users, Mail, Handshake, MoreHorizontal, Trash2,
} from 'lucide-react'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  formatCurrency, formatDate, formatDatetime, daysSince,
  LEAD_STAGE_LABELS, LEAD_STAGE_COLORS,
} from '@/lib/utils'
import type { Lead, LeadInteraction, InteractionType } from '@/lib/supabase/types'
import Link from 'next/link'
import { convertLeadToProject } from '@/lib/actions/leads'

type LeadDetail = Lead & {
  client: { id: string; name: string } | null
  product: { id: string; name: string; sigla: string } | null
}

const INTERACTION_TYPE_ICONS: Record<InteractionType, React.ElementType> = {
  contato: Phone,
  reuniao: Users,
  proposta: FileText,
  email: Mail,
  outro: MessageSquarePlus,
}

const INTERACTION_TYPE_LABELS: Record<InteractionType, string> = {
  contato: 'Contato',
  reuniao: 'Reunião',
  proposta: 'Proposta',
  email: 'E-mail',
  outro: 'Outro',
}

const INTERACTION_TYPE_COLORS: Record<InteractionType, string> = {
  contato: 'bg-blue-100 text-blue-700',
  reuniao: 'bg-purple-100 text-purple-700',
  proposta: 'bg-yellow-100 text-yellow-700',
  email: 'bg-slate-100 text-slate-700',
  outro: 'bg-slate-100 text-slate-600',
}

const STALE_DAYS = 7

export default function LeadDetailPage({ params }: { params: { id: string } }) {
  const supabase = createClient()
  const queryClient = useQueryClient()
  const leadId = params.id

  const [editSheetOpen, setEditSheetOpen] = useState(false)
  const [interactionSheetOpen, setInteractionSheetOpen] = useState(false)
  const [selectedInteraction, setSelectedInteraction] = useState<LeadInteraction | null>(null)
  const [convertConfirmOpen, setConvertConfirmOpen] = useState(false)
  const [deleteInteractionTarget, setDeleteInteractionTarget] = useState<LeadInteraction | null>(null)

  const { data: lead, isLoading: leadLoading } = useQuery<LeadDetail>({
    queryKey: ['lead', leadId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('leads')
        .select('*, client:clients(id, name), product:products(id, name, sigla)')
        .eq('id', leadId)
        .single()
      if (error) throw error
      return data as LeadDetail
    },
  })

  const { data: interactions = [], isLoading: interactionsLoading } = useQuery<LeadInteraction[]>({
    queryKey: ['lead-interactions', leadId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('lead_interactions')
        .select('*')
        .eq('lead_id', leadId)
        .order('interaction_date', { ascending: false })
      if (error) throw error
      return data ?? []
    },
  })

  const convertMutation = useMutation({
    mutationFn: async () => convertLeadToProject(leadId),
    onSuccess: () => {
      toast({ title: 'Lead convertido em projeto com sucesso!' })
      queryClient.invalidateQueries({ queryKey: ['lead', leadId] })
      setConvertConfirmOpen(false)
    },
    onError: (e: Error) => toast({ title: 'Erro ao converter.', description: e.message, variant: 'destructive' }),
  })

  const deleteInteractionMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('lead_interactions').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      toast({ title: 'Interação removida.' })
      queryClient.invalidateQueries({ queryKey: ['lead-interactions', leadId] })
      setDeleteInteractionTarget(null)
    },
    onError: (e: Error) => toast({ title: 'Erro ao remover.', description: e.message, variant: 'destructive' }),
  })

  function handleLeadUpdated() {
    queryClient.invalidateQueries({ queryKey: ['lead', leadId] })
    queryClient.invalidateQueries({ queryKey: ['leads'] })
    setEditSheetOpen(false)
  }

  function handleInteractionSaved() {
    queryClient.invalidateQueries({ queryKey: ['lead-interactions', leadId] })
    queryClient.invalidateQueries({ queryKey: ['lead', leadId] })
    setInteractionSheetOpen(false)
    setSelectedInteraction(null)
  }

  function openAddInteraction() {
    setSelectedInteraction(null)
    setInteractionSheetOpen(true)
  }

  function openEditInteraction(interaction: LeadInteraction) {
    setSelectedInteraction(interaction)
    setInteractionSheetOpen(true)
  }

  if (leadLoading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 bg-slate-100 rounded animate-pulse" />
        <div className="h-48 bg-slate-100 rounded-xl animate-pulse" />
        <div className="h-64 bg-slate-100 rounded-xl animate-pulse" />
      </div>
    )
  }

  if (!lead) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        Lead não encontrado.{' '}
        <Link href="/leads" className="text-sky-600 hover:underline">Voltar</Link>
      </div>
    )
  }

  const isStale = !['fechado', 'perdido'].includes(lead.stage) && daysSince(lead.updated_at) > STALE_DAYS
  const canConvert = lead.stage !== 'perdido' && !lead.converted_project_id

  return (
    <div className="space-y-5">
      {/* Breadcrumb + actions */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/leads"
            className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 transition-colors"
          >
            <ArrowLeft size={15} />
            Leads
          </Link>
          <span className="text-slate-300">/</span>
          <span className="text-sm font-medium text-slate-700 truncate max-w-[300px]">{lead.title}</span>
        </div>
        <div className="flex items-center gap-2">
          {canConvert && (
            <Button
              size="sm"
              onClick={() => setConvertConfirmOpen(true)}
              className="bg-sky-600 hover:bg-sky-700 gap-2"
            >
              <ArrowRightCircle size={14} />
              Converter em projeto
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={() => setEditSheetOpen(true)}
            className="gap-2"
          >
            <Pencil size={14} />
            Editar
          </Button>
        </div>
      </div>

      {/* Stale warning */}
      {isStale && (
        <div className="flex items-center gap-2 rounded-lg border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-700">
          <AlertTriangle size={16} className="flex-shrink-0" />
          <span>
            Este lead está sem atualização há <strong>{daysSince(lead.updated_at)} dias</strong>.
            Registre uma interação para manter o pipeline atualizado.
          </span>
        </div>
      )}

      {/* Converted badge */}
      {lead.converted_project_id && (
        <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
          <ArrowRightCircle size={16} className="flex-shrink-0" />
          <span>
            Lead convertido em projeto.{' '}
            <Link href={`/projetos`} className="font-medium underline">Ver projetos</Link>
          </span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Lead info card */}
        <div className="lg:col-span-1 space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-2">
                <CardTitle className="text-base leading-tight">{lead.title}</CardTitle>
                <Badge className={LEAD_STAGE_COLORS[lead.stage]}>
                  {LEAD_STAGE_LABELS[lead.stage]}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <InfoRow icon={Users} label="Cliente" value={lead.client?.name} />
              <InfoRow
                icon={Tag}
                label="Produto"
                value={lead.product ? `${lead.product.sigla} — ${lead.product.name}` : null}
              />
              <InfoRow
                icon={DollarSign}
                label="Valor estimado"
                value={lead.estimated_value != null ? formatCurrency(lead.estimated_value) : null}
              />
              <InfoRow icon={User} label="Responsável" value={lead.responsible} />

              {(lead.next_step || lead.next_step_date) && (
                <>
                  <Separator />
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Próximo passo</p>
                    {lead.next_step && <p className="text-slate-700">{lead.next_step}</p>}
                    {lead.next_step_date && (
                      <p className="flex items-center gap-1 text-slate-500 text-xs">
                        <CalendarClock size={12} />
                        {formatDate(lead.next_step_date)}
                      </p>
                    )}
                  </div>
                </>
              )}

              {lead.notes && (
                <>
                  <Separator />
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Observações</p>
                    <p className="text-slate-600 text-xs leading-relaxed">{lead.notes}</p>
                  </div>
                </>
              )}

              {lead.lost_reason && (
                <>
                  <Separator />
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-red-500 uppercase tracking-wide">Motivo da perda</p>
                    <p className="text-slate-600 text-xs leading-relaxed">{lead.lost_reason}</p>
                  </div>
                </>
              )}

              <Separator />
              <div className="text-xs text-slate-400 space-y-0.5">
                <p>Criado em {formatDate(lead.created_at)}</p>
                <p>Atualizado em {formatDatetime(lead.updated_at)}</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Interactions timeline */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Histórico de interações</CardTitle>
                <Button size="sm" onClick={openAddInteraction} className="bg-sky-600 hover:bg-sky-700 gap-2">
                  <MessageSquarePlus size={14} />
                  Registrar
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {interactionsLoading ? (
                <div className="space-y-3">
                  {[...Array(3)].map((_, i) => (
                    <div key={i} className="h-16 rounded-lg bg-slate-100 animate-pulse" />
                  ))}
                </div>
              ) : interactions.length === 0 ? (
                <div className="flex flex-col items-center py-10 text-center text-slate-400">
                  <MessageSquarePlus size={32} className="mb-3 opacity-30" />
                  <p className="font-medium text-slate-600">Nenhuma interação registrada</p>
                  <p className="text-sm mt-1">Registre a primeira interação com este lead.</p>
                  <Button size="sm" onClick={openAddInteraction} className="mt-4 bg-sky-600 hover:bg-sky-700">
                    Registrar interação
                  </Button>
                </div>
              ) : (
                <div className="relative">
                  {/* Timeline line */}
                  <div className="absolute left-4 top-3 bottom-3 w-px bg-slate-200" />

                  <div className="space-y-4">
                    {interactions.map((interaction) => {
                      const type = (interaction.type ?? 'outro') as InteractionType
                      const Icon = INTERACTION_TYPE_ICONS[type]
                      const colorClass = INTERACTION_TYPE_COLORS[type]

                      return (
                        <div key={interaction.id} className="flex gap-4">
                          {/* Icon dot */}
                          <div className={`relative z-10 flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${colorClass}`}>
                            <Icon size={14} />
                          </div>

                          {/* Content */}
                          <div className="flex-1 min-w-0 bg-slate-50 rounded-lg p-3 group">
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex items-center gap-2 flex-wrap">
                                <Badge className={`${colorClass} text-xs`}>
                                  {INTERACTION_TYPE_LABELS[type]}
                                </Badge>
                                <span className="text-xs text-slate-400">
                                  {formatDate(interaction.interaction_date)}
                                </span>
                              </div>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                                  >
                                    <MoreHorizontal size={12} />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem onClick={() => openEditInteraction(interaction)} className="gap-2">
                                    <Pencil size={13} /> Editar
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onClick={() => setDeleteInteractionTarget(interaction)}
                                    className="gap-2 text-red-500 focus:text-red-600"
                                  >
                                    <Trash2 size={13} /> Remover
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                            <p className="text-sm text-slate-700 mt-1.5 leading-relaxed">
                              {interaction.description}
                            </p>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Sheets */}
      <LeadSheet
        open={editSheetOpen}
        onOpenChange={setEditSheetOpen}
        lead={lead}
        onSuccess={handleLeadUpdated}
      />

      <InteractionSheet
        open={interactionSheetOpen}
        onOpenChange={setInteractionSheetOpen}
        leadId={leadId}
        interaction={selectedInteraction}
        onSuccess={handleInteractionSaved}
      />

      {/* Convert confirm */}
      <ConfirmDialog
        open={convertConfirmOpen}
        onOpenChange={setConvertConfirmOpen}
        title="Converter em projeto"
        description={`Deseja converter "${lead.title}" em um projeto? O lead será marcado como "Fechado" e um novo projeto será criado automaticamente.`}
        confirmLabel="Converter"
        loading={convertMutation.isPending}
        onConfirm={() => convertMutation.mutate()}
      />

      {/* Delete interaction confirm */}
      <ConfirmDialog
        open={!!deleteInteractionTarget}
        onOpenChange={(v) => !v && setDeleteInteractionTarget(null)}
        title="Remover interação"
        description="Tem certeza que deseja remover esta interação? Esta ação não pode ser desfeita."
        confirmLabel="Remover"
        loading={deleteInteractionMutation.isPending}
        onConfirm={() => deleteInteractionTarget && deleteInteractionMutation.mutate(deleteInteractionTarget.id)}
      />

      <Toaster />
    </div>
  )
}

// ─── Helper component ─────────────────────────────────────────

function InfoRow({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ElementType
  label: string
  value: string | null | undefined
}) {
  return (
    <div className="flex items-start gap-2.5">
      <Icon size={14} className="text-slate-400 mt-0.5 flex-shrink-0" />
      <div className="min-w-0">
        <p className="text-[11px] text-slate-400 uppercase tracking-wide leading-none mb-0.5">{label}</p>
        <p className="text-slate-700 truncate">
          {value ?? <span className="text-slate-400 italic">Não informado</span>}
        </p>
      </div>
    </div>
  )
}
