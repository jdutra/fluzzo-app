import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { format, formatDistanceToNow, differenceInDays } from 'date-fns'
import { ptBR } from 'date-fns/locale'

// ─── Tailwind / className ─────────────────────────────────────

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// ─── Formatação de moeda ──────────────────────────────────────

export function formatCurrency(
  value: number | null | undefined,
  options?: Intl.NumberFormatOptions
): string {
  if (value == null) return '—'
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    ...options,
  }).format(value)
}

export function formatCurrencyCompact(value: number | null | undefined): string {
  if (value == null) return '—'
  if (Math.abs(value) >= 1_000_000) {
    return `R$ ${(value / 1_000_000).toFixed(1)}M`
  }
  if (Math.abs(value) >= 1_000) {
    return `R$ ${(value / 1_000).toFixed(1)}K`
  }
  return formatCurrency(value)
}

// ─── Formatação de datas ──────────────────────────────────────

export function formatDate(
  date: string | Date | null | undefined,
  fmt = 'dd/MM/yyyy'
): string {
  if (!date) return '—'
  return format(new Date(date), fmt, { locale: ptBR })
}

export function formatDatetime(date: string | Date | null | undefined): string {
  return formatDate(date, "dd/MM/yyyy 'às' HH:mm")
}

export function formatRelative(date: string | Date | null | undefined): string {
  if (!date) return '—'
  return formatDistanceToNow(new Date(date), { addSuffix: true, locale: ptBR })
}

export function daysSince(date: string | Date | null | undefined): number {
  if (!date) return 0
  return differenceInDays(new Date(), new Date(date))
}

// ─── Formatação de percentual ─────────────────────────────────

export function formatPercent(
  value: number | null | undefined,
  decimals = 1
): string {
  if (value == null) return '—'
  return `${(value * 100).toFixed(decimals)}%`
}

// ─── Lead stage labels ────────────────────────────────────────

export const LEAD_STAGE_LABELS: Record<string, string> = {
  qualificacao: 'Qualificação',
  diagnostico: 'Diagnóstico',
  proposta: 'Proposta',
  negociacao: 'Negociação',
  fechado: 'Aprovado',
  perdido: 'Declinado',
}

export const LEAD_STAGE_COLORS: Record<string, string> = {
  qualificacao: 'bg-slate-100 text-slate-700',
  diagnostico: 'bg-blue-100 text-blue-700',
  proposta: 'bg-yellow-100 text-yellow-700',
  negociacao: 'bg-orange-100 text-orange-700',
  fechado: 'bg-green-100 text-green-700',
  perdido: 'bg-red-100 text-red-700',
}

// ─── Project status labels ────────────────────────────────────

export const PROJECT_STATUS_LABELS: Record<string, string> = {
  ativo: 'Ativo',
  'on-hold': 'On Hold',
  concluido: 'Concluído',
  cancelado: 'Cancelado',
}

export const PROJECT_STATUS_COLORS: Record<string, string> = {
  ativo: 'bg-green-100 text-green-700',
  'on-hold': 'bg-yellow-100 text-yellow-700',
  concluido: 'bg-blue-100 text-blue-700',
  cancelado: 'bg-red-100 text-red-700',
}

// ─── Entry status labels ──────────────────────────────────────

export const ENTRY_STATUS_LABELS: Record<string, string> = {
  previsto: 'Previsto',
  faturado: 'Faturado',
  pago: 'Pago',
  cancelado: 'Cancelado',
}

export const ENTRY_STATUS_COLORS: Record<string, string> = {
  previsto: 'bg-slate-100 text-slate-700',
  faturado: 'bg-blue-100 text-blue-700',
  pago: 'bg-green-100 text-green-700',
  cancelado: 'bg-red-100 text-red-700',
}

// ─── Helpers ──────────────────────────────────────────────────

/** Primeiro dia do mês em formato ISO */
export function firstDayOfMonth(year: number, month: number): string {
  return new Date(year, month - 1, 1).toISOString().split('T')[0]
}

/** Último dia do mês em formato ISO */
export function lastDayOfMonth(year: number, month: number): string {
  return new Date(year, month, 0).toISOString().split('T')[0]
}

/** Gera datas de parcelas: primeiro dia dos próximos N meses */
export function generateInstallmentDates(
  startDate: Date,
  installments: number
): string[] {
  return Array.from({ length: installments }, (_, i) => {
    const d = new Date(startDate)
    d.setMonth(d.getMonth() + i)
    d.setDate(1)
    return d.toISOString().split('T')[0]
  })
}

/** Formata CNPJ */
export function formatCNPJ(cnpj: string | null | undefined): string {
  if (!cnpj) return '—'
  const clean = cnpj.replace(/\D/g, '')
  if (clean.length !== 14) return cnpj
  return clean.replace(
    /^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/,
    '$1.$2.$3/$4-$5'
  )
}

/** Iniciais do nome para avatar */
export function getInitials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0].toUpperCase())
    .join('')
}
