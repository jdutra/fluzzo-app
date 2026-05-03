'use client'

import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { PageHeader } from '@/components/shared/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from '@/components/ui/use-toast'
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter,
} from '@/components/ui/sheet'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { ChevronLeft, ChevronRight, ChevronDown, TrendingUp, TrendingDown, Plus, Trash2, Loader2 } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
  ResponsiveContainer, Legend,
} from 'recharts'
import type { CashForecastManual } from '@/lib/supabase/types'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'

const MONTH_NAMES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun',
  'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

const manualSchema = z.object({
  period: z.string().min(1, 'Período obrigatório'),
  category: z.string().min(1, 'Categoria obrigatória'),
  description: z.string().optional(),
  amount: z.coerce.number().min(0.01, 'Valor deve ser > 0'),
  type: z.enum(['entrada', 'saida'] as const),
})

type ManualFormData = z.infer<typeof manualSchema>
type ViewMode = 'previsto' | 'realizado'

export default function FluxoPage() {
  const supabase = createClient()
  const queryClient = useQueryClient()
  const now = new Date()

  const [year, setYear] = useState(now.getFullYear())
  const [view, setView] = useState<ViewMode>('previsto')
  const [manualSheetOpen, setManualSheetOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<CashForecastManual | null>(null)

  const { register, handleSubmit, reset, setValue, watch, formState: { errors } } = useForm<ManualFormData>({
    resolver: zodResolver(manualSchema),
    defaultValues: { type: 'saida', period: `${year}-${String(now.getMonth() + 1).padStart(2, '0')}` },
  })

  const { data: company } = useQuery({
    queryKey: ['company'],
    queryFn: async () => {
      const { data } = await supabase.from('companies').select('id, saldo_inicial, data_saldo_inicial').single()
      return data
    },
  })

  const { data: classifications = [] } = useQuery({
    queryKey: ['classifications'],
    queryFn: async () => {
      const { data } = await supabase
        .from('classifications')
        .select('name, type, sort_order')
        .eq('active', true)
        .eq('is_totalizador', false)
        .order('sort_order')
        .order('name')
      return data ?? []
    },
  })

  const { data: entryData = [] } = useQuery({
    queryKey: ['entries-year', year, view],
    queryFn: async () => {
      let q = supabase.from('entries').select('forecast_payment, paid_at, amount, status, classification')

      if (view === 'previsto') {
        q = (q as any)
          .gte('forecast_payment', `${year}-01-01`)
          .lte('forecast_payment', `${year}-12-31`)
          .neq('status', 'cancelado')
      } else {
        q = (q as any)
          .eq('status', 'pago')
          .gte('paid_at', `${year}-01-01`)
          .lte('paid_at', `${year}-12-31`)
      }

      const { data, error } = await q
      if (error) throw error
      return (data ?? []) as Array<{
        forecast_payment: string | null
        paid_at: string | null
        amount: number
        status: string
        classification: string
      }>
    },
  })

  const { data: manualData = [] } = useQuery<CashForecastManual[]>({
    queryKey: ['cash-manual', year],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cash_forecast_manual')
        .select('*')
        .gte('period', `${year}-01`)
        .lte('period', `${year}-12`)
        .order('period')
      if (error) throw error
      return data ?? []
    },
  })

  const MONTHS_SHORT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
  const monthPeriods = useMemo(
    () => Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`),
    [year]
  )

  // ── Spreadsheet state ──────────────────────────────────────────
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(
    new Set(['entrada-op', 'saida-op', 'entrada-manual', 'saida-manual'])
  )

  function toggleGroup(id: string) {
    setExpandedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // ── Computed spreadsheet data ──────────────────────────────────
  const spreadsheet = useMemo(() => {
    // Build classification type lookup
    const classTypeMap: Record<string, 'entrada' | 'saida' | 'ambos'> = {}
    for (const c of classifications) {
      classTypeMap[(c as any).name] = (c as any).type
    }

    // Date field to use for grouping
    const dateField = view === 'previsto' ? 'forecast_payment' : 'paid_at'

    // Entries split by classification type
    const byClassEntrada: Record<string, Record<string, number>> = {}
    const byClassSaida: Record<string, Record<string, number>> = {}

    for (const e of entryData) {
      const period = (e as any)[dateField]?.slice(0, 7)
      if (!period) continue
      const cls = e.classification || 'Receita'
      const clsType = classTypeMap[cls] ?? 'entrada'

      if (clsType === 'saida') {
        if (!byClassSaida[cls]) byClassSaida[cls] = {}
        byClassSaida[cls][period] = (byClassSaida[cls][period] || 0) + (e.amount ?? 0)
      } else {
        if (!byClassEntrada[cls]) byClassEntrada[cls] = {}
        byClassEntrada[cls][period] = (byClassEntrada[cls][period] || 0) + (e.amount ?? 0)
      }
    }

    // Manual entries split by type
    const byEntrada: Record<string, Record<string, number>> = {}
    const bySaida: Record<string, Record<string, number>> = {}

    // For realizado, only include manual entries from past periods
    const today = new Date().toISOString().slice(0, 7)
    for (const m of manualData) {
      const period = m.period
      if (view === 'realizado' && period > today) continue
      const cat = m.category || 'Outros'
      if (m.type === 'entrada') {
        if (!byEntrada[cat]) byEntrada[cat] = {}
        byEntrada[cat][period] = (byEntrada[cat][period] || 0) + m.amount
      } else {
        if (!bySaida[cat]) bySaida[cat] = {}
        bySaida[cat][period] = (bySaida[cat][period] || 0) + m.amount
      }
    }

    // Monthly totals
    const totalEntradaOpByMonth: Record<string, number> = {}
    const totalSaidaOpByMonth: Record<string, number> = {}
    const totalEntradaNaoOpByMonth: Record<string, number> = {}
    const totalSaidaNaoOpByMonth: Record<string, number> = {}
    const geracaoOpByMonth: Record<string, number> = {}
    const geracaoNaoOpByMonth: Record<string, number> = {}
    const geracaoLiquidaByMonth: Record<string, number> = {}
    const margemLiquidaByMonth: Record<string, number> = {}

    for (const p of monthPeriods) {
      totalEntradaOpByMonth[p] = Object.values(byClassEntrada).reduce((s, v) => s + (v[p] ?? 0), 0)
      totalSaidaOpByMonth[p] = Object.values(byClassSaida).reduce((s, v) => s + (v[p] ?? 0), 0)
      totalEntradaNaoOpByMonth[p] = Object.values(byEntrada).reduce((s, v) => s + (v[p] ?? 0), 0)
      totalSaidaNaoOpByMonth[p] = Object.values(bySaida).reduce((s, v) => s + (v[p] ?? 0), 0)
      geracaoOpByMonth[p] = totalEntradaOpByMonth[p] - totalSaidaOpByMonth[p]
      geracaoNaoOpByMonth[p] = totalEntradaNaoOpByMonth[p] - totalSaidaNaoOpByMonth[p]
      geracaoLiquidaByMonth[p] = geracaoOpByMonth[p] + geracaoNaoOpByMonth[p]
      margemLiquidaByMonth[p] = totalEntradaOpByMonth[p] > 0
        ? (geracaoLiquidaByMonth[p] / totalEntradaOpByMonth[p]) * 100
        : 0
    }

    // Saldo acumulado starting from company.saldo_inicial
    let acc = ((company as any)?.saldo_inicial ?? 0) as number
    const saldoAcumulado: Record<string, number> = {}
    const saldoInicial: Record<string, number> = {}

    for (const p of monthPeriods) {
      saldoInicial[p] = acc
      acc += geracaoLiquidaByMonth[p]
      saldoAcumulado[p] = acc
    }

    // Sorted classification names (by sort_order from query, falling back to Object.keys order)
    const sortedEntradaNames = classifications
      .filter((c: any) => c.type !== 'saida' && byClassEntrada[c.name])
      .map((c: any) => c.name)
    // Add any names that exist in data but weren't in classifications list
    Object.keys(byClassEntrada).forEach((n) => { if (!sortedEntradaNames.includes(n)) sortedEntradaNames.push(n) })

    const sortedSaidaNames = classifications
      .filter((c: any) => c.type !== 'entrada' && byClassSaida[c.name])
      .map((c: any) => c.name)
    Object.keys(byClassSaida).forEach((n) => { if (!sortedSaidaNames.includes(n)) sortedSaidaNames.push(n) })

    return {
      byClassEntrada, byClassSaida, byEntrada, bySaida,
      totalEntradaOpByMonth, totalSaidaOpByMonth,
      totalEntradaNaoOpByMonth, totalSaidaNaoOpByMonth,
      geracaoOpByMonth, geracaoNaoOpByMonth,
      geracaoLiquidaByMonth, margemLiquidaByMonth,
      saldoAcumulado, saldoInicial,
      sortedEntradaNames, sortedSaidaNames,
    }
  }, [entryData, manualData, monthPeriods, classifications, company, view])

  // ── Chart data ─────────────────────────────────────────────────
  const monthlyData = useMemo(() => {
    return Array.from({ length: 12 }, (_, i) => {
      const p = monthPeriods[i]
      return {
        month: MONTH_NAMES[i],
        entradaOp: spreadsheet.totalEntradaOpByMonth[p] ?? 0,
        saidaOp: spreadsheet.totalSaidaOpByMonth[p] ?? 0,
        geracaoLiquida: spreadsheet.geracaoLiquidaByMonth[p] ?? 0,
      }
    })
  }, [spreadsheet, monthPeriods])

  // ── KPI totals ─────────────────────────────────────────────────
  const totalEntradaOp = monthlyData.reduce((s, m) => s + m.entradaOp, 0)
  const totalSaidaOp = monthlyData.reduce((s, m) => s + m.saidaOp, 0)
  const saldoFinal = spreadsheet.saldoAcumulado[monthPeriods[11]] ?? 0

  // ── Formatter ──────────────────────────────────────────────────
  function fmtCell(v: number): string {
    if (v === 0) return '—'
    const abs = Math.abs(v)
    const fmt = abs >= 1000
      ? `${(abs / 1000).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}K`
      : abs.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
    return v < 0 ? `- ${fmt}` : fmt
  }

  function fmtPct(v: number): string {
    if (v === 0) return '—'
    return `${v.toFixed(1)}%`
  }

  // ── Mutations ──────────────────────────────────────────────────
  const manualMutation = useMutation({
    mutationFn: async (data: ManualFormData) => {
      const { error } = await (supabase as any).from('cash_forecast_manual').insert({
        company_id: (company as any)?.id ?? null,
        period: data.period,
        category: data.category,
        description: data.description || null,
        amount: data.amount,
        type: data.type,
        recurring: false,
      })
      if (error) throw error
    },
    onSuccess: () => {
      toast({ title: 'Lançamento manual criado.' })
      queryClient.invalidateQueries({ queryKey: ['cash-manual'] })
      setManualSheetOpen(false)
      reset()
    },
    onError: (e: Error) => toast({ title: 'Erro.', description: e.message, variant: 'destructive' }),
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('cash_forecast_manual').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      toast({ title: 'Lançamento removido.' })
      queryClient.invalidateQueries({ queryKey: ['cash-manual'] })
      setDeleteTarget(null)
    },
    onError: (e: Error) => toast({ title: 'Erro.', description: e.message, variant: 'destructive' }),
  })

  function openManualSheet() {
    reset({ type: 'saida', period: `${year}-${String(now.getMonth() + 1).padStart(2, '0')}` })
    setManualSheetOpen(true)
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <PageHeader
          title="Fluxo de Caixa"
          description={view === 'previsto' ? 'Projeção mensal com todos os lançamentos previstos' : 'Apenas lançamentos efetivamente pagos'}
        />
        <div className="flex items-center gap-2">
          {/* Previsto / Realizado toggle */}
          <div className="flex rounded-md border border-slate-200 overflow-hidden">
            <button
              className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                view === 'previsto'
                  ? 'bg-teal-600 text-white'
                  : 'bg-white text-slate-600 hover:bg-slate-50'
              }`}
              onClick={() => setView('previsto')}
            >
              Previsto
            </button>
            <button
              className={`px-3 py-1.5 text-sm font-medium transition-colors border-l border-slate-200 ${
                view === 'realizado'
                  ? 'bg-teal-600 text-white'
                  : 'bg-white text-slate-600 hover:bg-slate-50'
              }`}
              onClick={() => setView('realizado')}
            >
              Realizado
            </button>
          </div>
          <Button size="sm" onClick={openManualSheet} className="bg-teal-600 hover:bg-teal-700 gap-2">
            <Plus size={14} /> Lançamento manual
          </Button>
        </div>
      </div>

      {/* Year navigator */}
      <div className="flex items-center gap-3">
        <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setYear(y => y - 1)}>
          <ChevronLeft size={14} />
        </Button>
        <span className="font-semibold text-slate-800 w-16 text-center">{year}</span>
        <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setYear(y => y + 1)}>
          <ChevronRight size={14} />
        </Button>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp size={16} className="text-green-500" />
              <p className="text-sm text-slate-500">
                {view === 'previsto' ? 'Entradas operacionais' : 'Total recebido'}
              </p>
            </div>
            <p className="text-2xl font-bold text-slate-800">{formatCurrency(totalEntradaOp)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-2 mb-1">
              <TrendingDown size={16} className="text-red-500" />
              <p className="text-sm text-slate-500">
                {view === 'previsto' ? 'Saídas operacionais' : 'Total saído'}
              </p>
            </div>
            <p className="text-2xl font-bold text-slate-800">{formatCurrency(totalSaidaOp)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp size={16} className={saldoFinal >= 0 ? 'text-teal-500' : 'text-red-500'} />
              <p className="text-sm text-slate-500">Saldo final {year}</p>
            </div>
            <p className={`text-2xl font-bold ${saldoFinal >= 0 ? 'text-slate-800' : 'text-red-600'}`}>
              {formatCurrency(saldoFinal)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Chart */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">
            Fluxo mensal — {year}
            <span className="ml-2 text-xs font-normal text-slate-400">
              ({view === 'previsto' ? 'previsto' : 'realizado'})
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={monthlyData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#64748b' }} />
              <YAxis
                tick={{ fontSize: 11, fill: '#64748b' }}
                tickFormatter={(v) => `R$${v >= 1000 ? `${(v / 1000).toFixed(0)}K` : v}`}
              />
              <RechartsTooltip
                formatter={(value: number, name: string) => [
                  formatCurrency(value),
                  name === 'entradaOp' ? 'Entradas Op.' : name === 'saidaOp' ? 'Saídas Op.' : 'Geração Líquida',
                ]}
                contentStyle={{ fontSize: 12, borderRadius: 8 }}
              />
              <Legend formatter={(val) =>
                val === 'entradaOp' ? 'Entradas Op.' : val === 'saidaOp' ? 'Saídas Op.' : 'Geração Líquida'
              } />
              <Bar dataKey="entradaOp" fill="#bae6fd" radius={[3, 3, 0, 0]} />
              <Bar dataKey="saidaOp" fill="#fca5a5" radius={[3, 3, 0, 0]} />
              <Bar dataKey="geracaoLiquida" fill="#0284c7" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* ── Spreadsheet colapsável ── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">
            Fluxo detalhado — {year}
            <span className="ml-2 text-xs font-normal text-slate-400">
              ({view === 'previsto' ? 'previsto' : 'realizado'})
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="text-xs border-collapse w-full" style={{ minWidth: 900 }}>
              <thead>
                <tr className="bg-slate-100 border-b-2 border-slate-300 text-slate-600">
                  <th className="sticky left-0 z-10 bg-slate-100 text-left px-3 py-2.5 font-semibold w-52 min-w-[200px] uppercase tracking-wide text-[10px]">
                    Descrição
                  </th>
                  {MONTHS_SHORT.map((m, i) => (
                    <th key={i} className="px-2 py-2.5 text-right font-semibold w-20 min-w-[72px] uppercase tracking-wide text-[10px]">
                      {m}/{String(year).slice(2)}
                    </th>
                  ))}
                  <th className="px-2 py-2.5 text-right font-semibold w-20 min-w-[72px] bg-slate-200 uppercase tracking-wide text-[10px]">
                    Total
                  </th>
                </tr>
              </thead>
              <tbody>

                {/* ── Saldo Inicial ── */}
                <SpreadRow
                  label="Saldo Inicial de Caixa"
                  values={monthPeriods.map(p => spreadsheet.saldoInicial[p])}
                  variant="highlight-blue"
                  fmt={fmtCell}
                  totalMode="last"
                />

                {/* ══ GRUPO: Entradas Operacionais ══ */}
                <SpreadGroupHeader
                  label="Entradas Operacionais"
                  expanded={expandedGroups.has('entrada-op')}
                  onToggle={() => toggleGroup('entrada-op')}
                  values={monthPeriods.map(p => spreadsheet.totalEntradaOpByMonth[p])}
                  color="green"
                  fmt={fmtCell}
                />
                {expandedGroups.has('entrada-op') && spreadsheet.sortedEntradaNames.map((cls) => (
                  <SpreadRow
                    key={cls}
                    label={cls}
                    values={monthPeriods.map(p => (spreadsheet.byClassEntrada[cls]?.[p]) ?? 0)}
                    variant="detail"
                    fmt={fmtCell}
                  />
                ))}
                {expandedGroups.has('entrada-op') && spreadsheet.sortedEntradaNames.length === 0 && (
                  <SpreadRow label="(sem lançamentos)" values={monthPeriods.map(() => 0)} variant="detail" fmt={fmtCell} empty />
                )}

                {/* ══ GRUPO: Saídas Operacionais ══ */}
                <SpreadGroupHeader
                  label="Saídas Operacionais"
                  expanded={expandedGroups.has('saida-op')}
                  onToggle={() => toggleGroup('saida-op')}
                  values={monthPeriods.map(p => spreadsheet.totalSaidaOpByMonth[p])}
                  color="red"
                  fmt={fmtCell}
                />
                {expandedGroups.has('saida-op') && spreadsheet.sortedSaidaNames.map((cls) => (
                  <SpreadRow
                    key={cls}
                    label={cls}
                    values={monthPeriods.map(p => (spreadsheet.byClassSaida[cls]?.[p]) ?? 0)}
                    variant="detail"
                    fmt={fmtCell}
                  />
                ))}
                {expandedGroups.has('saida-op') && spreadsheet.sortedSaidaNames.length === 0 && (
                  <SpreadRow label="(sem lançamentos)" values={monthPeriods.map(() => 0)} variant="detail" fmt={fmtCell} empty />
                )}

                {/* ── Geração Operacional ── */}
                <SpreadRow
                  label="Geração Operacional"
                  values={monthPeriods.map(p => spreadsheet.geracaoOpByMonth[p])}
                  variant="saldo"
                  fmt={fmtCell}
                  pctValues={monthPeriods.map(p =>
                    spreadsheet.totalEntradaOpByMonth[p] > 0
                      ? (spreadsheet.geracaoOpByMonth[p] / spreadsheet.totalEntradaOpByMonth[p]) * 100
                      : 0
                  )}
                />

                {/* ══ GRUPO: Entradas Não Operacionais ══ */}
                <SpreadGroupHeader
                  label="Entradas Não Operacionais"
                  expanded={expandedGroups.has('entrada-manual')}
                  onToggle={() => toggleGroup('entrada-manual')}
                  values={monthPeriods.map(p => spreadsheet.totalEntradaNaoOpByMonth[p])}
                  color="teal"
                  fmt={fmtCell}
                />
                {expandedGroups.has('entrada-manual') && Object.entries(spreadsheet.byEntrada).map(([cat, byMonth]) => (
                  <SpreadRow
                    key={cat}
                    label={cat}
                    values={monthPeriods.map(p => byMonth[p] ?? 0)}
                    variant="detail"
                    fmt={fmtCell}
                  />
                ))}
                {expandedGroups.has('entrada-manual') && Object.keys(spreadsheet.byEntrada).length === 0 && (
                  <SpreadRow label="(sem lançamentos)" values={monthPeriods.map(() => 0)} variant="detail" fmt={fmtCell} empty />
                )}

                {/* ══ GRUPO: Saídas Não Operacionais ══ */}
                <SpreadGroupHeader
                  label="Saídas Não Operacionais"
                  expanded={expandedGroups.has('saida-manual')}
                  onToggle={() => toggleGroup('saida-manual')}
                  values={monthPeriods.map(p => spreadsheet.totalSaidaNaoOpByMonth[p])}
                  color="orange"
                  fmt={fmtCell}
                />
                {expandedGroups.has('saida-manual') && Object.entries(spreadsheet.bySaida).map(([cat, byMonth]) => (
                  <SpreadRow
                    key={cat}
                    label={cat}
                    values={monthPeriods.map(p => byMonth[p] ?? 0)}
                    variant="detail"
                    fmt={fmtCell}
                  />
                ))}
                {expandedGroups.has('saida-manual') && Object.keys(spreadsheet.bySaida).length === 0 && (
                  <SpreadRow label="(sem lançamentos)" values={monthPeriods.map(() => 0)} variant="detail" fmt={fmtCell} empty />
                )}

                {/* ── Geração Não Operacional ── */}
                <SpreadRow
                  label="Geração Não Operacional"
                  values={monthPeriods.map(p => spreadsheet.geracaoNaoOpByMonth[p])}
                  variant="saldo"
                  fmt={fmtCell}
                />

                {/* ── Geração Líquida ── */}
                <SpreadRow
                  label="Geração Líquida"
                  values={monthPeriods.map(p => spreadsheet.geracaoLiquidaByMonth[p])}
                  variant="saldo-dark"
                  fmt={fmtCell}
                  pctValues={monthPeriods.map(p =>
                    spreadsheet.totalEntradaOpByMonth[p] > 0
                      ? (spreadsheet.geracaoLiquidaByMonth[p] / spreadsheet.totalEntradaOpByMonth[p]) * 100
                      : 0
                  )}
                />

                {/* ── Margem Líquida ── */}
                <SpreadRow
                  label="Margem Líquida"
                  values={monthPeriods.map(p => spreadsheet.margemLiquidaByMonth[p])}
                  variant="highlight"
                  fmt={fmtPct}
                  totalFmt={(vals) => {
                    const totalGL = monthPeriods.reduce((s, p) => s + (spreadsheet.geracaoLiquidaByMonth[p] ?? 0), 0)
                    const totalEO = monthPeriods.reduce((s, p) => s + (spreadsheet.totalEntradaOpByMonth[p] ?? 0), 0)
                    return totalEO > 0 ? fmtPct((totalGL / totalEO) * 100) : '—'
                  }}
                />

                {/* ── Saldo Final ── */}
                <SpreadRow
                  label="Saldo Final Acumulado"
                  values={monthPeriods.map(p => spreadsheet.saldoAcumulado[p])}
                  variant="highlight-blue-bold"
                  fmt={fmtCell}
                  totalMode="last"
                />

              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Manual entries list */}
      {manualData.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Lançamentos manuais — {year}</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50">
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-slate-500 uppercase">Período</th>
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-slate-500 uppercase">Categoria</th>
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-slate-500 uppercase">Descrição</th>
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-slate-500 uppercase">Tipo</th>
                    <th className="text-right px-4 py-2.5 text-xs font-medium text-slate-500 uppercase">Valor</th>
                    <th className="px-4 py-2.5" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {manualData.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50">
                      <td className="px-4 py-2.5 text-slate-600 font-mono text-xs">{item.period}</td>
                      <td className="px-4 py-2.5 text-slate-700">{item.category}</td>
                      <td className="px-4 py-2.5 text-slate-500 text-xs">{item.description ?? '—'}</td>
                      <td className="px-4 py-2.5">
                        <Badge className={item.type === 'entrada' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}>
                          {item.type === 'entrada' ? 'Entrada' : 'Saída'}
                        </Badge>
                      </td>
                      <td className="px-4 py-2.5 text-right font-medium text-slate-700">{formatCurrency(item.amount)}</td>
                      <td className="px-4 py-2.5">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-slate-400 hover:text-red-500"
                          onClick={() => setDeleteTarget(item)}
                        >
                          <Trash2 size={13} />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Manual entry sheet */}
      <Sheet open={manualSheetOpen} onOpenChange={setManualSheetOpen}>
        <SheetContent className="w-full sm:max-w-md">
          <SheetHeader className="mb-6">
            <SheetTitle>Novo lançamento manual</SheetTitle>
            <SheetDescription>Saídas fixas, investimentos, impostos ou outras entradas não vinculadas a projetos.</SheetDescription>
          </SheetHeader>
          <form onSubmit={handleSubmit((d) => manualMutation.mutate(d))} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="period">Período *</Label>
                <Input id="period" type="month" {...register('period')} />
                {errors.period && <p className="text-xs text-red-500">{errors.period.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label>Tipo *</Label>
                <Select value={watch('type')} onValueChange={(v) => setValue('type', v as 'entrada' | 'saida')}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="saida">Saída</SelectItem>
                    <SelectItem value="entrada">Entrada</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="category">Categoria *</Label>
              <Input id="category" {...register('category')} placeholder="Ex: Folha de pagamento, Aluguel, Impostos" />
              {errors.category && <p className="text-xs text-red-500">{errors.category.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="description">Descrição</Label>
              <Input id="description" {...register('description')} placeholder="Detalhes opcionais" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="amount">Valor (R$) *</Label>
              <Input id="amount" type="number" step="0.01" min="0.01" {...register('amount')} />
              {errors.amount && <p className="text-xs text-red-500">{errors.amount.message}</p>}
            </div>
            <SheetFooter className="pt-4 gap-2">
              <Button type="button" variant="outline" onClick={() => setManualSheetOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={manualMutation.isPending} className="bg-teal-600 hover:bg-teal-700">
                {manualMutation.isPending && <Loader2 size={14} className="animate-spin" />}
                Criar
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(v) => !v && setDeleteTarget(null)}
        title="Remover lançamento"
        description="Remover este lançamento manual? Esta ação não pode ser desfeita."
        confirmLabel="Remover"
        loading={deleteMutation.isPending}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
      />

    </div>
  )
}

// ─── Componentes auxiliares do Spreadsheet ─────────────────────────────────

type SpreadVariant = 'detail' | 'saldo' | 'saldo-dark' | 'highlight' | 'highlight-blue' | 'highlight-blue-bold'

function SpreadGroupHeader({
  label, expanded, onToggle, values, color, fmt,
}: {
  label: string
  expanded: boolean
  onToggle: () => void
  values: number[]
  color: 'green' | 'teal' | 'red' | 'orange'
  fmt: (v: number) => string
}) {
  const styles = {
    green: {
      row: 'bg-emerald-50 border-y border-emerald-200 cursor-pointer select-none hover:bg-emerald-100 transition-colors',
      sticky: 'sticky left-0 z-10 bg-emerald-50 px-3 py-2 font-semibold text-emerald-800',
      cell: 'text-emerald-700 font-semibold',
      total: 'bg-emerald-100 text-emerald-800 font-bold',
    },
    teal: {
      row: 'bg-teal-50 border-y border-teal-200 cursor-pointer select-none hover:bg-teal-100 transition-colors',
      sticky: 'sticky left-0 z-10 bg-teal-50 px-3 py-2 font-semibold text-teal-800',
      cell: 'text-teal-700 font-semibold',
      total: 'bg-teal-100 text-teal-800 font-bold',
    },
    red: {
      row: 'bg-rose-50 border-y border-rose-200 cursor-pointer select-none hover:bg-rose-100 transition-colors',
      sticky: 'sticky left-0 z-10 bg-rose-50 px-3 py-2 font-semibold text-rose-800',
      cell: 'text-rose-700 font-semibold',
      total: 'bg-rose-100 text-rose-800 font-bold',
    },
    orange: {
      row: 'bg-orange-50 border-y border-orange-200 cursor-pointer select-none hover:bg-orange-100 transition-colors',
      sticky: 'sticky left-0 z-10 bg-orange-50 px-3 py-2 font-semibold text-orange-800',
      cell: 'text-orange-700 font-semibold',
      total: 'bg-orange-100 text-orange-800 font-bold',
    },
  }
  const s = styles[color]
  const total = values.reduce((sv, v) => sv + v, 0)
  return (
    <tr className={s.row} onClick={onToggle}>
      <td className={s.sticky}>
        <div className="flex items-center gap-1.5">
          <ChevronDown
            size={13}
            className={`transition-transform flex-shrink-0 ${expanded ? '' : '-rotate-90'}`}
          />
          {label}
        </div>
      </td>
      {values.map((v, i) => (
        <td key={i} className={`px-2 py-2 text-right ${s.cell} ${v === 0 ? 'opacity-30' : ''}`}>
          {fmt(v)}
        </td>
      ))}
      <td className={`px-2 py-2 text-right ${s.total}`}>
        {fmt(total)}
      </td>
    </tr>
  )
}

function SpreadRow({
  label, values, variant, fmt, empty = false, totalFmt, pctValues, totalMode = 'sum',
}: {
  label: string
  values: number[]
  variant: SpreadVariant
  fmt: (v: number) => string
  empty?: boolean
  totalFmt?: (values: number[]) => string
  pctValues?: number[]
  totalMode?: 'sum' | 'last'
}) {
  const total = totalMode === 'last' ? values[values.length - 1] : values.reduce((s, v) => s + v, 0)

  const styles: Record<SpreadVariant, { row: string; cell: (v: number) => string; first: string; totalCell: string }> = {
    detail: {
      row: 'border-b border-slate-100 hover:bg-slate-50/70',
      cell: () => 'text-slate-600',
      first: 'sticky left-0 z-10 bg-white pl-7 pr-3 py-1.5 text-slate-500 font-normal',
      totalCell: 'bg-slate-50 font-medium text-slate-600',
    },
    saldo: {
      row: 'bg-slate-700/90 border-y border-slate-500',
      cell: (v) => v >= 0 ? 'text-emerald-300 font-bold' : 'text-rose-300 font-bold',
      first: 'sticky left-0 z-10 bg-slate-700 px-3 py-2.5 text-slate-100 font-bold',
      totalCell: 'bg-slate-800/50 font-bold text-slate-100',
    },
    'saldo-dark': {
      row: 'bg-slate-900 border-y border-slate-700',
      cell: (v) => v >= 0 ? 'text-emerald-300 font-bold' : 'text-rose-300 font-bold',
      first: 'sticky left-0 z-10 bg-slate-900 px-3 py-2.5 text-white font-bold',
      totalCell: 'bg-slate-900 font-bold text-white',
    },
    highlight: {
      row: 'bg-amber-50/80 border-b border-amber-200',
      cell: (v) => v >= 0 ? 'text-amber-700 font-semibold' : 'text-rose-600 font-semibold',
      first: 'sticky left-0 z-10 bg-amber-50 px-3 py-2.5 text-amber-800 font-bold',
      totalCell: 'bg-amber-100/80 font-bold text-amber-800',
    },
    'highlight-blue': {
      row: 'bg-slate-50 border-b border-slate-200',
      cell: (v) => v >= 0 ? 'text-slate-700 font-semibold' : 'text-rose-600 font-semibold',
      first: 'sticky left-0 z-10 bg-slate-50 px-3 py-2.5 text-slate-700 font-bold',
      totalCell: 'bg-slate-100 font-bold text-slate-700',
    },
    'highlight-blue-bold': {
      row: 'bg-sky-50 border-b-2 border-sky-300',
      cell: (v) => v >= 0 ? 'text-sky-700 font-bold' : 'text-rose-600 font-bold',
      first: 'sticky left-0 z-10 bg-sky-50 px-3 py-2.5 text-sky-800 font-extrabold',
      totalCell: 'bg-sky-100 font-extrabold text-sky-800',
    },
  }

  const s = styles[variant]

  const totalPct = pctValues
    ? (totalMode === 'last' ? pctValues[pctValues.length - 1] : pctValues.reduce((s, v) => s + v, 0) / pctValues.length)
    : null

  return (
    <tr className={s.row}>
      <td className={s.first}>{label}</td>
      {values.map((v, i) => {
        const pct = pctValues?.[i]
        return (
          <td key={i} className={`px-2 py-1.5 text-right ${s.cell(v)} ${v === 0 && !empty ? 'opacity-40' : ''}`}>
            {empty ? '—' : fmt(v)}
            {pct !== undefined && pct !== 0 && (
              <div className="text-[9px] opacity-70 font-normal leading-tight">{pct.toFixed(1)}%</div>
            )}
          </td>
        )
      })}
      <td className={`px-2 py-1.5 text-right ${s.totalCell}`}>
        {empty ? '—' : totalFmt ? totalFmt(values) : fmt(total)}
        {totalPct !== null && totalPct !== 0 && (
          <div className="text-[9px] opacity-70 font-normal leading-tight">{totalPct.toFixed(1)}%</div>
        )}
      </td>
    </tr>
  )
}
