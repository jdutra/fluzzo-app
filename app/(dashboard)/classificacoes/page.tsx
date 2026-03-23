'use client'

import { useState, useMemo } from 'react'
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
import { Loader2, Tag, Pencil, Trash2, MoreHorizontal, ChevronRight, Settings2 } from 'lucide-react'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { Classification, Company } from '@/lib/supabase/types'

// ─── Helpers ─────────────────────────────────────────────────

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

// ─── Types ─────────────────────────────────────────────────

type ClassificationForm = {
  name: string
  type: 'entrada' | 'saida' | 'ambos'
  description: string
  active: boolean
  is_totalizador: boolean
  parent_id: string   // '' means root
  sort_order: string  // kept as string for input
}

const emptyForm: ClassificationForm = {
  name: '',
  type: 'ambos',
  description: '',
  active: true,
  is_totalizador: false,
  parent_id: '',
  sort_order: '0',
}

type TreeNode = Classification & { children: TreeNode[] }

// ─── Build tree from flat list ────────────────────────────

function buildTree(items: Classification[]): TreeNode[] {
  const byId = new Map<string, TreeNode>()
  items.forEach((c) => byId.set(c.id, { ...c, children: [] }))

  const roots: TreeNode[] = []
  byId.forEach((node) => {
    if (node.parent_id && byId.has(node.parent_id)) {
      byId.get(node.parent_id)!.children.push(node)
    } else {
      roots.push(node)
    }
  })

  // Sort by sort_order then name
  function sortNodes(nodes: TreeNode[]) {
    nodes.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name))
    nodes.forEach((n) => sortNodes(n.children))
  }
  sortNodes(roots)
  return roots
}

// ─── Page ─────────────────────────────────────────────────

