'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { PageHeader } from '@/components/shared/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from '@/components/ui/use-toast'
import {
  Receipt, Check, Pencil, X, ChevronLeft, ChevronRight, Undo2,
} from 'lucide-react'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import {
  formatCurrency, formatDate,
  ENTRY_STATUS_LABELS, ENTRY_STATUS_COLORS,
} from '@/lib/utils'
import type { Entry, EntryStatus, Classification } from '@/lib/supabase/types'
import { updateEntryStatus, updateEntryAmount, updateEntryClassification, updateEntryDate } from '@/lib/actions/entries'
import Link from 'next/link'

type EntryWithRelations = Entry & {
  project: { id: string; code: number } | null
  client: { id: string; name: string } | null
  consultant: { id: string; name: string } | null
  partner: { id: string; name: string } | null
}

const ALL_STATUSES: EntryStatus[] = ['previsto', 'faturado', 'pago', 'cancelado']

const STATUS_NEXT: Partial<Record<EntryStatus, EntryStatus>> = {
  previsto: 'faturado',
  faturado: 'pago',
}

const STATUS_NEXT_LABEL: Partial<Record<EntryStatus, string>> = {
  previsto: 'Faturar',
  faturado: 'Pagar',
}

const STATUS_PREV: Partial<Record<EntryStatus, EntryStatus>> = {
  faturado: 'previsto',
  pago: 'faturado',
}

const STATUS_PREV_LABEL: Partial<Record<EntryStatus, string>> = {
  faturado: 'Reverter para Previsto',
  pago: 'Reverter para Faturado',
}

// Permite ir diretamente de "previsto" para "pago" sem passar por "faturado"
const STATUS_DIRECT_PAY: Partial<Record<EntryStatus, EntryStatus>> = {
  previsto: 'pago',
}

