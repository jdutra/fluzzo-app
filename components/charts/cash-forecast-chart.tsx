'use client'

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts'
import { formatCurrency, formatDate } from '@/lib/utils'
import type { VwCashForecast } from '@/lib/supabase/types'

interface CashForecastChartProps {
  data: VwCashForecast[]
}

export function CashForecastChart({ data }: CashForecastChartProps) {
  // Agrupa por período
  const grouped = data.reduce<
    Record<string, { period: string; total_in: number; total_out: number }>
  >((acc, row) => {
    const key = row.period ?? ''
    if (!acc[key]) {
      acc[key] = { period: key, total_in: 0, total_out: 0 }
    }
    acc[key].total_in += row.total_in ?? 0
    acc[key].total_out += row.total_out ?? 0
    return acc
  }, {})

  const chartData = Object.values(grouped)
    .sort((a, b) => a.period.localeCompare(b.period))
    .slice(-6) // últimos 6 meses
    .map((d) => ({
      ...d,
      label: formatDate(d.period, 'MMM/yy'),
      saldo: d.total_in - d.total_out,
    }))

  if (chartData.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
        Nenhum lançamento previsto
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={200}>
      <AreaChart data={chartData}>
        <defs>
          <linearGradient id="colorIn" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#10b981" stopOpacity={0.2} />
            <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="colorOut" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#f97316" stopOpacity={0.2} />
            <stop offset="95%" stopColor="#f97316" stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis
          dataKey="label"
          tick={{ fontSize: 11 }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tick={{ fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v) =>
            v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)
          }
        />
        <Tooltip
          formatter={(value: number, name: string) => [
            formatCurrency(value),
            name === 'total_in' ? 'Entradas' : 'Saídas',
          ]}
          contentStyle={{ borderRadius: 8, fontSize: 12 }}
        />
        <Legend
          formatter={(value) =>
            value === 'total_in' ? 'Entradas' : 'Saídas'
          }
        />
        <Area
          type="monotone"
          dataKey="total_in"
          stroke="#10b981"
          strokeWidth={2}
          fill="url(#colorIn)"
        />
        <Area
          type="monotone"
          dataKey="total_out"
          stroke="#f97316"
          strokeWidth={2}
          fill="url(#colorOut)"
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}
