'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { PageHeader } from '@/components/shared/page-header'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { EmptyState } from '@/components/shared/empty-state'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter,
} from '@/components/ui/sheet'
import { toast } from '@/components/ui/use-toast'
import { Toaster } from '@/components/ui/toaster'
import { Loader2, Tag, Pencil, Trash2, MoreHorizontal } from 'lucide-react'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { Classification } from '@/lib/supabase/types'

const TYPE_LABELS: Record<string, string> = {
  entrada: 'Entrada',
  saida: 'Saída',
  ambos: 'Ambos',
}

const TYPE_COLORS: Record<string, string> = {
  entrada: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  saida: 'bg-red-50 text-red-700 border-red-200',
  ambos: 'bg-slate-50 text-slate-600 border-slate-200',
}

type ClassificationForm = {
  name: string
  type: 'entrada' | 'saida' | 'ambos'
  description: string
  active: boolean
}

const emptyForm: ClassificationForm = { name: '', type: 'ambos', description: '', active: true }

export default function ClassificacoesPage() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  const [sheetOpen, setSheetOpen] = useState(false)
  const [editing, setEditing] = useState<Classification | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Classification | null>(null)
  const [form, setForm] = useState<ClassificationForm>(emptyForm)
  const [typeFilter, setTypeFilter] = useState<'all' | 'entrada' | 'saida' | 'ambos'>('all')

  const { data: company } = useQuery({
    queryKey: ['company'],
    queryFn: async () => {
      const { data } = await supabase.from('companies').select('id').single()
      return data
    },
  })

  const { data: classifications = [], isLoading } = useQuery<Classification[]>({
    queryKey: ['classifications'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('classifications')
        .select('*')
        .order('name')
      if (error) throw error
      return (data ?? []) as Classification[]
    },
  })

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        name: form.name.trim(),
        type: form.type,
        description: form.description.trim() || null,
        active: form.active,
        company_id: company?.id ?? null,
      }
      if (editing) {
        const { error } = await supabase.from('classifications').update(payload).eq('id', editing.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('classifications').insert(payload)
        if (error) throw error
      }
    },
    onSuccess: () => {
      toast({ title: editing ? 'Classificação atualizada.' : 'Classificação cadastrada.' })
      queryClient.invalidateQueries({ queryKey: ['classifications'] })
      setSheetOpen(false)
    },
    onError: (e: Error) => toast({ title: 'Erro ao salvar.', description: e.message, variant: 'destructive' }),
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('classifications').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      toast({ title: 'Classificação removida.' })
      queryClient.invalidateQueries({ queryKey: ['classifications'] })
      setDeleteTarget(null)
    },
    onError: (e: Error) => toast({ title: 'Erro ao remover.', description: e.message, variant: 'destructive' }),
  })

  function openCreate() {
    setEditing(null)
    setForm(emptyForm)
    setSheetOpen(true)
  }

  function openEdit(c: Classification) {
    setEditing(c)
    setForm({
      name: c.name,
      type: c.type as 'entrada' | 'saida' | 'ambos',
      description: c.description ?? '',
      active: c.active,
    })
    setSheetOpen(true)
  }

  const filtered = typeFilter === 'all'
    ? classifications
    : classifications.filter((c) => c.type === typeFilter)

  const activeCount = classifications.filter((c) => c.active).length

  return (
    <div className="space-y-5">
      <PageHeader
        title="Classificações"
        description="Categorias de lançamentos e transações financeiras"
        action={{ label: 'Nova Classificação', onClick: openCreate }}
      />

      {/* Filter tabs */}
      <div className="flex flex-wrap gap-2">
        {[
          { key: 'all', label: `Todas (${classifications.length})` },
          { key: 'entrada', label: `Entrada (${classifications.filter(c => c.type === 'entrada').length})` },
          { key: 'saida', label: `Saída (${classifications.filter(c => c.type === 'saida').length})` },
          { key: 'ambos', label: `Ambos (${classifications.filter(c => c.type === 'ambos').length})` },
        ].map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTypeFilter(key as typeof typeFilter)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors border ${
              typeFilter === key
                ? 'bg-slate-900 text-white border-slate-900'
                : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Summary */}
      {classifications.length > 0 && (
        <div className="flex items-center gap-6 px-4 py-3 rounded-lg bg-slate-50 border border-slate-100 text-sm">
          <div>
            <span className="text-slate-500">Total: </span>
            <span className="font-semibold text-slate-800">{classifications.length}</span>
          </div>
          <div>
            <span className="text-slate-500">Ativas: </span>
            <span className="font-semibold text-emerald-700">{activeCount}</span>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        {isLoading ? (
          <div className="p-8 space-y-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-10 rounded-md bg-slate-100 animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={Tag}
            title="Nenhuma classificação encontrada"
            description="Crie categorias para organizar seus lançamentos financeiros."
            action={typeFilter === 'all' ? { label: 'Nova Classificação', onClick: openCreate } : undefined}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Nome</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Tipo</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Descrição</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Status</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-slate-800">{c.name}</td>
                    <td className="px-4 py-3">
                      <Badge className={TYPE_COLORS[c.type]}>
                        {TYPE_LABELS[c.type]}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-slate-500 text-xs">
                      {c.description ?? <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${
                        c.active ? 'text-emerald-600' : 'text-slate-400'
                      }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${c.active ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                        {c.active ? 'Ativa' : 'Inativa'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal size={15} />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openEdit(c)} className="gap-2">
                            <Pencil size={14} /> Editar
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => setDeleteTarget(c)}
                            className="gap-2 text-red-500 focus:text-red-600"
                          >
                            <Trash2 size={14} /> Remover
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Sheet form */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader className="mb-6">
            <SheetTitle>{editing ? 'Editar Classificação' : 'Nova Classificação'}</SheetTitle>
            <SheetDescription>
              Defina uma categoria para organizar lançamentos financeiros.
            </SheetDescription>
          </SheetHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Nome *</Label>
              <Input
                placeholder="ex: Receita de Projetos"
                value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Tipo</Label>
              <Select
                value={form.type}
                onValueChange={(v) => setForm((p) => ({ ...p, type: v as typeof form.type }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="entrada">Entrada</SelectItem>
                  <SelectItem value="saida">Saída</SelectItem>
                  <SelectItem value="ambos">Ambos</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-slate-500">Define se essa categoria é usada para entradas, saídas ou ambos.</p>
            </div>

            <div className="space-y-1.5">
              <Label>Descrição</Label>
              <Input
                placeholder="Descrição opcional"
                value={form.description}
                onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select
                value={form.active ? 'true' : 'false'}
                onValueChange={(v) => setForm((p) => ({ ...p, active: v === 'true' }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="true">Ativa</SelectItem>
                  <SelectItem value="false">Inativa</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <SheetFooter className="pt-6 gap-2">
            <Button variant="outline" onClick={() => setSheetOpen(false)}>Cancelar</Button>
            <Button
              className="bg-sky-600 hover:bg-sky-700"
              disabled={!form.name.trim() || saveMutation.isPending}
              onClick={() => saveMutation.mutate()}
            >
              {saveMutation.isPending && <Loader2 size={14} className="animate-spin" />}
              {editing ? 'Salvar' : 'Cadastrar'}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(v) => !v && setDeleteTarget(null)}
        title="Remover classificação"
        description={`Remover "${deleteTarget?.name}"? Lançamentos que usam esta classificação não serão afetados.`}
        confirmLabel="Remover"
        loading={deleteMutation.isPending}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
      />

      <Toaster />
    </div>
  )
}
