import { useEffect, useRef, useState, useCallback } from 'react'
import type { Network } from '../../types/network'
import type { KineticAlert } from '../../pages/KineticTerminal'
import type { WSEvent } from '../../types/attack'
import { wsUrl } from '../../api/client'
import { useInterfacesStore } from '../../store/interfaces'

interface Props {
  networks: Network[]
  /** Pre-select this network when switching to console view */
  initialTarget?: Network | null
  scanLines: string[]
  attackLines: string[]
  setAttackLines: React.Dispatch<React.SetStateAction<string[]>>
  pushAlert: (type: KineticAlert['type'], label: string, value: string) => void
}

type AttackType = 'handshake' | 'wps' | 'pmkid' | 'crack'

const ATTACK_META: Record<AttackType, { label: string; color: string; desc: string }> = {
  handshake: { label: 'WPA HANDSHAKE', color: '#00e5ff', desc: 'Capture 4-way handshake + deauth' },
  wps:       { label: 'WPS PIXIE',     color: '#ff9900', desc: 'WPS Pixie Dust / brute-force' },
  pmkid:     { label: 'PMKID CAPTURE', color: '#aa44ff', desc: 'Capture PMKID without client' },
  crack:     { label: 'CRACK HASH',    color: '#ff4444', desc: 'Offline aircrack-ng / hashcat' },
}

function TermLines({ lines, color }: { lines: string[]; color: string }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight
  }, [lines])

  return (
    <div
      ref={ref}
      className="flex-1 overflow-y-auto font-mono text-[10px] leading-relaxed p-3 bg-[#04090a] min-h-0"
      style={{ color: `${color}cc` }}
    >
      {lines.length === 0 && (
        <div className="text-[#2aff8a]/15 text-center mt-8 tracking-wider">
          — AWAITING TASK —
        </div>
      )}
      {lines.map((line, i) => (
        <div key={i}>
          <span className="text-[#2aff8a]/25 mr-2 select-none">{String(i + 1).padStart(4, '0')}</span>
          {line}
        </div>
      ))}
      <div className="animate-pulse inline-block w-2 h-3 bg-current align-middle" />
    </div>
  )
}

