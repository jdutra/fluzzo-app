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
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter,
} from '@/components/ui/sheet'
import { toast } from '@/components/ui/use-toast'
import { Loader2, UserCircle2, Pencil, Trash2, MoreHorizontal, Mail, Phone } from 'lucide-react'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

// ─── Types ─────────────────────────────────────────────────────

type Vendedor = {
  id: string
  company_id: string | null
  name: string
  email: string | null
  phone: string | null
  role: string | null
  active: boolean
  notes: string | null
  created_at: string
}

type VendedorForm = {
  name: string
  email: string
  phone: string
  role: string
  active: boolean
  notes: string
}

const emptyForm: VendedorForm = {
  name: '', email: '', phone: '', role: '', active: true, notes: '',
}

// ─── Page ──────────────────────────────────────────────────────

export default function VendedoresPage() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  const [sheetOpen, setSheetOpen] = useState(false)
  const [editing, setEditing] = useState<Vendedor | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Vendedor | null>(null)
  const [form, setForm] = useState<VendedorForm>(emptyForm)

  const { data: company } = useQuery({
    queryKey: ['company'],
    queryFn: async () => {
      const { data } = await supabase.from('companies').select('id').single()
      return data
    },
  })

  const { data: vendedores = [], isLoading } = useQuery<Vendedor[]>({
    queryKey: ['vendedores'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('vendedores')
        .select('*')
        .order('name')
      if (error) throw error
      return (data ?? []) as Vendedor[]
    },
  })

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        name: form.name.trim(),
        email: form.email.trim() || null,
        phone: form.phone.trim() || null,
        role: form.role.trim() || null,
        active: form.active,
        notes: form.notes.trim() || null,
        company_id: company?.id ?? null,
      }
      if (editing) {
        const { error } = await supabase.from('vendedores').update(payload).eq('id', editing.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('vendedores').insert(payload)
        if (error) throw error
      }
    },
    onSuccess: () => {
      toast({ title: editing ? 'Vendedor atualizado.' : 'Vendedor cadastrado.' })
      queryClient.invalidateQueries({ queryKey: ['vendedores'] })
      setSheetOpen(false)
    },
    onError: (e: Error) => toast({ title: 'Erro ao salvar.', description: e.message, variant: 'destructive' }),
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('vendedores').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      toast({ title: 'Vendedor removido.' })
      queryClient.invalidateQueries({ queryKey: ['vendedores'] })
      setDeleteTarget(null)
    },
    onError: (e: Error) => toast({ title: 'Erro ao remover.', description: e.message, variant: 'destructive' }),
  })

  function openCreate() {
    setEditing(null)
    setForm(emptyForm)
    setSheetOpen(true)
  }

  function openEdit(v: Vendedor) {
    setEditing(v)
    setForm({
      name: v.name,
      email: v.email ?? '',
      phone: v.phone ?? '',
      role: v.role ?? '',
      active: v.active,
      notes: v.notes ?? '',
    })
    setSheetOpen(true)
  }

  const activeCount = vendedores.filter(v => v.active).length

  return (
    <div className="space-y-5">
      <PageHeader
        title="Vendedores"
        description="Equipe comercial e responsáveis pelas propostas"
        action={{ label: 'Novo Vendedor', onClick: openCreate }}
      />

      {/* Summary */}
      {vendedores.length > 0 && (
        <div className="flex items-center gap-6 px-4 py-3 rounded-lg bg-slate-50 border border-slate-100 text-sm">
          <div><span className="text-slate-500">Total: </span><span className="font-semibold">{vendedores.length}</span></div>
          <div><span className="text-slate-500">Ativos: </span><span className="font-semibold text-emerald-700">{activeCount}</span></div>
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
        ) : vendedores.length === 0 ? (
          <EmptyState
            icon={UserCircle2}
            title="Nenhum vendedor cadastrado"
            description="Cadastre a equipe comercial para vinculá-la às propostas e leads."
            action={{ label: 'Novo Vendedor', onClick: openCreate }}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Nome</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide hidden sm:table-cell">Função</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide hidden md:table-cell">Contato</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Status</th>
                  <th className="px-4 py-3 w-10" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {vendedores.map((v) => (
                  <tr key={v.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-teal-100 flex items-center justify-center text-teal-700 font-semibold text-sm flex-shrink-0">
                          {v.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-medium text-slate-800">{v.name}</p>
                          {v.notes && <p className="text-xs text-slate-400 truncate max-w-[200px]">{v.notes}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell">
                      {v.role
                        ? <Badge className="bg-slate-100 text-slate-600 border-slate-200 text-xs">{v.role}</Badge>
                        : <span className="text-slate-400">—</span>
                      }
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      <div className="space-y-0.5">
                        {v.email && (
                          <div className="flex items-center gap-1.5 text-xs text-slate-600">
                            <Mail size={11} className="text-slate-400" />
                            {v.email}
                          </div>
                        )}
                        {v.phone && (
                          <div className="flex items-center gap-1.5 text-xs text-slate-600">
                            <Phone size={11} className="text-slate-400" />
                            {v.phone}
                          </div>
                        )}
                        {!v.email && !v.phone && <span className="text-slate-400 text-xs">—</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${v.active ? 'text-emerald-600' : 'text-slate-400'}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${v.active ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                        {v.active ? 'Ativo' : 'Inativo'}
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
                          <DropdownMenuItem onClick={() => openEdit(v)} className="gap-2">
                            <Pencil size={14} /> Editar
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => setDeleteTarget(v)} className="gap-2 text-red-500 focus:text-red-600">
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

      {/* Sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader className="mb-6">
            <SheetTitle>{editing ? 'Editar Vendedor' : 'Novo Vendedor'}</SheetTitle>
            <SheetDescription>Integrante da equipe comercial ou responsável por propostas.</SheetDescription>
          </SheetHeader>
          <div className="space-y-4">

            <div className="space-y-1.5">
              <Label>Nome *</Label>
              <Input placeholder="Nome completo" value={form.name}
                onChange={(e) => setForm(p => ({ ...p, name: e.target.value }))} />
            </div>

            <div className="space-y-1.5">
              <Label>Função / Cargo</Label>
              <Input placeholder="ex: Sócio, Consultor Comercial, SDR" value={form.role}
                onChange={(e) => setForm(p => ({ ...p, role: e.target.value }))} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>E-mail</Label>
                <Input type="email" placeholder="email@empresa.com" value={form.email}
                  onChange={(e) => setForm(p => ({ ...p, email: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Telefone / WhatsApp</Label>
                <Input placeholder="(11) 99999-0000" value={form.phone}
                  onChange={(e) => setForm(p => ({ ...p, phone: e.target.value }))} />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={form.active ? 'true' : 'false'}
                onValueChange={(v) => setForm(p => ({ ...p, active: v === 'true' }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="true">Ativo</SelectItem>
                  <SelectItem value="false">Inativo</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Observações</Label>
              <Textarea placeholder="Informações adicionais..." rows={3} value={form.notes}
                onChange={(e) => setForm(p => ({ ...p, notes: e.target.value }))} />
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
        title="Remover vendedor"
        description={`Remover "${deleteTarget?.name}" da equipe comercial?`}
        confirmLabel="Remover"
        loading={deleteMutation.isPending}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
      />
    </div>
  )
}
