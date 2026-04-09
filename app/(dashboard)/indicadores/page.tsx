'use client'

import { useState, useMemo, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { PageHeader } from '@/components/shared/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { toast } from '@/components/ui/use-toast'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import {
  Gauge, TrendingUp, TrendingDown, DollarSign, Users, FolderKanban,
  Plus, Pencil, Trash2, X, GripVertical, Loader2, ChevronDown, ChevronUp,
  Target, ArrowUpRight,
} from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { cn } from '@/lib/utils'
import {
  createKpiIndicator, updateKpiIndicator, deleteKpiIndicator,
} from '@/lib/actions/kpis'
import type { KpiIndicator, KpiComponent, Entry, Lead, Project, CashForecastManual, Classification } from '@/lib/supabase/types'

// ─── Constants ────────────────────────────────────────────────────────────────

const MONTH_NAMES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun',
  'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

const MONTH_NAMES_FULL = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']

const COLOR_OPTIONS = [
  { value: 'teal',   label: 'Verde-água', bg: 'bg-teal-500',   text: 'text-teal-600',   light: 'bg-teal-50',   border: 'border-teal-200' },
  { value: 'blue',   label: 'Azul',       bg: 'bg-blue-500',   text: 'text-blue-600',   light: 'bg-blue-50',   border: 'border-blue-200' },
  { value: 'violet', label: 'Violeta',    bg: 'bg-violet-500', text: 'text-violet-600', light: 'bg-violet-50', border: 'border-violet-200' },
  { value: 'amber',  label: 'Âmbar',      bg: 'bg-amber-500',  text: 'text-amber-600',  light: 'bg-amber-50',  border: 'border-amber-200' },
  { value: 'rose',   label: 'Rosa',       bg: 'bg-rose-500',   text: 'text-rose-600',   light: 'bg-rose-50',   border: 'border-rose-200' },
  { value: 'emerald',label: 'Esmeralda',  bg: 'bg-emerald-500',text: 'text-emerald-600',light: 'bg-emerald-50',border: 'border-emerald-200' },
]

const COLOR_MAP: Record<string, typeof COLOR_OPTIONS[0]> = Object.fromEntries(
  COLOR_OPTIONS.map(c => [c.value, c])
)

