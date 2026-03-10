'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { PageHeader } from '@/components/shared/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from '@/components/ui/use-toast'
import { Toaster } from '@/components/ui/toaster'
import {
  Receipt, Check, Pencil, X, ChevronLeft, ChevronRight,
} from 'lucide-react'
import {
  formatCurrency, formatDate,
  ENTRY_STATUS_LABELS, ENTRY_STATUS_COLORS,
} from '@/lib/utils'
import type { Entry, EntryStatus } from '@/lib/supabase/types'
import { updateEntryStatus, updateEntryAmount } from '@/lib/actions/entries'
import Link from 'next/link'

type EntryWithRelations = Entry & {
  project: { id: string; code: number } | null
  client: { id: string; name: string } | null
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

export default function LancamentosPage() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1) // 1-12
  const [statusFilter, setStatusFilter] = useState<EntryStatus | 'all'>('all')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')

  const period = `${year}-${String(month).padStart(2, '0')}`

  const { data: entries = [], isLoading } = useQuery<EntryWithRelations[]>({
    queryKey: ['entries', period],
    queryFn: async () => {
      const startDate = `${period}-01`
      const endDate = new Date(year, month, 0).toISOString().split('T')[0]

      const { data, error } = await supabase
        .from('entries')
        .select('*, project:projects(id, code), client:clients(id, name)')
        .gte('forecast_payment', startDate)
        .lte('forecast_payment', endDate)
        .order('forecast_payment')
      if (error) throw error
      return (data ?? []) as EntryWithRelations[]
    },
  })

  const statusMutation = useMutation({
    mutationFn: async ({ entry, newStatus }: { entry: Entry; newStatus: EntryStatus }) => {
      await updateEntryStatus(entry.id, newStatus, entry.status)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['entries'] })
      toast({ title: 'Status atualizado.' })
    },
    onError: (e: Error) => toast({ title: 'Erro.', description: e.message, variant: 'destructive' }),
  })

  const amountMutation = useMutation({
    mutationFn: async ({ entry, newAmount }: { entry: Entry; newAmount: number }) => {
      await updateEntryAmount(entry.id, newAmount, entry.amount)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['entries'] })
      toast({ title: 'Valor atualizado.' })
      setEditingId(null)
    },
    onError: (e: Error) => toast({ title: 'Erro.', description: e.message, variant: 'destructive' }),
  })

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

  function prevMonth() {
    if (month === 1) { setMonth(12); setYear(y => y - 1) }
    else setMonth(m => m - 1)
  }

  function nextMonth() {
    if (month === 12) { setMonth(1); setYear(y => y + 1) }
    else setMonth(m => m + 1)
  }

  const MONTH_NAMES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']

  function startEdit(entry: Entry) {
    setEditingId(entry.id)
    setEditValue(String(entry.amount))
  }

  function cancelEdit() {
    setEditingId(null)
    setEditValue('')
  }

  function confirmEdit(entry: Entry) {
    const val = parseFloat(editValue)
    if (isNaN(val) || val < 0) return
    amountMutation.mutate({ entry, newAmount: val })
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
            <p className="font-medium text-slate-600">Nenhum lançamento em {MONTH_NAMES[month - 1]}/{year}</p>
            <p className="text-sm mt-1">Crie projetos para gerar lançamentos automáticos.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Projeto</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Cliente</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Classificação</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Parcela</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Valor</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Prev. pagamento</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Status</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((entry) => {
                  const nextStatus = STATUS_NEXT[entry.status]
                  const nextLabel = STATUS_NEXT_LABEL[entry.status]
                  const isEditing = editingId === entry.id

                  return (
                    <tr key={entry.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3">
                        {entry.project ? (
                          <Link
                            href={`/projetos/${entry.project.id}`}
                            className="font-mono text-sky-600 hover:text-sky-800 font-medium"
                          >
                            #{entry.project.code}
                          </Link>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {entry.client?.name ?? <span className="text-slate-400">—</span>}
                      </td>
                      <td className="px-4 py-3 text-slate-600 text-xs">{entry.classification}</td>
                      <td className="px-4 py-3 text-slate-500 font-mono text-xs">
                        {entry.installment != null ? entry.installment : '—'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {isEditing ? (
                          <div className="flex items-center gap-1 justify-end">
                            <Input
                              type="number"
                              step="0.01"
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              className="h-7 w-28 text-xs text-right"
                            />
                            <Button
                              size="icon"
                              className="h-7 w-7 bg-green-600 hover:bg-green-700"
                              onClick={() => confirmEdit(entry)}
                              disabled={amountMutation.isPending}
                            >
                              <Check size={11} />
                            </Button>
                            <Button
                              size="icon"
                              variant="outline"
                              className="h-7 w-7"
                              onClick={cancelEdit}
                            >
                              <X size={11} />
                            </Button>
                          </div>
                        ) : (
                          <button
                            onClick={() => startEdit(entry)}
                            className="font-medium text-slate-700 hover:text-sky-600 transition-colors group flex items-center gap-1 ml-auto"
                          >
                            {formatCurrency(entry.amount)}
                            <Pencil size={11} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                          </button>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-500 text-xs">
                        {entry.forecast_payment ? formatDate(entry.forecast_payment) : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <Badge className={ENTRY_STATUS_COLORS[entry.status]}>
                          {ENTRY_STATUS_LABELS[entry.status]}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        {nextStatus && nextLabel && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 text-xs gap-1 text-slate-500 hover:text-sky-700 hover:bg-sky-50"
                            onClick={() => statusMutation.mutate({ entry, newStatus: nextStatus })}
                            disabled={statusMutation.isPending}
                          >
                            <Check size={11} />
                            {nextLabel}
                          </Button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Toaster />
    </div>
  )
}
