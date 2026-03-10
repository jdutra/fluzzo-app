'use client'

import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Toaster } from '@/components/ui/toaster'
import { toast } from '@/components/ui/use-toast'
import { Loader2, Building2, Save, CheckCircle2, Plus, Trash2, Mail, Phone, User } from 'lucide-react'
import { formatCNPJ } from '@/lib/utils'
import type { Company, CompanyContact } from '@/lib/supabase/types'

const schema = z.object({
  name: z.string().min(2, 'Nome obrigatório'),
  cnpj: z.string().optional(),
  city: z.string().optional(),
  state: z.string().max(2).optional(),
  encargo_simples: z.coerce.number().min(0).max(100),
  encargo_retirada: z.coerce.number().min(0).max(100),
})
type FormData = z.infer<typeof schema>

const contactSchema = z.object({
  name: z.string().min(2, 'Nome obrigatório'),
  role: z.string().optional(),
  email: z.string().email('E-mail inválido').optional().or(z.literal('')),
  phone: z.string().optional(),
})
type ContactFormData = z.infer<typeof contactSchema>

export default function EmpresaPage() {
  const supabase = createClient()
  const queryClient = useQueryClient()
  const [addingContact, setAddingContact] = useState(false)

  const { data: company, isLoading } = useQuery<Company | null>({
    queryKey: ['company'],
    queryFn: async () => {
      const { data, error } = await supabase.from('companies').select('*').single()
      if (error && error.code !== 'PGRST116') throw error
      return data ?? null
    },
  })

  const { data: contacts = [] } = useQuery<CompanyContact[]>({
    queryKey: ['company-contacts', company?.id],
    enabled: !!company?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('company_contacts')
        .select('*')
        .eq('company_id', company!.id)
        .order('is_primary', { ascending: false })
        .order('name')
      if (error) throw error
      return data ?? []
    },
  })

  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { encargo_simples: 15, encargo_retirada: 19 },
  })

  const contactForm = useForm<ContactFormData>({ resolver: zodResolver(contactSchema) })

  useEffect(() => {
    if (company) {
      reset({
        name: company.name,
        cnpj: company.cnpj ?? '',
        city: company.city ?? '',
        state: company.state ?? '',
        encargo_simples: company.encargo_simples * 100,
        encargo_retirada: company.encargo_retirada * 100,
      })
    }
  }, [company, reset])

  const mutation = useMutation({
    mutationFn: async (data: FormData) => {
      const payload = {
        name: data.name,
        cnpj: data.cnpj || null,
        city: data.city || null,
        state: data.state?.toUpperCase() || null,
        encargo_simples: data.encargo_simples / 100,
        encargo_retirada: data.encargo_retirada / 100,
      }
      if (company) {
        const { error } = await supabase.from('companies').update(payload).eq('id', company.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('companies').insert(payload)
        if (error) throw error
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['company'] })
      toast({ title: 'Dados da empresa salvos.' })
    },
    onError: (e: Error) => toast({ title: 'Erro ao salvar.', description: e.message, variant: 'destructive' }),
  })

  const addContactMutation = useMutation({
    mutationFn: async (data: ContactFormData) => {
      const { error } = await supabase.from('company_contacts').insert({
        company_id: company!.id,
        name: data.name,
        role: data.role || null,
        email: data.email || null,
        phone: data.phone || null,
        is_primary: contacts.length === 0,
      })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['company-contacts', company?.id] })
      contactForm.reset()
      setAddingContact(false)
      toast({ title: 'Contato adicionado.' })
    },
    onError: (e: Error) => toast({ title: 'Erro ao adicionar contato.', description: e.message, variant: 'destructive' }),
  })

  const deleteContactMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('company_contacts').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['company-contacts', company?.id] })
      toast({ title: 'Contato removido.' })
    },
  })

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-40 bg-slate-100 rounded animate-pulse" />
        <div className="h-64 bg-slate-100 rounded-lg animate-pulse" />
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">Empresa</h2>
        <p className="text-muted-foreground mt-1 text-sm">Parâmetros globais usados nos cálculos do sistema</p>
      </div>

      {/* Dados salvos — resumo visual */}
      {company && (
        <Card className="border-emerald-200 bg-emerald-50">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-start gap-3">
              <CheckCircle2 size={18} className="text-emerald-600 mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-emerald-800 mb-2">Dados cadastrados</p>
                <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
                  <div>
                    <span className="text-emerald-700 font-medium">Razão Social: </span>
                    <span className="text-emerald-900">{company.name}</span>
                  </div>
                  {company.cnpj && (
                    <div>
                      <span className="text-emerald-700 font-medium">CNPJ: </span>
                      <span className="text-emerald-900">{formatCNPJ(company.cnpj)}</span>
                    </div>
                  )}
                  {(company.city || company.state) && (
                    <div>
                      <span className="text-emerald-700 font-medium">Localização: </span>
                      <span className="text-emerald-900">
                        {[company.city, company.state].filter(Boolean).join(' — ')}
                      </span>
                    </div>
                  )}
                  <div>
                    <span className="text-emerald-700 font-medium">Encargo Simples: </span>
                    <span className="text-emerald-900">{(company.encargo_simples * 100).toFixed(1)}%</span>
                  </div>
                  <div>
                    <span className="text-emerald-700 font-medium">Encargo Retirada: </span>
                    <span className="text-emerald-900">{(company.encargo_retirada * 100).toFixed(1)}%</span>
                  </div>
                </div>
                <p className="text-xs text-emerald-600 mt-2">Para alterar, edite os campos abaixo e clique em &quot;Salvar alterações&quot;.</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="space-y-6">
        {/* Dados básicos */}
        <Card>
          <CardHeader className="pb-4">
            <div className="flex items-center gap-2">
              <Building2 size={16} className="text-slate-500" />
              <CardTitle className="text-base">Dados da Empresa</CardTitle>
            </div>
            <CardDescription>Identificação e dados cadastrais</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="name">Razão Social *</Label>
              <Input id="name" {...register('name')} placeholder="Nome da empresa" />
              {errors.name && <p className="text-xs text-red-500">{errors.name.message}</p>}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="cnpj">CNPJ</Label>
                <Input id="cnpj" {...register('cnpj')} placeholder="00.000.000/0001-00" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="state">UF</Label>
                <Input id="state" {...register('state')} placeholder="SP" maxLength={2} className="uppercase" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="city">Cidade</Label>
              <Input id="city" {...register('city')} placeholder="São Paulo" />
            </div>
          </CardContent>
        </Card>

        {/* Encargos */}
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-base">Parâmetros de Encargos</CardTitle>
            <CardDescription>
              Usados para estimativa de margem nos lançamentos. Regime Simples Nacional.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="encargo_simples">Encargo Simples (%)</Label>
                <div className="relative">
                  <Input id="encargo_simples" type="number" step="0.1" min="0" max="100"
                    {...register('encargo_simples')} className="pr-8" />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span>
                </div>
                <p className="text-xs text-muted-foreground">Alíquota do Simples sobre receita (ex: 15%)</p>
                {errors.encargo_simples && <p className="text-xs text-red-500">{errors.encargo_simples.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="encargo_retirada">Encargo Retirada (%)</Label>
                <div className="relative">
                  <Input id="encargo_retirada" type="number" step="0.1" min="0" max="100"
                    {...register('encargo_retirada')} className="pr-8" />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span>
                </div>
                <p className="text-xs text-muted-foreground">Encargo sobre retirada do sócio (ex: 19%)</p>
                {errors.encargo_retirada && <p className="text-xs text-red-500">{errors.encargo_retirada.message}</p>}
              </div>
            </div>

            <div className="p-3 bg-slate-50 rounded-lg text-sm text-slate-600 space-y-1">
              <p className="font-medium text-slate-700">Como são usados:</p>
              <p>• <strong>Encargo Simples:</strong> deduzido da receita para calcular margem bruta estimada</p>
              <p>• <strong>Encargo Retirada:</strong> aplicado sobre retirada do sócio nos relatórios gerenciais</p>
            </div>
          </CardContent>
        </Card>

        <Button type="submit" disabled={mutation.isPending} className="bg-sky-600 hover:bg-sky-700">
          {mutation.isPending ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
          Salvar alterações
        </Button>
      </form>

      {/* Contatos da empresa */}
      {company && (
        <Card>
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">Contatos</CardTitle>
                <CardDescription>Pessoas de contato da empresa (relacionamento, financeiro etc.)</CardDescription>
              </div>
              <Button variant="outline" size="sm" onClick={() => setAddingContact(!addingContact)}>
                <Plus size={14} />
                Novo contato
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Formulário inline para novo contato */}
            {addingContact && (
              <form onSubmit={contactForm.handleSubmit((d) => addContactMutation.mutate(d))}
                className="p-3 border rounded-lg space-y-3 bg-slate-50">
                <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Novo contato</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Nome *</Label>
                    <Input {...contactForm.register('name')} placeholder="Nome" className="h-8 text-sm" />
                    {contactForm.formState.errors.name && (
                      <p className="text-xs text-red-500">{contactForm.formState.errors.name.message}</p>
                    )}
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Área / Cargo</Label>
                    <Input {...contactForm.register('role')} placeholder="ex: Financeiro" className="h-8 text-sm" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">E-mail</Label>
                    <Input {...contactForm.register('email')} type="email" placeholder="email@empresa.com" className="h-8 text-sm" />
                    {contactForm.formState.errors.email && (
                      <p className="text-xs text-red-500">{contactForm.formState.errors.email.message}</p>
                    )}
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Telefone</Label>
                    <Input {...contactForm.register('phone')} placeholder="(11) 99999-9999" className="h-8 text-sm" />
                  </div>
                </div>
                <div className="flex gap-2 justify-end">
                  <Button type="button" variant="ghost" size="sm" onClick={() => setAddingContact(false)}>Cancelar</Button>
                  <Button type="submit" size="sm" disabled={addContactMutation.isPending} className="bg-sky-600 hover:bg-sky-700">
                    {addContactMutation.isPending && <Loader2 size={12} className="animate-spin" />}
                    Adicionar
                  </Button>
                </div>
              </form>
            )}

            {/* Lista de contatos */}
            {contacts.length === 0 && !addingContact && (
              <p className="text-sm text-slate-400 text-center py-4">Nenhum contato cadastrado ainda.</p>
            )}
            {contacts.map((c) => (
              <div key={c.id} className="flex items-start justify-between gap-3 p-3 rounded-lg border bg-white">
                <div className="flex items-start gap-2.5 min-w-0">
                  <div className="mt-0.5 h-7 w-7 rounded-full bg-slate-100 flex items-center justify-center shrink-0">
                    <User size={13} className="text-slate-500" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-slate-800 text-sm">{c.name}</p>
                      {c.is_primary && (
                        <span className="text-xs bg-sky-50 text-sky-700 border border-sky-200 px-1.5 py-0.5 rounded-full">
                          Principal
                        </span>
                      )}
                      {c.role && <span className="text-xs text-slate-500">{c.role}</span>}
                    </div>
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
                      {c.email && (
                        <a href={`mailto:${c.email}`} className="flex items-center gap-1 text-xs text-sky-600 hover:underline">
                          <Mail size={10} />{c.email}
                        </a>
                      )}
                      {c.phone && (
                        <a href={`tel:${c.phone}`} className="flex items-center gap-1 text-xs text-slate-600 hover:underline">
                          <Phone size={10} />{c.phone}
                        </a>
                      )}
                    </div>
                  </div>
                </div>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-red-400 hover:text-red-600 hover:bg-red-50 shrink-0"
                  onClick={() => deleteContactMutation.mutate(c.id)}>
                  <Trash2 size={13} />
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Toaster />
    </div>
  )
}
