'use client'

import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from '@/components/ui/use-toast'
import { Loader2, Plus, Trash2, Users } from 'lucide-react'
import type { Client, ClientContact } from '@/lib/supabase/types'

const ESTADOS_BR = [
  'AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS',
  'MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC',
  'SP','SE','TO',
]


const schema = z.object({
  name: z.string().min(2, 'Nome obrigatório'),
  cnpj: z.string().optional(),
  type: z.enum(['Cliente', 'Lead']),
  indicator_id: z.string().optional(),
  contact: z.string().optional(),
  start_date: z.string().optional(),
  segment_macro: z.string().optional(),
  segment: z.string().optional(),
  state: z.string().optional(),
  size: z.enum(['Pequeno', 'Médio', 'Grande']).optional(),
  active: z.boolean(),
})

type FormData = z.infer<typeof schema>

type ContactRow = {
  id?: string           // undefined = novo (ainda não salvo)
  name: string
  role: string
  email: string
  phone: string
}

interface ClientSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  client: Client | null
  onSuccess: () => void
}

export function ClientSheet({ open, onOpenChange, client, onSuccess }: ClientSheetProps) {
  const supabase = createClient()
  const queryClient = useQueryClient()
  const isEditing = !!client
  const [contacts, setContacts] = useState<ContactRow[]>([])

  const { data: company } = useQuery({
    queryKey: ['company'],
    queryFn: async () => {
      const { data } = await supabase.from('companies').select('id').single()
      return data
    },
  })

  const { data: partners = [] } = useQuery<{ id: string; name: string }[]>({
    queryKey: ['partners-active'],
    queryFn: async () => {
      const { data } = await supabase.from('partners').select('id, name').order('name')
      return data ?? []
    },
  })

  // Contatos existentes do cliente (em edição)
  // ATENÇÃO: não usar default = [] inline — cria nova referência a cada render e causa loop no useEffect
  const { data: existingContacts, isSuccess: contactsLoaded } = useQuery<ClientContact[]>({
    queryKey: ['client-contacts', client?.id],
    enabled: !!client?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from('client_contacts')
        .select('*')
        .eq('client_id', client!.id)
        .order('created_at')
      return (data ?? []) as ClientContact[]
    },
  })

  const { register, handleSubmit, reset, setValue, watch, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { type: 'Cliente', active: true },
  })

  // Inicializa form e contatos quando o sheet abre
  useEffect(() => {
    if (!open) return
    if (client) {
      reset({
        name: client.name,
        cnpj: client.cnpj ?? '',
        type: (client.type === 'Fluzzo' ? 'Cliente' : (client.type as 'Cliente' | 'Lead')) ?? 'Cliente',
        indicator_id: (client as any).indicator_id ?? '',
        contact: client.contact ?? '',
        start_date: client.start_date ?? '',
        segment_macro: client.segment_macro ?? '',
        segment: client.segment ?? '',
        state: client.state ?? '',
        size: (client.size as 'Pequeno' | 'Médio' | 'Grande') ?? undefined,
        active: client.active,
      })
    } else {
      reset({ type: 'Cliente', active: true })
      // Pré-carrega 1 linha vazia
      setContacts([{ name: '', role: '', email: '', phone: '' }])
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, client?.id])

  // Carrega contatos existentes quando a query termina (isSuccess garante referência estável)
  useEffect(() => {
    if (!open || !client || !contactsLoaded) return
    const rows: ContactRow[] = (existingContacts ?? []).map((c) => ({
      id: c.id,
      name: c.name,
      role: c.role ?? '',
      email: c.email ?? '',
      phone: c.phone ?? '',
    }))
    if (rows.length === 0) rows.push({ name: '', role: '', email: '', phone: '' })
    setContacts(rows)
  }, [open, client?.id, contactsLoaded]) // eslint-disable-line react-hooks/exhaustive-deps

  function addContact() {
    setContacts((prev) => [...prev, { name: '', role: '', email: '', phone: '' }])
  }

  function removeContact(idx: number) {
    setContacts((prev) => prev.filter((_, i) => i !== idx))
  }

  function updateContact(idx: number, field: keyof ContactRow, value: string) {
    setContacts((prev) => prev.map((c, i) => i === idx ? { ...c, [field]: value } : c))
  }

  const mutation = useMutation({
    mutationFn: async (data: FormData) => {
      const payload = {
        name: data.name,
        cnpj: data.cnpj || null,
        type: data.type,
        indicator_id: data.indicator_id || null,
        contact: data.contact || null,
        start_date: data.start_date || null,
        segment_macro: data.segment_macro || null,
        segment: data.segment || null,
        state: data.state || null,
        size: data.size || null,
        active: data.active,
        company_id: company?.id ?? null,
        year: data.start_date ? new Date(data.start_date).getFullYear() : null,
      }

      let clientId: string
      if (isEditing) {
        const { error } = await supabase.from('clients').update(payload).eq('id', client.id)
        if (error) throw error
        clientId = client.id
      } else {
        const { data: inserted, error } = await supabase.from('clients').insert(payload).select('id').single()
        if (error) throw error
        clientId = inserted.id
      }

      // Salvar contatos (upsert por id ou insert para novos)
      const validContacts = contacts.filter((c) => c.name.trim())
      try {
        if (isEditing) {
          // Remove contatos que foram deletados
          const keepIds = validContacts.filter((c) => c.id).map((c) => c.id!)
          const existingIds = (existingContacts ?? []).map((c) => c.id)
          const toDelete = existingIds.filter((id) => !keepIds.includes(id))
          if (toDelete.length > 0) {
            await supabase.from('client_contacts').delete().in('id', toDelete)
          }
        }
        for (const c of validContacts) {
          if (c.id) {
            await supabase.from('client_contacts').update({
              name: c.name, role: c.role || null, email: c.email || null, phone: c.phone || null,
            }).eq('id', c.id)
          } else {
            await supabase.from('client_contacts').insert({
              client_id: clientId, name: c.name, role: c.role || null,
              email: c.email || null, phone: c.phone || null,
            })
          }
        }
      } catch {
        // client_contacts pode não existir ainda — migration 010 pendente
        console.warn('client_contacts sync skipped — migration 010 may not have been applied.')
      }
    },
    onSuccess: () => {
      toast({ title: isEditing ? 'Cliente atualizado.' : 'Cliente cadastrado.' })
      // Invalida cache dos contatos para forçar reload ao reabrir
      if (client?.id) {
        queryClient.invalidateQueries({ queryKey: ['client-contacts', client.id] })
      }
      onSuccess()
    },
    onError: (e: Error) => toast({ title: 'Erro ao salvar.', description: e.message, variant: 'destructive' }),
  })

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader className="mb-6">
            <SheetTitle>{isEditing ? 'Editar Cliente' : 'Novo Cliente'}</SheetTitle>
            <SheetDescription>
              {isEditing ? 'Atualize os dados do cliente.' : 'Preencha os dados do novo cliente.'}
            </SheetDescription>
          </SheetHeader>

          <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="space-y-4">
            {/* Nome */}
            <div className="space-y-1.5">
              <Label htmlFor="name">Nome *</Label>
              <Input id="name" {...register('name')} placeholder="Razão social ou nome" />
              {errors.name && <p className="text-xs text-red-500">{errors.name.message}</p>}
            </div>

            {/* CNPJ + Tipo */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="cnpj">CNPJ</Label>
                <Input id="cnpj" {...register('cnpj')} placeholder="00.000.000/0001-00" />
              </div>
              <div className="space-y-1.5">
                <Label>Tipo</Label>
                <Select value={watch('type')} onValueChange={(v) => setValue('type', v as 'Cliente' | 'Lead')}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Lead">Lead</SelectItem>
                    <SelectItem value="Cliente">Cliente</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Parceiro indicador */}
            {partners.length > 0 && (
              <div className="space-y-1.5">
                <Label>Parceiro <span className="text-xs text-slate-400 font-normal">(quem nos indicou este cliente)</span></Label>
                <Select
                  value={watch('indicator_id') ?? ''}
                  onValueChange={(v) => setValue('indicator_id', v === '_none' ? '' : v)}
                >
                  <SelectTrigger><SelectValue placeholder="Nenhum" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">Nenhum</SelectItem>
                    {partners.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Data início + UF */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="start_date">Data de início</Label>
                <Input id="start_date" type="date" {...register('start_date')} />
              </div>
              <div className="space-y-1.5">
                <Label>UF</Label>
                <Select value={watch('state') ?? ''} onValueChange={(v) => setValue('state', v)}>
                  <SelectTrigger><SelectValue placeholder="Estado" /></SelectTrigger>
                  <SelectContent>
                    {ESTADOS_BR.map((uf) => (
                      <SelectItem key={uf} value={uf}>{uf}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Segmento macro + segmento */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="segment_macro">Segmento macro</Label>
                <Input id="segment_macro" {...register('segment_macro')} placeholder="ex: Indústria" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="segment">Segmento</Label>
                <Input id="segment" {...register('segment')} placeholder="ex: Alimentos" />
              </div>
            </div>

            {/* Porte + Status */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Porte</Label>
                <Select value={watch('size') ?? ''} onValueChange={(v) => setValue('size', v as 'Pequeno' | 'Médio' | 'Grande')}>
                  <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Pequeno">Pequeno</SelectItem>
                    <SelectItem value="Médio">Médio</SelectItem>
                    <SelectItem value="Grande">Grande</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select
                  value={watch('active') ? 'true' : 'false'}
                  onValueChange={(v) => setValue('active', v === 'true')}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="true">Ativo</SelectItem>
                    <SelectItem value="false">Inativo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* ── Contatos ─────────────────────────────────── */}
            <div className="space-y-2 pt-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Users size={14} className="text-slate-500" />
                  <Label className="text-sm font-medium">Contatos</Label>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={addContact}
                  className="h-7 px-2 text-xs gap-1">
                  <Plus size={12} /> Adicionar
                </Button>
              </div>

              <div className="space-y-2">
                {contacts.map((contact, idx) => (
                  <div key={idx} className="rounded-md border border-slate-200 p-3 space-y-2 bg-slate-50">
                    <div className="grid grid-cols-2 gap-2">
                      {/* Área / Papel */}
                      <div className="space-y-1">
                        <Label className="text-xs text-slate-500">Área</Label>
                        <Input
                          className="h-8 text-xs"
                          placeholder="ex: Compras, TI, Financeiro"
                          value={contact.role}
                          onChange={(e) => updateContact(idx, 'role', e.target.value)}
                        />
                      </div>
                      {/* Nome */}
                      <div className="space-y-1">
                        <Label className="text-xs text-slate-500">Nome</Label>
                        <Input
                          className="h-8 text-xs"
                          placeholder="Nome do contato"
                          value={contact.name}
                          onChange={(e) => updateContact(idx, 'name', e.target.value)}
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {/* Email */}
                      <div className="space-y-1">
                        <Label className="text-xs text-slate-500">E-mail</Label>
                        <Input
                          className="h-8 text-xs"
                          placeholder="email@empresa.com"
                          type="email"
                          value={contact.email}
                          onChange={(e) => updateContact(idx, 'email', e.target.value)}
                        />
                      </div>
                      {/* Telefone + botão remover */}
                      <div className="space-y-1">
                        <Label className="text-xs text-slate-500">Telefone</Label>
                        <div className="flex gap-1">
                          <Input
                            className="h-8 text-xs"
                            placeholder="(11) 99999-0000"
                            value={contact.phone}
                            onChange={(e) => updateContact(idx, 'phone', e.target.value)}
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-red-400 hover:text-red-600 hover:bg-red-50 flex-shrink-0"
                            onClick={() => removeContact(idx)}
                          >
                            <Trash2 size={12} />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
                {contacts.length === 0 && (
                  <p className="text-xs text-slate-400 text-center py-3">
                    Nenhum contato adicionado. Clique em "Adicionar".
                  </p>
                )}
              </div>
            </div>

            <SheetFooter className="pt-4 gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={mutation.isPending} className="bg-teal-600 hover:bg-teal-700">
                {mutation.isPending && <Loader2 size={14} className="animate-spin" />}
                {isEditing ? 'Salvar alterações' : 'Cadastrar'}
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>
    </>
  )
}
