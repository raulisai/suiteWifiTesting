interface VulnBadgeProps {
  encryption: string | null
  wpsEnabled: boolean
  wpsLocked: boolean
}

export function VulnBadge({ encryption, wpsEnabled, wpsLocked }: VulnBadgeProps) {
  const badges: { label: string; color: string }[] = []

  if (encryption === 'WEP') {
    badges.push({ label: 'WEP', color: 'bg-red-600 text-white' })
  }
  if (encryption === 'OPN') {
    badges.push({ label: 'OPEN', color: 'bg-red-500 text-white' })
  }
  if (wpsEnabled && !wpsLocked) {
    badges.push({ label: 'WPS', color: 'bg-orange-500 text-white' })
  }
  if (wpsEnabled && wpsLocked) {
    badges.push({ label: 'WPS-LCK', color: 'bg-gray-600 text-gray-300' })
  }
  if (encryption === 'WPA2' || encryption === 'WPA') {
    badges.push({ label: encryption, color: 'bg-yellow-700 text-yellow-100' })
  }
  if (encryption === 'WPA3') {
    badges.push({ label: 'WPA3', color: 'bg-green-700 text-green-100' })
  }

  return (
    <div className="flex flex-wrap gap-1">
      {badges.map((b) => (
        <span
          key={b.label}
          className={`px-1.5 py-0.5 rounded text-[10px] font-bold font-mono ${b.color}`}
        >
          {b.label}
        </span>
      ))}
    </div>
  )
}
