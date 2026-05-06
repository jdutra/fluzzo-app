'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from '@/components/ui/use-toast'
import { ProjectSheet } from '@/components/forms/project-sheet'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import {
  ArrowLeft, Pencil, User, CalendarDays,
  FileText, Receipt, UserCheck, Handshake, Plus, Check, X, Package, Trash2,
} from 'lucide-react'
import {
  formatCurrency, formatDate,
  PROJECT_STATUS_LABELS, PROJECT_STATUS_COLORS,
  ENTRY_STATUS_LABELS, ENTRY_STATUS_COLORS,
} from '@/lib/utils'
import type { Project, Entry, EntryStatus } from '@/lib/supabase/types'
import Link from 'next/link'
import { updateEntryStatus, createManualEntry, createManualEntries, updateEntry, deleteEntry } from '@/lib/actions/entries'
import { addProjectConsultant, addProjectPartner } from '@/lib/actions/projects'

type ProjectDetail = Project & {
  client: { id: string; name: string } | null
}

type EntryRow = Entry & {
  consultant: { id: string; name: string } | null
}

type ProjectConsultantRow = {
  id: string
  role: string | null
  fee_pct: number
  amount_due: number
  amount_paid: number
  installments: number
  monthly_value: number
  consultant: { id: string; name: string }
}

type ProjectPartnerRow = {
  id: string
  fee_pct: number
  fee_amount: number
  fee_paid: number
  partner: { id: string; name: string }
}

type ProjectProductRow = {
  id: string
  product_id: string
  value: number | null
  product: { id: string; sigla: string; name: string }
}

const STATUS_FLOW: Record<EntryStatus, EntryStatus | null> = {
  previsto: 'faturado',
  faturado: 'pago',
  pago: null,
  cancelado: null,
}

const STATUS_FLOW_LABEL: Record<EntryStatus, string | null> = {
  previsto: 'Marcar como faturado',
  faturado: 'Marcar como pago',
  pago: null,
  cancelado: null,
}

type ConsultantForm = { consultant_id: string; role: string; billing_start_date: string; installments: string; monthly_value: string }
type PartnerForm = { partner_id: string; fee_pct: string; fee_amount: string; installments: string }

const emptyConsultantForm: ConsultantForm = { consultant_id: '', role: '', billing_start_date: '', installments: '1', monthly_value: '' }
const emptyPartnerForm: PartnerForm = { partner_id: '', fee_pct: '', fee_amount: '', installments: '1' }

