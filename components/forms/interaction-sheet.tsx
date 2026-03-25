'use client'

import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation } from '@tanstack/react-query'
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
import { Loader2, CalendarClock } from 'lucide-react'
import type { LeadInteraction, InteractionType } from '@/lib/supabase/types'

const INTERACTION_TYPE_LABELS: Record<InteractionType, string> = {
  contato: 'Contato telefônico',
  reuniao: 'Reunião',
  proposta: 'Envio de proposta',
  email: 'E-mail',
  outro: 'Outro',
}

const INTERACTION_TYPES: InteractionType[] = ['contato', 'reuniao', 'proposta', 'email', 'outro']

const schema = z.object({
  type: z.enum(['contato', 'reuniao', 'proposta', 'email', 'outro'] as const),
  description: z.string().min(2, 'Descrição obrigatória'),
  interaction_date: z.string().min(1, 'Data obrigatória'),
  next_step: z.string().optional(),
  next_step_date: z.string().optional(),
})

type FormData = z.infer<typeof schema>

interface InteractionSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  leadId: string
  interaction: LeadInteraction | null
  onSuccess: () => void
}

export function InteractionSheet({ open, onOpenChange, leadId, interaction, onSuccess }: InteractionSheetProps) {
  const supabase = createClient()
  const isEditing = !!interaction

  const today = new Date().toISOString().split('T')[0]

  const { register, handleSubmit, reset, setValue, watch, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { type: 'contato', interaction_date: today },
  })

  useEffect(() => {
    if (open) {
      if (interaction) {
        reset({
          type: (interaction.type as InteractionType) ?? 'contato',
          description: interaction.description,
          interaction_date: interaction.interaction_date,
          next_step: '',
          next_step_date: '',
        })
      } else {
        reset({ type: 'contato', interaction_date: today, next_step: '', next_step_date: '' })
      }
    }
  }, [open, interaction, reset, today])

  const mutation = useMutation({
    mutationFn: async (data: FormData) => {
      // 1. Salva a interação
      const payload = {
        lead_id: leadId,
        type: data.type,
        description: data.description,
        interaction_date: data.interaction_date,
      }
      if (isEditing) {
        const { error } = await supabase.from('lead_interactions').update(payload).eq('id', interaction.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('lead_interactions').insert(payload)
        if (error) throw error
      }

      // 2. Se preencheu próximo passo, atualiza o lead
      if (data.next_step?.trim() || data.next_step_date) {
        const leadUpdate: Record<string, string | null> = {}
        if (data.next_step?.trim()) leadUpdate.next_step = data.next_step.trim()
        if (data.next_step_date) leadUpdate.next_step_date = data.next_step_date
        await supabase.from('leads').update(leadUpdate).eq('id', leadId)
      }
    },
    onSuccess: () => {
      toast({ title: isEditing ? 'Interação atualizada.' : 'Interação registrada.' })
      onSuccess()
    },
    onError: (e: Error) => toast({ title: 'Erro ao salvar.', description: e.message, variant: 'destructive' }),
  })

  const hasNextStep = !!(watch('next_step')?.trim() || watch('next_step_date'))

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader className="mb-6">
            <SheetTitle>{isEditing ? 'Editar Interação' : 'Registrar Interação'}</SheetTitle>
            <SheetDescription>Registro de contato ou atividade com o lead.</SheetDescription>
          </SheetHeader>
          <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="space-y-4">

            {/* Tipo + Data */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Tipo *</Label>
                <Select
                  value={watch('type')}
                  onValueChange={(v) => setValue('type', v as InteractionType)}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {INTERACTION_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>{INTERACTION_TYPE_LABELS[t]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="interaction_date">Data *</Label>
                <Input id="interaction_date" type="date" {...register('interaction_date')} />
                {errors.interaction_date && (
                  <p className="text-xs text-red-500">{errors.interaction_date.message}</p>
                )}
              </div>
            </div>

            {/* Descrição */}
            <div className="space-y-1.5">
              <Label htmlFor="description">O que aconteceu? *</Label>
              <Textarea
                id="description"
                {...register('description')}
                placeholder="Descreva o que foi discutido nesta interação..."
                rows={4}
              />
              {errors.description && <p className="text-xs text-red-500">{errors.description.message}</p>}
            </div>

            {/* Próximo passo */}
            <div className={`rounded-lg border p-4 space-y-3 transition-colors ${hasNextStep ? 'border-teal-200 bg-teal-50' : 'border-slate-200 bg-slate-50'}`}>
              <div className="flex items-center gap-2">
                <CalendarClock size={14} className={hasNextStep ? 'text-teal-600' : 'text-slate-400'} />
                <p className="text-sm font-medium text-slate-700">Próximo passo</p>
                <span className="text-[11px] text-slate-400">(opcional)</span>
              </div>
              <p className="text-xs text-slate-500">
                Defina aqui o próximo passo após esta interação. Ele ficará visível no card do lead.
              </p>
              <div className="space-y-1.5">
                <Label htmlFor="next_step" className="text-xs">Ação</Label>
                <Input
                  id="next_step"
                  {...register('next_step')}
                  placeholder="ex: Enviar proposta revisada, Agendar reunião..."
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="next_step_date" className="text-xs">Data prevista</Label>
                <Input
                  id="next_step_date"
                  type="date"
                  {...register('next_step_date')}
                />
              </div>
            </div>

            <SheetFooter className="pt-4 gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
              <Button type="submit" disabled={mutation.isPending} className="bg-teal-600 hover:bg-teal-700">
                {mutation.isPending && <Loader2 size={14} className="animate-spin" />}
                {isEditing ? 'Salvar' : 'Registrar'}
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>
    </>
  )
}
