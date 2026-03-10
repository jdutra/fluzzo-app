'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { PageHeader } from '@/components/shared/page-header'
import { EmptyState } from '@/components/shared/empty-state'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { ClientSheet } from '@/components/forms/client-sheet'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from '@/components/ui/use-toast'
import { formatDate } from '@/lib/utils'
import { Users, Pencil, Trash2, Search } from 'lucide-react'
import type { Client } from '@/lib/supabase/types'

export default function ClientesPage() {
  const supabase = createClient()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [sheetOpen, setSheetOpen] = useState(false)
  const [editing, setEditing] = useState<Client | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Client | null>(null)

  const { data: clients = [], isLoading } = useQuery<Client[]>({
    queryKey: ['clients'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('clients').select('*').order('name')
      if (error) throw error
      return data ?? []
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('clients').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clients'] })
      toast({ title: 'Cliente excluído com sucesso.' })
      setDeleteTarget(null)
    },
    onError: () => toast({ title: 'Erro ao excluir cliente.', variant: 'destructive' }),
  })

  const filtered = clients.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    (c.contact ?? '').toLowerCase().includes(search.toLowerCase())
  )

  function openNew() { setEditing(null); setSheetOpen(true) }
  function openEdit(c: Client) { setEditing(c); setSheetOpen(true) }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Clientes"
        description={`${clients.filter(c => c.active).length} clientes ativos`}
        action={{ label: 'Novo Cliente', onClick: openNew }}
      />

      <div className="relative max-w-sm">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <Input placeholder="Buscar por nome ou contato..." value={search}
          onChange={(e) => setSearch(e.target.value)} className="pl-9 h-9" />
      </div>

      {isLoading ? (
        <TableSkeleton />
      ) : filtered.length === 0 ? (
        <EmptyState icon={Users} title={search ? 'Nenhum cliente encontrado' : 'Nenhum cliente cadastrado'}
          description={search ? 'Tente outro termo.' : 'Clique em "Novo Cliente" para começar.'}
          action={!search ? { label: 'Novo Cliente', onClick: openNew } : undefined} />
      ) : (
        <div className="bg-white rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-slate-50">
                <th className="text-left px-4 py-3 font-medium text-slate-600">Nome</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600 hidden md:table-cell">Contato</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600 hidden lg:table-cell">Segmento</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600 hidden lg:table-cell">UF</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600 hidden md:table-cell">Porte</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600 hidden xl:table-cell">Desde</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Status</th>
                <th className="px-4 py-3 w-20" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((client) => (
                <tr key={client.id} className="border-b last:border-0 hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3 font-medium text-slate-800">{client.name}</td>
                  <td className="px-4 py-3 text-slate-600 hidden md:table-cell">{client.contact ?? '—'}</td>
                  <td className="px-4 py-3 text-slate-600 hidden lg:table-cell">{client.segment_macro ?? '—'}</td>
                  <td className="px-4 py-3 text-slate-600 hidden lg:table-cell">{client.state ?? '—'}</td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    {client.size ? <SizeBadge size={client.size} /> : <span className="text-slate-400">—</span>}
                  </td>
                  <td className="px-4 py-3 text-slate-600 hidden xl:table-cell">{formatDate(client.start_date)}</td>
                  <td className="px-4 py-3">
                    <Badge variant="outline"
                      className={client.active ? 'bg-green-50 text-green-700 border-green-200' : 'bg-slate-50 text-slate-500'}>
                      {client.active ? 'Ativo' : 'Inativo'}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 justify-end">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(client)}>
                        <Pencil size={14} />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500 hover:text-red-600 hover:bg-red-50"
                        onClick={() => setDeleteTarget(client)}>
                        <Trash2 size={14} />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ClientSheet open={sheetOpen} onOpenChange={setSheetOpen} client={editing}
        onSuccess={() => { queryClient.invalidateQueries({ queryKey: ['clients'] }); setSheetOpen(false) }} />

      <ConfirmDialog open={!!deleteTarget} onOpenChange={(v) => !v && setDeleteTarget(null)}
        title="Excluir cliente" confirmLabel="Excluir" loading={deleteMutation.isPending}
        description={`Tem certeza que deseja excluir "${deleteTarget?.name}"? Esta ação não pode ser desfeita.`}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)} />

    </div>
  )
}

function SizeBadge({ size }: { size: string }) {
  const map: Record<string, string> = {
    'Pequeno': 'bg-blue-50 text-blue-600 border-blue-200',
    'Médio': 'bg-yellow-50 text-yellow-700 border-yellow-200',
    'Grande': 'bg-purple-50 text-purple-700 border-purple-200',
  }
  return <Badge variant="outline" className={map[size] ?? ''}>{size}</Badge>
}

function TableSkeleton() {
  return (
    <div className="bg-white rounded-lg border overflow-hidden">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex gap-4 px-4 py-3 border-b animate-pulse">
          <div className="h-4 bg-slate-100 rounded w-40" />
          <div className="h-4 bg-slate-100 rounded w-32 hidden md:block" />
          <div className="h-4 bg-slate-100 rounded w-24 hidden lg:block" />
        </div>
      ))}
    </div>
  )
}