export default function ProjectDetailPage({ params }: { params: { id: string } }) {
  const supabase = createClient()
  const queryClient = useQueryClient()
  const projectId = params.id

  const [editSheetOpen, setEditSheetOpen] = useState(false)
  const [addingConsultant, setAddingConsultant] = useState(false)
  const [addingPartner, setAddingPartner] = useState(false)
  const [newConsultant, setNewConsultant] = useState<ConsultantForm>(emptyConsultantForm)
  const [newPartner, setNewPartner] = useState<PartnerForm>(emptyPartnerForm)

  // Estado para criar/editar lançamentos
  type EntryForm = { classification: string; amount: string; forecast_payment: string; forecast_billing: string; notes: string; repetitions: string }
  const emptyEntryForm: EntryForm = { classification: 'Receita', amount: '', forecast_payment: '', forecast_billing: '', notes: '', repetitions: '1' }
  const [addingEntry, setAddingEntry] = useState(false)
  const [editingEntry, setEditingEntry] = useState<EntryRow | null>(null)
  const [entryForm, setEntryForm] = useState<EntryForm>(emptyEntryForm)
  const [deleteEntryTarget, setDeleteEntryTarget] = useState<EntryRow | null>(null)

  // ─── Queries ─────────────────────────────────────────────
  const { data: project, isLoading: projectLoading } = useQuery<ProjectDetail>({
    queryKey: ['project', projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('projects')
        .select('*, client:clients(id, name)')
        .eq('id', projectId)
        .single()
      if (error) throw error
      return data as ProjectDetail
    },
  })

  const { data: entries = [] } = useQuery<EntryRow[]>({
    queryKey: ['project-entries', projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('entries')
        .select('*, consultant:consultants(id, name)')
        .eq('project_id', projectId)
        .order('installment')
      if (error) throw error
      return (data ?? []) as EntryRow[]
    },
  })

  const { data: consultants = [] } = useQuery<ProjectConsultantRow[]>({
    queryKey: ['project-consultants', projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('project_consultants')
        .select('*, consultant:consultants(id, name)')
        .eq('project_id', projectId)
      if (error) throw error
      return (data ?? []) as ProjectConsultantRow[]
    },
  })

  const { data: partners = [] } = useQuery<ProjectPartnerRow[]>({
    queryKey: ['project-partners', projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('project_partners')
        .select('*, partner:partners(id, name)')
        .eq('project_id', projectId)
      if (error) throw error
      return (data ?? []) as ProjectPartnerRow[]
    },
  })

  const { data: projectProducts = [] } = useQuery<ProjectProductRow[]>({
    queryKey: ['project-products', projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('project_products')
        .select('*, product:products(id, sigla, name)')
        .eq('project_id', projectId)
      if (error) throw error
      return (data ?? []).map((r: any) => ({ ...r, value: r.value ?? null })) as ProjectProductRow[]
    },
  })

  const { data: allConsultants = [] } = useQuery<{ id: string; name: string }[]>({
    queryKey: ['consultants-active'],
    queryFn: async () => {
      const { data } = await supabase.from('consultants').select('id, name').eq('active', true).order('name')
      return data ?? []
    },
  })

  const { data: allPartners = [] } = useQuery<{ id: string; name: string }[]>({
    queryKey: ['partners-active'],
    queryFn: async () => {
      const { data } = await supabase.from('partners').select('id, name').order('name')
      return data ?? []
    },
  })

  const { data: company } = useQuery<{ encargo_simples: number } | null>({
    queryKey: ['company'],
    queryFn: async () => {
      const { data } = await supabase.from('companies').select('encargo_simples').single()
      return data ?? null
    },
  })

  const { data: classifications = [] } = useQuery<{ id: string; name: string; parent_id: string | null }[]>({
    queryKey: ['classifications-active'],
    queryFn: async () => {
      const { data } = await supabase
        .from('classifications')
        .select('id, name, parent_id')
        .eq('active', true)
        .eq('is_totalizador', false)
        .order('sort_order')
        .order('name')
      return data ?? []
    },
  })

  const [mutatingEntryId, setMutatingEntryId] = useState<string | null>(null)

  // ─── Mutations ────────────────────────────────────────────
  const statusMutation = useMutation({
    mutationFn: async ({ entry, newStatus }: { entry: Entry; newStatus: EntryStatus }) => {
      setMutatingEntryId(entry.id)
      await updateEntryStatus(entry.id, newStatus, entry.status)
    },
    onSuccess: () => {
      setMutatingEntryId(null)
      queryClient.invalidateQueries({ queryKey: ['project-entries', projectId] })
      queryClient.invalidateQueries({ queryKey: ['entries'] })
      toast({ title: 'Status do lançamento atualizado.' })
    },
    onError: (e: Error) => {
      setMutatingEntryId(null)
      toast({ title: 'Erro.', description: e.message, variant: 'destructive' })
    },
  })

  const addConsultantMutation = useMutation({
    mutationFn: async () => {
      if (!newConsultant.consultant_id) throw new Error('Selecione um consultor')
      await addProjectConsultant({
        project_id: projectId,
        consultant_id: newConsultant.consultant_id,
        role: newConsultant.role || null,
        billing_start_date: newConsultant.billing_start_date || null,
        installments: parseInt(newConsultant.installments) || 1,
        monthly_value: parseFloat(newConsultant.monthly_value) || 0,
        company_id: project?.company_id ?? null,
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-consultants', projectId] })
      queryClient.invalidateQueries({ queryKey: ['project-entries', projectId] })
      queryClient.invalidateQueries({ queryKey: ['entries'] })
      setNewConsultant(emptyConsultantForm)
      setAddingConsultant(false)
      toast({ title: 'Consultor adicionado.' })
    },
    onError: (e: Error) => toast({ title: 'Erro.', description: e.message, variant: 'destructive' }),
  })

  const removeConsultantMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('project_consultants').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-consultants', projectId] })
      toast({
        title: 'Consultor desvinculado.',
        description: 'Os lançamentos e registros financeiros deste consultor foram mantidos.',
      })
    },
    onError: (e: Error) => toast({ title: 'Erro.', description: e.message, variant: 'destructive' }),
  })

  const addPartnerMutation = useMutation({
    mutationFn: async () => {
      if (!newPartner.partner_id) throw new Error('Selecione um parceiro')
      await addProjectPartner({
        project_id: projectId,
        partner_id: newPartner.partner_id,
        fee_pct: parseFloat(newPartner.fee_pct) / 100 || 0,
        fee_amount: parseFloat(newPartner.fee_amount) || 0,
        installments: parseInt(newPartner.installments) || 1,
        company_id: project?.company_id ?? null,
        billing_start_date: project?.billing_start_date ?? null,
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-partners', projectId] })
      queryClient.invalidateQueries({ queryKey: ['project-entries', projectId] })
      queryClient.invalidateQueries({ queryKey: ['entries'] })
      setNewPartner(emptyPartnerForm)
      setAddingPartner(false)
      toast({ title: 'Parceiro adicionado.' })
    },
    onError: (e: Error) => toast({ title: 'Erro.', description: e.message, variant: 'destructive' }),
  })

  const removePartnerMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('project_partners').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-partners', projectId] })
      toast({
        title: 'Parceiro desvinculado.',
        description: 'Os lançamentos e registros financeiros deste parceiro foram mantidos.',
      })
    },
    onError: (e: Error) => toast({ title: 'Erro.', description: e.message, variant: 'destructive' }),
  })

  function invalidateEntries() {
    queryClient.invalidateQueries({ queryKey: ['project-entries', projectId] })
    queryClient.invalidateQueries({ queryKey: ['entries'] })
  }

  const createEntryMutation = useMutation({
    mutationFn: async () => {
      if (!entryForm.amount || parseFloat(entryForm.amount) <= 0) throw new Error('Informe um valor válido')
      const reps = parseInt(entryForm.repetitions) || 1
      const base = {
        project_id: projectId,
        company_id: project?.company_id ?? null,
        client_id: project?.client_id ?? null,
        classification: entryForm.classification || 'Receita',
        amount: parseFloat(entryForm.amount),
        forecast_payment: entryForm.forecast_payment || null,
        forecast_billing: entryForm.forecast_billing || null,
        notes: entryForm.notes || null,
      }
      if (reps > 1) {
        await createManualEntries({ ...base, repetitions: reps })
      } else {
        await createManualEntry(base)
      }
    },
    onSuccess: () => {
      const reps = parseInt(entryForm.repetitions) || 1
      toast({ title: reps > 1 ? `${reps} lançamentos criados.` : 'Lançamento criado.' })
      invalidateEntries()
      setAddingEntry(false)
      setEntryForm(emptyEntryForm)
    },
    onError: (e: Error) => toast({ title: 'Erro.', description: e.message, variant: 'destructive' }),
  })

  const updateEntryMutation = useMutation({
    mutationFn: async () => {
      if (!editingEntry) return
      if (!entryForm.amount || parseFloat(entryForm.amount) <= 0) throw new Error('Informe um valor válido')
      await updateEntry(editingEntry.id, {
        classification: entryForm.classification || 'Receita',
        amount: parseFloat(entryForm.amount),
        forecast_payment: entryForm.forecast_payment || null,
        forecast_billing: entryForm.forecast_billing || null,
        notes: entryForm.notes || null,
      }, projectId)
    },
    onSuccess: () => {
      toast({ title: 'Lançamento atualizado.' })
      invalidateEntries()
      setEditingEntry(null)
      setEntryForm(emptyEntryForm)
    },
    onError: (e: Error) => toast({ title: 'Erro.', description: e.message, variant: 'destructive' }),
  })

  const deleteEntryMutation = useMutation({
    mutationFn: async (entry: EntryRow) => {
      await deleteEntry(entry.id, projectId)
    },
    onSuccess: () => {
      toast({ title: 'Lançamento removido.' })
      invalidateEntries()
      setDeleteEntryTarget(null)
    },
    onError: (e: Error) => toast({ title: 'Erro.', description: e.message, variant: 'destructive' }),
  })

  function openEditEntry(entry: EntryRow) {
    setEditingEntry(entry)
    setEntryForm({
      classification: entry.classification ?? 'Receita',
      amount: String(entry.amount),
      forecast_payment: entry.forecast_payment ?? '',
      forecast_billing: entry.forecast_billing ?? '',
      notes: entry.notes ?? '',
      repetitions: '1',
    })
    setAddingEntry(false)
  }

  function openAddEntry() {
    setAddingEntry(true)
    setEditingEntry(null)
    setEntryForm(emptyEntryForm)
  }

  function handleProjectUpdated() {
    queryClient.invalidateQueries({ queryKey: ['project', projectId] })
    queryClient.invalidateQueries({ queryKey: ['projects'] })
    queryClient.invalidateQueries({ queryKey: ['project-products', projectId] })
    setEditSheetOpen(false)
  }

  if (projectLoading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 bg-slate-100 rounded animate-pulse" />
        <div className="h-48 bg-slate-100 rounded-xl animate-pulse" />
      </div>
    )
  }

  if (!project) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        Projeto não encontrado.{' '}
        <Link href="/projetos" className="text-teal-600 hover:underline">Voltar</Link>
      </div>
    )
  }

  const totalPaid = entries.filter(e => e.status === 'pago').reduce((s, e) => s + e.amount, 0)
  const totalFaturado = entries.filter(e => e.status === 'faturado').reduce((s, e) => s + e.amount, 0)
  const totalPrevisto = entries.filter(e => e.status === 'previsto').reduce((s, e) => s + e.amount, 0)
  const alreadyLinkedPartnerIds = partners.map(p => p.partner.id)

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/projetos" className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 transition-colors">
            <ArrowLeft size={15} /> Projetos
          </Link>
          <span className="text-slate-300">/</span>
          <span className="text-sm font-medium text-slate-700">
            Projeto #{project.code} — {project.client?.name ?? 'Sem cliente'}
          </span>
        </div>
        <Button size="sm" variant="outline" onClick={() => setEditSheetOpen(true)} className="gap-2">
          <Pencil size={14} /> Editar
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Left column */}
        <div className="space-y-4">

          {/* Project info */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-2">
                <CardTitle className="text-base">Projeto #{project.code}</CardTitle>
                <Badge className={PROJECT_STATUS_COLORS[project.status]}>
                  {PROJECT_STATUS_LABELS[project.status]}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <InfoRow icon={User} label="Cliente" value={project.client?.name} />
              <InfoRow icon={User} label="Gestor (GP)" value={project.gp} />
              <InfoRow icon={CalendarDays} label="Data da venda" value={project.sale_date ? formatDate(project.sale_date) : null} />
              <InfoRow icon={CalendarDays} label="Início faturamento" value={project.billing_start_date ? formatDate(project.billing_start_date) : null} />
              <InfoRow icon={FileText} label="Purchase Order" value={project.purchase_order} />
              {projectProducts.filter(pp => pp.product).length > 0 && (
                <div className="flex items-start gap-2.5">
                  <Package size={14} className="text-slate-400 mt-0.5 flex-shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] text-slate-400 uppercase tracking-wide leading-none mb-1">Produtos</p>
                    <div className="space-y-1">
                      {projectProducts.filter(pp => pp.product).map(pp => (
                        <div key={pp.id} className="flex items-center justify-between gap-2">
                          <span className="text-slate-700 text-xs">
                            <span className="font-mono text-teal-600 mr-1">{pp.product.sigla}</span>
                            {pp.product.name}
                          </span>
                          {pp.value != null && (
                            <span className="text-xs font-medium text-slate-600 shrink-0">
                              {formatCurrency(pp.value)}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
              <Separator />
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-[11px] text-slate-400 uppercase tracking-wide mb-0.5">Receita</p>
                  <p className="font-semibold text-slate-800">{formatCurrency(project.revenue)}</p>
                </div>
                <div>
                  <p className="text-[11px] text-slate-400 uppercase tracking-wide mb-0.5">Faturado</p>
                  <p className="font-semibold text-slate-800">{formatCurrency(project.invoiced)}</p>
                </div>
              </div>
              {project.notes && (
                <>
                  <Separator />
                  <div>
                    <p className="text-[11px] text-slate-400 uppercase tracking-wide mb-1">Observações</p>
                    <p className="text-xs text-slate-600 leading-relaxed">{project.notes}</p>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Progress card */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-slate-600">Receita por status</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {[
                { label: 'Previsto', value: totalPrevisto, color: 'bg-slate-200' },
                { label: 'Faturado', value: totalFaturado, color: 'bg-blue-400' },
                { label: 'Pago', value: totalPaid, color: 'bg-green-500' },
              ].map(({ label, value, color }) => (
                <div key={label} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <div className={`w-2.5 h-2.5 rounded-full ${color}`} />
                    <span className="text-slate-600">{label}</span>
                  </div>
                  <span className="font-medium">{formatCurrency(value)}</span>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Consultores por frente */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm flex items-center gap-2">
                  <UserCheck size={14} /> Consultores ({consultants.length})
                </CardTitle>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs gap-1 text-slate-500 hover:text-teal-700"
                  onClick={() => { setAddingConsultant(!addingConsultant); setNewConsultant(emptyConsultantForm) }}
                >
                  <Plus size={12} /> Adicionar
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* Inline add form */}
              {addingConsultant && (
                <div className="border border-slate-200 rounded-lg p-3 space-y-2 bg-slate-50">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-xs">Consultor *</Label>
                      <Select
                        value={newConsultant.consultant_id}
                        onValueChange={(v) => setNewConsultant((p) => ({ ...p, consultant_id: v }))}
                      >
                        <SelectTrigger className="h-8 text-xs mt-1">
                          <SelectValue placeholder="Selecionar" />
                        </SelectTrigger>
                        <SelectContent>
                          {allConsultants.map((c) => (
                            <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs">Papel</Label>
                      <Input
                        className="h-8 text-xs mt-1"
                        placeholder="ex: Implantação, Suporte"
                        value={newConsultant.role}
                        onChange={(e) => setNewConsultant((p) => ({ ...p, role: e.target.value }))}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <Label className="text-xs">Início recebimento</Label>
                      <Input
                        className="h-8 text-xs mt-1"
                        type="date"
                        value={newConsultant.billing_start_date}
                        onChange={(e) => setNewConsultant((p) => ({ ...p, billing_start_date: e.target.value }))}
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Parcelas</Label>
                      <Input
                        className="h-8 text-xs mt-1"
                        type="number" min="1"
                        value={newConsultant.installments}
                        onChange={(e) => setNewConsultant((p) => ({ ...p, installments: e.target.value }))}
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Valor/mês (R$)</Label>
                      <Input
                        className="h-8 text-xs mt-1"
                        type="number" min="0" step="0.01"
                        placeholder="0.00"
                        value={newConsultant.monthly_value}
                        onChange={(e) => setNewConsultant((p) => ({ ...p, monthly_value: e.target.value }))}
                      />
                    </div>
                  </div>
                  <div className="flex justify-end gap-2 pt-1">
                    <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setAddingConsultant(false)}>
                      <X size={12} className="mr-1" /> Cancelar
                    </Button>
                    <Button
                      size="sm"
                      className="h-7 text-xs bg-teal-600 hover:bg-teal-700"
                      disabled={!newConsultant.consultant_id || addConsultantMutation.isPending}
                      onClick={() => addConsultantMutation.mutate()}
                    >
                      <Check size={12} className="mr-1" />
                      {addConsultantMutation.isPending ? 'Salvando...' : 'Salvar'}
                    </Button>
                  </div>
                </div>
              )}

              {consultants.map((c) => (
                <div key={c.id} className="flex items-start justify-between gap-2 text-sm">
                  <div>
                    <p className="font-medium text-slate-800">{c.consultant.name}</p>
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-slate-500 mt-0.5">
                      {c.role && <span className="text-teal-600 font-medium">{c.role}</span>}
                      <span>{c.installments}x {formatCurrency(c.monthly_value)}</span>
                      <span className="text-amber-600">A pagar: {formatCurrency(c.amount_due)}</span>
                    </div>
                  </div>
                  <Button
                    size="sm" variant="ghost"
                    className="h-6 w-6 p-0 text-slate-300 hover:text-red-500 shrink-0"
                    onClick={() => removeConsultantMutation.mutate(c.id)}
                    disabled={removeConsultantMutation.isPending}
                  >
                    <X size={12} />
                  </Button>
                </div>
              ))}
              {consultants.length === 0 && !addingConsultant && (
                <p className="text-xs text-slate-400 italic">Nenhum consultor alocado.</p>
              )}
            </CardContent>
          </Card>

          {/* Parceiros */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Handshake size={14} /> Parceiros ({partners.length})
                </CardTitle>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs gap-1 text-slate-500 hover:text-teal-700"
                  onClick={() => { setAddingPartner(!addingPartner); setNewPartner(emptyPartnerForm) }}
                >
                  <Plus size={12} /> Adicionar
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {addingPartner && (
                <div className="border border-slate-200 rounded-lg p-3 space-y-2 bg-slate-50">
                  <div>
                    <Label className="text-xs">Parceiro *</Label>
                    <Select
                      value={newPartner.partner_id}
                      onValueChange={(v) => setNewPartner((p) => ({ ...p, partner_id: v }))}
                    >
                      <SelectTrigger className="h-8 text-xs mt-1">
                        <SelectValue placeholder="Selecionar" />
                      </SelectTrigger>
                      <SelectContent>
                        {allPartners
                          .filter((p) => !alreadyLinkedPartnerIds.includes(p.id))
                          .map((p) => (
                            <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <Label className="text-xs">Fee (%)</Label>
                      <Input
                        className="h-8 text-xs mt-1"
                        type="number" min="0" max="100" step="0.1"
                        placeholder="ex: 10"
                        value={newPartner.fee_pct}
                        onChange={(e) => {
                          const pct = parseFloat(e.target.value) || 0
                          const encargo = company?.encargo_simples ?? 0
                          const netRevenue = project ? project.revenue * (1 - encargo) : 0
                          const amount = (netRevenue * pct / 100).toFixed(2)
                          setNewPartner((p) => ({ ...p, fee_pct: e.target.value, fee_amount: amount }))
                        }}
                      />
                      <p className="text-[10px] text-slate-400 mt-0.5">% da receita líquida (descontado encargo)</p>
                    </div>
                    <div>
                      <Label className="text-xs">Valor fee (R$)</Label>
                      <Input
                        className="h-8 text-xs mt-1"
                        type="number" min="0" step="0.01"
                        placeholder="0.00"
                        value={newPartner.fee_amount}
                        onChange={(e) => setNewPartner((p) => ({ ...p, fee_amount: e.target.value }))}
                      />
                      <p className="text-[10px] text-slate-400 mt-0.5">Auto ou override manual</p>
                    </div>
                    <div>
                      <Label className="text-xs">Parcelas</Label>
                      <Input
                        className="h-8 text-xs mt-1"
                        type="number" min="1"
                        value={newPartner.installments}
                        onChange={(e) => setNewPartner((p) => ({ ...p, installments: e.target.value }))}
                      />
                    </div>
                  </div>
                  <div className="flex justify-end gap-2 pt-1">
                    <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setAddingPartner(false)}>
                      <X size={12} className="mr-1" /> Cancelar
                    </Button>
                    <Button
                      size="sm"
                      className="h-7 text-xs bg-teal-600 hover:bg-teal-700"
                      disabled={!newPartner.partner_id || addPartnerMutation.isPending}
                      onClick={() => addPartnerMutation.mutate()}
                    >
                      <Check size={12} className="mr-1" />
                      {addPartnerMutation.isPending ? 'Salvando...' : 'Salvar'}
                    </Button>
                  </div>
                </div>
              )}

              {partners.map((p) => (
                <div key={p.id} className="flex items-start justify-between gap-2 text-sm">
                  <div>
                    <p className="font-medium text-slate-800">{p.partner.name}</p>
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-slate-500 mt-0.5">
                      <span>Fee: {(p.fee_pct * 100).toFixed(1)}%</span>
                      <span>Valor: {formatCurrency(p.fee_amount)}</span>
                      <span className="text-amber-600">Pago: {formatCurrency(p.fee_paid)}</span>
                      {(p as any).installments > 1 && <span>{(p as any).installments}x</span>}
                    </div>
                  </div>
                  <Button
                    size="sm" variant="ghost"
                    className="h-6 w-6 p-0 text-slate-300 hover:text-red-500 shrink-0"
                    onClick={() => removePartnerMutation.mutate(p.id)}
                    disabled={removePartnerMutation.isPending}
                  >
                    <X size={12} />
                  </Button>
                </div>
              ))}
              {partners.length === 0 && !addingPartner && (
                <p className="text-xs text-slate-400 italic">Nenhum parceiro vinculado.</p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right: Entries */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <Receipt size={16} /> Lançamentos ({entries.length})
                </CardTitle>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs gap-1 text-slate-500 hover:text-teal-700"
                    onClick={openAddEntry}
                  >
                    <Plus size={12} /> Adicionar
                  </Button>
                  <Link href="/lancamentos" className="text-xs text-teal-600 hover:underline">
                    Ver todos →
                  </Link>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {/* Formulário inline de novo / edição de lançamento */}
              {(addingEntry || editingEntry) && (
                <div className="border-b border-slate-200 bg-slate-50 px-4 py-3 space-y-3">
                  <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
                    {editingEntry ? 'Editar lançamento' : 'Novo lançamento manual'}
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <div className="sm:col-span-2">
                      <Label className="text-xs">Classificação</Label>
                      <Select
                        value={entryForm.classification}
                        onValueChange={(v) => setEntryForm((p) => ({ ...p, classification: v }))}
                      >
                        <SelectTrigger className="h-8 text-xs mt-1">
                          <SelectValue placeholder="Selecionar…" />
                        </SelectTrigger>
                        <SelectContent>
                          {classifications.length === 0 && (
                            <SelectItem value="_none" disabled>Nenhuma classificação cadastrada</SelectItem>
                          )}
                          {classifications.map((c) => (
                            <SelectItem key={c.id} value={c.name}>
                              {c.parent_id ? <span className="text-slate-400 mr-1">↳</span> : null}
                              {c.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs">Valor (R$) *</Label>
                      <Input
                        className="h-8 text-xs mt-1"
                        type="number" min="0" step="0.01"
                        placeholder="0,00"
                        value={entryForm.amount}
                        onChange={(e) => setEntryForm((p) => ({ ...p, amount: e.target.value }))}
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Prev. faturamento</Label>
                      <Input
                        className="h-8 text-xs mt-1"
                        type="date"
                        value={entryForm.forecast_billing}
                        onChange={(e) => setEntryForm((p) => ({ ...p, forecast_billing: e.target.value }))}
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Prev. pagamento</Label>
                      <Input
                        className="h-8 text-xs mt-1"
                        type="date"
                        value={entryForm.forecast_payment}
                        onChange={(e) => setEntryForm((p) => ({ ...p, forecast_payment: e.target.value }))}
                      />
                    </div>
                    {!editingEntry && (
                      <div>
                        <Label className="text-xs">Repetições</Label>
                        <Input
                          className="h-8 text-xs mt-1"
                          type="number" min="1" max="60"
                          value={entryForm.repetitions}
                          onChange={(e) => setEntryForm((p) => ({ ...p, repetitions: e.target.value }))}
                          title="Gera N lançamentos mensais consecutivos"
                        />
                        {parseInt(entryForm.repetitions) > 1 && (
                          <p className="text-[10px] text-teal-600 mt-0.5">
                            Gera {entryForm.repetitions}× mensais a partir da data informada
                          </p>
                        )}
                      </div>
                    )}
                    <div className={editingEntry ? 'sm:col-span-3' : 'sm:col-span-2'}>
                      <Label className="text-xs">Observação</Label>
                      <Input
                        className="h-8 text-xs mt-1"
                        placeholder="Opcional"
                        value={entryForm.notes}
                        onChange={(e) => setEntryForm((p) => ({ ...p, notes: e.target.value }))}
                      />
                    </div>
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button
                      size="sm" variant="ghost" className="h-7 text-xs"
                      onClick={() => { setAddingEntry(false); setEditingEntry(null); setEntryForm(emptyEntryForm) }}
                    >
                      <X size={12} className="mr-1" /> Cancelar
                    </Button>
                    <Button
                      size="sm"
                      className="h-7 text-xs bg-teal-600 hover:bg-teal-700"
                      disabled={createEntryMutation.isPending || updateEntryMutation.isPending}
                      onClick={() => editingEntry ? updateEntryMutation.mutate() : createEntryMutation.mutate()}
                    >
                      <Check size={12} className="mr-1" />
                      {(createEntryMutation.isPending || updateEntryMutation.isPending) ? 'Salvando…' : 'Salvar'}
                    </Button>
                  </div>
                </div>
              )}

              {entries.length === 0 && !addingEntry ? (
                <div className="p-8 text-center text-slate-400 text-sm">
                  Nenhum lançamento. Clique em <strong>Adicionar</strong> para criar manualmente
                  ou edite o projeto para gerar lançamentos automáticos por parcelas.
                </div>
              ) : entries.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-100 bg-slate-50">
                        <th className="text-left px-4 py-2.5 text-xs font-medium text-slate-500 uppercase">Parc.</th>
                        <th className="text-left px-4 py-2.5 text-xs font-medium text-slate-500 uppercase">Classificação</th>
                        <th className="text-right px-4 py-2.5 text-xs font-medium text-slate-500 uppercase">Valor</th>
                        <th className="text-left px-4 py-2.5 text-xs font-medium text-slate-500 uppercase hidden sm:table-cell">Prev. pgto</th>
                        <th className="text-left px-4 py-2.5 text-xs font-medium text-slate-500 uppercase">Status</th>
                        <th className="px-4 py-2.5 text-xs" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {entries.map((entry) => {
                        const nextStatus = STATUS_FLOW[entry.status]
                        const isEditing = editingEntry?.id === entry.id
                        return (
                          <tr key={entry.id} className={`hover:bg-slate-50 ${isEditing ? 'bg-teal-50' : ''}`}>
                            <td className="px-4 py-2.5 font-mono text-slate-500 text-xs">
                              {entry.is_manual ? (
                                <span className="text-xs text-slate-400 italic">manual</span>
                              ) : entry.installment != null ? (
                                `${entry.installment}/${entries.filter(e => !e.is_manual && e.classification === entry.classification).length}`
                              ) : '—'}
                            </td>
                            <td className="px-4 py-2.5 text-slate-600 text-xs">{entry.classification}</td>
                            <td className="px-4 py-2.5 text-right font-medium">{formatCurrency(entry.amount)}</td>
                            <td className="px-4 py-2.5 text-slate-500 text-xs hidden sm:table-cell">
                              {entry.forecast_payment ? formatDate(entry.forecast_payment) : '—'}
                            </td>
                            <td className="px-4 py-2.5">
                              <Badge className={ENTRY_STATUS_COLORS[entry.status]}>
                                {ENTRY_STATUS_LABELS[entry.status]}
                              </Badge>
                            </td>
                            <td className="px-4 py-2.5">
                              <div className="flex items-center gap-1">
                                {nextStatus && (
                                  <Button
                                    size="sm" variant="ghost"
                                    className="h-7 text-xs gap-1 text-slate-400 hover:text-teal-700"
                                    onClick={() => statusMutation.mutate({ entry, newStatus: nextStatus })}
                                    disabled={mutatingEntryId === entry.id}
                                  >
                                    <Check size={11} />
                                    {mutatingEntryId === entry.id ? '...' : nextStatus === 'faturado' ? 'Faturar' : 'Pagar'}
                                  </Button>
                                )}
                                <Button
                                  size="sm" variant="ghost"
                                  className="h-7 w-7 p-0 text-slate-300 hover:text-slate-600"
                                  onClick={() => openEditEntry(entry)}
                                >
                                  <Pencil size={11} />
                                </Button>
                                <Button
                                  size="sm" variant="ghost"
                                  className="h-7 w-7 p-0 text-slate-300 hover:text-red-500"
                                  onClick={() => setDeleteEntryTarget(entry)}
                                  disabled={deleteEntryMutation.isPending}
                                >
                                  <Trash2 size={11} />
                                </Button>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </CardContent>
          </Card>
        </div>
      </div>

      <ConfirmDialog
        open={!!deleteEntryTarget}
        onOpenChange={(v) => !v && setDeleteEntryTarget(null)}
        title="Remover lançamento"
        description={`Remover lançamento de ${deleteEntryTarget ? formatCurrency(deleteEntryTarget.amount) : ''}? Esta ação não pode ser desfeita.`}
        confirmLabel="Remover"
        loading={deleteEntryMutation.isPending}
        onConfirm={() => deleteEntryTarget && deleteEntryMutation.mutate(deleteEntryTarget)}
      />

      <ProjectSheet
        open={editSheetOpen}
        onOpenChange={setEditSheetOpen}
        project={project}
        onSuccess={handleProjectUpdated}
      />

    </div>
  )
}

function InfoRow({ icon: Icon, label, value }: {
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
