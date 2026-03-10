'use client'

import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation, useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from '@/components/ui/use-toast'
import { Toaster } from '@/components/ui/toaster'
import { Loader2 } from 'lucide-react'
import type { Client } from '@/lib/supabase/types'

const ESTADOS_BR = [
  'AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS',
  'MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC',
  'SP','SE','TO',
]

const schema = z.object({
  name: z.string().min(2, 'Nome obrigatório'),
  type: z.enum(['Fluzzo', 'Cliente']),
  contact: z.string().optional(),
  contract_type: z.string().optional(),
  start_date: z.string().optional(),
  segment_macro: z.string().optional(),
  segment: z.string().optional(),
  state: z.string().optional(),
  size: z.enum(['Pequeno', 'Médio', 'Grande']).optional(),
  active: z.boolean(),
})

type FormData = z.infer<typeof schema>

interface ClientSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  client: Client | null
  onSuccess: () => void
}

export function ClientSheet({ open, onOpenChange, client, onSuccess }: ClientSheetProps) {
  const supabase = createClient()
  const isEditing = !!client
  const [customContractType, setCustomContractType] = useState(false)

  const { data: company } = useQuery({
    queryKey: ['company'],
    queryFn: async () => {
      const { data } = await supabase.from('companies').select('id').single()
      return data
    },
  })

  // Busca tipos de contrato existentes para sugestões
  const { data: existingClients = [] } = useQuery<Client[]>({
    queryKey: ['clients'],
    queryFn: async () => {
      const { data } = await supabase.from('clients').select('contract_type').not('contract_type', 'is', null)
      return (data ?? []) as Client[]
    },
  })

  const existingContractTypes = Array.from(
    new Set(existingClients.map((c) => c.contract_type).filter(Boolean) as string[])
  ).sort()

  const { register, handleSubmit, reset, setValue, watch, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { type: 'Cliente', active: true },
  })

  const watchedContractType = watch('contract_type')

  useEffect(() => {
    if (open) {
      if (client) {
        reset({
          name: client.name,
          type: (client.type as 'Fluzzo' | 'Cliente') ?? 'Cliente',
          contact: client.contact ?? '',
          contract_type: client.contract_type ?? '',
          start_date: client.start_date ?? '',
          segment_macro: client.segment_macro ?? '',
          segment: client.segment ?? '',
          state: client.state ?? '',
          size: (client.size as 'Pequeno' | 'Médio' | 'Grande') ?? undefined,
          active: client.active,
        })
        setCustomContractType(
          !!client.contract_type && !existingContractTypes.includes(client.contract_type)
        )
      } else {
        reset({ type: 'Cliente', active: true })
        setCustomContractType(false)
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, client, reset])

  const mutation = useMutation({
    mutationFn: async (data: FormData) => {
      const payload = {
        ...data,
        contact: data.contact || null,
        contract_type: data.contract_type || null,
        start_date: data.start_date || null,
        segment_macro: data.segment_macro || null,
        segment: data.segment || null,
        state: data.state || null,
        size: data.size || null,
        company_id: company?.id ?? null,
        year: data.start_date ? new Date(data.start_date).getFullYear() : null,
      }
      if (isEditing) {
        const { error } = await supabase.from('clients').update(payload).eq('id', client.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('clients').insert(payload)
        if (error) throw error
      }
    },
    onSuccess: () => {
      toast({ title: isEditing ? 'Cliente atualizado.' : 'Cliente cadastrado.' })
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

            {/* Tipo + Tipo de Contrato */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Tipo</Label>
                <Select value={watch('type')} onValueChange={(v) => setValue('type', v as 'Fluzzo' | 'Cliente')}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Cliente">Cliente</SelectItem>
                    <SelectItem value="Fluzzo">Fluzzo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Tipo de Contrato</Label>
                {customContractType || existingContractTypes.length === 0 ? (
                  <div className="flex gap-1">
                    <Input
                      placeholder="ex: Mensal, Projeto"
                      value={watchedContractType ?? ''}
                      onChange={(e) => setValue('contract_type', e.target.value)}
                      className="text-sm"
                    />
                    {existingContractTypes.length > 0 && (
                      <Button type="button" variant="outline" size="sm" className="shrink-0 px-2"
                        onClick={() => { setCustomContractType(false); setValue('contract_type', '') }}>
                        ↩
                      </Button>
                    )}
                  </div>
                ) : (
                  <div className="flex gap-1">
                    <Select value={watchedContractType ?? ''} onValueChange={(v) => setValue('contract_type', v)}>
                      <SelectTrigger className="flex-1"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">— nenhum —</SelectItem>
                        {existingContractTypes.map((t) => (
                          <SelectItem key={t} value={t}>{t}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button type="button" variant="outline" size="sm" className="shrink-0 px-2 text-xs"
                      title="Criar novo tipo de contrato"
                      onClick={() => { setCustomContractType(true); setValue('contract_type', '') }}>
                      +
                    </Button>
                  </div>
                )}
              </div>
            </div>

            {/* Contato */}
            <div className="space-y-1.5">
              <Label htmlFor="contact">Contato</Label>
              <Input id="contact" {...register('contact')} placeholder="Nome do contato principal" />
            </div>

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

            <SheetFooter className="pt-4 gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={mutation.isPending} className="bg-sky-600 hover:bg-sky-700">
                {mutation.isPending && <Loader2 size={14} className="animate-spin" />}
                {isEditing ? 'Salvar alterações' : 'Cadastrar'}
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>
      <Toaster />
    </>
  )
}
