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
import { Separator } from '@/components/ui/separator'
import { toast } from '@/components/ui/use-toast'
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter,
} from '@/components/ui/sheet'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { ChevronLeft, ChevronRight, TrendingUp, TrendingDown, Plus, Trash2, Loader2 } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
  ResponsiveContainer, BarChart, Bar, Legend,
} from 'recharts'
import type { CashForecastManual } from '@/lib/supabase/types'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'

const MONTH_NAMES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun',
  'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

const MONTH_NAMES_FULL = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']

const manualSchema = z.object({
  period: z.string().min(1, 'Período obrigatório'),
  category: z.string().min(1, 'Categoria obrigatória'),
  description: z.string().optional(),
  amount: z.coerce.number().min(0.01, 'Valor deve ser > 0'),
  type: z.enum(['entrada', 'saida'] as const),
})

type ManualFormData = z.infer<typeof manualSchema>

export default function FluxoPage() {
  const supabase = createClient()
  const queryClient = useQueryClient()
  const now = new Date()

  const [year, setYear] = useState(now.getFullYear())
  const [manualSheetOpen, setManualSheetOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<CashForecastManual | null>(null)

  const { register, handleSubmit, reset, setValue, watch, formState: { errors } } = useForm<ManualFormData>({
    resolver: zodResolver(manualSchema),
    defaultValues: { type: 'saida', period: `${year}-${String(now.getMonth() + 1).padStart(2, '0')}` },
  })

  const { data: company } = useQuery({
    queryKey: ['company'],
    queryFn: async () => {
      const { data } = await supabase.from('companies').select('id').single()
      return data
    },
  })

  // Entries agrupadas por mês (receitas)
  const { data: entryData = [] } = useQuery({
    queryKey: ['entries-year', year],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('entries')
        .select('forecast_payment, amount, status')
        .gte('forecast_payment', `${year}-01-01`)
        .lte('forecast_payment', `${year}-12-31`)
        .neq('status', 'cancelado')
      if (error) throw error
      return data ?? []
    },
  })

  // Lançamentos manuais (saídas / outros)
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

  // Build monthly data for chart
  const monthlyData = useMemo(() => {
    return Array.from({ length: 12 }, (_, i) => {
      const m = i + 1
      const periodStr = `${year}-${String(m).padStart(2, '0')}`

      // Entries (receitas) neste mês
      const monthEntries = entryData.filter((e) => {
        const p = e.forecast_payment?.slice(0, 7)
        return p === periodStr
      })
      const receita = monthEntries.reduce((sum, e) => sum + (e.amount ?? 0), 0)
      const recebido = monthEntries.filter(e => e.status === 'pago').reduce((sum, e) => sum + (e.amount ?? 0), 0)

      // Manual entries neste mês
      const monthManual = manualData.filter((m2) => m2.period === periodStr)
      const saida = monthManual.filter(m2 => m2.type === 'saida').reduce((sum, m2) => sum + m2.amount, 0)
      const entradas_manual = monthManual.filter(m2 => m2.type === 'entrada').reduce((sum, m2) => sum + m2.amount, 0)

      const total_in = receita + entradas_manual
      const total_out = saida
      const saldo = total_in - total_out

      return {
        month: MONTH_NAMES[i],
        period: periodStr,
        receita,
        recebido,
        saida,
        entradas_manual,
        total_in,
        total_out,
        saldo,
      }
    })
  }, [entryData, manualData, year])

  const totalReceita = monthlyData.reduce((s, m) => s + m.receita, 0)
  const totalRecebido = monthlyData.reduce((s, m) => s + m.recebido, 0)
  const totalSaida = monthlyData.reduce((s, m) => s + m.saida, 0)

  const manualMutation = useMutation({
    mutationFn: async (data: ManualFormData) => {
      const { error } = await supabase.from('cash_forecast_manual').insert({
        company_id: company?.id ?? null,
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
        <PageHeader title="Fluxo de Caixa" description="Projeção mensal de receitas e saídas" />
        <Button size="sm" onClick={openManualSheet} className="bg-teal-600 hover:bg-teal-700 gap-2">
          <Plus size={14} /> Lançamento manual
        </Button>
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
              <p className="text-sm text-slate-500">Receita prevista</p>
            </div>
            <p className="text-2xl font-bold text-slate-800">{formatCurrency(totalReceita)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp size={16} className="text-teal-500" />
              <p className="text-sm text-slate-500">Efetivamente pago</p>
            </div>
            <p className="text-2xl font-bold text-slate-800">{formatCurrency(totalRecebido)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-2 mb-1">
              <TrendingDown size={16} className="text-red-500" />
              <p className="text-sm text-slate-500">Saídas manuais</p>
            </div>
            <p className="text-2xl font-bold text-slate-800">{formatCurrency(totalSaida)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Chart */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Fluxo mensal — {year}</CardTitle>
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
                  name === 'receita' ? 'Receita prevista' : name === 'recebido' ? 'Recebido' : 'Saídas',
                ]}
                contentStyle={{ fontSize: 12, borderRadius: 8 }}
              />
              <Legend formatter={(val) =>
                val === 'receita' ? 'Receita prevista' : val === 'recebido' ? 'Recebido' : 'Saídas'
              } />
              <Bar dataKey="receita" fill="#bae6fd" radius={[3, 3, 0, 0]} />
              <Bar dataKey="recebido" fill="#0284c7" radius={[3, 3, 0, 0]} />
              <Bar dataKey="saida" fill="#fca5a5" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Monthly table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Resumo por mês</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase">Mês</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-slate-500 uppercase">Receita prev.</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-slate-500 uppercase">Recebido</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-slate-500 uppercase">Saídas</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-slate-500 uppercase">Saldo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {monthlyData.map((row) => (
                  <tr key={row.period} className="hover:bg-slate-50">
                    <td className="px-4 py-2.5 font-medium text-slate-700">
                      {MONTH_NAMES_FULL[monthlyData.indexOf(row)]} {year}
                    </td>
                    <td className="px-4 py-2.5 text-right text-slate-600">{formatCurrency(row.receita)}</td>
                    <td className="px-4 py-2.5 text-right text-teal-700">{formatCurrency(row.recebido)}</td>
                    <td className="px-4 py-2.5 text-right text-red-500">{formatCurrency(row.saida)}</td>
                    <td className={`px-4 py-2.5 text-right font-medium ${row.saldo >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {formatCurrency(row.saldo)}
                    </td>
                  </tr>
                ))}
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
