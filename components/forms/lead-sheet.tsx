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
import { Loader2, Check, X } from 'lucide-react'
import type { Lead } from '@/lib/supabase/types'
import { LEAD_STAGE_LABELS } from '@/lib/utils'
import { cn } from '@/lib/utils'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { convertLeadToProject } from '@/lib/actions/leads'

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

type ProductRow = { id: string; value: number }

export function LeadSheet({ open, onOpenChange, lead, onSuccess }: LeadSheetProps) {
  const supabase = createClient()
  const queryClient = useQueryClient()
  const isEditing = !!lead
  const [selectedProducts, setSelectedProducts] = useState<ProductRow[]>([])
  const [showConvertDialog, setShowConvertDialog] = useState(false)
  const [pendingConvertLeadId, setPendingConvertLeadId] = useState<string | null>(null)

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
  const { data: leadProductRows = [] } = useQuery<ProductRow[]>({
    queryKey: ['lead-products', lead?.id],
    enabled: !!lead?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from('lead_products')
        .select('product_id, value')
        .eq('lead_id', lead!.id)
      return (data ?? []).map((r) => ({ id: r.product_id, value: (r as any).value ?? 0 }))
    },
  })

  const { register, handleSubmit, reset, setValue, watch, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { stage: 'qualificacao' },
  })

  const watchedStage = watch('stage')

  // Calcula total automaticamente a partir dos valores por produto
  const productsTotal = selectedProducts.reduce((sum, p) => sum + (p.value || 0), 0)

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
    if (open && lead && leadProductRows.length > 0) {
      setSelectedProducts(leadProductRows)
    }
  }, [open, lead?.id, leadProductRows])

  // Sincroniza o estimated_value com o total dos produtos quando muda
  useEffect(() => {
    if (productsTotal > 0) {
      setValue('estimated_value', productsTotal)
    }
  }, [productsTotal, setValue])

  function toggleProduct(id: string) {
    setSelectedProducts((prev) => {
      const exists = prev.find((p) => p.id === id)
      return exists ? prev.filter((p) => p.id !== id) : [...prev, { id, value: 0 }]
    })
  }

  function updateProductValue(id: string, value: number) {
    setSelectedProducts((prev) => prev.map((p) => p.id === id ? { ...p, value } : p))
  }

  const convertMutation = useMutation({
    mutationFn: async (leadId: string) => convertLeadToProject(leadId),
    onSuccess: () => {
      toast({ title: 'Lead convertido em projeto com sucesso!' })
      queryClient.invalidateQueries({ queryKey: ['leads'] })
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      setShowConvertDialog(false)
      setPendingConvertLeadId(null)
    },
    onError: (e: Error) => {
      toast({ title: 'Erro ao converter.', description: e.message, variant: 'destructive' })
      setShowConvertDialog(false)
      setPendingConvertLeadId(null)
    },
  })

  const mutation = useMutation({
    mutationFn: async (data: FormData) => {
      const payload = {
        title: data.title,
        client_id: data.client_id || null,
        product_id: selectedProducts[0]?.id ?? null, // manter compat com campo legado
        estimated_value: productsTotal > 0 ? productsTotal : (data.estimated_value ?? null),
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
            selectedProducts.map((p) => ({ lead_id: leadId, product_id: p.id, value: p.value || null }))
          )
        }
      } catch {
        // lead_products pode não existir ainda (migration 006 pendente)
        console.warn('lead_products sync skipped — migration 006 may not have been applied.')
      }

      return { leadId, stage: data.stage }
    },
    onSuccess: ({ leadId, stage }) => {
      toast({ title: isEditing ? 'Lead atualizado.' : 'Lead cadastrado.' })
      onSuccess()
      if (stage === 'fechado' && !lead?.converted_project_id) {
        setPendingConvertLeadId(leadId)
        setShowConvertDialog(true)
      }
    },
    onError: (e: Error) => toast({ title: 'Erro ao salvar.', description: e.message, variant: 'destructive' }),
  })

  return (
    <>
      <ConfirmDialog
        open={showConvertDialog}
        onOpenChange={(v) => {
          if (!v) { setShowConvertDialog(false); setPendingConvertLeadId(null) }
        }}
        title="Converter em projeto"
        description="Este lead foi marcado como fechado. Deseja convertê-lo em projeto agora?"
        confirmLabel="Sim, converter"
        cancelLabel="Apenas salvar"
        variant="default"
        loading={convertMutation.isPending}
        onConfirm={() => pendingConvertLeadId && convertMutation.mutate(pendingConvertLeadId)}
      />
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

            {/* Produtos (múltiplos) com valor individual */}
            <div className="space-y-1.5">
              <Label>Produtos</Label>
              <div className="border rounded-md divide-y max-h-48 overflow-y-auto">
                {products.length === 0 && (
                  <p className="text-xs text-slate-400 px-3 py-2">Nenhum produto ativo cadastrado.</p>
                )}
                {products.map((p) => {
                  const row = selectedProducts.find((r) => r.id === p.id)
                  const checked = !!row
                  return (
                    <div key={p.id} className={cn('flex items-center gap-2 px-3 py-2 text-sm', checked ? 'bg-teal-50' : 'hover:bg-slate-50')}>
                      <button type="button" onClick={() => toggleProduct(p.id)}
                        className={cn('flex-shrink-0 w-4 h-4 rounded border flex items-center justify-center',
                          checked ? 'bg-teal-600 border-teal-600' : 'border-slate-300')}>
                        {checked && <Check size={10} className="text-white" />}
                      </button>
                      <span className="font-mono text-xs text-slate-500 w-8">{p.sigla}</span>
                      <span className="text-slate-700 flex-1">{p.name}</span>
                      {checked && (
                        <Input
                          type="number" min="0" step="0.01"
                          placeholder="R$ 0,00"
                          value={row.value || ''}
                          onChange={(e) => updateProductValue(p.id, parseFloat(e.target.value) || 0)}
                          onClick={(e) => e.stopPropagation()}
                          className="w-28 h-7 text-xs text-right"
                        />
                      )}
                    </div>
                  )
                })}
              </div>
              {selectedProducts.length > 0 && (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500">{selectedProducts.length} produto(s) selecionado(s)</span>
                  {productsTotal > 0 && (
                    <span className="font-semibold text-teal-700">
                      Total: R$ {productsTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Estágio — campo em destaque */}
            <div className="space-y-1.5">
              <Label className="font-semibold">Estágio do lead *</Label>
              <div className="grid grid-cols-3 gap-1.5">
                {STAGES.map((s) => {
                  const isSelected = watch('stage') === s
                  const colors: Record<string, string> = {
                    qualificacao: 'border-slate-300 data-[active=true]:bg-slate-700 data-[active=true]:text-white data-[active=true]:border-slate-700',
                    diagnostico:  'border-blue-200  data-[active=true]:bg-blue-600   data-[active=true]:text-white data-[active=true]:border-blue-600',
                    proposta:     'border-yellow-200 data-[active=true]:bg-yellow-500 data-[active=true]:text-white data-[active=true]:border-yellow-500',
                    negociacao:   'border-orange-200 data-[active=true]:bg-orange-500 data-[active=true]:text-white data-[active=true]:border-orange-500',
                    fechado:      'border-green-200 data-[active=true]:bg-green-600  data-[active=true]:text-white data-[active=true]:border-green-600',
                    perdido:      'border-red-200   data-[active=true]:bg-red-500    data-[active=true]:text-white data-[active=true]:border-red-500',
                  }
                  return (
                    <button
                      key={s}
                      type="button"
                      data-active={isSelected}
                      onClick={() => setValue('stage', s)}
                      className={`px-2 py-1.5 rounded-md border text-xs font-medium transition-all text-center ${
                        isSelected ? '' : 'bg-white text-slate-600 hover:bg-slate-50'
                      } ${colors[s]}`}
                    >
                      {LEAD_STAGE_LABELS[s]}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Valor */}
            <div className="space-y-1.5">
              <Label htmlFor="estimated_value">Valor total (R$)</Label>
              <Input id="estimated_value" type="number" step="0.01" min="0"
                {...register('estimated_value')} placeholder="0,00"
                readOnly={selectedProducts.length > 0}
                className={selectedProducts.length > 0 ? 'bg-teal-50 font-medium cursor-not-allowed' : ''} />
              {selectedProducts.length > 0 && <p className="text-[10px] text-teal-600">Calculado pela soma dos produtos — edite os valores acima</p>}
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
