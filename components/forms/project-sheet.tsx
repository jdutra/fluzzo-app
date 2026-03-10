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
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from '@/components/ui/use-toast'
import { Toaster } from '@/components/ui/toaster'
import { Loader2 } from 'lucide-react'
import type { Project, ProjectStatus } from '@/lib/supabase/types'
import { createProjectWithEntries, updateProject } from '@/lib/actions/projects'
import { PROJECT_STATUS_LABELS } from '@/lib/utils'

const STATUSES: ProjectStatus[] = ['ativo', 'on-hold', 'concluido', 'cancelado']

const schema = z.object({
  client_id: z.string().optional(),
  gp: z.string().optional(),
  sale_date: z.string().optional(),
  billing_start_date: z.string().optional(),
  status: z.enum(['ativo', 'on-hold', 'concluido', 'cancelado'] as const),
  revenue: z.coerce.number().min(0, 'Receita deve ser ≥ 0'),
  purchase_order: z.string().optional(),
  notes: z.string().optional(),
  installments: z.coerce.number().min(1).max(60).optional(),
})

type FormData = z.infer<typeof schema>

interface ProjectSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  project: Project | null
  onSuccess: () => void
}

export function ProjectSheet({ open, onOpenChange, project, onSuccess }: ProjectSheetProps) {
  const supabase = createClient()
  const queryClient = useQueryClient()
  const isEditing = !!project

  const [selectedProducts, setSelectedProducts] = useState<string[]>([])

  const { data: company } = useQuery({
    queryKey: ['company'],
    queryFn: async () => {
      const { data } = await supabase.from('companies').select('id').single()
      return data
    },
  })

  const { data: clients = [] } = useQuery({
    queryKey: ['clients-active'],
    queryFn: async () => {
      const { data } = await supabase.from('clients').select('id, name').eq('active', true).order('name')
      return data ?? []
    },
  })

  const { data: products = [] } = useQuery({
    queryKey: ['products-active'],
    queryFn: async () => {
      const { data } = await supabase.from('products').select('id, sigla, name').eq('active', true).order('sigla')
      return data ?? []
    },
  })

  // Load existing project_products when editing
  const { data: existingProductIds = [] } = useQuery({
    queryKey: ['project-products', project?.id],
    enabled: !!project?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from('project_products')
        .select('product_id')
        .eq('project_id', project!.id)
      return (data ?? []).map((p) => p.product_id as string)
    },
  })

  const { register, handleSubmit, reset, setValue, watch, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { status: 'ativo', revenue: 0, installments: 1 },
  })

  useEffect(() => {
    if (open) {
      if (project) {
        reset({
          client_id: project.client_id ?? '',
          gp: project.gp ?? '',
          sale_date: project.sale_date ?? '',
          billing_start_date: project.billing_start_date ?? '',
          status: (project.status as ProjectStatus) ?? 'ativo',
          revenue: project.revenue ?? 0,
          purchase_order: project.purchase_order ?? '',
          notes: project.notes ?? '',
          installments: 1,
        })
        setSelectedProducts(existingProductIds)
      } else {
        const today = new Date().toISOString().split('T')[0]
        reset({ status: 'ativo', revenue: 0, installments: 1, sale_date: today })
        setSelectedProducts([])
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, project, reset, existingProductIds])

  const mutation = useMutation({
    mutationFn: async (data: FormData) => {
      const year = data.sale_date ? new Date(data.sale_date).getFullYear() : new Date().getFullYear()
      let projectId: string

      if (isEditing) {
        await updateProject(project.id, {
          client_id: data.client_id || null,
          gp: data.gp || null,
          sale_date: data.sale_date || null,
          billing_start_date: data.billing_start_date || null,
          year,
          status: data.status,
          revenue: data.revenue,
          purchase_order: data.purchase_order || null,
          notes: data.notes || null,
        })
        projectId = project.id
      } else {
        const created = await createProjectWithEntries({
          company_id: company?.id ?? '',
          client_id: data.client_id || null,
          gp: data.gp || null,
          sale_date: data.sale_date || null,
          billing_start_date: data.billing_start_date || null,
          year,
          status: data.status,
          revenue: data.revenue,
          purchase_order: data.purchase_order || null,
          notes: data.notes || null,
          installments: data.installments ?? 1,
        })
        projectId = created.id
      }

      // Sync project_products
      await supabase.from('project_products').delete().eq('project_id', projectId)
      if (selectedProducts.length > 0) {
        await supabase.from('project_products').insert(
          selectedProducts.map((pid) => ({ project_id: projectId, product_id: pid }))
        )
      }
    },
    onSuccess: () => {
      toast({ title: isEditing ? 'Projeto atualizado.' : 'Projeto criado com lançamentos gerados.' })
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      queryClient.invalidateQueries({ queryKey: ['entries'] })
      queryClient.invalidateQueries({ queryKey: ['project-products'] })
      onSuccess()
    },
    onError: (e: Error) => toast({ title: 'Erro ao salvar.', description: e.message, variant: 'destructive' }),
  })

  function toggleProduct(productId: string) {
    setSelectedProducts((prev) =>
      prev.includes(productId) ? prev.filter((id) => id !== productId) : [...prev, productId]
    )
  }

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader className="mb-6">
            <SheetTitle>{isEditing ? `Editar Projeto #${project?.code}` : 'Novo Projeto'}</SheetTitle>
            <SheetDescription>
              {isEditing
                ? 'Atualize os dados do projeto. Os lançamentos não serão regerados.'
                : 'Ao criar, lançamentos serão gerados automaticamente conforme o número de parcelas.'}
            </SheetDescription>
          </SheetHeader>
          <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="space-y-4">

            {/* Cliente + Status */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Cliente</Label>
                <Select value={watch('client_id') ?? ''} onValueChange={(v) => setValue('client_id', v)}>
                  <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
                  <SelectContent>
                    {clients.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Status *</Label>
                <Select value={watch('status')} onValueChange={(v) => setValue('status', v as ProjectStatus)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>{PROJECT_STATUS_LABELS[s]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* GP (Gestor) */}
            <div className="space-y-1.5">
              <Label htmlFor="gp">Gestor do Projeto (GP)</Label>
              <Input id="gp" {...register('gp')} placeholder="Nome do responsável" />
            </div>

            {/* Receita + Parcelas */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="revenue">Receita (R$) *</Label>
                <Input id="revenue" type="number" step="0.01" min="0" {...register('revenue')} />
                {errors.revenue && <p className="text-xs text-red-500">{errors.revenue.message}</p>}
              </div>
              {!isEditing && (
                <div className="space-y-1.5">
                  <Label htmlFor="installments">Nº de parcelas</Label>
                  <Input id="installments" type="number" min="1" max="60" {...register('installments')} />
                  <p className="text-[11px] text-slate-400">Gera lançamentos automáticos</p>
                </div>
              )}
            </div>

            {/* Data de venda + Início faturamento */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="sale_date">Data de venda</Label>
                <Input id="sale_date" type="date" {...register('sale_date')} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="billing_start_date">Início faturamento</Label>
                <Input id="billing_start_date" type="date" {...register('billing_start_date')} />
              </div>
            </div>

            {/* Purchase Order */}
            <div className="space-y-1.5">
              <Label htmlFor="purchase_order">Purchase Order (PO)</Label>
              <Input id="purchase_order" {...register('purchase_order')} placeholder="Nº da PO" />
            </div>

            {/* Produtos */}
            {products.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Produtos</p>
                <div className="grid grid-cols-2 gap-1.5 rounded-lg border border-slate-200 p-3 bg-slate-50">
                  {products.map((p) => (
                    <label key={p.id} className="flex items-center gap-2 cursor-pointer text-sm py-0.5">
                      <input
                        type="checkbox"
                        className="rounded border-slate-300 accent-sky-600"
                        checked={selectedProducts.includes(p.id)}
                        onChange={() => toggleProduct(p.id)}
                      />
                      <span className="font-semibold text-sky-700 w-8 shrink-0">{p.sigla}</span>
                      <span className="text-slate-600 text-xs truncate">{p.name}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* Observações */}
            <div className="space-y-1.5">
              <Label htmlFor="notes">Observações</Label>
              <Textarea id="notes" {...register('notes')} placeholder="Notas internas do projeto" rows={3} />
            </div>

            <SheetFooter className="pt-4 gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
              <Button type="submit" disabled={mutation.isPending} className="bg-sky-600 hover:bg-sky-700">
                {mutation.isPending && <Loader2 size={14} className="animate-spin" />}
                {isEditing ? 'Salvar' : 'Criar Projeto'}
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>
      <Toaster />
    </>
  )
}