export function AttackConsole({
  networks, initialTarget, scanLines, attackLines, setAttackLines, pushAlert,
}: Props) {
  const iface = useInterfacesStore((s) => s.selected)
  const [attackType, setAttackType]   = useState<AttackType>('handshake')
  const [targetBssid, setTargetBssid] = useState('')
  const [wordlist, setWordlist]       = useState('/usr/share/wordlists/rockyou.txt')
  const [channel, setChannel]         = useState('6')
  const [running, setRunning]         = useState(false)
  const wsRef = useRef<WebSocket | null>(null)

  /* Apply pre-selected target from network grid */
  useEffect(() => {
    if (initialTarget) {
      setTargetBssid(initialTarget.bssid)
      if (initialTarget.channel) setChannel(String(initialTarget.channel))
    }
  }, [initialTarget?.bssid]) // eslint-disable-line react-hooks/exhaustive-deps

  const meta = ATTACK_META[attackType]

  const stop = useCallback(() => {
    wsRef.current?.close()
    wsRef.current = null
    setRunning(false)
  }, [])

  const launch = useCallback(() => {
    if (!targetBssid) return
    stop()
    setAttackLines([])
    setRunning(true)

    const paths: Record<AttackType, string> = {
      handshake: '/api/attacks/handshake',
      wps:       '/api/attacks/wps',
      pmkid:     '/api/attacks/pmkid',
      crack:     '/api/attacks/crack',
    }

    const configs: Record<AttackType, Record<string, unknown>> = {
      handshake: { interface: iface, bssid: targetBssid, channel: parseInt(channel) || 6, capture_timeout: 60 },
      wps:       { interface: iface, bssid: targetBssid, channel: parseInt(channel) || 6, mode: 'pixie' },
      pmkid:     { interface: iface, bssid: targetBssid, timeout: 60 },
      crack:     { bssid: targetBssid, wordlist, use_hashcat: false },
    }

    const ws = new WebSocket(wsUrl(paths[attackType]))
    wsRef.current = ws

    ws.onmessage = (msg) => {
      let ev: WSEvent
      try { ev = JSON.parse(msg.data) } catch { return }

      if (ev.type === 'ready') {
        ws.send(JSON.stringify(configs[attackType]))
        return
      }

      if (ev.message) {
        setAttackLines(prev => [...prev.slice(-500), ev.message!])
      }

      if (ev.type === 'data' && ev.data) {
        const d = ev.data as Record<string, unknown>
        if (d.password)  pushAlert('crack',     'PASSWORD FOUND',   String(d.password))
        if (d.pin)       pushAlert('crack',     'WPS PIN FOUND',    String(d.pin))
        if (d.file_path) pushAlert('handshake', 'HANDSHAKE SAVED',  String(d.file_path))
      }

      if (ev.type === 'done')  { setRunning(false); pushAlert('info', attackType.toUpperCase() + ' DONE', targetBssid) }
      if (ev.type === 'error') { setRunning(false); pushAlert('brute', 'ATTACK ERROR', ev.message ?? '') }
    }

    ws.onerror  = () => { setRunning(false) }
    ws.onclose  = () => { if (running) setRunning(false) }
  }, [attackType, iface, targetBssid, channel, wordlist, stop, pushAlert, setAttackLines, running])

  /* auto-fill target when networks list changes and bssid is empty */
  useEffect(() => {
    if (!targetBssid && networks.length > 0) setTargetBssid(networks[0].bssid)
  }, [networks, targetBssid])

  return (
    <div className="flex h-full gap-0">

      {/* Left: config panel */}
      <div className="w-56 flex flex-col border-r border-[#1a2f1a] bg-[#080c10] shrink-0">

        {/* Attack type tabs */}
        <div className="p-2 border-b border-[#1a2f1a]">
          <div className="text-[9px] text-[#2aff8a]/30 tracking-widest mb-2">ATTACK_MODE</div>
          <div className="flex flex-col gap-1">
            {(Object.keys(ATTACK_META) as AttackType[]).map(k => {
              const m = ATTACK_META[k]
              const active = k === attackType
              return (
                <button
                  key={k}
                  onClick={() => setAttackType(k)}
                  disabled={running}
                  className={`text-left px-2 py-1.5 rounded text-[10px] border transition-colors ${
                    active
                      ? 'border-opacity-50 bg-opacity-10'
                      : 'border-[#1a2f1a] text-[#2aff8a]/40 hover:text-[#2aff8a]/70 hover:bg-[#1a2f1a]'
                  }`}
                  style={active ? {
                    borderColor: `${m.color}50`,
                    backgroundColor: `${m.color}10`,
                    color: m.color,
                  } : undefined}
                >
                  <div className="font-bold">{m.label}</div>
                  <div className="text-[8px] opacity-60 mt-0.5">{m.desc}</div>
                </button>
              )
            })}
          </div>
        </div>

        {/* Target selector */}
        <div className="p-2 border-b border-[#1a2f1a] flex flex-col gap-2">
          <div className="text-[9px] text-[#2aff8a]/30 tracking-widest">TARGET</div>

          {networks.length > 0 ? (
            <select
              value={targetBssid}
              onChange={e => {
                setTargetBssid(e.target.value)
                const n = networks.find(n => n.bssid === e.target.value)
                if (n?.channel) setChannel(String(n.channel))
              }}
              disabled={running}
              className="bg-[#0d1f0d] border border-[#2aff8a]/20 rounded px-2 py-1 text-[10px] text-[#2aff8a] font-mono focus:outline-none w-full"
            >
              {networks.map(n => (
                <option key={n.bssid} value={n.bssid}>
                  {n.ssid ?? n.bssid} ({n.encryption ?? 'OPEN'})
                </option>
              ))}
            </select>
          ) : (
            <input
              value={targetBssid}
              onChange={e => setTargetBssid(e.target.value)}
              placeholder="AA:BB:CC:DD:EE:FF"
              disabled={running}
              className="bg-[#0d1f0d] border border-[#2aff8a]/20 rounded px-2 py-1 text-[10px] text-[#2aff8a] font-mono focus:outline-none w-full placeholder-[#2aff8a]/20"
            />
          )}

          <div className="flex gap-1">
            <div className="flex-1">
              <div className="text-[8px] text-[#2aff8a]/30 mb-1">CHANNEL</div>
              <input
                value={channel}
                onChange={e => setChannel(e.target.value)}
                disabled={running || attackType === 'crack'}
                className="bg-[#0d1f0d] border border-[#2aff8a]/20 rounded px-2 py-1 text-[10px] text-[#2aff8a] font-mono focus:outline-none w-full"
              />
            </div>
          </div>

          {attackType === 'crack' && (
            <div>
              <div className="text-[8px] text-[#2aff8a]/30 mb-1">WORDLIST</div>
              <input
                value={wordlist}
                onChange={e => setWordlist(e.target.value)}
                disabled={running}
                className="bg-[#0d1f0d] border border-[#2aff8a]/20 rounded px-2 py-1 text-[10px] text-[#2aff8a] font-mono focus:outline-none w-full"
              />
            </div>
          )}
        </div>

        {/* Launch / stop */}
        <div className="p-2 mt-auto">
          {running ? (
            <button
              onClick={stop}
              className="w-full py-2 text-[10px] font-bold tracking-widest border border-[#ff4444]/50 bg-[#ff4444]/10 hover:bg-[#ff4444]/20 text-[#ff6b6b] rounded transition-colors"
            >
              ■ ABORT
            </button>
          ) : (
            <button
              onClick={launch}
              disabled={!targetBssid}
              className="w-full py-2 text-[10px] font-bold tracking-widest rounded transition-colors disabled:opacity-30"
              style={{
                borderWidth: 1,
                borderStyle: 'solid',
                borderColor: `${meta.color}50`,
                backgroundColor: `${meta.color}10`,
                color: meta.color,
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = `${meta.color}20` }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = `${meta.color}10` }}
            >
              ▶ EXECUTE
            </button>
          )}
        </div>
      </div>

      {/* Right: dual terminal panes */}
      <div className="flex-1 flex flex-col min-w-0">

        {/* Attack output */}
        <div className="flex-1 flex flex-col min-h-0 border-b border-[#1a2f1a]">
          <div
            className="px-3 py-1 text-[9px] tracking-widest border-b border-[#1a2f1a] shrink-0"
            style={{ color: `${meta.color}70` }}
          >
            {meta.label} OUTPUT {running && <span className="animate-pulse">●</span>}
          </div>
          <TermLines lines={attackLines} color={meta.color} />
        </div>

        {/* Scan log */}
        <div className="h-36 flex flex-col min-h-0">
          <div className="px-3 py-1 text-[9px] text-[#2aff8a]/40 tracking-widest border-b border-[#1a2f1a] shrink-0">
            SCAN LOG
          </div>
          <TermLines lines={scanLines} color="#2aff8a" />
        </div>
      </div>
    </div>
  )
}