export default function ClassificacoesPage() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  const [sheetOpen, setSheetOpen] = useState(false)
  const [editing, setEditing] = useState<Classification | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Classification | null>(null)
  const [form, setForm] = useState<ClassificationForm>(emptyForm)
  const [typeFilter, setTypeFilter] = useState<'all' | 'entrada' | 'saida' | 'ambos'>('all')
  const [showDefaults, setShowDefaults] = useState(false)

  // ── Queries ──────────────────────────────────────────────

  const { data: company } = useQuery<Pick<Company,
    'id' | 'default_class_recebimento' | 'default_class_fee' | 'default_class_imposto' | 'default_class_consultor'
  > | null>({
    queryKey: ['company'],
    queryFn: async () => {
      const { data } = await supabase
        .from('companies')
        .select('id, default_class_recebimento, default_class_fee, default_class_imposto, default_class_consultor')
        .single()
      return data ?? null
    },
  })

  const { data: classifications = [], isLoading } = useQuery<Classification[]>({
    queryKey: ['classifications'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('classifications')
        .select('*')
        .order('sort_order')
        .order('name')
      if (error) throw error
      return (data ?? []) as Classification[]
    },
  })

  // ── Tree + filter ────────────────────────────────────────

  const filtered = typeFilter === 'all'
    ? classifications
    : classifications.filter((c) => c.type === typeFilter)

  const tree = useMemo(() => buildTree(filtered), [filtered])

  // ── Parent options for the form (only root items, excluding self + descendants) ──

  const rootClassifications = useMemo(
    () => classifications.filter((c) => !c.parent_id),
    [classifications]
  )

  // ── Mutations ────────────────────────────────────────────

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        name: form.name.trim(),
        type: form.type,
        description: form.description.trim() || null,
        active: form.active,
        is_totalizador: form.is_totalizador,
        parent_id: form.parent_id || null,
        sort_order: parseInt(form.sort_order) || 0,
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

  const saveDefaultsMutation = useMutation({
    mutationFn: async (defaults: {
      default_class_recebimento: string | null
      default_class_fee: string | null
      default_class_imposto: string | null
      default_class_consultor: string | null
    }) => {
      if (!company?.id) throw new Error('Empresa não encontrada.')
      const { error } = await supabase.from('companies').update(defaults).eq('id', company.id)
      if (error) throw error
    },
    onSuccess: () => {
      toast({ title: 'Configurações de projeto salvas.' })
      queryClient.invalidateQueries({ queryKey: ['company'] })
    },
    onError: (e: Error) => toast({ title: 'Erro ao salvar.', description: e.message, variant: 'destructive' }),
  })

  // ── Handlers ─────────────────────────────────────────────

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
      is_totalizador: c.is_totalizador ?? false,
      parent_id: c.parent_id ?? '',
      sort_order: String(c.sort_order ?? 0),
    })
    setSheetOpen(true)
  }

  // Defaults state (controlled locally, saved on click)
  const [defaultRec, setDefaultRec] = useState<string>('')
  const [defaultFee, setDefaultFee] = useState<string>('')
  const [defaultImp, setDefaultImp] = useState<string>('')
  const [defaultCon, setDefaultCon] = useState<string>('')

  // Sync defaults from company on first load
  useMemo(() => {
    if (company) {
      setDefaultRec(company.default_class_recebimento ?? '')
      setDefaultFee(company.default_class_fee ?? '')
      setDefaultImp(company.default_class_imposto ?? '')
      setDefaultCon(company.default_class_consultor ?? '')
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [company?.id])

  const activeCount = classifications.filter((c) => c.active).length

  // ── Render ────────────────────────────────────────────────

  return (
    <div className="space-y-5">
      <PageHeader
        title="Classificações"
        description="Categorias de lançamentos e transações financeiras"
        action={{ label: 'Nova Classificação', onClick: openCreate }}
      />

      {/* Filter tabs */}
      <div className="flex flex-wrap items-center gap-2">
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
        <div className="flex-1" />
        <button
          onClick={() => setShowDefaults((v) => !v)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors border ${
            showDefaults
              ? 'bg-teal-700 text-white border-teal-700'
              : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'
          }`}
        >
          <Settings2 size={12} />
          Config. de Projeto
        </button>
      </div>

      {/* ── Project Defaults Panel ─────────────────────── */}
      {showDefaults && (
        <div className="rounded-xl border border-teal-100 bg-teal-50 p-5 space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-teal-800">Classificações padrão de projeto</h3>
            <p className="text-xs text-teal-600 mt-0.5">
              Quando um projeto gera lançamentos automáticos, estas classificações são aplicadas por padrão.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <DefaultClassSelect
              label="Recebimento (receita de projeto)"
              value={defaultRec}
              onChange={setDefaultRec}
              options={classifications}
            />
            <DefaultClassSelect
              label="Fee de parceiro"
              value={defaultFee}
              onChange={setDefaultFee}
              options={classifications}
            />
            <DefaultClassSelect
              label="Imposto sobre NF"
              value={defaultImp}
              onChange={setDefaultImp}
              options={classifications}
            />
            <DefaultClassSelect
              label="Pagamento de consultor"
              value={defaultCon}
              onChange={setDefaultCon}
              options={classifications}
            />
          </div>

          <div className="flex justify-end">
            <Button
              size="sm"
              className="bg-teal-600 hover:bg-teal-700"
              disabled={saveDefaultsMutation.isPending}
              onClick={() =>
                saveDefaultsMutation.mutate({
                  default_class_recebimento: defaultRec || null,
                  default_class_fee: defaultFee || null,
                  default_class_imposto: defaultImp || null,
                  default_class_consultor: defaultCon || null,
                })
              }
            >
              {saveDefaultsMutation.isPending && <Loader2 size={13} className="animate-spin" />}
              Salvar configurações
            </Button>
          </div>
        </div>
      )}

      {/* ── Summary ────────────────────────────────────── */}
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
          <div>
            <span className="text-slate-500">Totalizadores: </span>
            <span className="font-semibold text-violet-700">
              {classifications.filter((c) => c.is_totalizador).length}
            </span>
          </div>
        </div>
      )}

      {/* ── Tree table ─────────────────────────────────── */}
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
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide hidden sm:table-cell">Tipo</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide hidden lg:table-cell">Descrição</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide hidden md:table-cell">Status</th>
                  <th className="px-4 py-3 w-10" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {tree.map((node) => (
                  <TreeRows
                    key={node.id}
                    node={node}
                    depth={0}
                    onEdit={openEdit}
                    onDelete={setDeleteTarget}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Sheet form ─────────────────────────────────── */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader className="mb-6">
            <SheetTitle>{editing ? 'Editar Classificação' : 'Nova Classificação'}</SheetTitle>
            <SheetDescription>
              Defina uma categoria para organizar lançamentos financeiros.
            </SheetDescription>
          </SheetHeader>

          <div className="space-y-4">

            {/* Nome */}
            <div className="space-y-1.5">
              <Label>Nome *</Label>
              <Input
                placeholder="ex: Receita de Projetos"
                value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
              />
            </div>

            {/* Tipo + Ordem */}
            <div className="grid grid-cols-2 gap-3">
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
              </div>
              <div className="space-y-1.5">
                <Label>Ordem</Label>
                <Input
                  type="number"
                  placeholder="0"
                  value={form.sort_order}
                  onChange={(e) => setForm((p) => ({ ...p, sort_order: e.target.value }))}
                />
              </div>
            </div>

            {/* Nível pai */}
            <div className="space-y-1.5">
              <Label>Grupo pai</Label>
              <Select
                value={form.parent_id || '__root__'}
                onValueChange={(v) => setForm((p) => ({ ...p, parent_id: v === '__root__' ? '' : v }))}
              >
                <SelectTrigger><SelectValue placeholder="Nível raiz (sem pai)" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__root__">— Nível raiz —</SelectItem>
                  {rootClassifications
                    .filter((c) => !editing || c.id !== editing.id)
                    .map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))
                  }
                </SelectContent>
              </Select>
              <p className="text-xs text-slate-500">Deixe em branco para criar um grupo de nível raiz.</p>
            </div>

            {/* Totalizador */}
            <div className="flex items-center justify-between rounded-lg border border-slate-200 px-4 py-3">
              <div>
                <p className="text-sm font-medium text-slate-700">É totalizador?</p>
                <p className="text-xs text-slate-500 mt-0.5">
                  Totalizadores agrupam sub-itens e somam seus valores no relatório.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setForm((p) => ({ ...p, is_totalizador: !p.is_totalizador }))}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                  form.is_totalizador ? 'bg-teal-600' : 'bg-slate-200'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                    form.is_totalizador ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>

            {/* Descrição */}
            <div className="space-y-1.5">
              <Label>Descrição</Label>
              <Input
                placeholder="Descrição opcional"
                value={form.description}
                onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
              />
            </div>

            {/* Status */}
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
              className="bg-teal-600 hover:bg-teal-700"
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
        description={`Remover "${deleteTarget?.name}"? Sub-itens perderão o vínculo com este grupo.`}
        confirmLabel="Remover"
        loading={deleteMutation.isPending}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
      />
    </div>
  )
}

// ─── Tree rows (recursive) ────────────────────────────────

function TreeRows({
  node,
  depth,
  onEdit,
  onDelete,
}: {
  node: TreeNode
  depth: number
  onEdit: (c: Classification) => void
  onDelete: (c: Classification) => void
}) {
  const indent = depth * 20

  return (
    <>
      <tr className={`hover:bg-slate-50 transition-colors ${node.is_totalizador ? 'bg-violet-50/40' : ''}`}>
        <td className="px-4 py-2.5">
          <div className="flex items-center gap-1.5" style={{ paddingLeft: indent }}>
            {depth > 0 && (
              <ChevronRight size={12} className="text-slate-300 flex-shrink-0" />
            )}
            <span className={`font-medium ${node.is_totalizador ? 'text-violet-800' : 'text-slate-800'} ${depth > 0 ? 'text-sm' : ''}`}>
              {node.name}
            </span>
            {node.is_totalizador && (
              <Badge className="bg-violet-100 text-violet-700 border-violet-200 text-[10px] px-1.5 py-0 h-4">
                Σ Total
              </Badge>
            )}
          </div>
        </td>
        <td className="px-4 py-2.5 hidden sm:table-cell">
          <Badge className={`text-xs ${TYPE_COLORS[node.type] ?? ''}`}>
            {TYPE_LABELS[node.type] ?? node.type}
          </Badge>
        </td>
        <td className="px-4 py-2.5 text-slate-500 text-xs hidden lg:table-cell">
          {node.description ?? <span className="text-slate-300">—</span>}
        </td>
        <td className="px-4 py-2.5 hidden md:table-cell">
          <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${
            node.active ? 'text-emerald-600' : 'text-slate-400'
          }`}>
            <span className={`w-1.5 h-1.5 rounded-full ${node.active ? 'bg-emerald-500' : 'bg-slate-300'}`} />
            {node.active ? 'Ativa' : 'Inativa'}
          </span>
        </td>
        <td className="px-4 py-2.5">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreHorizontal size={15} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onEdit(node)} className="gap-2">
                <Pencil size={14} /> Editar
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => onDelete(node)}
                className="gap-2 text-red-500 focus:text-red-600"
              >
                <Trash2 size={14} /> Remover
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </td>
      </tr>

      {node.children.map((child) => (
        <TreeRows
          key={child.id}
          node={child}
          depth={depth + 1}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      ))}
    </>
  )
}

// ─── Default class selector ──────────────────────────────

function DefaultClassSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  options: Classification[]
}) {
  const active = options.filter((c) => c.active)
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-teal-700">{label}</Label>
      <Select value={value || '__none__'} onValueChange={(v) => onChange(v === '__none__' ? '' : v)}>
        <SelectTrigger className="bg-white text-sm h-9">
          <SelectValue placeholder="— Não definida —" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__none__">— Não definida —</SelectItem>
          {active.map((c) => (
            <SelectItem key={c.id} value={c.name}>
              {c.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
