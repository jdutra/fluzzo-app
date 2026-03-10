'use client'

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts'
import { formatCurrency, LEAD_STAGE_LABELS } from '@/lib/utils'
import type { VwPipeline } from '@/lib/supabase/types'

interface PipelineChartProps {
  data: VwPipeline[]
}

const STAGE_ORDER = ['qualificacao', 'diagnostico', 'proposta', 'negociacao']
const STAGE_COLORS: Record<string, string> = {
  qualificacao: '#94a3b8',
  diagnostico: '#60a5fa',
  proposta: '#fbbf24',
  negociacao: '#f97316',
}

export function PipelineChart({ data }: PipelineChartProps) {
  const chartData = STAGE_ORDER.map((stage) => {
    const found = data.find((d) => d.stage === stage)
    return {
      stage,
      label: LEAD_STAGE_LABELS[stage] ?? stage,
      lead_count: found?.lead_count ?? 0,
      total_value: found?.total_value ?? 0,
    }
  }).filter((d) => d.lead_count > 0)

  if (chartData.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
        Nenhum dado disponível
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <ResponsiveContainer width="100%" height={160}>
        <BarChart data={chartData} barSize={32}>
          <XAxis
            dataKey="label"
            tick={{ fontSize: 12 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis hide />
          <Tooltip
            formatter={(value: number, name: string) => {
              if (name === 'lead_count') return [value, 'Leads']
              return [formatCurrency(value), 'Valor']
            }}
            labelStyle={{ fontWeight: 600 }}
            contentStyle={{ borderRadius: 8, fontSize: 12 }}
          />
          <Bar dataKey="lead_count" radius={[4, 4, 0, 0]}>
            {chartData.map((entry) => (
              <Cell
                key={entry.stage}
                fill={STAGE_COLORS[entry.stage] ?? '#94a3b8'}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      {/* Summary table below chart */}
      <div className="space-y-1.5">
        {chartData.map((d) => (
          <div
            key={d.stage}
            className="flex items-center justify-between text-xs"
          >
            <div className="flex items-center gap-2">
              <div
                className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: STAGE_COLORS[d.stage] ?? '#94a3b8' }}
              />
              <span className="text-slate-600">{d.label}</span>
            </div>
            <div className="flex items-center gap-4 text-slate-700">
              <span>{d.lead_count} lead{d.lead_count !== 1 ? 's' : ''}</span>
              <span className="font-medium">{formatCurrency(d.total_value)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