const COMPONENT_TYPE_LABELS: Record<string, string> = {
  'entries-all':            'Todos os lançamentos (projetos)',
  'entries-classification': 'Lançamentos por classificação',
  'manual-all':             'Todos os lançamentos manuais',
  'manual-category':        'Lançamentos manuais por categoria',
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtK(v: number) {
  const abs = Math.abs(v)
  if (abs >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000)     return `${(v / 1_000).toFixed(0)}K`
  return v.toFixed(0)
}

function pct(num: number, den: number) {
  if (!den || den === 0) return null
  return (num / den) * 100
}

// ─── Component: KPI Card (business metrics — hardcoded) ───────────────────────

interface HardKpiCardProps {
  label: string
  value: string
  sub?: string
  trend?: 'up' | 'down' | 'neutral'
  icon: React.ElementType
  colorClass: string
  lightClass: string
  borderClass: string
}

function HardKpiCard({ label, value, sub, trend, icon: Icon, colorClass, lightClass, borderClass }: HardKpiCardProps) {
  return (
    <div className={cn('rounded-xl border p-5 flex flex-col gap-3', lightClass, borderClass)}>
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-slate-600">{label}</span>
        <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center', lightClass)}>
          <Icon size={18} className={colorClass} />
        </div>
      </div>
      <div>
        <p className={cn('text-2xl font-bold', colorClass)}>{value}</p>
        {sub && (
          <p className={cn('text-xs mt-0.5 flex items-center gap-1',
            trend === 'up' ? 'text-emerald-600' : trend === 'down' ? 'text-rose-500' : 'text-slate-400'
          )}>
            {trend === 'up' && <TrendingUp size={11} />}
            {trend === 'down' && <TrendingDown size={11} />}
            {sub}
          </p>
        )}
      </div>
    </div>
  )
}

// ─── Component: Configurable KPI Card ─────────────────────────────────────────

interface ConfigKpiCardProps {
  indicator: KpiIndicator
  value: number | null
  percentValue: number | null
  onEdit: () => void
  onDelete: () => void
}

function ConfigKpiCard({ indicator, value, percentValue, onEdit, onDelete }: ConfigKpiCardProps) {
  const col = COLOR_MAP[indicator.color] ?? COLOR_MAP['teal']
  const isPositive = value !== null && value >= 0

  return (
    <div className={cn('rounded-xl border p-5 flex flex-col gap-3 group relative', col.light, col.border)}>
      {/* Actions */}
      <div className="absolute top-3 right-3 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button onClick={onEdit} className="p-1 rounded hover:bg-white/60 text-slate-400 hover:text-slate-700">
          <Pencil size={13} />
        </button>
        <button onClick={onDelete} className="p-1 rounded hover:bg-white/60 text-slate-400 hover:text-rose-600">
          <Trash2 size={13} />
        </button>
      </div>
      <div className="flex items-center gap-2">
        <div className={cn('w-2.5 h-2.5 rounded-full', col.bg)} />
        <span className="text-sm font-medium text-slate-600">{indicator.name}</span>
      </div>
      <div>
        {value === null ? (
          <p className="text-lg font-semibold text-slate-400 italic">Sem dados</p>
        ) : (
          <p className={cn('text-2xl font-bold', col.text)}>
            {formatCurrency(value)}
          </p>
        )}
        {percentValue !== null && (
          <p className={cn('text-xs mt-0.5 flex items-center gap-1', isPositive ? 'text-emerald-600' : 'text-rose-500')}>
            <ArrowUpRight size={11} />
            {percentValue.toFixed(1)}%
          </p>
        )}
        {/* Formula preview */}
        <p className="text-xs text-slate-400 mt-1 truncate">
          {indicator.components.map((c, i) => {
            const sign = c.sign === 1 ? (i === 0 ? '' : ' + ') : ' − '
            const label = c.category ?? COMPONENT_TYPE_LABELS[c.type]?.split(' ').slice(0, 3).join(' ') ?? c.type
            return `${sign}${label}`
          }).join('')}
        </p>
      </div>
    </div>
  )
}

// ─── Component: Formula Builder Row ───────────────────────────────────────────

interface FormulaRowProps {
  comp: KpiComponent
  idx: number
  classifications: Classification[]
  manualCategories: string[]
  onChange: (idx: number, comp: KpiComponent) => void
  onRemove: (idx: number) => void
}

function FormulaRow({ comp, idx, classifications, manualCategories, onChange, onRemove }: FormulaRowProps) {
  return (
    <div className="flex items-center gap-2 p-2 bg-slate-50 rounded-lg">
      <GripVertical size={14} className="text-slate-300 flex-shrink-0" />

      {/* Sign */}
      <Select
        value={String(comp.sign)}
        onValueChange={(v) => onChange(idx, { ...comp, sign: Number(v) as 1 | -1 })}
      >
        <SelectTrigger className="w-16 h-8 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="1">+</SelectItem>
          <SelectItem value="-1">−</SelectItem>
        </SelectContent>
      </Select>

      {/* Source type */}
      <Select
        value={comp.type}
        onValueChange={(v) => onChange(idx, { ...comp, type: v as KpiComponent['type'], category: undefined })}
      >
        <SelectTrigger className="flex-1 h-8 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="entries-all">Lançamentos (todos)</SelectItem>
          <SelectItem value="entries-classification">Lançamentos por classificação</SelectItem>
          <SelectItem value="manual-all">Manuais (todos)</SelectItem>
          <SelectItem value="manual-category">Manuais por categoria</SelectItem>
        </SelectContent>
      </Select>

      {/* Category selector — appears when needed */}
      {comp.type === 'entries-classification' && (
        <Select
          value={comp.category ?? ''}
          onValueChange={(v) => onChange(idx, { ...comp, category: v })}
        >
          <SelectTrigger className="flex-1 h-8 text-xs">
            <SelectValue placeholder="Classificação…" />
          </SelectTrigger>
          <SelectContent>
            {classifications.map((c) => (
              <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {comp.type === 'manual-category' && (
        <Select
          value={comp.category ?? ''}
          onValueChange={(v) => onChange(idx, { ...comp, category: v })}
        >
          <SelectTrigger className="flex-1 h-8 text-xs">
            <SelectValue placeholder="Categoria…" />
          </SelectTrigger>
          <SelectContent>
            {manualCategories.map((cat) => (
              <SelectItem key={cat} value={cat}>{cat}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      <button onClick={() => onRemove(idx)} className="p-1 rounded text-slate-400 hover:text-rose-500">
        <X size={14} />
      </button>
    </div>
  )
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

const BLANK_FORM = {
  name: '',
  color: 'teal',
  show_percent: false,
  components: [] as KpiComponent[],
  percent_base_components: [] as KpiComponent[],
}

export default function IndicadoresPage() {
  const supabase = createClient()
  const queryClient = useQueryClient()
  const now = new Date()

  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth()) // 0-indexed
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(BLANK_FORM)
  const [showFormulaSection, setShowFormulaSection] = useState(true)

  // ─── Queries ──────────────────────────────────────────────────────────────

  const { data: leads = [] } = useQuery({
    queryKey: ['leads-all'],
    queryFn: async () => {
      const { data } = await supabase.from('leads').select('*')
      return data ?? []
    },
    throwOnError: false,
  })

  const { data: projects = [] } = useQuery({
    queryKey: ['projects-all'],
    queryFn: async () => {
      const { data } = await supabase.from('projects').select('*')
      return data ?? []
    },
    throwOnError: false,
  })

  const { data: entries = [] } = useQuery({
    queryKey: ['entries-all'],
    queryFn: async () => {
      const { data } = await supabase.from('entries').select('*').order('forecast_billing', { ascending: true })
      return (data ?? []) as Entry[]
    },
    throwOnError: false,
  })

  const { data: manualEntries = [] } = useQuery({
    queryKey: ['manual-entries-all'],
    queryFn: async () => {
      const { data } = await supabase
        .from('cash_forecast_manual')
        .select('*')
      return (data ?? []) as CashForecastManual[]
    },
    throwOnError: false,
  })

  const { data: kpis = [], isLoading: kpisLoading } = useQuery({
    queryKey: ['kpi-indicators'],
    queryFn: async () => {
      const { data } = await supabase
        .from('kpi_indicators')
        .select('*')
        .eq('active', true)
        .order('sort_order')
      return (data ?? []) as KpiIndicator[]
    },
    throwOnError: false,
    retry: false,
  })

  const { data: classifications = [] } = useQuery({
    queryKey: ['classifications'],
    queryFn: async () => {
      const { data } = await supabase
        .from('classifications')
        .select('*')
        .eq('active', true)
        .order('sort_order')
      return (data ?? []) as Classification[]
    },
    throwOnError: false,
  })

  // ─── Derived data ─────────────────────────────────────────────────────────

  const manualCategories = useMemo(() => {
    const cats = new Set(manualEntries.map((m) => m.category).filter(Boolean))
    return Array.from(cats) as string[]
  }, [manualEntries])

  // Period boundaries for selected month
  const periodStr = useMemo(
    () => `${year}-${String(month + 1).padStart(2, '0')}`,
    [year, month]
  )

  // YTD period (Jan–selected month)
  const ytdMonths = useMemo(
    () => Array.from({ length: month + 1 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`),
    [year, month]
  )

  // ─── Business KPIs (hardcoded logic) ──────────────────────────────────────

  const businessKpis = useMemo(() => {
    const activeLeads = leads.filter((l: any) => !['fechado', 'perdido'].includes(l.stage))
    const convertedLeads = leads.filter((l: any) => l.stage === 'fechado')
    const lostLeads = leads.filter((l: any) => l.stage === 'perdido')
    const totalLeads = leads.length

    const pipeline = activeLeads.reduce((sum: number, l: any) => sum + (l.estimated_value ?? 0), 0)

    const conversionRate = totalLeads > 0
      ? ((convertedLeads.length / totalLeads) * 100).toFixed(1) + '%'
      : '—'

    const ticketMedio = convertedLeads.length > 0
      ? convertedLeads.reduce((sum: number, l: any) => sum + (l.estimated_value ?? 0), 0) / convertedLeads.length
      : null

    const activeProjects = projects.filter((p: any) => p.status === 'ativo').length

    // Revenue YTD — entries with paid_at or forecast_billing in YTD range, type entrada (positive amount)
    const receitaYTD = entries
      .filter((e) => {
        const ref = e.paid_at ?? e.forecast_billing
        if (!ref) return false
        const m = ref.slice(0, 7)
        return ytdMonths.includes(m) && e.amount > 0
      })
      .reduce((sum, e) => sum + e.amount, 0)

    // Receita prevista for this month
    const receitaPrevista = entries
      .filter((e) => {
        const m = (e.forecast_billing ?? '').slice(0, 7)
        return m === periodStr && e.amount > 0
      })
      .reduce((sum, e) => sum + e.amount, 0)

    // Receita realizada for this month
    const receitaRealizada = entries
      .filter((e) => {
        const m = (e.paid_at ?? '').slice(0, 7)
        return m === periodStr && e.amount > 0
      })
      .reduce((sum, e) => sum + e.amount, 0)

    const realizationRate = receitaPrevista > 0
      ? ((receitaRealizada / receitaPrevista) * 100).toFixed(1) + '%'
      : '—'

    return {
      pipeline,
      conversionRate,
      ticketMedio,
      activeProjects,
      lostLeads: lostLeads.length,
      totalLeads,
      receitaYTD,
      receitaPrevista,
      receitaRealizada,
      realizationRate,
    }
  }, [leads, projects, entries, ytdMonths, periodStr])

  // ─── Configurable KPI computation ─────────────────────────────────────────

  function computeComponents(components: KpiComponent[], period: string): number {
    let total = 0
    for (const comp of components) {
      let val = 0
      if (comp.type === 'entries-all') {
        val = entries
          .filter((e) => {
            const ref = e.paid_at ?? e.forecast_billing ?? ''
            return ref.slice(0, 7) === period
          })
          .reduce((s, e) => s + e.amount, 0)
      } else if (comp.type === 'entries-classification' && comp.category) {
        val = entries
          .filter((e) => {
            const ref = e.paid_at ?? e.forecast_billing ?? ''
            return ref.slice(0, 7) === period && e.classification === comp.category
          })
          .reduce((s, e) => s + e.amount, 0)
      } else if (comp.type === 'manual-all') {
        val = manualEntries
          .filter((m) => m.period === period)
          .reduce((s, m) => s + m.amount, 0)
      } else if (comp.type === 'manual-category' && comp.category) {
        val = manualEntries
          .filter((m) => m.period === period && m.category === comp.category)
          .reduce((s, m) => s + m.amount, 0)
      }
      total += comp.sign * val
    }
    return total
  }

  const kpiValues = useMemo(() => {
    return kpis.map((kpi) => {
      const value = computeComponents(kpi.components, periodStr)
      let percentValue: number | null = null
      if (kpi.show_percent && kpi.percent_base_components.length > 0) {
        const base = computeComponents(kpi.percent_base_components, periodStr)
        percentValue = pct(value, base)
      }
      return { id: kpi.id, value, percentValue }
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kpis, periodStr, entries, manualEntries])

  // ─── Mutations ────────────────────────────────────────────────────────────

  const createMutation = useMutation({
    mutationFn: () => createKpiIndicator({
      name: form.name,
      color: form.color,
      components: form.components,
      show_percent: form.show_percent,
      percent_base_components: form.percent_base_components,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kpi-indicators'] })
      toast({ title: 'Indicador criado com sucesso!' })
      setDialogOpen(false)
      setForm(BLANK_FORM)
      setEditingId(null)
    },
    onError: (e: any) => toast({ title: 'Erro ao criar', description: e.message, variant: 'destructive' }),
  })

  const updateMutation = useMutation({
    mutationFn: () => updateKpiIndicator(editingId!, {
      name: form.name,
      color: form.color,
      components: form.components,
      show_percent: form.show_percent,
      percent_base_components: form.percent_base_components,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kpi-indicators'] })
      toast({ title: 'Indicador atualizado!' })
      setDialogOpen(false)
      setForm(BLANK_FORM)
      setEditingId(null)
    },
    onError: (e: any) => toast({ title: 'Erro ao atualizar', description: e.message, variant: 'destructive' }),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteKpiIndicator(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kpi-indicators'] })
      toast({ title: 'Indicador removido.' })
    },
    onError: (e: any) => toast({ title: 'Erro ao remover', description: e.message, variant: 'destructive' }),
  })

  // ─── Handlers ─────────────────────────────────────────────────────────────

  function openCreate() {
    setForm(BLANK_FORM)
    setEditingId(null)
    setDialogOpen(true)
  }

  function openEdit(kpi: KpiIndicator) {
    setForm({
      name: kpi.name,
      color: kpi.color,
      show_percent: kpi.show_percent,
      components: kpi.components,
      percent_base_components: kpi.percent_base_components,
    })
    setEditingId(kpi.id)
    setDialogOpen(true)
  }

  function handleSave() {
    if (!form.name.trim()) return toast({ title: 'Nome é obrigatório', variant: 'destructive' })
    if (editingId) updateMutation.mutate()
    else createMutation.mutate()
  }

  const updateComp = useCallback((idx: number, comp: KpiComponent) => {
    setForm((p) => {
      const arr = [...p.components]
      arr[idx] = comp
      return { ...p, components: arr }
    })
  }, [])

  const removeComp = useCallback((idx: number) => {
    setForm((p) => ({ ...p, components: p.components.filter((_, i) => i !== idx) }))
  }, [])

  const addComp = useCallback(() => {
    setForm((p) => ({
      ...p,
      components: [...p.components, { type: 'entries-all', sign: 1 }],
    }))
  }, [])

  const updateBaseComp = useCallback((idx: number, comp: KpiComponent) => {
    setForm((p) => {
      const arr = [...p.percent_base_components]
      arr[idx] = comp
      return { ...p, percent_base_components: arr }
    })
  }, [])

  const removeBaseComp = useCallback((idx: number) => {
    setForm((p) => ({ ...p, percent_base_components: p.percent_base_components.filter((_, i) => i !== idx) }))
  }, [])

  const addBaseComp = useCallback(() => {
    setForm((p) => ({
      ...p,
      percent_base_components: [...p.percent_base_components, { type: 'entries-all', sign: 1 }],
    }))
  }, [])

  const isSaving = createMutation.isPending || updateMutation.isPending

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <PageHeader
          title="Indicadores"
          description="Métricas do negócio e indicadores financeiros configuráveis"
        />
        {/* Period selectors */}
        <div className="flex items-center gap-2">
          <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
            <SelectTrigger className="w-32 h-9 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MONTH_NAMES_FULL.map((m, i) => (
                <SelectItem key={i} value={String(i)}>{m}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
            <SelectTrigger className="w-24 h-9 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[2023, 2024, 2025, 2026, 2027].map((y) => (
                <SelectItem key={y} value={String(y)}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* ── Section 1: Business KPIs ── */}
      <section>
        <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3">
          Desempenho Comercial
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
          <HardKpiCard
            label="Pipeline Ativo"
            value={`R$ ${fmtK(businessKpis.pipeline)}`}
            sub={`${leads.filter((l: any) => !['fechado', 'perdido'].includes(l.stage)).length} leads`}
            trend="neutral"
            icon={TrendingUp}
            colorClass="text-blue-600"
            lightClass="bg-blue-50"
            borderClass="border-blue-200"
          />
          <HardKpiCard
            label="Taxa de Conversão"
            value={businessKpis.conversionRate}
            sub={`${leads.filter((l: any) => l.stage === 'fechado').length} / ${businessKpis.totalLeads} leads`}
            trend="up"
            icon={Target}
            colorClass="text-emerald-600"
            lightClass="bg-emerald-50"
            borderClass="border-emerald-200"
          />
          <HardKpiCard
            label="Ticket Médio"
            value={businessKpis.ticketMedio != null ? `R$ ${fmtK(businessKpis.ticketMedio)}` : '—'}
            sub="leads convertidos"
            trend="neutral"
            icon={DollarSign}
            colorClass="text-teal-600"
            lightClass="bg-teal-50"
            borderClass="border-teal-200"
          />
          <HardKpiCard
            label="Projetos Ativos"
            value={String(businessKpis.activeProjects)}
            sub="em andamento"
            trend="neutral"
            icon={FolderKanban}
            colorClass="text-violet-600"
            lightClass="bg-violet-50"
            borderClass="border-violet-200"
          />
          <HardKpiCard
            label={`Receita YTD ${year}`}
            value={`R$ ${fmtK(businessKpis.receitaYTD)}`}
            sub={`Jan–${MONTH_NAMES[month]}`}
            trend="up"
            icon={ArrowUpRight}
            colorClass="text-amber-600"
            lightClass="bg-amber-50"
            borderClass="border-amber-200"
          />
          <HardKpiCard
            label="Realização do Mês"
            value={businessKpis.realizationRate}
            sub={`Prev. ${formatCurrency(businessKpis.receitaPrevista)}`}
            trend={businessKpis.receitaRealizada >= businessKpis.receitaPrevista ? 'up' : 'down'}
            icon={Gauge}
            colorClass="text-rose-600"
            lightClass="bg-rose-50"
            borderClass="border-rose-200"
          />
        </div>
      </section>

      <Separator />

      {/* ── Section 2: Configurable Financial KPIs ── */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider">
              Indicadores Financeiros Configuráveis
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Referência: {MONTH_NAMES_FULL[month]} {year}
            </p>
          </div>
          <Button size="sm" onClick={openCreate} className="gap-1.5">
            <Plus size={14} />
            Novo Indicador
          </Button>
        </div>

        {kpisLoading && (
          <div className="flex items-center gap-2 text-sm text-slate-400 py-4">
            <Loader2 size={16} className="animate-spin" />
            Carregando indicadores…
          </div>
        )}

        {!kpisLoading && kpis.length === 0 && (
          <div className="rounded-xl border border-dashed border-slate-200 p-8 text-center">
            <Gauge size={32} className="mx-auto text-slate-300 mb-2" />
            <p className="text-sm text-slate-500 font-medium">Nenhum indicador configurado</p>
            <p className="text-xs text-slate-400 mt-1">
              Clique em "Novo Indicador" para criar fórmulas personalizadas como Margem Operacional, Cobertura de Custos, etc.
            </p>
            <Button variant="outline" size="sm" className="mt-4 gap-1.5" onClick={openCreate}>
              <Plus size={13} />
              Criar primeiro indicador
            </Button>
          </div>
        )}

        {!kpisLoading && kpis.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
            {kpis.map((kpi) => {
              const vals = kpiValues.find((v) => v.id === kpi.id)
              return (
                <ConfigKpiCard
                  key={kpi.id}
                  indicator={kpi}
                  value={vals?.value ?? null}
                  percentValue={vals?.percentValue ?? null}
                  onEdit={() => openEdit(kpi)}
                  onDelete={() => deleteMutation.mutate(kpi.id)}
                />
              )
            })}
          </div>
        )}
      </section>

      {/* ── Section 3: Monthly trend table ── */}
      {!kpisLoading && kpis.length > 0 && (
        <>
          <Separator />
          <section>
            <button
              className="flex items-center gap-2 text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3 hover:text-slate-700"
              onClick={() => setShowFormulaSection((p) => !p)}
            >
              Evolução Mensal — {year}
              {showFormulaSection ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>

            {showFormulaSection && (
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="min-w-full text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <th className="sticky left-0 bg-slate-50 px-4 py-2.5 text-left font-semibold text-slate-600 w-48 min-w-[12rem] z-10">
                        Indicador
                      </th>
                      {MONTH_NAMES.map((m) => (
                        <th key={m} className="px-3 py-2.5 text-right font-medium text-slate-500 min-w-[4.5rem]">
                          {m}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {kpis.map((kpi, ri) => {
                      const col = COLOR_MAP[kpi.color] ?? COLOR_MAP['teal']
                      return (
                        <tr key={kpi.id} className={ri % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}>
                          <td className={cn(
                            'sticky left-0 px-4 py-2 font-medium text-slate-700 z-10',
                            ri % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'
                          )}>
                            <div className="flex items-center gap-1.5">
                              <div className={cn('w-2 h-2 rounded-full flex-shrink-0', col.bg)} />
                              <span className="truncate max-w-[10rem]">{kpi.name}</span>
                            </div>
                          </td>
                          {MONTH_NAMES.map((_, mi) => {
                            const p = `${year}-${String(mi + 1).padStart(2, '0')}`
                            const v = computeComponents(kpi.components, p)
                            const isSelected = mi === month
                            return (
                              <td
                                key={mi}
                                className={cn(
                                  'px-3 py-2 text-right tabular-nums',
                                  isSelected ? `font-bold ${col.text}` : 'text-slate-600',
                                  isSelected ? col.light : ''
                                )}
                              >
                                {v === 0 ? <span className="text-slate-300">—</span> : fmtK(v)}
                              </td>
                            )
                          })}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}

      {/* ── Dialog: Create / Edit KPI ── */}
      <Dialog open={dialogOpen} onOpenChange={(o) => { if (!isSaving) { setDialogOpen(o); if (!o) { setEditingId(null); setForm(BLANK_FORM) } } }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Editar Indicador' : 'Novo Indicador'}</DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-4 py-2">
            {/* Name */}
            <div className="space-y-1">
              <Label>Nome do indicador</Label>
              <Input
                placeholder="Ex: Margem Operacional"
                value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
              />
            </div>

            {/* Color */}
            <div className="space-y-1">
              <Label>Cor</Label>
              <div className="flex gap-2 flex-wrap">
                {COLOR_OPTIONS.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    onClick={() => setForm((p) => ({ ...p, color: c.value }))}
                    className={cn(
                      'w-7 h-7 rounded-full border-2 transition-all',
                      c.bg,
                      form.color === c.value ? 'border-slate-700 scale-110' : 'border-transparent'
                    )}
                    title={c.label}
                  />
                ))}
              </div>
            </div>

            <Separator />

            {/* Formula components */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Fórmula</Label>
                <span className="text-xs text-slate-400">Soma dos componentes com sinal</span>
              </div>
              <div className="flex flex-col gap-1.5">
                {form.components.map((comp, idx) => (
                  <FormulaRow
                    key={idx}
                    comp={comp}
                    idx={idx}
                    classifications={classifications}
                    manualCategories={manualCategories}
                    onChange={updateComp}
                    onRemove={removeComp}
                  />
                ))}
              </div>
              <Button type="button" variant="outline" size="sm" className="gap-1.5 w-full" onClick={addComp}>
                <Plus size={13} />
                Adicionar componente
              </Button>
            </div>

            <Separator />

            {/* Percentage option */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <input
                  id="show-pct"
                  type="checkbox"
                  checked={form.show_percent}
                  onChange={(e) => setForm((p) => ({ ...p, show_percent: e.target.checked }))}
                  className="rounded"
                />
                <Label htmlFor="show-pct" className="font-normal cursor-pointer">
                  Mostrar percentual sobre uma base
                </Label>
              </div>

              {form.show_percent && (
                <div className="pl-5 space-y-1.5">
                  <Label className="text-xs text-slate-500">Base (denominador do %)</Label>
                  <div className="flex flex-col gap-1.5">
                    {form.percent_base_components.map((comp, idx) => (
                      <FormulaRow
                        key={idx}
                        comp={comp}
                        idx={idx}
                        classifications={classifications}
                        manualCategories={manualCategories}
                        onChange={updateBaseComp}
                        onRemove={removeBaseComp}
                      />
                    ))}
                  </div>
                  <Button type="button" variant="outline" size="sm" className="gap-1.5 w-full" onClick={addBaseComp}>
                    <Plus size={13} />
                    Adicionar base
                  </Button>
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => { setDialogOpen(false); setEditingId(null); setForm(BLANK_FORM) }}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={isSaving} className="gap-1.5">
              {isSaving && <Loader2 size={14} className="animate-spin" />}
              {editingId ? 'Salvar' : 'Criar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
