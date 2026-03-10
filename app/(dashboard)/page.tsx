import { createClient } from '@/lib/supabase/server'
import { formatCurrency, formatCurrencyCompact, LEAD_STAGE_LABELS } from '@/lib/utils'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  TrendingUp,
  FolderKanban,
  Receipt,
  AlertCircle,
  ArrowUpRight,
} from 'lucide-react'
import Link from 'next/link'
import { PipelineChart } from '@/components/charts/pipeline-chart'
import { CashForecastChart } from '@/components/charts/cash-forecast-chart'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function DashboardPage() {
  const supabase = createClient()

  // KPI 1: Leads ativos (não fechados/perdidos)
  const { count: activeLeads } = await supabase
    .from('leads')
    .select('*', { count: 'exact', head: true })
    .not('stage', 'in', '(fechado,perdido)')

  // KPI 2: Projetos abertos
  const { count: openProjects } = await supabase
    .from('projects')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'ativo')

  // KPI 3: Receita prevista (lançamentos previstos/faturados)
  const { data: revenueData } = await supabase
    .from('entries')
    .select('amount')
    .in('status', ['previsto', 'faturado'])

  const forecastRevenue =
    revenueData?.reduce((acc, e) => acc + (e.amount > 0 ? e.amount : 0), 0) ?? 0

  // KPI 4: A receber (lançamentos faturados não pagos)
  const { data: receivableData } = await supabase
    .from('entries')
    .select('amount')
    .eq('status', 'faturado')
    .is('paid_at', null)

  const totalReceivable =
    receivableData?.reduce((acc, e) => acc + e.amount, 0) ?? 0

  // Pipeline por estágio
  const { data: pipelineData } = await supabase.from('vw_pipeline').select('*')

  // Leads com follow-up atrasado (sem interação > 7 dias)
  const sevenDaysAgo = new Date()
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
  const isoDate = sevenDaysAgo.toISOString().split('T')[0]

  const { data: overdueLeads } = await supabase
    .from('leads')
    .select(`
      id, title, stage, estimated_value,
      lead_interactions(interaction_date)
    `)
    .not('stage', 'in', '(fechado,perdido)')
    .order('updated_at', { ascending: true })
    .limit(5)

  // Filtrar leads sem interação recente no cliente (simplificado)
  const staleLeads =
    overdueLeads?.filter((lead) => {
      const interactions = lead.lead_interactions as { interaction_date: string }[]
      if (!interactions || interactions.length === 0) return true
      const lastInteraction = interactions.sort(
        (a, b) =>
          new Date(b.interaction_date).getTime() -
          new Date(a.interaction_date).getTime()
      )[0]
      return lastInteraction.interaction_date < isoDate
    }) ?? []

  // Saldo a receber por projeto (top 5)
  const { data: receivables } = await supabase
    .from('vw_receivables')
    .select('*')
    .gt('balance_due', 0)
    .order('balance_due', { ascending: false })
    .limit(5)

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">Dashboard</h2>
        <p className="text-muted-foreground mt-1">
          Visão geral do negócio em tempo real
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="Leads Ativos"
          value={String(activeLeads ?? 0)}
          description="No pipeline"
          icon={<TrendingUp size={18} className="text-teal-600" />}
          href="/leads"
          color="sky"
        />
        <KpiCard
          title="Projetos Abertos"
          value={String(openProjects ?? 0)}
          description="Em andamento"
          icon={<FolderKanban size={18} className="text-violet-600" />}
          href="/projetos"
          color="violet"
        />
        <KpiCard
          title="Receita Prevista"
          value={formatCurrencyCompact(forecastRevenue)}
          description="Previsto + faturado"
          icon={<Receipt size={18} className="text-emerald-600" />}
          href="/lancamentos"
          color="emerald"
        />
        <KpiCard
          title="A Receber"
          value={formatCurrencyCompact(totalReceivable)}
          description="Faturado não pago"
          icon={<Receipt size={18} className="text-orange-600" />}
          href="/lancamentos"
          color="orange"
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Pipeline Chart */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">
              Pipeline por Estágio
            </CardTitle>
            <CardDescription>Leads ativos e valor potencial</CardDescription>
          </CardHeader>
          <CardContent>
            {pipelineData && pipelineData.length > 0 ? (
              <PipelineChart data={pipelineData} />
            ) : (
              <EmptyState message="Nenhum lead no pipeline" href="/leads" />
            )}
          </CardContent>
        </Card>

        {/* Receivables */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base font-semibold">
                  Saldo a Receber
                </CardTitle>
                <CardDescription>Top projetos em aberto</CardDescription>
              </div>
              <Link
                href="/lancamentos"
                className="text-xs text-teal-600 hover:underline flex items-center gap-1"
              >
                Ver todos <ArrowUpRight size={12} />
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            {receivables && receivables.length > 0 ? (
              <div className="space-y-3">
                {receivables.map((r) => (
                  <div
                    key={r.project_id}
                    className="flex items-center justify-between py-2 border-b last:border-0"
                  >
                    <div>
                      <p className="text-sm font-medium text-slate-800">
                        {r.client_name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Projeto #{r.code}
                      </p>
                    </div>
                    <span className="text-sm font-semibold text-emerald-700">
                      {formatCurrency(r.balance_due)}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState message="Nenhum saldo a receber" href="/projetos" />
            )}
          </CardContent>
        </Card>
      </div>

      {/* Stale Leads Alert */}
      {staleLeads.length > 0 && (
        <Card className="border-orange-200 bg-orange-50">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <AlertCircle size={16} className="text-orange-600" />
              <CardTitle className="text-base font-semibold text-orange-800">
                Leads sem interação há mais de 7 dias ({staleLeads.length})
              </CardTitle>
            </div>
            <CardDescription className="text-orange-700">
              Atenção: leads que precisam de follow-up
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {staleLeads.slice(0, 5).map((lead) => (
                <Link
                  key={lead.id}
                  href={`/leads/${lead.id}`}
                  className="flex items-center justify-between p-3 bg-white rounded-lg border border-orange-100 hover:border-orange-300 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <Badge
                      variant="secondary"
                      className="text-xs capitalize"
                    >
                      {LEAD_STAGE_LABELS[lead.stage] ?? lead.stage}
                    </Badge>
                    <span className="text-sm font-medium text-slate-800">
                      {lead.title}
                    </span>
                  </div>
                  <span className="text-sm text-muted-foreground">
                    {lead.estimated_value
                      ? formatCurrency(lead.estimated_value)
                      : '—'}
                  </span>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

// ─── Sub-components ───────────────────────────────────────────

interface KpiCardProps {
  title: string
  value: string
  description: string
  icon: React.ReactNode
  href: string
  color: 'sky' | 'violet' | 'emerald' | 'orange'
}

function KpiCard({ title, value, description, icon, href, color }: KpiCardProps) {
  const bgMap = {
    sky: 'bg-teal-50',
    violet: 'bg-violet-50',
    emerald: 'bg-emerald-50',
    orange: 'bg-orange-50',
  }

  return (
    <Link href={href}>
      <Card className="hover:shadow-md transition-shadow cursor-pointer">
        <CardContent className="p-5">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-muted-foreground">{title}</p>
              <p className="text-2xl font-bold text-slate-900 mt-1">{value}</p>
              <p className="text-xs text-muted-foreground mt-1">{description}</p>
            </div>
            <div
              className={`w-10 h-10 rounded-lg ${bgMap[color]} flex items-center justify-center`}
            >
              {icon}
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}

function EmptyState({ message, href }: { message: string; href: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-32 text-center">
      <p className="text-sm text-muted-foreground">{message}</p>
      <Link
        href={href}
        className="text-xs text-teal-600 hover:underline mt-2"
      >
        Adicionar agora
      </Link>
    </div>
  )
}
