'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { PageHeader } from '@/components/shared/page-header'
import { EmptyState } from '@/components/shared/empty-state'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { ConsultantSheet } from '@/components/forms/consultant-sheet'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from '@/components/ui/use-toast'
import { formatCurrency } from '@/lib/utils'
import { UserCheck, Pencil, Trash2, Search, Mail, Phone, FileCheck, FileX } from 'lucide-react'
import type { Consultant } from '@/lib/supabase/types'

export default function ConsultoresPage() {
  const supabase = createClient()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [sheetOpen, setSheetOpen] = useState(false)
  const [editing, setEditing] = useState<Consultant | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Consultant | null>(null)

  const { data: consultants = [], isLoading } = useQuery<Consultant[]>({
    queryKey: ['consultants'],
    queryFn: async () => {
      const { data, error } = await supabase.from('consultants').select('*').order('name')
      if (error) throw error
      return data ?? []
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('consultants').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['consultants'] })
      toast({ title: 'Consultor excluído.' })
      setDeleteTarget(null)
    },
    onError: () => toast({ title: 'Erro ao excluir.', variant: 'destructive' }),
  })

  const filtered = consultants.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase())
  )

  function openNew() { setEditing(null); setSheetOpen(true) }
  function openEdit(c: Consultant) { setEditing(c); setSheetOpen(true) }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Consultores"
        description={`${consultants.filter(c => c.active).length} consultores ativos`}
        action={{ label: 'Novo Consultor', onClick: openNew }}
      />

      <div className="relative max-w-sm">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <Input placeholder="Buscar por nome..." value={search}
          onChange={(e) => setSearch(e.target.value)} className="pl-9 h-9" />
      </div>

      {isLoading ? (
        <TableSkeleton />
      ) : filtered.length === 0 ? (
        <EmptyState icon={UserCheck} title={search ? 'Nenhum consultor encontrado' : 'Nenhum consultor cadastrado'}
          action={!search ? { label: 'Novo Consultor', onClick: openNew } : undefined} />
      ) : (
        <div className="bg-white rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-slate-50">
                <th className="text-left px-4 py-3 font-medium text-slate-600">Nome</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600 hidden lg:table-cell">Contato</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600 hidden xl:table-cell">PIX PF</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600 hidden xl:table-cell">PIX PJ</th>
                <th className="text-right px-4 py-3 font-medium text-slate-600 hidden lg:table-cell">A Pagar</th>
                <th className="text-right px-4 py-3 font-medium text-slate-600 hidden lg:table-cell">Pago</th>
                <th className="text-center px-4 py-3 font-medium text-slate-600 hidden md:table-cell">Contrato</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Status</th>
                <th className="px-4 py-3 w-20" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr key={c.id} className="border-b last:border-0 hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3 font-medium text-slate-800">{c.name}</td>
                  <td className="px-4 py-3 hidden lg:table-cell">
                    <div className="space-y-0.5">
                      {c.email && (
                        <a href={`mailto:${c.email}`} className="flex items-center gap-1 text-xs text-teal-600 hover:underline">
                          <Mail size={11} />{c.email}
                        </a>
                      )}
                      {c.phone && (
                        <a href={`tel:${c.phone}`} className="flex items-center gap-1 text-xs text-slate-600 hover:underline">
                          <Phone size={11} />{c.phone}
                        </a>
                      )}
                      {!c.email && !c.phone && <span className="text-slate-400 text-xs">—</span>}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-600 hidden xl:table-cell font-mono text-xs">{c.pix_pf ?? '—'}</td>
                  <td className="px-4 py-3 text-slate-600 hidden xl:table-cell font-mono text-xs">{c.pix_pj ?? '—'}</td>
                  <td className="px-4 py-3 text-right hidden lg:table-cell">
                    <span className={c.amount_due > 0 ? 'text-orange-600 font-medium' : 'text-slate-400'}>
                      {formatCurrency(c.amount_due)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right hidden lg:table-cell text-slate-600">{formatCurrency(c.amount_paid)}</td>
                  <td className="px-4 py-3 text-center hidden md:table-cell">
                    {c.has_contract ? (
                      <span title="Contrato assinado">
                        {c.contract_url ? (
                          <a href={c.contract_url} target="_blank" rel="noopener noreferrer">
                            <FileCheck size={16} className="text-green-600 mx-auto" />
                          </a>
                        ) : (
                          <FileCheck size={16} className="text-green-600 mx-auto" />
                        )}
                      </span>
                    ) : (
                      <span title="Sem contrato assinado">
                        <FileX size={16} className="text-red-400 mx-auto" />
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant="outline"
                      className={c.active ? 'bg-green-50 text-green-700 border-green-200' : 'bg-slate-50 text-slate-500'}>
                      {c.active ? 'Ativo' : 'Inativo'}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 justify-end">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(c)}>
                        <Pencil size={14} />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500 hover:text-red-600 hover:bg-red-50"
                        onClick={() => setDeleteTarget(c)}>
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

      <ConsultantSheet open={sheetOpen} onOpenChange={setSheetOpen} consultant={editing}
        onSuccess={() => { queryClient.invalidateQueries({ queryKey: ['consultants'] }); setSheetOpen(false) }} />

      <ConfirmDialog open={!!deleteTarget} onOpenChange={(v) => !v && setDeleteTarget(null)}
        title="Excluir consultor" confirmLabel="Excluir" loading={deleteMutation.isPending}
        description={`Tem certeza que deseja excluir "${deleteTarget?.name}"?`}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)} />

    </div>
  )
}

function TableSkeleton() {
  return (
    <div className="bg-white rounded-lg border overflow-hidden">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="flex gap-4 px-4 py-3 border-b animate-pulse">
          <div className="h-4 bg-slate-100 rounded w-36" />
          <div className="h-4 bg-slate-100 rounded w-28 hidden md:block" />
        </div>
      ))}
    </div>
  )
}
