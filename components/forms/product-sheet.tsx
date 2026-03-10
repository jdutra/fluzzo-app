'use client'

import { useEffect, useState } from 'react'
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
import { Toaster } from '@/components/ui/toaster'
import { Loader2 } from 'lucide-react'
import type { Product } from '@/lib/supabase/types'

const schema = z.object({
  name: z.string().min(2, 'Nome obrigatório'),
  sigla: z.string().min(1, 'Sigla obrigatória').max(10),
  type: z.string().min(1, 'Tipo obrigatório'),
  active: z.boolean(),
})
type FormData = z.infer<typeof schema>

interface ProductSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  product: Product | null
  onSuccess: () => void
}

export function ProductSheet({ open, onOpenChange, product, onSuccess }: ProductSheetProps) {
  const supabase = createClient()
  const isEditing = !!product
  const [customType, setCustomType] = useState(false)

  const { data: company } = useQuery({
    queryKey: ['company'],
    queryFn: async () => {
      const { data } = await supabase.from('companies').select('id').single()
      return data
    },
  })

  // Busca os tipos existentes para sugestões
  const { data: existingProducts = [] } = useQuery<Product[]>({
    queryKey: ['products'],
    queryFn: async () => {
      const { data } = await supabase.from('products').select('type').order('type')
      return (data ?? []) as Product[]
    },
  })

  const existingTypes = Array.from(
    new Set(existingProducts.map((p) => p.type).filter(Boolean) as string[])
  ).sort()

  const { register, handleSubmit, reset, setValue, watch, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { active: true },
  })

  const watchedType = watch('type')

  useEffect(() => {
    if (open) {
      if (product) {
        reset({ name: product.name, sigla: product.sigla, type: product.type ?? '', active: product.active })
        // Se o tipo do produto não está na lista predefinida, entra em modo custom
        setCustomType(!!product.type && !existingTypes.includes(product.type))
      } else {
        reset({ active: true })
        setCustomType(false)
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, product, reset])

  const mutation = useMutation({
    mutationFn: async (data: FormData) => {
      const payload = { ...data, company_id: company?.id ?? null }
      if (isEditing) {
        const { error } = await supabase.from('products').update(payload).eq('id', product.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('products').insert(payload)
        if (error) throw error
      }
    },
    onSuccess: () => {
      toast({ title: isEditing ? 'Produto atualizado.' : 'Produto cadastrado.' })
      onSuccess()
    },
    onError: (e: Error) => toast({ title: 'Erro ao salvar.', description: e.message, variant: 'destructive' }),
  })

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader className="mb-6">
            <SheetTitle>{isEditing ? 'Editar Produto' : 'Novo Produto'}</SheetTitle>
            <SheetDescription>Produtos e serviços oferecidos pela empresa.</SheetDescription>
          </SheetHeader>
          <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="name">Nome *</Label>
              <Input id="name" {...register('name')} placeholder="Nome completo do produto" />
              {errors.name && <p className="text-xs text-red-500">{errors.name.message}</p>}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="sigla">Sigla *</Label>
                <Input id="sigla" {...register('sigla')} placeholder="ex: PS" className="uppercase" />
                {errors.sigla && <p className="text-xs text-red-500">{errors.sigla.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label>Tipo *</Label>
                {customType || existingTypes.length === 0 ? (
                  <div className="flex gap-1">
                    <Input
                      placeholder="ex: Assinatura"
                      value={watchedType ?? ''}
                      onChange={(e) => setValue('type', e.target.value)}
                    />
                    {existingTypes.length > 0 && (
                      <Button type="button" variant="outline" size="sm" className="shrink-0 px-2"
                        onClick={() => { setCustomType(false); setValue('type', '') }}>
                        ↩
                      </Button>
                    )}
                  </div>
                ) : (
                  <div className="flex gap-1">
                    <Select value={watchedType ?? ''} onValueChange={(v) => setValue('type', v)}>
                      <SelectTrigger className="flex-1"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                      <SelectContent>
                        {existingTypes.map((t) => (
                          <SelectItem key={t} value={t}>{t}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button type="button" variant="outline" size="sm" className="shrink-0 px-2 text-xs"
                      title="Criar novo tipo"
                      onClick={() => { setCustomType(true); setValue('type', '') }}>
                      +
                    </Button>
                  </div>
                )}
                {customType && existingTypes.length > 0 && (
                  <p className="text-xs text-muted-foreground">Novo tipo — será criado ao salvar o produto.</p>
                )}
                {errors.type && <p className="text-xs text-red-500">{errors.type.message}</p>}
              </div>
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
              <Button type="submit" disabled={mutation.isPending} className="bg-sky-600 hover:bg-sky-700">
                {mutation.isPending && <Loader2 size={14} className="animate-spin" />}
                {isEditing ? 'Salvar' : 'Cadastrar'}
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>
      <Toaster />
    </>
  )
}
