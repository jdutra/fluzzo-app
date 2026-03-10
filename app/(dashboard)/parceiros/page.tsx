'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { PageHeader } from '@/components/shared/page-header'
import { EmptyState } from '@/components/shared/empty-state'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { PartnerSheet } from '@/components/forms/partner-sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from '@/components/ui/use-toast'
import { formatCurrency, formatPercent } from '@/lib/utils'
import { Handshake, Pencil, Trash2, Search, Mail, Phone } from 'lucide-react'
import type { Partner } from '@/lib/supabase/types'

export default function ParceirosPage() {
  const supabase = createClient()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [sheetOpen, setSheetOpen] = useState(false)
  const [editing, setEditing] = useState<Partner | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Partner | null>(null)

  const { data: partners = [], isLoading } = useQuery<Partner[]>({
    queryKey: ['partners'],
    queryFn: async () => {
      const { data, error } = await supabase.from('partners').select('*').order('name')
      if (error) throw error
      return data ?? []
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('partners').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['partners'] })
      toast({ title: 'Parceiro excluído.' })
      setDeleteTarget(null)
    },
    onError: () => toast({ title: 'Erro ao excluir.', variant: 'destructive' }),
  })

  const filtered = partners.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    (p.partner_company ?? '').toLowerCase().includes(search.toLowerCase())
  )

  function openNew() { setEditing(null); setSheetOpen(true) }
  function openEdit(p: Partner) { setEditing(p); setSheetOpen(true) }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Parceiros Comerciais"
        description={`${partners.length} parceiros cadastrados`}
        action={{ label: 'Novo Parceiro', onClick: openNew }}
      />

      <div className="relative max-w-sm">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <Input placeholder="Buscar por nome ou empresa..." value={search}
          onChange={(e) => setSearch(e.target.value)} className="pl-9 h-9" />
      </div>

      {isLoading ? (
        <TableSkeleton />
      ) : filtered.length === 0 ? (
        <EmptyState icon={Handshake} title={search ? 'Nenhum parceiro encontrado' : 'Nenhum parceiro cadastrado'}
          action={!search ? { label: 'Novo Parceiro', onClick: openNew } : undefined} />
      ) : (
        <div className="bg-white rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-slate-50">
                <th className="text-left px-4 py-3 font-medium text-slate-600">Nome</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600 hidden md:table-cell">Empresa</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600 hidden lg:table-cell">Área</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600 hidden xl:table-cell">Contato</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600 hidden md:table-cell">Status</th>
                <th className="text-right px-4 py-3 font-medium text-slate-600 hidden lg:table-cell">Indicações</th>
                <th className="text-right px-4 py-3 font-medium text-slate-600 hidden md:table-cell">Fee médio</th>
                <th className="text-right px-4 py-3 font-medium text-slate-600 hidden lg:table-cell">A pagar</th>
                <th className="px-4 py-3 w-20" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p.id} className="border-b last:border-0 hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-800">{p.name}</p>
                  </td>
                  <td className="px-4 py-3 text-slate-600 hidden md:table-cell">{p.partner_company ?? '—'}</td>
                  <td className="px-4 py-3 text-slate-600 hidden lg:table-cell">{p.area ?? '—'}</td>
                  <td className="px-4 py-3 hidden xl:table-cell">
                    <div className="space-y-0.5">
                      {p.email && (
                        <a href={`mailto:${p.email}`} className="flex items-center gap-1 text-teal-600 hover:underline text-xs">
                          <Mail size={11} />{p.email}
                        </a>
                      )}
                      {p.phone && (
                        <a href={`tel:${p.phone}`} className="flex items-center gap-1 text-slate-600 hover:underline text-xs">
                          <Phone size={11} />{p.phone}
                        </a>
                      )}
                      {!p.email && !p.phone && <span className="text-slate-400 text-xs">—</span>}
                    </div>
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                      (p.status ?? 'ativo') === 'ativo'
                        ? 'bg-emerald-100 text-emerald-700'
                        : 'bg-slate-100 text-slate-500'
                    }`}>
                      {(p.status ?? 'ativo') === 'ativo' ? 'Ativo' : 'Inativo'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right hidden lg:table-cell text-slate-700">{p.total_referrals}</td>
                  <td className="px-4 py-3 text-right hidden md:table-cell text-slate-600">
                    {p.fee_avg ? formatPercent(p.fee_avg) : '—'}
                  </td>
                  <td className="px-4 py-3 text-right hidden lg:table-cell">
                    <span className={p.fee_due > 0 ? 'text-orange-600 font-medium' : 'text-slate-400'}>
                      {formatCurrency(p.fee_due)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 justify-end">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(p)}>
                        <Pencil size={14} />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500 hover:text-red-600 hover:bg-red-50"
                        onClick={() => setDeleteTarget(p)}>
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

      <PartnerSheet open={sheetOpen} onOpenChange={setSheetOpen} partner={editing}
        onSuccess={() => { queryClient.invalidateQueries({ queryKey: ['partners'] }); setSheetOpen(false) }} />

      <ConfirmDialog open={!!deleteTarget} onOpenChange={(v) => !v && setDeleteTarget(null)}
        title="Excluir parceiro" confirmLabel="Excluir" loading={deleteMutation.isPending}
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
