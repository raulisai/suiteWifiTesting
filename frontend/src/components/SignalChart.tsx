import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Cell,
} from 'recharts'
import type { Network } from '../types/network'

interface SignalChartProps {
  networks: Network[]
}

function signalColor(power: number): string {
  if (power >= -50) return '#22c55e'   // excellent — green
  if (power >= -65) return '#eab308'   // good — yellow
  if (power >= -75) return '#f97316'   // fair — orange
  return '#ef4444'                      // poor — red
}

export function SignalChart({ networks }: SignalChartProps) {
  const data = networks
    .filter((n) => n.power !== null)
    .sort((a, b) => (b.power ?? -100) - (a.power ?? -100))
    .slice(0, 20)
    .map((n) => ({
      name: n.ssid ?? n.bssid.slice(-5),
      power: n.power ?? -100,
      fill: signalColor(n.power ?? -100),
    }))

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-gray-600 text-sm">
        Sin datos de señal
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} layout="vertical" margin={{ left: 10, right: 20 }}>
        <XAxis type="number" domain={[-100, 0]} tick={{ fill: '#6b7280', fontSize: 11 }} />
        <YAxis
          type="category"
          dataKey="name"
          width={80}
          tick={{ fill: '#9ca3af', fontSize: 10 }}
        />
        <Tooltip
          formatter={(v: number) => [`${v} dBm`, 'Señal']}
          contentStyle={{ background: '#1a1a1a', border: '1px solid #2e2e2e', fontSize: 12 }}
          labelStyle={{ color: '#e5e7eb' }}
        />
        <Bar dataKey="power" radius={[0, 3, 3, 0]}>
          {data.map((entry, i) => (
            <Cell key={i} fill={entry.fill} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
