'use client'

import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { PageHeader } from '@/components/shared/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { toast } from '@/components/ui/use-toast'
import { Toaster } from '@/components/ui/toaster'
import { ChevronLeft, ChevronRight, Target, Check, X, Pencil, Plus, Loader2 } from 'lucide-react'
import { formatCurrency, formatCurrencyCompact } from '@/lib/utils'
import type { Goal, Product } from '@/lib/supabase/types'

type GoalWithProduct = Goal & {
  product: Pick<Product, 'id' | 'name' | 'sigla' | 'type'> | null
}

const PRODUCT_TYPE_COLOR: Record<string, string> = {
  PS: 'bg-blue-100 text-blue-700',
  AS: 'bg-purple-100 text-purple-700',
  Ou: 'bg-slate-100 text-slate-600',
}

export default function MetasPage() {
  const supabase = createClient()
  const queryClient = useQueryClient()
  const now = new Date()

  const [year, setYear] = useState(now.getFullYear())
  const [editingGoalId, setEditingGoalId] = useState<string | null>(null)
  const [editData, setEditData] = useState({ qty_budget: '', ticket_budget: '' })
  const [addingProduct, setAddingProduct] = useState(false)
  const [newGoalProductId, setNewGoalProductId] = useState<string>('')

  const { data: company } = useQuery({
    queryKey: ['company'],
    queryFn: async () => {
      const { data } = await supabase.from('companies').select('id').single()
      return data
    },
  })

  const { data: goals = [], isLoading: goalsLoading } = useQuery<GoalWithProduct[]>({
    queryKey: ['goals', year],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('goals')
        .select('*, product:products(id, name, sigla, type)')
        .eq('year', year)
        .order('product_id')
      if (error) throw error
      return (data ?? []) as GoalWithProduct[]
    },
  })

  const { data: allProducts = [] } = useQuery<Product[]>({
    queryKey: ['products-active'],
    queryFn: async () => {
      const { data } = await supabase
        .from('products')
        .select('*')
        .eq('active', true)
        .order('name')
      return data ?? []
    },
  })

  // Products without goals for this year
  const productsWithoutGoal = allProducts.filter(
    (p) => !goals.some((g) => g.product_id === p.id)
  )

  const updateMutation = useMutation({
    mutationFn: async ({ goalId, qty_budget, ticket_budget }: {
      goalId: string
      qty_budget: number
      ticket_budget: number
    }) => {
      const { error } = await supabase
        .from('goals')
        .update({ qty_budget, ticket_budget })
        .eq('id', goalId)
      if (error) throw error
    },
    onSuccess: () => {
      toast({ title: 'Meta atualizada.' })
      queryClient.invalidateQueries({ queryKey: ['goals', year] })
      setEditingGoalId(null)
    },
    onError: (e: Error) => toast({ title: 'Erro.', description: e.message, variant: 'destructive' }),
  })

  const createMutation = useMutation({
    mutationFn: async ({ product_id, qty_budget, ticket_budget }: {
      product_id: string
      qty_budget: number
      ticket_budget: number
    }) => {
      const { error } = await supabase.from('goals').insert({
        company_id: company?.id ?? null,
        product_id,
        year,
        qty_budget,
        ticket_budget,
        qty_sold: 0,
        ticket_sold: 0,
      })
      if (error) throw error
    },
    onSuccess: () => {
      toast({ title: 'Meta criada.' })
      queryClient.invalidateQueries({ queryKey: ['goals', year] })
      setAddingProduct(false)
      setNewGoalProductId('')
    },
    onError: (e: Error) => toast({ title: 'Erro.', description: e.message, variant: 'destructive' }),
  })

  function startEdit(goal: Goal) {
    setEditingGoalId(goal.id)
    setEditData({ qty_budget: String(goal.qty_budget), ticket_budget: String(goal.ticket_budget) })
  }

  function confirmEdit(goalId: string) {
    const qty = parseInt(editData.qty_budget)
    const ticket = parseFloat(editData.ticket_budget)
    if (isNaN(qty) || isNaN(ticket)) return
    updateMutation.mutate({ goalId, qty_budget: qty, ticket_budget: ticket })
  }

  // Totals
  const totals = goals.reduce(
    (acc, g) => {
      acc.budget_total += g.total_budget ?? 0
      acc.sold_total += g.total_sold ?? 0
      acc.qty_budget += g.qty_budget
      acc.qty_sold += g.qty_sold
      return acc
    },
    { budget_total: 0, sold_total: 0, qty_budget: 0, qty_sold: 0 }
  )

  const achievementPct = totals.budget_total > 0
    ? Math.round((totals.sold_total / totals.budget_total) * 100)
    : 0

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <PageHeader title="Metas" description="Orçamento vs realizado por produto e ano" />
        {productsWithoutGoal.length > 0 && (
          <Button size="sm" onClick={() => setAddingProduct(true)} className="bg-sky-600 hover:bg-sky-700 gap-2">
            <Plus size={14} /> Adicionar produto
          </Button>
        )}
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

      {/* Summary KPIs */}
      {goals.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-5">
              <p className="text-xs text-slate-500 mb-1">Receita orçada</p>
              <p className="text-xl font-bold text-slate-800">{formatCurrencyCompact(totals.budget_total)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5">
              <p className="text-xs text-slate-500 mb-1">Receita realizada</p>
              <p className="text-xl font-bold text-green-700">{formatCurrencyCompact(totals.sold_total)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5">
              <p className="text-xs text-slate-500 mb-1">Qtd orçada</p>
              <p className="text-xl font-bold text-slate-800">{totals.qty_budget}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5">
              <p className="text-xs text-slate-500 mb-1">Atingimento</p>
              <p className={`text-xl font-bold ${achievementPct >= 100 ? 'text-green-600' : achievementPct >= 70 ? 'text-yellow-600' : 'text-red-500'}`}>
                {achievementPct}%
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Add new goal row */}
      {addingProduct && productsWithoutGoal.length > 0 && (
        <AddGoalRow
          products={productsWithoutGoal}
          year={year}
          onSave={(productId, qty, ticket) => createMutation.mutate({ product_id: productId, qty_budget: qty, ticket_budget: ticket })}
          onCancel={() => setAddingProduct(false)}
          saving={createMutation.isPending}
        />
      )}

      {/* Goals table */}
      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        {goalsLoading ? (
          <div className="p-8 space-y-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-16 rounded-md bg-slate-100 animate-pulse" />
            ))}
          </div>
        ) : goals.length === 0 ? (
          <div className="p-12 text-center text-slate-400">
            <Target size={32} className="mx-auto mb-3 opacity-30" />
            <p className="font-medium text-slate-600">Nenhuma meta definida para {year}</p>
            <p className="text-sm mt-1">Adicione metas por produto para monitorar o desempenho.</p>
            {productsWithoutGoal.length > 0 && (
              <Button
                size="sm"
                onClick={() => setAddingProduct(true)}
                className="mt-4 bg-sky-600 hover:bg-sky-700 gap-2"
              >
                <Plus size={14} /> Adicionar meta
              </Button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Produto</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Qtd orçada</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Ticket orçado</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Total orçado</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Realizado</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide w-36">Atingimento</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {goals.map((goal) => {
                  const isEditing = editingGoalId === goal.id
                  const pct = goal.total_budget > 0
                    ? Math.min(Math.round((goal.total_sold / goal.total_budget) * 100), 100)
                    : 0
                  const barColor = pct >= 100 ? 'bg-green-500' : pct >= 70 ? 'bg-yellow-400' : 'bg-red-400'

                  return (
                    <tr key={goal.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {goal.product && (
                            <Badge className={`text-xs ${PRODUCT_TYPE_COLOR[goal.product.type ?? 'Ou']}`}>
                              {goal.product.sigla}
                            </Badge>
                          )}
                          <span className="font-medium text-slate-800">
                            {goal.product?.name ?? '—'}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right text-slate-700">
                        {isEditing ? (
                          <Input
                            type="number"
                            min="0"
                            value={editData.qty_budget}
                            onChange={(e) => setEditData(d => ({ ...d, qty_budget: e.target.value }))}
                            className="h-7 w-20 text-xs text-right ml-auto"
                          />
                        ) : goal.qty_budget}
                      </td>
                      <td className="px-4 py-3 text-right text-slate-700">
                        {isEditing ? (
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            value={editData.ticket_budget}
                            onChange={(e) => setEditData(d => ({ ...d, ticket_budget: e.target.value }))}
                            className="h-7 w-28 text-xs text-right ml-auto"
                          />
                        ) : formatCurrency(goal.ticket_budget)}
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-slate-800">
                        {formatCurrency(goal.total_budget)}
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-green-700">
                        {formatCurrency(goal.total_sold)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 bg-slate-100 rounded-full h-2">
                            <div
                              className={`h-2 rounded-full transition-all ${barColor}`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className={`text-xs font-medium w-8 text-right ${pct >= 100 ? 'text-green-600' : pct >= 70 ? 'text-yellow-600' : 'text-red-500'}`}>
                            {pct}%
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {isEditing ? (
                          <div className="flex items-center gap-1">
                            <Button
                              size="icon"
                              className="h-7 w-7 bg-green-600 hover:bg-green-700"
                              onClick={() => confirmEdit(goal.id)}
                              disabled={updateMutation.isPending}
                            >
                              {updateMutation.isPending ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
                            </Button>
                            <Button
                              size="icon"
                              variant="outline"
                              className="h-7 w-7"
                              onClick={() => setEditingGoalId(null)}
                            >
                              <X size={11} />
                            </Button>
                          </div>
                        ) : (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-slate-400 hover:text-slate-700"
                            onClick={() => startEdit(goal)}
                          >
                            <Pencil size={13} />
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

// ─── AddGoalRow component ─────────────────────────────────────

function AddGoalRow({
  products,
  year,
  onSave,
  onCancel,
  saving,
}: {
  products: Product[]
  year: number
  onSave: (productId: string, qty: number, ticket: number) => void
  onCancel: () => void
  saving: boolean
}) {
  const [productId, setProductId] = useState(products[0]?.id ?? '')
  const [qty, setQty] = useState('1')
  const [ticket, setTicket] = useState('0')

  function handleSave() {
    const q = parseInt(qty)
    const t = parseFloat(ticket)
    if (!productId || isNaN(q) || isNaN(t)) return
    onSave(productId, q, t)
  }

  return (
    <div className="rounded-xl border border-sky-200 bg-sky-50 p-4">
      <p className="text-sm font-medium text-sky-700 mb-3">Nova meta — {year}</p>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 items-end">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-slate-600">Produto</label>
          <select
            value={productId}
            onChange={(e) => setProductId(e.target.value)}
            className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
          >
            {products.map((p) => (
              <option key={p.id} value={p.id}>{p.sigla} — {p.name}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-slate-600">Qtd orçada</label>
          <Input type="number" min="0" value={qty} onChange={(e) => setQty(e.target.value)} className="h-9" />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-slate-600">Ticket médio (R$)</label>
          <Input type="number" step="0.01" min="0" value={ticket} onChange={(e) => setTicket(e.target.value)} className="h-9" />
        </div>
        <div className="flex gap-2">
          <Button onClick={handleSave} disabled={saving} className="bg-sky-600 hover:bg-sky-700 gap-2 flex-1">
            {saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
            Salvar
          </Button>
          <Button variant="outline" onClick={onCancel}>
            <X size={13} />
          </Button>
        </div>
      </div>
    </div>
  )
}
