'use client'

import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { PageHeader } from '@/components/shared/page-header'
import { EmptyState } from '@/components/shared/empty-state'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { ProductSheet } from '@/components/forms/product-sheet'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Toaster } from '@/components/ui/toaster'
import { toast } from '@/components/ui/use-toast'
import { Package, Pencil, Trash2 } from 'lucide-react'
import type { Product } from '@/lib/supabase/types'

// Pool de cores que cicla conforme novos tipos são criados
const COLOR_POOL = [
  'bg-sky-50 text-sky-700 border-sky-200',
  'bg-violet-50 text-violet-700 border-violet-200',
  'bg-emerald-50 text-emerald-700 border-emerald-200',
  'bg-amber-50 text-amber-700 border-amber-200',
  'bg-rose-50 text-rose-700 border-rose-200',
  'bg-indigo-50 text-indigo-700 border-indigo-200',
  'bg-teal-50 text-teal-700 border-teal-200',
  'bg-slate-50 text-slate-600 border-slate-200',
]

export default function ProdutosPage() {
  const supabase = createClient()
  const queryClient = useQueryClient()
  const [sheetOpen, setSheetOpen] = useState(false)
  const [editing, setEditing] = useState<Product | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null)
  const [activeFilter, setActiveFilter] = useState<string | null>(null)

  const { data: products = [], isLoading } = useQuery<Product[]>({
    queryKey: ['products'],
    queryFn: async () => {
      const { data, error } = await supabase.from('products').select('*').order('type').order('name')
      if (error) throw error
      return data ?? []
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('products').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] })
      toast({ title: 'Produto excluído.' })
      setDeleteTarget(null)
    },
    onError: () => toast({ title: 'Erro ao excluir.', variant: 'destructive' }),
  })

  // Lista de tipos únicos extraídos dos produtos cadastrados
  const uniqueTypes = useMemo(() => {
    const types = new Set<string>()
    products.forEach((p) => { if (p.type) types.add(p.type) })
    return Array.from(types).sort()
  }, [products])

  // Mapeamento tipo → cor (estável por ordem de aparição)
  const typeColorMap = useMemo(() => {
    const map: Record<string, string> = {}
    uniqueTypes.forEach((t, i) => { map[t] = COLOR_POOL[i % COLOR_POOL.length] })
    return map
  }, [uniqueTypes])

  // Filtrar por tipo selecionado
  const filtered = activeFilter
    ? products.filter((p) => p.type === activeFilter)
    : products

  // Agrupar por tipo para exibição em seções
  const grouped = useMemo(() => {
    const groups: Record<string, Product[]> = {}
    filtered.forEach((p) => {
      const key = p.type ?? 'Sem tipo'
      if (!groups[key]) groups[key] = []
      groups[key].push(p)
    })
    return groups
  }, [filtered])

  function openNew() { setEditing(null); setSheetOpen(true) }
  function openEdit(p: Product) { setEditing(p); setSheetOpen(true) }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Produtos / Serviços"
        description={`${products.filter(p => p.active).length} produtos ativos`}
        action={{ label: 'Novo Produto', onClick: openNew }}
      />

      {/* Filtros por tipo */}
      {uniqueTypes.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setActiveFilter(null)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors border ${
              activeFilter === null
                ? 'bg-sky-600 text-white border-sky-600'
                : 'bg-white text-slate-600 border-slate-200 hover:border-sky-300 hover:text-sky-700'
            }`}
          >
            Todos ({products.length})
          </button>
          {uniqueTypes.map((type) => {
            const count = products.filter((p) => p.type === type).length
            return (
              <button
                key={type}
                onClick={() => setActiveFilter(activeFilter === type ? null : type)}
                className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors border ${
                  activeFilter === type
                    ? 'bg-sky-600 text-white border-sky-600'
                    : 'bg-white text-slate-600 border-slate-200 hover:border-sky-300 hover:text-sky-700'
                }`}
              >
                {type} ({count})
              </button>
            )
          })}
        </div>
      )}

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 animate-pulse">
          {[1, 2, 3].map(i => <div key={i} className="h-28 bg-slate-100 rounded-lg" />)}
        </div>
      ) : products.length === 0 ? (
        <EmptyState icon={Package} title="Nenhum produto cadastrado"
          action={{ label: 'Novo Produto', onClick: openNew }} />
      ) : filtered.length === 0 ? (
        <EmptyState icon={Package} title="Nenhum produto neste tipo" />
      ) : (
        <div className="space-y-8">
          {Object.entries(grouped).map(([type, items]) => (
            <section key={type}>
              {/* Cabeçalho do grupo */}
              <div className="flex items-center gap-3 mb-3">
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${typeColorMap[type] ?? COLOR_POOL[COLOR_POOL.length - 1]}`}>
                  {type}
                </span>
                <span className="text-xs text-slate-400">{items.length} produto{items.length !== 1 ? 's' : ''}</span>
                <div className="flex-1 h-px bg-slate-100" />
              </div>

              {/* Cards do grupo */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {items.map((p) => (
                  <div key={p.id} className="bg-white rounded-lg border p-4 hover:shadow-sm transition-shadow">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-mono text-xs font-bold text-slate-500">{p.sigla}</span>
                          {p.type && (
                            <Badge variant="outline" className={`text-xs ${typeColorMap[p.type] ?? ''}`}>
                              {p.type}
                            </Badge>
                          )}
                        </div>
                        <p className="font-medium text-slate-800 truncate">{p.name}</p>
                        <Badge variant="outline" className={`mt-2 text-xs ${p.active ? 'bg-green-50 text-green-700 border-green-200' : 'bg-slate-50 text-slate-500'}`}>
                          {p.active ? 'Ativo' : 'Inativo'}
                        </Badge>
                      </div>
                      <div className="flex gap-1 flex-shrink-0">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(p)}>
                          <Pencil size={14} />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500 hover:text-red-600 hover:bg-red-50"
                          onClick={() => setDeleteTarget(p)}>
                          <Trash2 size={14} />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      <ProductSheet open={sheetOpen} onOpenChange={setSheetOpen} product={editing}
        onSuccess={() => { queryClient.invalidateQueries({ queryKey: ['products'] }); setSheetOpen(false) }} />

      <ConfirmDialog open={!!deleteTarget} onOpenChange={(v) => !v && setDeleteTarget(null)}
        title="Excluir produto" confirmLabel="Excluir" loading={deleteMutation.isPending}
        description={`Tem certeza que deseja excluir "${deleteTarget?.name}"?`}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)} />

      <Toaster />
    </div>
  )
}