export default function LancamentosPage() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1) // 1-12
  const [statusFilter, setStatusFilter] = useState<EntryStatus | 'all'>('all')

  // Amount editing
  const [editingAmountId, setEditingAmountId] = useState<string | null>(null)
  const [editAmountValue, setEditAmountValue] = useState('')

  // Classification editing
  const [editingClassId, setEditingClassId] = useState<string | null>(null)
  const [editClassValue, setEditClassValue] = useState('')

  // Revert status
  const [revertTarget, setRevertTarget] = useState<EntryWithRelations | null>(null)
  const [revertToStatus, setRevertToStatus] = useState<EntryStatus | null>(null)

  // Date editing
  const [editingDateId, setEditingDateId] = useState<string | null>(null)
  const [editingDateField, setEditingDateField] = useState<'forecast_payment' | 'forecast_billing'>('forecast_payment')
  const [editDateValue, setEditDateValue] = useState('')

  const period = `${year}-${String(month).padStart(2, '0')}`

  // ── Queries ────────────────────────────────────────────────────────────
  const { data: entries = [], isLoading } = useQuery<EntryWithRelations[]>({
    queryKey: ['entries', period],
    queryFn: async () => {
      const startDate = `${period}-01`
      const endDate = new Date(year, month, 0).toISOString().split('T')[0]

      const { data, error } = await supabase
        .from('entries')
        .select('*, project:projects(id, code), client:clients(id, name), consultant:consultants(id, name), partner:partners(id, name)')
        .gte('forecast_payment', startDate)
        .lte('forecast_payment', endDate)
        .order('forecast_payment')
      if (error) throw error
      return (data ?? []) as EntryWithRelations[]
    },
  })

  const { data: classifications = [] } = useQuery<Classification[]>({
    queryKey: ['classifications-active'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('classifications')
        .select('*')
        .eq('active', true)
        .eq('is_totalizador', false)
        .order('sort_order')
        .order('name')
      if (error) throw error
      return (data ?? []) as Classification[]
    },
  })

  // Merge saved classification names with any values already on entries
  const classNames: string[] = Array.from(
    new Set([
      ...classifications.map((c) => c.name),
      ...entries.map((e) => e.classification).filter(Boolean),
    ])
  ).sort()

  const [mutatingStatusId, setMutatingStatusId] = useState<string | null>(null)

  // ── Mutations ─────────────────────────────────────────────────────────
  const statusMutation = useMutation({
    mutationFn: async ({ entry, newStatus }: { entry: Entry; newStatus: EntryStatus }) => {
      setMutatingStatusId(entry.id)
      await updateEntryStatus(entry.id, newStatus, entry.status)
    },
    onSuccess: () => {
      setMutatingStatusId(null)
      queryClient.invalidateQueries({ queryKey: ['entries'] })
      toast({ title: 'Status atualizado.' })
    },
    onError: (e: Error) => {
      setMutatingStatusId(null)
      toast({ title: 'Erro.', description: e.message, variant: 'destructive' })
    },
  })

  const amountMutation = useMutation({
    mutationFn: async ({ entry, newAmount }: { entry: Entry; newAmount: number }) => {
      await updateEntryAmount(entry.id, newAmount, entry.amount)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['entries'] })
      toast({ title: 'Valor atualizado.' })
      setEditingAmountId(null)
    },
    onError: (e: Error) => toast({ title: 'Erro.', description: e.message, variant: 'destructive' }),
  })

  const classMutation = useMutation({
    mutationFn: async ({ entry, newClass }: { entry: Entry; newClass: string }) => {
      await updateEntryClassification(entry.id, newClass, entry.classification)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['entries'] })
      toast({ title: 'Classificação atualizada.' })
      setEditingClassId(null)
    },
    onError: (e: Error) => toast({ title: 'Erro.', description: e.message, variant: 'destructive' }),
  })

  const revertMutation = useMutation({
    mutationFn: async ({ entry, toStatus }: { entry: Entry; toStatus: EntryStatus }) => {
      await updateEntryStatus(entry.id, toStatus, entry.status)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['entries'] })
      toast({ title: 'Status revertido.' })
      setRevertTarget(null)
      setRevertToStatus(null)
    },
    onError: (e: Error) => toast({ title: 'Erro.', description: e.message, variant: 'destructive' }),
  })

  const dateMutation = useMutation({
    mutationFn: async ({ id, field, value }: { id: string; field: 'forecast_payment' | 'forecast_billing'; value: string | null }) => {
      await updateEntryDate(id, field, value)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['entries'] })
      toast({ title: 'Data atualizada.' })
      setEditingDateId(null)
    },
    onError: (e: Error) => toast({ title: 'Erro.', description: e.message, variant: 'destructive' }),
  })

  function startEditDate(entry: EntryWithRelations, field: 'forecast_payment' | 'forecast_billing') {
    setEditingDateId(entry.id)
    setEditingDateField(field)
    setEditDateValue(field === 'forecast_payment' ? (entry.forecast_payment ?? '') : (entry.forecast_billing ?? ''))
    setEditingAmountId(null)
    setEditingClassId(null)
  }

  function confirmEditDate() {
    if (!editingDateId) return
    dateMutation.mutate({ id: editingDateId, field: editingDateField, value: editDateValue || null })
  }

  // ── Derived ────────────────────────────────────────────────────────────
  const filtered = statusFilter === 'all'
    ? entries
    : entries.filter((e) => e.status === statusFilter)

  const countByStatus = ALL_STATUSES.reduce<Record<string, number>>((acc, s) => {
    acc[s] = entries.filter((e) => e.status === s).length
    return acc
  }, {})

  const totalByStatus = ALL_STATUSES.reduce<Record<string, number>>((acc, s) => {
    acc[s] = entries.filter((e) => e.status === s).reduce((sum, e) => sum + e.amount, 0)
    return acc
  }, {})

  // ── Helpers ────────────────────────────────────────────────────────────
  function clearEditing() {
    setEditingAmountId(null)
    setEditAmountValue('')
    setEditingClassId(null)
    setEditClassValue('')
    setEditingDateId(null)
  }

  function prevMonth() {
    clearEditing()
    if (month === 1) { setMonth(12); setYear((y) => y - 1) }
    else setMonth((m) => m - 1)
  }

  function nextMonth() {
    clearEditing()
    if (month === 12) { setMonth(1); setYear((y) => y + 1) }
    else setMonth((m) => m + 1)
  }

  const MONTH_NAMES = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
  ]

  function startEditAmount(entry: Entry) {
    setEditingAmountId(entry.id)
    setEditAmountValue(String(entry.amount))
    setEditingClassId(null) // close any open class editor
  }

  function cancelEditAmount() {
    setEditingAmountId(null)
    setEditAmountValue('')
  }

  function confirmEditAmount(entry: Entry) {
    const val = parseFloat(editAmountValue)
    if (isNaN(val) || val < 0) return
    amountMutation.mutate({ entry, newAmount: val })
  }

  function startEditClass(entry: Entry) {
    setEditingClassId(entry.id)
    setEditClassValue(entry.classification ?? '')
    setEditingAmountId(null) // close any open amount editor
  }

  function confirmEditClass(entry: Entry) {
    if (!editClassValue || editClassValue === entry.classification) {
      setEditingClassId(null)
      return
    }
    classMutation.mutate({ entry, newClass: editClassValue })
  }

  return (
    <div className="space-y-5">
      <PageHeader title="Lançamentos" description="Controle de faturamento e recebimentos" />

      {/* Month navigator */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={prevMonth}>
            <ChevronLeft size={14} />
          </Button>
          <span className="font-semibold text-slate-800 min-w-[160px] text-center">
            {MONTH_NAMES[month - 1]} {year}
          </span>
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={nextMonth}>
            <ChevronRight size={14} />
          </Button>
        </div>

        {/* Status filter pills */}
        <div className="flex gap-1.5">
          <button
            onClick={() => setStatusFilter('all')}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors border ${
              statusFilter === 'all'
                ? 'bg-slate-900 text-white border-slate-900'
                : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'
            }`}
          >
            Todos ({entries.length})
          </button>
          {ALL_STATUSES.map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors border ${
                statusFilter === s
                  ? 'bg-slate-900 text-white border-slate-900'
                  : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'
              }`}
            >
              {ENTRY_STATUS_LABELS[s]} ({countByStatus[s] ?? 0})
            </button>
          ))}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {ALL_STATUSES.map((s) => (
          <div key={s} className="bg-white rounded-lg border border-slate-200 p-3">
            <p className="text-xs text-slate-500 mb-1">{ENTRY_STATUS_LABELS[s]}</p>
            <p className="font-semibold text-slate-800">{formatCurrency(totalByStatus[s] ?? 0)}</p>
            <p className="text-xs text-slate-400 mt-0.5">{countByStatus[s] ?? 0} lançamentos</p>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        {isLoading ? (
          <div className="p-8 space-y-3">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-10 rounded-md bg-slate-100 animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-slate-400">
            <Receipt size={32} className="mx-auto mb-3 opacity-30" />
            <p className="font-medium text-slate-600">
              Nenhum lançamento em {MONTH_NAMES[month - 1]}/{year}
            </p>
            <p className="text-sm mt-1">Crie projetos para gerar lançamentos automáticos.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Projeto</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Cliente</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide hidden md:table-cell">Para quem</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Classificação</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Parcela</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Valor</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide hidden lg:table-cell">Prev. faturamento</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Prev. pagamento</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Status</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((entry) => {
                  const nextStatus = STATUS_NEXT[entry.status]
                  const nextLabel = STATUS_NEXT_LABEL[entry.status]
                  const isEditingAmount = editingAmountId === entry.id
                  const isEditingClass = editingClassId === entry.id

                  return (
                    <tr key={entry.id} className="hover:bg-slate-50 transition-colors">
                      {/* Projeto */}
                      <td className="px-4 py-3">
                        {entry.project ? (
                          <Link
                            href={`/projetos/${entry.project.id}`}
                            className="font-mono text-teal-600 hover:text-teal-800 font-medium"
                          >
                            #{entry.project.code}
                          </Link>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>

                      {/* Cliente */}
                      <td className="px-4 py-3 text-slate-700">
                        {entry.client?.name ?? <span className="text-slate-400">—</span>}
                      </td>

                      {/* Para quem */}
                      <td className="px-4 py-3 text-xs hidden md:table-cell">
                        {entry.consultant?.name ? (
                          <span className="text-blue-600">{entry.consultant.name}</span>
                        ) : entry.partner?.name ? (
                          <span className="text-orange-600">{entry.partner.name}</span>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>

                      {/* Classificação — inline Select com confirm/cancel */}
                      <td className="px-4 py-3">
                        {isEditingClass ? (
                          <div className="flex items-center gap-1">
                            <Select
                              value={editClassValue}
                              onValueChange={(val) => setEditClassValue(val)}
                              disabled={classMutation.isPending}
                            >
                              <SelectTrigger className="h-7 w-44 text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {classNames.map((name) => (
                                  <SelectItem key={name} value={name} className="text-xs">
                                    {name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <Button
                              size="icon"
                              className="h-7 w-7 bg-green-600 hover:bg-green-700"
                              onClick={() => confirmEditClass(entry)}
                              disabled={classMutation.isPending}
                            >
                              <Check size={11} />
                            </Button>
                            <Button
                              size="icon"
                              variant="outline"
                              className="h-7 w-7"
                              onClick={() => setEditingClassId(null)}
                            >
                              <X size={11} />
                            </Button>
                          </div>
                        ) : (
                          <button
                            onClick={() => startEditClass(entry)}
                            className="text-xs text-slate-600 hover:text-teal-600 transition-colors group flex items-center gap-1"
                          >
                            <span>{entry.classification || '—'}</span>
                            <Pencil size={10} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                          </button>
                        )}
                      </td>

                      {/* Parcela */}
                      <td className="px-4 py-3 text-slate-500 font-mono text-xs">
                        {entry.installment != null ? entry.installment : '—'}
                      </td>

                      {/* Valor — inline Input */}
                      <td className="px-4 py-3 text-right">
                        {isEditingAmount ? (
                          <div className="flex items-center gap-1 justify-end">
                            <Input
                              type="number"
                              step="0.01"
                              value={editAmountValue}
                              onChange={(e) => setEditAmountValue(e.target.value)}
                              className="h-7 w-28 text-xs text-right"
                              autoFocus
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') confirmEditAmount(entry)
                                if (e.key === 'Escape') cancelEditAmount()
                              }}
                            />
                            <Button
                              size="icon"
                              className="h-7 w-7 bg-green-600 hover:bg-green-700"
                              onClick={() => confirmEditAmount(entry)}
                              disabled={amountMutation.isPending}
                            >
                              <Check size={11} />
                            </Button>
                            <Button
                              size="icon"
                              variant="outline"
                              className="h-7 w-7"
                              onClick={cancelEditAmount}
                            >
                              <X size={11} />
                            </Button>
                          </div>
                        ) : (
                          <button
                            onClick={() => startEditAmount(entry)}
                            className="font-medium text-slate-700 hover:text-teal-600 transition-colors group flex items-center gap-1 ml-auto"
                          >
                            {formatCurrency(entry.amount)}
                            <Pencil size={11} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                          </button>
                        )}
                      </td>

                      {/* Prev. faturamento — editável inline para previsto */}
                      <td className="px-4 py-3 text-slate-500 text-xs hidden lg:table-cell">
                        {editingDateId === entry.id && editingDateField === 'forecast_billing' ? (
                          <div className="flex items-center gap-1">
                            <Input type="date" value={editDateValue} onChange={(e) => setEditDateValue(e.target.value)}
                              className="h-6 text-xs px-1 w-32" autoFocus
                              onKeyDown={(e) => { if (e.key === 'Enter') confirmEditDate(); if (e.key === 'Escape') setEditingDateId(null) }}
                            />
                            <Button size="icon" className="h-6 w-6 bg-green-600 hover:bg-green-700" onClick={confirmEditDate} disabled={dateMutation.isPending}><Check size={10} /></Button>
                            <Button size="icon" variant="outline" className="h-6 w-6" onClick={() => setEditingDateId(null)}><X size={10} /></Button>
                          </div>
                        ) : (
                          <button onClick={() => entry.status === 'previsto' ? startEditDate(entry, 'forecast_billing') : undefined}
                            className={`group flex items-center gap-1 ${entry.status === 'previsto' ? 'hover:text-teal-600 cursor-pointer' : 'cursor-default'}`}
                          >
                            {entry.forecast_billing ? formatDate(entry.forecast_billing) : <span className="text-slate-300">—</span>}
                            {entry.status === 'previsto' && <Pencil size={9} className="opacity-0 group-hover:opacity-100 transition-opacity" />}
                          </button>
                        )}
                      </td>

                      {/* Prev. pagamento — editável inline para previsto */}
                      <td className="px-4 py-3 text-slate-500 text-xs">
                        {editingDateId === entry.id && editingDateField === 'forecast_payment' ? (
                          <div className="flex items-center gap-1">
                            <Input type="date" value={editDateValue} onChange={(e) => setEditDateValue(e.target.value)}
                              className="h-6 text-xs px-1 w-32" autoFocus
                              onKeyDown={(e) => { if (e.key === 'Enter') confirmEditDate(); if (e.key === 'Escape') setEditingDateId(null) }}
                            />
                            <Button size="icon" className="h-6 w-6 bg-green-600 hover:bg-green-700" onClick={confirmEditDate} disabled={dateMutation.isPending}><Check size={10} /></Button>
                            <Button size="icon" variant="outline" className="h-6 w-6" onClick={() => setEditingDateId(null)}><X size={10} /></Button>
                          </div>
                        ) : (
                          <button onClick={() => entry.status === 'previsto' ? startEditDate(entry, 'forecast_payment') : undefined}
                            className={`group flex items-center gap-1 ${entry.status === 'previsto' ? 'hover:text-teal-600 cursor-pointer' : 'cursor-default'}`}
                          >
                            {entry.forecast_payment ? formatDate(entry.forecast_payment) : <span className="text-slate-300">—</span>}
                            {entry.status === 'previsto' && <Pencil size={9} className="opacity-0 group-hover:opacity-100 transition-opacity" />}
                          </button>
                        )}
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3">
                        <Badge className={ENTRY_STATUS_COLORS[entry.status]}>
                          {ENTRY_STATUS_LABELS[entry.status]}
                        </Badge>
                      </td>

                      {/* Ação */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 flex-wrap">
                          {nextStatus && nextLabel && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 text-xs gap-1 text-slate-500 hover:text-teal-700 hover:bg-teal-50"
                              onClick={() => statusMutation.mutate({ entry, newStatus: nextStatus })}
                              disabled={mutatingStatusId === entry.id}
                            >
                              <Check size={11} />
                              {mutatingStatusId === entry.id ? '...' : nextLabel}
                            </Button>
                          )}
                          {/* Atalho: pagar diretamente (previsto → pago) */}
                          {STATUS_DIRECT_PAY[entry.status] && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 text-xs gap-1 text-slate-400 hover:text-green-700 hover:bg-green-50"
                              onClick={() => statusMutation.mutate({ entry, newStatus: STATUS_DIRECT_PAY[entry.status]! })}
                              disabled={mutatingStatusId === entry.id}
                              title="Marcar como pago (sem faturamento)"
                            >
                              <Check size={11} />
                              Pagar
                            </Button>
                          )}
                          {STATUS_PREV[entry.status] && STATUS_PREV_LABEL[entry.status] && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 text-xs gap-1 text-slate-400 hover:text-orange-600 hover:bg-orange-50"
                              onClick={() => {
                                setRevertTarget(entry)
                                setRevertToStatus(STATUS_PREV[entry.status] ?? null)
                              }}
                              title={STATUS_PREV_LABEL[entry.status]}
                            >
                              <Undo2 size={11} />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={!!revertTarget}
        onOpenChange={(v) => { if (!v) { setRevertTarget(null); setRevertToStatus(null) } }}
        title="Reverter status"
        description={`Deseja reverter este lançamento para "${ENTRY_STATUS_LABELS[revertToStatus ?? 'previsto']}"?`}
        confirmLabel="Reverter"
        cancelLabel="Cancelar"
        variant="default"
        loading={revertMutation.isPending}
        onConfirm={() => revertTarget && revertToStatus && revertMutation.mutate({ entry: revertTarget, toStatus: revertToStatus })}
      />
    </div>
  )
}
