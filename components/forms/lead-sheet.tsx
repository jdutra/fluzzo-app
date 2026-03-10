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
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from '@/components/ui/use-toast'
import { Loader2, Check } from 'lucide-react'
import type { Lead } from '@/lib/supabase/types'
import { LEAD_STAGE_LABELS } from '@/lib/utils'
import { cn } from '@/lib/utils'

const STAGES = ['qualificacao', 'diagnostico', 'proposta', 'negociacao', 'fechado', 'perdido'] as const

const schema = z.object({
  title: z.string().min(2, 'Título obrigatório'),
  client_id: z.string().optional(),
  estimated_value: z.coerce.number().min(0).optional(),
  stage: z.enum(STAGES),
  responsible: z.string().optional(),
  notes: z.string().optional(),
  next_step: z.string().optional(),
  next_step_date: z.string().optional(),
  lost_reason: z.string().optional(),
})

type FormData = z.infer<typeof schema>

interface LeadSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  lead: Lead | null
  onSuccess: () => void
}

export function LeadSheet({ open, onOpenChange, lead, onSuccess }: LeadSheetProps) {
  const supabase = createClient()
  const isEditing = !!lead
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
      const { data } = await supabase.from('products').select('id, name, sigla, type').eq('active', true).order('type').order('name')
      return data ?? []
    },
  })

  // Busca responsáveis existentes para autocomplete
  const { data: existingLeads = [] } = useQuery<{ responsible: string | null }[]>({
    queryKey: ['leads-responsibles'],
    queryFn: async () => {
      const { data } = await supabase.from('leads').select('responsible').not('responsible', 'is', null)
      return data ?? []
    },
  })

  const responsibleSuggestions = Array.from(
    new Set(existingLeads.map((l) => l.responsible).filter(Boolean) as string[])
  ).sort()

  // Busca produtos já vinculados ao lead (em edição)
  const { data: leadProductIds = [] } = useQuery<string[]>({
    queryKey: ['lead-products', lead?.id],
    enabled: !!lead?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from('lead_products')
        .select('product_id')
        .eq('lead_id', lead!.id)
      return (data ?? []).map((r) => r.product_id)
    },
  })

  const { register, handleSubmit, reset, setValue, watch, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { stage: 'qualificacao' },
  })

  const watchedStage = watch('stage')

  // Popula o form quando abre (ou muda o lead selecionado)
  useEffect(() => {
    if (!open) return
    if (lead) {
      reset({
        title: lead.title,
        client_id: lead.client_id ?? '',
        estimated_value: lead.estimated_value ?? undefined,
        stage: (lead.stage as typeof STAGES[number]) ?? 'qualificacao',
        responsible: lead.responsible ?? '',
        notes: lead.notes ?? '',
        next_step: lead.next_step ?? '',
        next_step_date: lead.next_step_date ?? '',
        lost_reason: lead.lost_reason ?? '',
      })
    } else {
      reset({ stage: 'qualificacao' })
      setSelectedProducts([])
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, lead?.id])

  // Carrega produtos vinculados separadamente (não interfere no reset do form)
  useEffect(() => {
    if (open && lead && leadProductIds.length > 0) {
      setSelectedProducts(leadProductIds)
    }
  }, [open, lead?.id, leadProductIds])

  function toggleProduct(id: string) {
    setSelectedProducts((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    )
  }

  const mutation = useMutation({
    mutationFn: async (data: FormData) => {
      const payload = {
        title: data.title,
        client_id: data.client_id || null,
        product_id: selectedProducts[0] ?? null, // manter compat com campo legado
        estimated_value: data.estimated_value ?? null,
        stage: data.stage,
        responsible: data.responsible || null,
        notes: data.notes || null,
        next_step: data.next_step || null,
        next_step_date: data.next_step_date || null,
        lost_reason: data.lost_reason || null,
        company_id: company?.id ?? null,
      }

      let leadId: string
      if (isEditing) {
        const { error } = await supabase.from('leads').update(payload).eq('id', lead.id)
        if (error) throw error
        leadId = lead.id
      } else {
        const { data: inserted, error } = await supabase.from('leads').insert(payload).select('id').single()
        if (error) throw error
        if (!inserted?.id) throw new Error('Falha ao obter ID do lead criado.')
        leadId = inserted.id
      }

      // Sincronizar lead_products (tabela opcional — requer migration 006)
      try {
        await supabase.from('lead_products').delete().eq('lead_id', leadId)
        if (selectedProducts.length > 0) {
          await supabase.from('lead_products').insert(
            selectedProducts.map((pid) => ({ lead_id: leadId, product_id: pid }))
          )
        }
      } catch {
        // lead_products pode não existir ainda (migration 006 pendente)
        console.warn('lead_products sync skipped — migration 006 may not have been applied.')
      }
    },
    onSuccess: () => {
      toast({ title: isEditing ? 'Lead atualizado.' : 'Lead cadastrado.' })
      onSuccess()
    },
    onError: (e: Error) => toast({ title: 'Erro ao salvar.', description: e.message, variant: 'destructive' }),
  })

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader className="mb-6">
            <SheetTitle>{isEditing ? 'Editar Lead' : 'Novo Lead'}</SheetTitle>
            <SheetDescription>Oportunidade em pipeline de vendas.</SheetDescription>
          </SheetHeader>
          <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="space-y-4">
            {/* Título */}
            <div className="space-y-1.5">
              <Label htmlFor="title">Título *</Label>
              <Input id="title" {...register('title')} placeholder="Ex: Projeto de Demanda — Supermercado X" />
              {errors.title && <p className="text-xs text-red-500">{errors.title.message}</p>}
            </div>

            {/* Cliente */}
            <div className="space-y-1.5">
              <Label>Cliente</Label>
              <Select value={watch('client_id') ?? ''} onValueChange={(v) => setValue('client_id', v)}>
                <SelectTrigger><SelectValue placeholder="Selecionar cliente" /></SelectTrigger>
                <SelectContent>
                  {clients.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Produtos (múltiplos) */}
            <div className="space-y-1.5">
              <Label>Produtos</Label>
              <div className="border rounded-md divide-y max-h-40 overflow-y-auto">
                {products.length === 0 && (
                  <p className="text-xs text-slate-400 px-3 py-2">Nenhum produto ativo cadastrado.</p>
                )}
                {products.map((p) => {
                  const checked = selectedProducts.includes(p.id)
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => toggleProduct(p.id)}
                      className={cn(
                        'flex items-center gap-2 w-full px-3 py-2 text-sm text-left transition-colors',
                        checked ? 'bg-teal-50' : 'hover:bg-slate-50'
                      )}
                    >
                      <span className={cn(
                        'flex-shrink-0 w-4 h-4 rounded border flex items-center justify-center',
                        checked ? 'bg-teal-600 border-teal-600' : 'border-slate-300'
                      )}>
                        {checked && <Check size={10} className="text-white" />}
                      </span>
                      <span className="font-mono text-xs text-slate-500 w-8">{p.sigla}</span>
                      <span className="text-slate-700">{p.name}</span>
                      {p.type && (
                        <span className="ml-auto text-xs text-slate-400">{p.type}</span>
                      )}
                    </button>
                  )
                })}
              </div>
              {selectedProducts.length > 0 && (
                <p className="text-xs text-slate-500">{selectedProducts.length} produto(s) selecionado(s)</p>
              )}
            </div>

            {/* Valor + Estágio */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="estimated_value">Valor estimado (R$)</Label>
                <Input id="estimated_value" type="number" step="0.01" min="0"
                  {...register('estimated_value')} placeholder="0,00" />
              </div>
              <div className="space-y-1.5">
                <Label>Estágio *</Label>
                <Select value={watch('stage')} onValueChange={(v) => setValue('stage', v as typeof STAGES[number])}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STAGES.map((s) => (
                      <SelectItem key={s} value={s}>{LEAD_STAGE_LABELS[s]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Responsável — com sugestões */}
            <div className="space-y-1.5">
              <Label htmlFor="responsible">Responsável</Label>
              <Input
                id="responsible"
                list="responsible-suggestions"
                {...register('responsible')}
                placeholder="Nome do responsável"
              />
              {responsibleSuggestions.length > 0 && (
                <datalist id="responsible-suggestions">
                  {responsibleSuggestions.map((r) => (
                    <option key={r} value={r} />
                  ))}
                </datalist>
              )}
            </div>

            {/* Próximo passo + Data */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="next_step">Próximo passo</Label>
                <Input id="next_step" {...register('next_step')} placeholder="Ex: Enviar proposta" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="next_step_date">Data do passo</Label>
                <Input id="next_step_date" type="date" {...register('next_step_date')} />
              </div>
            </div>

            {/* Motivo de perda (condicional) */}
            {watchedStage === 'perdido' && (
              <div className="space-y-1.5">
                <Label htmlFor="lost_reason">Motivo da perda</Label>
                <Textarea id="lost_reason" {...register('lost_reason')}
                  placeholder="Descreva o motivo pelo qual o lead foi perdido" rows={2} />
              </div>
            )}

            {/* Observações */}
            <div className="space-y-1.5">
              <Label htmlFor="notes">Observações</Label>
              <Textarea id="notes" {...register('notes')} placeholder="Anotações internas" rows={3} />
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
