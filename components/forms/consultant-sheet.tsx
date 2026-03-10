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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from '@/components/ui/use-toast'
import { Loader2 } from 'lucide-react'
import type { Consultant } from '@/lib/supabase/types'

const schema = z.object({
  name: z.string().min(2, 'Nome obrigatório'),
  email: z.string().email('E-mail inválido').optional().or(z.literal('')),
  phone: z.string().optional(),
  pix_pf: z.string().optional(),
  pix_pj: z.string().optional(),
  notes: z.string().optional(),
  active: z.boolean(),
})
type FormData = z.infer<typeof schema>

interface ConsultantSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  consultant: Consultant | null
  onSuccess: () => void
}

export function ConsultantSheet({ open, onOpenChange, consultant, onSuccess }: ConsultantSheetProps) {
  const supabase = createClient()
  const isEditing = !!consultant

  const { data: company } = useQuery({
    queryKey: ['company'],
    queryFn: async () => {
      const { data } = await supabase.from('companies').select('id').single()
      return data
    },
  })

  const { register, handleSubmit, reset, setValue, watch, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { active: true },
  })

  useEffect(() => {
    if (open) {
      if (consultant) {
        reset({
          name: consultant.name,
          email: consultant.email ?? '',
          phone: consultant.phone ?? '',
          pix_pf: consultant.pix_pf ?? '',
          pix_pj: consultant.pix_pj ?? '',
          notes: consultant.notes ?? '',
          active: consultant.active,
        })
      } else {
        reset({ active: true })
      }
    }
  }, [open, consultant, reset])

  const mutation = useMutation({
    mutationFn: async (data: FormData) => {
      const payload = {
        name: data.name,
        email: data.email || null,
        phone: data.phone || null,
        pix_pf: data.pix_pf || null,
        pix_pj: data.pix_pj || null,
        notes: data.notes || null,
        active: data.active,
        company_id: company?.id ?? null,
      }
      if (isEditing) {
        const { error } = await supabase.from('consultants').update(payload).eq('id', consultant.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('consultants').insert(payload)
        if (error) throw error
      }
    },
    onSuccess: () => {
      toast({ title: isEditing ? 'Consultor atualizado.' : 'Consultor cadastrado.' })
      onSuccess()
    },
    onError: (e: Error) => toast({ title: 'Erro ao salvar.', description: e.message, variant: 'destructive' }),
  })

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader className="mb-6">
            <SheetTitle>{isEditing ? 'Editar Consultor' : 'Novo Consultor'}</SheetTitle>
            <SheetDescription>Dados do consultor alocado em projetos.</SheetDescription>
          </SheetHeader>
          <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="space-y-4">

            {/* Dados básicos */}
            <div className="space-y-1.5">
              <Label htmlFor="name">Nome *</Label>
              <Input id="name" {...register('name')} placeholder="Nome completo" />
              {errors.name && <p className="text-xs text-red-500">{errors.name.message}</p>}
            </div>

            {/* Contato */}
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide pt-1">Contato</p>
            <div className="space-y-1.5">
              <Label htmlFor="email">E-mail</Label>
              <Input id="email" type="email" {...register('email')} placeholder="email@exemplo.com" />
              {errors.email && <p className="text-xs text-red-500">{errors.email.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="phone">Telefone / WhatsApp</Label>
              <Input id="phone" {...register('phone')} placeholder="(11) 99999-9999" />
            </div>

            {/* PIX PF / PJ */}
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide pt-1">Dados de Pagamento</p>
            <div className="space-y-1.5">
              <Label htmlFor="pix_pf">PIX Pessoa Física (PF)</Label>
              <Input id="pix_pf" {...register('pix_pf')} placeholder="CPF, e-mail ou telefone" />
              <p className="text-xs text-muted-foreground">Para pagamentos diretos ao consultor como pessoa física</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pix_pj">PIX Pessoa Jurídica (PJ)</Label>
              <Input id="pix_pj" {...register('pix_pj')} placeholder="CNPJ ou e-mail empresarial" />
              <p className="text-xs text-muted-foreground">Para pagamentos via empresa do consultor</p>
            </div>

            {/* Observações + Status */}
            <div className="space-y-1.5">
              <Label htmlFor="notes">Observações</Label>
              <Input id="notes" {...register('notes')} placeholder="Informações adicionais" />
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={watch('active') ? 'true' : 'false'} onValueChange={(v) => setValue('active', v === 'true')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="true">Ativo</SelectItem>
                  <SelectItem value="false">Inativo</SelectItem>
                </SelectContent>
              </Select>
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
