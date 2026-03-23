'use client'

import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation, useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from '@/components/ui/use-toast'
import { Loader2 } from 'lucide-react'
import type { Partner } from '@/lib/supabase/types'

const schema = z.object({
  name: z.string().min(2, 'Nome obrigatório'),
  partner_company: z.string().optional(),
  area: z.string().optional(),
  email: z.string().email('E-mail inválido').optional().or(z.literal('')),
  phone: z.string().optional(),
  pix: z.string().optional(),
  status: z.enum(['ativo', 'inativo']),
  fee_avg: z.coerce.number().min(0).max(100).optional(),
})
type FormData = z.infer<typeof schema>

interface PartnerSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  partner: Partner | null
  onSuccess: () => void
}

export function PartnerSheet({ open, onOpenChange, partner, onSuccess }: PartnerSheetProps) {
  const supabase = createClient()
  const isEditing = !!partner

  const { data: company } = useQuery({
    queryKey: ['company'],
    queryFn: async () => {
      const { data } = await supabase.from('companies').select('id').single()
      return data
    },
  })

  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { status: 'ativo' },
  })

  useEffect(() => {
    if (open) {
      if (partner) {
        reset({
          name: partner.name,
          partner_company: partner.partner_company ?? '',
          area: partner.area ?? '',
          email: partner.email ?? '',
          phone: partner.phone ?? '',
          pix: partner.pix ?? '',
          status: partner.status ?? 'ativo',
          fee_avg: partner.fee_avg != null ? partner.fee_avg * 100 : undefined,
        })
      } else {
        reset({ status: 'ativo' })
      }
    }
  }, [open, partner, reset])

  const mutation = useMutation({
    mutationFn: async (data: FormData) => {
      const payload = {
        name: data.name,
        partner_company: data.partner_company || null,
        area: data.area || null,
        email: data.email || null,
        phone: data.phone || null,
        pix: data.pix || null,
        status: data.status,
        fee_avg: data.fee_avg != null ? data.fee_avg / 100 : null,
        company_id: company?.id ?? null,
      }
      if (isEditing) {
        const { error } = await supabase.from('partners').update(payload).eq('id', partner.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('partners').insert(payload)
        if (error) throw error
      }
    },
    onSuccess: () => {
      toast({ title: isEditing ? 'Parceiro atualizado.' : 'Parceiro cadastrado.' })
      onSuccess()
    },
    onError: (e: Error) => toast({ title: 'Erro ao salvar.', description: e.message, variant: 'destructive' }),
  })

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader className="mb-6">
            <SheetTitle>{isEditing ? 'Editar Parceiro' : 'Novo Parceiro'}</SheetTitle>
            <SheetDescription>Parceiro comercial que indica clientes.</SheetDescription>
          </SheetHeader>
          <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="space-y-4">

            {/* Dados básicos */}
            <div className="space-y-1.5">
              <Label htmlFor="name">Nome *</Label>
              <Input id="name" {...register('name')} placeholder="Nome do parceiro" />
              {errors.name && <p className="text-xs text-red-500">{errors.name.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="partner_company">Empresa</Label>
              <Input id="partner_company" {...register('partner_company')} placeholder="Empresa do parceiro" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="area">Área de atuação</Label>
              <Input id="area" {...register('area')} placeholder="ex: Marketing, RH, Jurídico" />
            </div>

            {/* Contato */}
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide pt-2">Contato</p>
            <div className="space-y-1.5">
              <Label htmlFor="email">E-mail</Label>
              <Input id="email" type="email" {...register('email')} placeholder="email@empresa.com" />
              {errors.email && <p className="text-xs text-red-500">{errors.email.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="phone">Telefone / WhatsApp</Label>
              <Input id="phone" {...register('phone')} placeholder="(11) 99999-9999" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pix">PIX</Label>
              <Input id="pix" {...register('pix')} placeholder="CPF, CNPJ, e-mail ou chave aleatória" />
            </div>

            {/* Status */}
            <div className="space-y-1.5">
              <Label htmlFor="status">Status</Label>
              <select id="status" {...register('status')}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
                <option value="ativo">Ativo</option>
                <option value="inativo">Inativo</option>
              </select>
            </div>

            {/* Fee */}
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide pt-2">Financeiro</p>
            <div className="space-y-1.5">
              <Label htmlFor="fee_avg">Fee médio (%)</Label>
              <Input id="fee_avg" type="number" step="0.1" min="0" max="100"
                {...register('fee_avg')} placeholder="ex: 10" />
              <p className="text-xs text-muted-foreground">Percentual médio de comissão sobre projetos</p>
              {errors.fee_avg && <p className="text-xs text-red-500">{errors.fee_avg.message}</p>}
            </div>

            <SheetFooter className="pt-4 gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
              <Button type="submit" disabled={mutation.isPending} className="bg-teal-600 hover:bg-teal-700">
                {mutation.isPending && <Loader2 size={14} className="animate-spin" />}
                {isEditing ? 'Salvar' : 'Cadastrar'}
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>
    </>
  )
}
