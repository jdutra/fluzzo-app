'use client'

import { useState, useCallback, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { PageHeader } from '@/components/shared/page-header'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { toast } from '@/components/ui/use-toast'
import {
  UploadCloud, FileText, CheckCircle2, XCircle, Loader2,
  ChevronLeft, ChevronRight, TrendingUp, TrendingDown,
  AlertTriangle, Link2, Link2Off, Search, ArrowUpDown,
} from 'lucide-react'
import { formatCurrency, formatDate } from '@/lib/utils'
import type { BankExtract, Classification, Entry } from '@/lib/supabase/types'
import { reconcileExtract, unreconcileExtract } from '@/lib/actions/bank-extract'

// ─── Types ────────────────────────────────────────────────────

type BankExtractWithEntry = BankExtract & {
  reconciled_entry?: { id: string; project: { id: string; code: number } | null } | null
}

type EntryWithRelations = Entry & {
  project: { id: string; code: number } | null
  client: { id: string; name: string } | null
}

type ParsedRow = {
  transaction_date: string
  description: string
  amount: number
  balance: number | null
  rowIndex: number
  valid: boolean
  error?: string
}

type Step = 'list' | 'upload' | 'preview' | 'done'
type ListFilter = 'all' | 'pendente' | 'conciliado'

// ─── CSV Helpers ──────────────────────────────────────────────

function parseCSV(text: string): string[][] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim())
  const sep = lines[0]?.includes(';') ? ';' : ','
  return lines.map((line) =>
    line.split(sep).map((cell) => cell.replace(/^["']|["']$/g, '').trim())
  )
}

function parseDate(val: string): string | null {
  if (!val) return null
  const dmy = val.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (dmy) return `${dmy[3]}-${dmy[2]}-${dmy[1]}`
  const ymd = val.match(/^\d{4}-\d{2}-\d{2}$/)
  if (ymd) return val
  const dmy2 = val.match(/^(\d{2})-(\d{2})-(\d{4})$/)
  if (dmy2) return `${dmy2[3]}-${dmy2[2]}-${dmy2[1]}`
  return null
}

function parseBRNumber(val: string): number | null {
  if (!val) return null
  const normalized = val.replace(/\s/g, '').replace(/\./g, '').replace(',', '.')
  const n = parseFloat(normalized)
  return isNaN(n) ? null : n
}

type ColumnMap = { date: number; description: number; amount: number; balance: number }

function detectColumns(rows: string[][]): ColumnMap | null {
  if (rows.length < 2) return null
  for (let i = 0; i < Math.min(5, rows.length); i++) {
    const row = rows[i]
    for (let dateCol = 0; dateCol < row.length; dateCol++) {
      let dateHits = 0
      for (let j = i + 1; j < Math.min(i + 5, rows.length); j++) {
        if (parseDate(rows[j][dateCol])) dateHits++
      }
      if (dateHits >= 2) {
        for (let j = i + 1; j < Math.min(i + 5, rows.length); j++) {
          const numericCols = rows[j]
            .map((v, idx) => ({ idx, val: parseBRNumber(v) }))
            .filter((x) => x.val !== null && x.idx !== dateCol)
          if (numericCols.length >= 1) {
            const descCol = rows[j].findIndex((v, idx) => {
              if (idx === dateCol) return false
              if (parseBRNumber(v) !== null) return false
              return v.trim().length > 0
            })
            const amountCol = numericCols[numericCols.length >= 2 ? numericCols.length - 2 : 0].idx
            const balanceCol = numericCols.length >= 2 ? numericCols[numericCols.length - 1].idx : -1
            return {
              date: dateCol,
              description: descCol >= 0 ? descCol : (dateCol === 0 ? 1 : 0),
              amount: amountCol,
              balance: balanceCol,
            }
          }
        }
      }
    }
  }
  return null
}

// ─── Main Component ───────────────────────────────────────────

const MONTH_NAMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]

export default function ExtratoPage() {
  const supabase = createClient()
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const now = new Date()
  const [step, setStep] = useState<Step>('list')
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [listFilter, setListFilter] = useState<ListFilter>('all')

  // Reconciliation dialog
  const [reconcileRow, setReconcileRow] = useState<BankExtractWithEntry | null>(null)
  const [entrySearch, setEntrySearch] = useState('')

  // Import wizard state
  const [dragOver, setDragOver] = useState(false)
  const [fileName, setFileName] = useState('')
  const [rows, setRows] = useState<ParsedRow[]>([])
  const [columnMap, setColumnMap] = useState<ColumnMap>({ date: 0, description: 1, amount: 2, balance: 3 })
  const [rawRows, setRawRows] = useState<string[][]>([])
  const [headerSkip, setHeaderSkip] = useState(1)
  const [importing, setImporting] = useState(false)
  const [importedCount, setImportedCount] = useState(0)

  const period = `${year}-${String(month).padStart(2, '0')}`

  // ── Queries ────────────────────────────────────────────────────

  const { data: company } = useQuery({
    queryKey: ['company'],
    queryFn: async () => {
      const { data } = await supabase.from('companies').select('id').single()
      return data
    },
  })

  const { data: extracts = [], isLoading: loadingExtracts } = useQuery<BankExtractWithEntry[]>({
    queryKey: ['bank-extract', period],
    queryFn: async () => {
      const startDate = `${period}-01`
      const endDate = new Date(year, month, 0).toISOString().split('T')[0]
      const { data, error } = await supabase
        .from('bank_extract')
        .select('*, reconciled_entry:entries(id, project:projects(id, code))')
        .gte('transaction_date', startDate)
        .lte('transaction_date', endDate)
        .order('transaction_date')
      if (error) throw error
      return (data ?? []) as BankExtractWithEntry[]
    },
    enabled: step === 'list',
  })

  // Entries available for reconciliation (same month, not yet reconciled via another extract row)
  const { data: candidateEntries = [] } = useQuery<EntryWithRelations[]>({
    queryKey: ['entries-for-reconcile', period],
    queryFn: async () => {
      const startDate = `${period}-01`
      const endDate = new Date(year, month, 0).toISOString().split('T')[0]
      const { data, error } = await supabase
        .from('entries')
        .select('*, project:projects(id, code), client:clients(id, name)')
        .or(`forecast_payment.gte.${startDate},paid_at.gte.${startDate}`)
        .or(`forecast_payment.lte.${endDate},paid_at.lte.${endDate}`)
        .order('forecast_payment')
      if (error) throw error
      return (data ?? []) as EntryWithRelations[]
    },
    enabled: !!reconcileRow,
  })

  const { data: classifications = [] } = useQuery<Classification[]>({
    queryKey: ['classifications'],
    queryFn: async () => {
      const { data } = await supabase.from('classifications').select('*').order('name')
      return (data ?? []) as Classification[]
    },
  })

  // ── Mutations ─────────────────────────────────────────────────

  const reconcileMutation = useMutation({
    mutationFn: async ({ extractId, entryId }: { extractId: string; entryId: string }) => {
      await reconcileExtract(extractId, entryId)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bank-extract'] })
      toast({ title: 'Conciliação realizada.' })
      setReconcileRow(null)
    },
    onError: (e: Error) =>
      toast({ title: 'Erro.', description: e.message, variant: 'destructive' }),
  })

  const unreconcileMutation = useMutation({
    mutationFn: async (extractId: string) => {
      await unreconcileExtract(extractId)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bank-extract'] })
      toast({ title: 'Conciliação removida.' })
    },
    onError: (e: Error) =>
      toast({ title: 'Erro.', description: e.message, variant: 'destructive' }),
  })

  // ── Derived ────────────────────────────────────────────────────

  const filtered =
    listFilter === 'all'
      ? extracts
      : listFilter === 'pendente'
      ? extracts.filter((e) => !e.reconciled)
      : extracts.filter((e) => e.reconciled)

  const totalIn = extracts.filter((e) => e.amount > 0).reduce((s, e) => s + e.amount, 0)
  const totalOut = extracts.filter((e) => e.amount < 0).reduce((s, e) => s + Math.abs(e.amount), 0)
  const pendingCount = extracts.filter((e) => !e.reconciled).length
  const reconciledCount = extracts.filter((e) => e.reconciled).length

  // Filter candidate entries by search + amount proximity
  const filteredEntries = candidateEntries.filter((e) => {
    if (!entrySearch) return true
    const q = entrySearch.toLowerCase()
    return (
      e.client?.name?.toLowerCase().includes(q) ||
      String(e.project?.code).includes(q) ||
      e.classification?.toLowerCase().includes(q)
    )
  })

  // ── Helpers ────────────────────────────────────────────────────

  function prevMonth() {
    if (month === 1) { setMonth(12); setYear((y) => y - 1) }
    else setMonth((m) => m - 1)
  }

  function nextMonth() {
    if (month === 12) { setMonth(1); setYear((y) => y + 1) }
    else setMonth((m) => m + 1)
  }

  // ── Import helpers ─────────────────────────────────────────────

  function buildPreview(raw: string[][], map: ColumnMap, skip: number): ParsedRow[] {
    return raw.slice(skip).map((row, i) => {
      const dateStr = parseDate(row[map.date] ?? '')
      const amount = parseBRNumber(row[map.amount] ?? '')
      const balance = map.balance >= 0 ? parseBRNumber(row[map.balance] ?? '') : null
      const description = (row[map.description] ?? '').trim()
      if (!dateStr) return { transaction_date: '', description, amount: 0, balance, rowIndex: i + skip, valid: false, error: 'Data inválida' }
      if (amount === null) return { transaction_date: dateStr, description, amount: 0, balance, rowIndex: i + skip, valid: false, error: 'Valor inválido' }
      if (!description) return { transaction_date: dateStr, description: '', amount, balance, rowIndex: i + skip, valid: false, error: 'Descrição vazia' }
      return { transaction_date: dateStr, description, amount, balance, rowIndex: i + skip, valid: true }
    }).filter((r) => r.description || r.valid)
  }

  async function handleFile(file: File) {
    if (!file.name.endsWith('.csv') && !file.name.endsWith('.txt')) {
      toast({ title: 'Formato inválido.', description: 'Envie um arquivo .csv ou .txt', variant: 'destructive' })
      return
    }
    setFileName(file.name)
    try {
      const text = await file.text()
      const raw = parseCSV(text)
      if (raw.length < 2) {
        toast({ title: 'Arquivo vazio ou inválido.', variant: 'destructive' })
        return
      }
      setRawRows(raw)
      const detected = detectColumns(raw) ?? { date: 0, description: 1, amount: 2, balance: 3 }
      setColumnMap(detected)
      const firstRowHasDate = parseDate(raw[0][detected.date] ?? '')
      const skip = firstRowHasDate ? 0 : 1
      setHeaderSkip(skip)
      setRows(buildPreview(raw, detected, skip))
      setStep('preview')
    } catch (e) {
      toast({ title: 'Erro ao ler arquivo.', description: String(e), variant: 'destructive' })
    }
  }

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleImport() {
    const validRows = rows.filter((r) => r.valid)
    if (validRows.length === 0) {
      toast({ title: 'Nenhuma linha válida para importar.', variant: 'destructive' })
      return
    }
    setImporting(true)
    try {
      const payload = validRows.map((r) => ({
        company_id: company?.id ?? null,
        transaction_date: r.transaction_date,
        description: r.description,
        amount: r.amount,
        balance: r.balance,
        classification: null,
        reconciled: false,
        reconciled_entry_id: null,
        source: 'import' as const,
        raw_description: r.description,
      }))
      const { error } = await supabase.from('bank_extract').insert(payload)
      if (error) throw error
      setImportedCount(validRows.length)
      setStep('done')
      queryClient.invalidateQueries({ queryKey: ['bank-extract'] })
      toast({ title: `${validRows.length} transações importadas com sucesso.` })
    } catch (e: unknown) {
      toast({ title: 'Erro ao importar.', description: e instanceof Error ? e.message : String(e), variant: 'destructive' })
    } finally {
      setImporting(false)
    }
  }

  function resetImport() {
    setStep('list')
    setFileName('')
    setRows([])
    setRawRows([])
    setImportedCount(0)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  function updateColumnMap(key: keyof ColumnMap, value: number) {
    const updated = { ...columnMap, [key]: value }
    setColumnMap(updated)
    setRows(buildPreview(rawRows, updated, headerSkip))
  }

  function updateHeaderSkip(skip: number) {
    setHeaderSkip(skip)
    setRows(buildPreview(rawRows, columnMap, skip))
  }

  const validCount = rows.filter((r) => r.valid).length
  const invalidCount = rows.filter((r) => !r.valid).length
  const previewTotalIn = rows.filter((r) => r.valid && r.amount > 0).reduce((s, r) => s + r.amount, 0)
  const previewTotalOut = rows.filter((r) => r.valid && r.amount < 0).reduce((s, r) => s + Math.abs(r.amount), 0)
  const colOptions = rawRows[0]?.map((h, i) => ({ value: i, label: h || `Coluna ${i + 1}` })) ?? []

  // ── Render ─────────────────────────────────────────────────────

  return (
    <div className="space-y-5">
      <PageHeader
        title="Extrato Bancário"
        description="Visualize e concilie transações do extrato com lançamentos"
        action={
          step === 'list'
            ? { label: 'Importar CSV', onClick: () => setStep('upload') }
            : step !== 'list'
            ? { label: '← Voltar ao extrato', onClick: resetImport }
            : undefined
        }
      />

      {/* ── LIST view ─────────────────────────────────────────── */}
      {step === 'list' && (
        <div className="space-y-4">
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

            {/* Filter pills */}
            <div className="flex gap-1.5">
              {(['all', 'pendente', 'conciliado'] as ListFilter[]).map((f) => {
                const label =
                  f === 'all'
                    ? `Todos (${extracts.length})`
                    : f === 'pendente'
                    ? `Pendente (${pendingCount})`
                    : `Conciliado (${reconciledCount})`
                return (
                  <button
                    key={f}
                    onClick={() => setListFilter(f)}
                    className={`px-3 py-1 rounded-full text-xs font-medium transition-colors border ${
                      listFilter === f
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'
                    }`}
                  >
                    {label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Summary cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="px-4 py-3 rounded-lg bg-white border border-slate-200">
              <p className="text-xs text-slate-500 mb-1">Total transações</p>
              <p className="font-semibold text-slate-800">{extracts.length}</p>
            </div>
            <div className="px-4 py-3 rounded-lg bg-emerald-50 border border-emerald-100">
              <p className="text-xs text-emerald-600 mb-1 flex items-center gap-1">
                <TrendingUp size={10} /> Entradas
              </p>
              <p className="font-semibold text-emerald-700">{formatCurrency(totalIn)}</p>
            </div>
            <div className="px-4 py-3 rounded-lg bg-red-50 border border-red-100">
              <p className="text-xs text-red-500 mb-1 flex items-center gap-1">
                <TrendingDown size={10} /> Saídas
              </p>
              <p className="font-semibold text-red-700">{formatCurrency(totalOut)}</p>
            </div>
            <div className="px-4 py-3 rounded-lg bg-amber-50 border border-amber-100">
              <p className="text-xs text-amber-600 mb-1">Pendentes de conciliação</p>
              <p className="font-semibold text-amber-700">{pendingCount}</p>
            </div>
          </div>

          {/* Table */}
          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
            {loadingExtracts ? (
              <div className="p-8 space-y-3">
                {[...Array(6)].map((_, i) => (
                  <div key={i} className="h-10 rounded-md bg-slate-100 animate-pulse" />
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <div className="p-12 text-center text-slate-400">
                <ArrowUpDown size={32} className="mx-auto mb-3 opacity-30" />
                <p className="font-medium text-slate-600">
                  Nenhuma transação em {MONTH_NAMES[month - 1]}/{year}
                </p>
                <p className="text-sm mt-1">
                  Use o botão "Importar CSV" para carregar um extrato bancário.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50">
                      <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Data</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Descrição</th>
                      <th className="text-right px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Valor</th>
                      <th className="text-right px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Saldo</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Status</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Lançamento</th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filtered.map((row) => (
                      <tr key={row.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-3 text-slate-500 text-xs whitespace-nowrap">
                          {formatDate(row.transaction_date)}
                        </td>
                        <td className="px-4 py-3 text-slate-700 max-w-[220px] truncate" title={row.description ?? ''}>
                          {row.description || '—'}
                        </td>
                        <td className={`px-4 py-3 text-right font-medium whitespace-nowrap ${
                          row.amount >= 0 ? 'text-emerald-600' : 'text-red-600'
                        }`}>
                          {formatCurrency(row.amount)}
                        </td>
                        <td className="px-4 py-3 text-right text-slate-400 text-xs whitespace-nowrap">
                          {row.balance != null ? formatCurrency(row.balance) : '—'}
                        </td>
                        <td className="px-4 py-3">
                          {row.reconciled ? (
                            <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 text-[10px] gap-1">
                              <CheckCircle2 size={10} /> Conciliado
                            </Badge>
                          ) : (
                            <Badge className="bg-amber-50 text-amber-700 border-amber-200 text-[10px] gap-1">
                              <AlertTriangle size={10} /> Pendente
                            </Badge>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs">
                          {row.reconciled && row.reconciled_entry?.project ? (
                            <span className="font-mono text-teal-600 font-medium">
                              #{row.reconciled_entry.project.code}
                            </span>
                          ) : (
                            <span className="text-slate-300">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {row.reconciled ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 text-xs gap-1 text-slate-400 hover:text-red-600 hover:bg-red-50"
                              onClick={() => unreconcileMutation.mutate(row.id)}
                              disabled={unreconcileMutation.isPending}
                            >
                              <Link2Off size={11} />
                              Desfazer
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 text-xs gap-1 text-slate-500 hover:text-teal-700 hover:bg-teal-50"
                              onClick={() => { setReconcileRow(row); setEntrySearch('') }}
                            >
                              <Link2 size={11} />
                              Conciliar
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── UPLOAD wizard ─────────────────────────────────────── */}
      {step === 'upload' && (
        <div className="max-w-2xl">
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            className={`border-2 border-dashed rounded-xl p-12 text-center transition-colors cursor-pointer ${
              dragOver ? 'border-teal-400 bg-teal-50' : 'border-slate-200 bg-white hover:border-slate-400'
            }`}
            onClick={() => fileInputRef.current?.click()}
          >
            <UploadCloud size={40} className="mx-auto text-slate-300 mb-4" />
            <p className="text-sm font-medium text-slate-700">Arraste um arquivo CSV aqui</p>
            <p className="text-xs text-slate-400 mt-1">ou clique para selecionar</p>
            <p className="text-xs text-slate-300 mt-3">Formatos suportados: .csv, .txt</p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.txt"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) handleFile(f)
              }}
            />
          </div>
          <div className="mt-4 p-4 rounded-lg border border-slate-100 bg-slate-50">
            <p className="text-xs font-semibold text-slate-600 mb-2">Formato esperado</p>
            <p className="text-xs text-slate-500">
              O arquivo deve conter colunas de data, descrição e valor. O separador pode ser vírgula ou ponto e vírgula. Datas nos formatos DD/MM/AAAA ou AAAA-MM-DD são reconhecidas automaticamente. Valores negativos representam débitos.
            </p>
          </div>
        </div>
      )}

      {/* ── PREVIEW wizard ────────────────────────────────────── */}
      {step === 'preview' && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <FileText size={16} className="text-slate-400" />
            <span className="text-sm font-medium text-slate-700">{fileName}</span>
          </div>

          {/* Column mapping */}
          {colOptions.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Mapeamento de colunas</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                  <div>
                    <Label className="text-xs">Ignorar linhas iniciais</Label>
                    <Input
                      type="number" min="0" max="10"
                      className="h-8 text-xs mt-1"
                      value={headerSkip}
                      onChange={(e) => updateHeaderSkip(parseInt(e.target.value) || 0)}
                    />
                  </div>
                  {(['date', 'description', 'amount', 'balance'] as const).map((key) => (
                    <div key={key}>
                      <Label className="text-xs capitalize">
                        {key === 'date' ? 'Data' : key === 'description' ? 'Descrição' : key === 'amount' ? 'Valor' : 'Saldo'}
                      </Label>
                      <Select
                        value={String(columnMap[key])}
                        onValueChange={(v) => updateColumnMap(key, parseInt(v))}
                      >
                        <SelectTrigger className="h-8 text-xs mt-1">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="-1">— nenhum —</SelectItem>
                          {colOptions.map((opt) => (
                            <SelectItem key={opt.value} value={String(opt.value)}>
                              {opt.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Summary */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="px-4 py-3 rounded-lg bg-slate-50 border border-slate-100">
              <p className="text-[11px] text-slate-500 uppercase tracking-wide">Total linhas</p>
              <p className="text-xl font-bold text-slate-800 mt-0.5">{rows.length}</p>
            </div>
            <div className="px-4 py-3 rounded-lg bg-emerald-50 border border-emerald-100">
              <p className="text-[11px] text-emerald-600 uppercase tracking-wide">Válidas</p>
              <p className="text-xl font-bold text-emerald-700 mt-0.5">{validCount}</p>
            </div>
            {invalidCount > 0 && (
              <div className="px-4 py-3 rounded-lg bg-red-50 border border-red-100">
                <p className="text-[11px] text-red-500 uppercase tracking-wide">Inválidas</p>
                <p className="text-xl font-bold text-red-700 mt-0.5">{invalidCount}</p>
              </div>
            )}
            <div className="px-4 py-3 rounded-lg bg-blue-50 border border-blue-100">
              <p className="text-[11px] text-blue-600 uppercase tracking-wide flex items-center gap-1">
                <TrendingUp size={10} /> Entradas
              </p>
              <p className="text-xl font-bold text-blue-700 mt-0.5">{formatCurrency(previewTotalIn)}</p>
            </div>
            <div className="px-4 py-3 rounded-lg bg-orange-50 border border-orange-100">
              <p className="text-[11px] text-orange-600 uppercase tracking-wide flex items-center gap-1">
                <TrendingDown size={10} /> Saídas
              </p>
              <p className="text-xl font-bold text-orange-700 mt-0.5">{formatCurrency(previewTotalOut)}</p>
            </div>
          </div>

          {/* Preview table */}
          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 bg-slate-50">
              <p className="text-xs font-semibold text-slate-600">
                Pré-visualização ({Math.min(rows.length, 50)} de {rows.length} linhas)
              </p>
            </div>
            <div className="overflow-x-auto max-h-96 overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-white">
                  <tr className="border-b border-slate-100">
                    <th className="text-left px-3 py-2 text-slate-500">Data</th>
                    <th className="text-left px-3 py-2 text-slate-500">Descrição</th>
                    <th className="text-right px-3 py-2 text-slate-500">Valor</th>
                    <th className="text-right px-3 py-2 text-slate-500">Saldo</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {rows.slice(0, 50).map((row) => (
                    <tr key={row.rowIndex} className={row.valid ? '' : 'bg-red-50'}>
                      <td className="px-3 py-1.5 text-slate-600">
                        {row.transaction_date ? formatDate(row.transaction_date) : <span className="text-red-400">—</span>}
                      </td>
                      <td className="px-3 py-1.5 text-slate-700 max-w-[200px] truncate">
                        {row.description || <span className="text-red-400">—</span>}
                      </td>
                      <td className={`px-3 py-1.5 text-right font-medium ${row.amount >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                        {row.valid ? formatCurrency(row.amount) : '—'}
                      </td>
                      <td className="px-3 py-1.5 text-right text-slate-500">
                        {row.balance != null ? formatCurrency(row.balance) : '—'}
                      </td>
                      <td className="px-3 py-1.5">
                        {row.valid
                          ? <CheckCircle2 size={12} className="text-emerald-500" />
                          : <span className="text-red-400 text-[10px]">{row.error}</span>
                        }
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {invalidCount > 0 && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-700">
              <AlertTriangle size={14} className="shrink-0 mt-0.5" />
              <span>
                {invalidCount} linha(s) inválida(s) serão ignoradas. Apenas as {validCount} linhas válidas serão importadas.
              </span>
            </div>
          )}

          <div className="flex gap-3">
            <Button variant="outline" onClick={resetImport}>Cancelar</Button>
            <Button
              className="bg-teal-600 hover:bg-teal-700"
              disabled={validCount === 0 || importing}
              onClick={handleImport}
            >
              {importing && <Loader2 size={14} className="animate-spin" />}
              Importar {validCount} transações
            </Button>
          </div>
        </div>
      )}

      {/* ── DONE ──────────────────────────────────────────────── */}
      {step === 'done' && (
        <div className="max-w-md">
          <Card>
            <CardContent className="pt-8 pb-6 text-center space-y-4">
              <CheckCircle2 size={48} className="mx-auto text-emerald-500" />
              <div>
                <p className="text-lg font-semibold text-slate-800">Importação concluída!</p>
                <p className="text-sm text-slate-500 mt-1">
                  {importedCount} transações foram importadas para o extrato bancário.
                </p>
              </div>
              <div className="flex gap-3 justify-center pt-2">
                <Button variant="outline" onClick={() => setStep('upload')}>Nova importação</Button>
                <Button className="bg-teal-600 hover:bg-teal-700" onClick={() => setStep('list')}>
                  Ver extrato
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── RECONCILIATION Dialog ──────────────────────────────── */}
      <Dialog open={!!reconcileRow} onOpenChange={(open) => { if (!open) setReconcileRow(null) }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Conciliar transação</DialogTitle>
          </DialogHeader>

          {reconcileRow && (
            <div className="space-y-4">
              {/* Extract row summary */}
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs space-y-1">
                <div className="flex justify-between">
                  <span className="text-slate-500">Data</span>
                  <span className="font-medium">{formatDate(reconcileRow.transaction_date)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Descrição</span>
                  <span className="font-medium truncate max-w-[220px]">{reconcileRow.description}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Valor</span>
                  <span className={`font-semibold ${reconcileRow.amount >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                    {formatCurrency(reconcileRow.amount)}
                  </span>
                </div>
              </div>

              {/* Search */}
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <Input
                  placeholder="Buscar por cliente, projeto ou classificação..."
                  value={entrySearch}
                  onChange={(e) => setEntrySearch(e.target.value)}
                  className="pl-8 h-8 text-xs"
                />
              </div>

              {/* Entries list */}
              <div className="max-h-72 overflow-y-auto space-y-1">
                {filteredEntries.length === 0 ? (
                  <p className="text-xs text-slate-400 text-center py-6">
                    Nenhum lançamento encontrado para este período.
                  </p>
                ) : (
                  filteredEntries.map((entry) => (
                    <div
                      key={entry.id}
                      className="flex items-center justify-between px-3 py-2 rounded-lg border border-slate-100 hover:border-teal-200 hover:bg-teal-50 transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          {entry.project && (
                            <span className="font-mono text-xs text-teal-600 font-medium">
                              #{entry.project.code}
                            </span>
                          )}
                          <span className="text-xs text-slate-700 truncate">
                            {entry.client?.name ?? '—'}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[10px] text-slate-400">{entry.classification}</span>
                          <span className="text-[10px] text-slate-300">·</span>
                          <span className="text-[10px] text-slate-400">
                            {entry.forecast_payment ? formatDate(entry.forecast_payment) : '—'}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 ml-2 shrink-0">
                        <span className="text-xs font-semibold text-slate-700">
                          {formatCurrency(entry.amount)}
                        </span>
                        <Button
                          size="sm"
                          className="h-6 text-[10px] bg-teal-600 hover:bg-teal-700"
                          onClick={() =>
                            reconcileMutation.mutate({
                              extractId: reconcileRow.id,
                              entryId: entry.id,
                            })
                          }
                          disabled={reconcileMutation.isPending}
                        >
                          Vincular
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

    </div>
  )
}
