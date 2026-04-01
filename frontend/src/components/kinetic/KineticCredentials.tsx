import { useCallback, useEffect, useRef, useState } from 'react'
import { useCredentialsStore } from '../../store/credentials'
import { credentialsApi }      from '../../api/credentials'
import { wsUrl }               from '../../api/client'
import type { Handshake }      from '../../types/credential'

const ATTACK_BADGE: Record<string, string> = {
  wpa_handshake:  'border-[#ffaa00]/40 text-[#ffaa00]',
  wps_pixie:      'border-[#ff6b35]/40 text-[#ff6b35]',
  wps_bruteforce: 'border-[#ff6b35]/60 text-[#ff6b35]',
  pmkid:          'border-[#2aff8a]/30 text-[#2aff8a]',
}

const FT_COLOR: Record<string, string> = {
  hc22000: '#2aff8a',
  cap:     '#ffaa00',
  pcapng:  '#ff6b35',
}

// ── helpers ──────────────────────────────────────────────────────────────────

/** Colour a line of hc22000 / hex-dump output */
function lineColor(line: string): string {
  if (line.startsWith('#'))          return 'text-[#2aff8a]/30'
  if (line.startsWith('WPA*02*'))    return 'text-[#2aff8a]'
  if (line.startsWith('WPA*01*'))    return 'text-[#ffaa00]'
  if (/^[0-9a-f]{8}  /.test(line))  return 'text-[#a8f0c6]/80'
  if (line === '')                   return 'text-transparent'
  return 'text-[#a8f0c6]/60'
}

/** Colour a crack-log event line */
function crackLineColor(type: string): string {
  if (type === 'credential') return 'text-[#2aff8a] font-bold'
  if (type === 'error')      return 'text-[#ff4444]'
  if (type === 'start')      return 'text-[#ffaa00]'
  if (type === 'step')       return 'text-[#a8f0c6]/70'
  if (type === 'done')       return 'text-[#2aff8a]/60'
  return 'text-[#a8f0c6]/45'
}

type Tab      = 'credentials' | 'hashes'
type Wordlist = { name: string; path: string; size_mb: number }

// ── component ─────────────────────────────────────────────────────────────────

export function KineticCredentials() {
  const {
    credentials, loading,            fetchCredentials, deleteCredential,
    handshakes,  loadingHandshakes,  fetchHandshakes,  deleteHandshake,
  } = useCredentialsStore()

  // ── general ──
  const [tab,    setTab]    = useState<Tab>('credentials')
  const [search, setSearch] = useState('')

  // ── file viewer ──
  const [activeHash,  setActiveHash]  = useState<Handshake | null>(null)
  const [content,     setContent]     = useState<string | null>(null)
  const [loadingFile, setLoadingFile] = useState(false)
  const termRef = useRef<HTMLDivElement>(null)

  // ── crack panel ──
  const [crackTarget, setCrackTarget] = useState<Handshake | null>(null)
  const [wordlists,   setWordlists]   = useState<Wordlist[]>([])
  const [loadingWL,   setLoadingWL]   = useState(false)
  const [crackWL,     setCrackWL]     = useState('')
  const [customWL,    setCustomWL]    = useState('')
  const [useHashcat,  setUseHashcat]  = useState(false)
  const [crackMask,   setCrackMask]   = useState('')
  const [cracking,    setCracking]    = useState(false)
  const [crackLog,    setCrackLog]    = useState<{ text: string; type: string }[]>([])
  const [crackResult, setCrackResult] = useState<{ password: string; cracker: string } | null>(null)
  const crackRef = useRef<HTMLDivElement>(null)
  const wsRef    = useRef<WebSocket | null>(null)

  // ── on mount / tab switch ────────────────────────────────────────────────────
  useEffect(() => { fetchCredentials() }, [fetchCredentials])
  useEffect(() => { fetchHandshakes()  }, [fetchHandshakes])

  useEffect(() => {
    if (tab === 'hashes' && handshakes.length > 0 && !activeHash) {
      loadFileContent(handshakes[0])
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, handshakes])

  useEffect(() => {
    if (termRef.current) termRef.current.scrollTop = termRef.current.scrollHeight
  }, [content])
  useEffect(() => {
    if (crackRef.current) crackRef.current.scrollTop = crackRef.current.scrollHeight
  }, [crackLog])

  // ── file-content loader ───────────────────────────────────────────────────
  const loadFileContent = useCallback(async (h: Handshake) => {
    setActiveHash(h)
    setContent(null)
    setLoadingFile(true)
    try {
      const text = await credentialsApi.handshakeContent(h.id)
      setContent(text)
    } catch {
      setContent(`# ERROR: could not read file\n# ${h.file_path}`)
    } finally {
      setLoadingFile(false)
    }
  }, [])

  // ── wordlist loader ───────────────────────────────────────────────────────
  const fetchWordlists = useCallback(async () => {
    setLoadingWL(true)
    try {
      const data = await credentialsApi.listWordlists()
      setWordlists(data)
      if (data.length > 0) setCrackWL((prev) => prev || data[0].path)
    } catch { /* ignore */ }
    finally { setLoadingWL(false) }
  }, [])

  // ── open crack panel ──────────────────────────────────────────────────────
  const openCrack = useCallback((h: Handshake) => {
    setCrackTarget(h)
    setCrackLog([])
    setCrackResult(null)
    setCracking(false)
    wsRef.current?.close()
    if (wordlists.length === 0) fetchWordlists()
  }, [wordlists.length, fetchWordlists])

  // ── start crack ───────────────────────────────────────────────────────────
  const startCrack = useCallback(() => {
    if (!crackTarget) return
    const wl = customWL.trim() || crackWL
    if (!wl && !crackMask) {
      setCrackLog([{ text: 'Select a wordlist or enter a hashcat mask first.', type: 'error' }])
      return
    }
    setCracking(true)
    setCrackLog([])
    setCrackResult(null)

    const ws = new WebSocket(wsUrl('/api/attacks/crack'))
    wsRef.current = ws

    ws.onopen = () => {
      ws.send(JSON.stringify({
        handshake_id: crackTarget.id,
        wordlist:     crackMask ? null : wl,
        use_hashcat:  useHashcat,
        mask:         crackMask || null,
      }))
    }
    ws.onmessage = (e: MessageEvent) => {
      try {
        const evt = JSON.parse(e.data as string) as {
          type: string; message: string; data?: { password: string; cracker: string }
        }
        if (evt.type === 'ready') return
        setCrackLog((prev) => [...prev, { text: evt.message, type: evt.type }])
        if (evt.type === 'credential' && evt.data) {
          setCrackResult(evt.data)
          fetchCredentials()
        }
        if (evt.type === 'done' || evt.type === 'error') setCracking(false)
      } catch { /* ignore */ }
    }
    ws.onerror = () => {
      setCrackLog((prev) => [...prev, { text: 'WebSocket connection error.', type: 'error' }])
      setCracking(false)
    }
    ws.onclose = () => setCracking(false)
  }, [crackTarget, customWL, crackWL, crackMask, useHashcat, fetchCredentials])

  const stopCrack = useCallback(() => {
    wsRef.current?.close()
    setCracking(false)
    setCrackLog((prev) => [...prev, { text: 'Cracking stopped by user.', type: 'info' }])
  }, [])

  // ── misc ─────────────────────────────────────────────────────────────────
  const handleCopy = (text: string) => navigator.clipboard.writeText(text).catch(() => {})

  const tabCls = (t: Tab) =>
    `px-4 py-1.5 text-[10px] font-bold tracking-widest rounded-t border-b-0 transition-all ${
      tab === t
        ? 'border border-[#2aff8a]/40 border-b-[#080c10] text-[#2aff8a] bg-[#080c10]'
        : 'border border-transparent text-[#2aff8a]/30 hover:text-[#2aff8a]/60'
    }`

  const filteredCreds = credentials.filter((c) =>
    c.bssid.toLowerCase().includes(search.toLowerCase()) ||
    (c.ssid ?? '').toLowerCase().includes(search.toLowerCase()) ||
    c.attack_type.toLowerCase().includes(search.toLowerCase())
  )

  const filteredHashes = handshakes.filter((h) =>
    h.bssid.toLowerCase().includes(search.toLowerCase()) ||
    (h.ssid ?? '').toLowerCase().includes(search.toLowerCase()) ||
    h.file_type.toLowerCase().includes(search.toLowerCase())
  )

  // ── render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full p-5 gap-4 overflow-hidden">

      {/* Header */}
      <div className="flex items-center justify-between shrink-0">
        <div>
          <div className="text-[10px] tracking-widest text-[#2aff8a]/50 mb-0.5">RECOVERED</div>
          <h2 className="text-[#2aff8a] font-bold tracking-wider text-sm">CREDENTIALS</h2>
        </div>
        <span className="text-[10px] font-mono px-2 py-1 rounded border border-[#2aff8a]/15 text-[#2aff8a]/35 tracking-widest">
          {credentials.length} creds · {handshakes.length} hashes
        </span>
      </div>

      {/* Tabs + Search */}
      <div className="flex items-end justify-between shrink-0 border-b border-[#1a2f1a]">
        <div className="flex gap-1">
          <button className={tabCls('credentials')} onClick={() => setTab('credentials')}>
            CREDENTIALS{credentials.length > 0 && <span className="ml-1.5 text-[#2aff8a]/40">{credentials.length}</span>}
          </button>
          <button className={tabCls('hashes')} onClick={() => setTab('hashes')}>
            HASHES{handshakes.length > 0 && <span className="ml-1.5 text-[#2aff8a]/40">{handshakes.length}</span>}
          </button>
        </div>
        <input
          className="mb-1.5 bg-[#0d1f0d] border border-[#1a2f1a] rounded px-2.5 py-1 text-[10px] font-mono text-[#a8f0c6] focus:outline-none focus:border-[#2aff8a]/50 w-48"
          placeholder="BSSID / SSID / type..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* ── CREDENTIALS TAB ── */}
      {tab === 'credentials' && (
        loading ? (
          <div className="text-[#2aff8a]/30 text-xs animate-pulse tracking-widest">LOADING...</div>
        ) : filteredCreds.length === 0 ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center text-[#2aff8a]/20 text-[11px] tracking-widest">
              <div className="text-3xl mb-3">🔒</div>
              {credentials.length === 0
                ? <><div>NO CREDENTIALS FOUND</div><div className="mt-1">RUN AN ATTACK AND CRACK A HANDSHAKE</div></>
                : <div>NO RESULTS FOR SEARCH</div>}
            </div>
          </div>
        ) : (
          <div className="flex-1 min-h-0 overflow-y-auto border border-[#1a2f1a] rounded">
            <table className="w-full text-[10px] font-mono">
              <thead className="sticky top-0 bg-[#080c10]">
                <tr className="border-b border-[#1a2f1a] text-[#2aff8a]/30">
                  <th className="text-left py-2 px-3 tracking-wider">NETWORK</th>
                  <th className="text-left py-2 px-3 tracking-wider">PASSWORD</th>
                  <th className="text-left py-2 px-3 tracking-wider">TYPE</th>
                  <th className="text-left py-2 px-3 tracking-wider">CRACKER</th>
                  <th className="text-left py-2 px-3 tracking-wider">FOUND</th>
                  <th className="text-left py-2 px-3"></th>
                </tr>
              </thead>
              <tbody>
                {filteredCreds.map((c) => (
                  <tr key={c.id} className="border-b border-[#1a2f1a]/40 hover:bg-[#2aff8a]/5 transition-colors">
                    <td className="py-2.5 px-3">
                      <div className="text-[#a8f0c6]">{c.ssid ?? <span className="text-[#2aff8a]/20 italic">hidden</span>}</div>
                      <div className="text-[#2aff8a]/30 text-[9px] mt-0.5">{c.bssid}</div>
                    </td>
                    <td className="py-2.5 px-3">
                      <div className="flex items-center gap-2">
                        <span className="text-[#2aff8a] font-bold text-[11px] bg-[#2aff8a]/10 px-2 py-1 rounded border border-[#2aff8a]/30 select-all">
                          {c.password}
                        </span>
                        <button
                          onClick={() => handleCopy(c.password)}
                          className="px-1.5 py-0.5 rounded border border-[#2aff8a]/20 text-[#2aff8a]/40 hover:text-[#2aff8a] hover:border-[#2aff8a]/50 text-[8px] transition-colors"
                          title="Copy password"
                        >
                          COPY
                        </button>
                      </div>
                      {c.wps_pin && (
                        <div className="text-[#ff6b35]/50 text-[8px] mt-1">PIN: {c.wps_pin}</div>
                      )}
                    </td>
                    <td className="py-2.5 px-3">
                      <span className={`px-2 py-0.5 rounded border text-[9px] font-bold ${ATTACK_BADGE[c.attack_type] ?? 'border-[#2aff8a]/20 text-[#2aff8a]/40'}`}>
                        {c.attack_type.toUpperCase()}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-[#2aff8a]/50">{c.cracked_by}</td>
                    <td className="py-2.5 px-3 text-[#2aff8a]/30">{new Date(c.found_at).toLocaleString()}</td>
                    <td className="py-2.5 px-3">
                      <button onClick={() => deleteCredential(c.id)} className="px-2 py-0.5 rounded border border-[#ff4444]/20 text-[#ff4444]/40 hover:text-[#ff4444] hover:border-[#ff4444]/50 text-[9px] transition-colors">DEL</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {/* ── HASHES TAB ── */}
      {tab === 'hashes' && (
        loadingHandshakes ? (
          <div className="text-[#2aff8a]/30 text-xs animate-pulse tracking-widest">LOADING...</div>
        ) : handshakes.length === 0 ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center text-[#2aff8a]/20 text-[11px] tracking-widest">
              <div className="text-3xl mb-3">📡</div>
              <div>NO HASHES CAPTURED</div>
              <div className="mt-1">CAPTURE A HANDSHAKE OR PMKID FIRST</div>
            </div>
          </div>
        ) : (
          <div className="flex flex-1 min-h-0 gap-3">

            {/* ── Left: file list ── */}
            <div className="flex flex-col w-72 shrink-0 bg-[#030608] border border-[#1a2f1a] rounded overflow-hidden font-mono text-[10px]">
              <div className="flex items-center gap-1.5 px-3 py-2 border-b border-[#1a2f1a] bg-[#0a1a0a] shrink-0">
                <span className="w-2.5 h-2.5 rounded-full bg-[#ff4444]/60" />
                <span className="w-2.5 h-2.5 rounded-full bg-[#ffaa00]/60" />
                <span className="w-2.5 h-2.5 rounded-full bg-[#2aff8a]/40" />
                <span className="ml-2 text-[#2aff8a]/30 tracking-widest text-[9px]">ls -la captures/</span>
              </div>
              <div className="overflow-y-auto flex-1 p-2 space-y-0.5">
                <div className="text-[#2aff8a]/30 mb-2 px-1 text-[9px]">
                  <span className="text-[#2aff8a]/50">root@kali</span>
                  <span className="text-[#a8f0c6]/30">:</span>
                  <span className="text-[#ffaa00]/50">~/captures</span>
                  <span className="text-[#a8f0c6]/30">$ ls -la</span>
                </div>
                <div className="text-[#2aff8a]/20 mb-1 px-1 text-[9px]">total {filteredHashes.length}</div>

                {filteredHashes.map((h) => {
                  const col   = FT_COLOR[h.file_type] ?? '#2aff8a'
                  const fname = h.file_path.split('/').pop() ?? h.file_path
                  const isView = activeHash?.id === h.id && !crackTarget
                  const isCrk  = crackTarget?.id === h.id
                  return (
                    <div
                      key={h.id}
                      className="rounded border transition-all"
                      style={{
                        borderColor: isCrk ? `${col}50` : isView ? `${col}25` : 'transparent',
                        background:  isCrk ? `${col}10` : isView ? `${col}06` : undefined,
                      }}
                    >
                      <button
                        onClick={() => { setCrackTarget(null); loadFileContent(h) }}
                        className="w-full text-left px-1.5 py-1 flex items-center gap-1.5"
                      >
                        <span className="text-[#2aff8a]/20 shrink-0">-rw-r--r--</span>
                        <span className="shrink-0 px-1 rounded text-[8px] font-bold"
                          style={{ color: col, border: `1px solid ${col}30` }}>
                          {h.file_type.toUpperCase()}
                        </span>
                        <span className="truncate flex-1" style={{ color: isView || isCrk ? col : `${col}70` }}>{fname}</span>
                      </button>
                      <div className="flex gap-1 px-1.5 pb-1.5">
                        <button
                          onClick={() => openCrack(h)}
                          className="flex-1 py-0.5 rounded text-[8px] font-bold tracking-wider transition-colors"
                          style={{
                            border:     `1px solid ${isCrk ? col + '80' : col + '30'}`,
                            color:      isCrk ? col : `${col}50`,
                            background: isCrk ? `${col}15` : undefined,
                          }}
                        >
                          {isCrk ? '⚡ CRACKING' : '⚡ CRACK'}
                        </button>
                        <button
                          onClick={() => {
                            deleteHandshake(h.id)
                            if (activeHash?.id === h.id) { setActiveHash(null); setContent(null) }
                            if (crackTarget?.id === h.id) setCrackTarget(null)
                          }}
                          className="px-2 py-0.5 rounded border border-[#ff4444]/20 text-[#ff4444]/30 hover:text-[#ff4444] hover:border-[#ff4444]/50 text-[8px] transition-colors"
                        >
                          DEL
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* ── Right: crack panel OR file content viewer ── */}
            {crackTarget ? (
              /* ── CRACK PANEL ── */
              <div className="flex flex-col flex-1 min-w-0 border border-[#1a2f1a] rounded overflow-hidden font-mono text-[10px]"
                style={{ background: '#020406' }}>

                {/* title bar */}
                <div className="flex items-center justify-between px-3 py-2 border-b border-[#1a2f1a] bg-[#0a1a0a] shrink-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[#ffaa00] font-bold tracking-wider">⚡ CRACK</span>
                    <span className="text-[#a8f0c6]/40 truncate max-w-[200px]">
                      {crackTarget.file_path.split('/').pop()}
                    </span>
                    <span className="px-1 rounded text-[8px] font-bold"
                      style={{
                        color: FT_COLOR[crackTarget.file_type] ?? '#2aff8a',
                        border: `1px solid ${(FT_COLOR[crackTarget.file_type] ?? '#2aff8a')}40`,
                      }}>
                      {crackTarget.file_type.toUpperCase()}
                    </span>
                  </div>
                  <button
                    onClick={() => { setCrackTarget(null); if (activeHash) loadFileContent(activeHash) }}
                    className="px-2 py-0.5 rounded border border-[#2aff8a]/20 text-[#2aff8a]/40 hover:text-[#2aff8a] hover:border-[#2aff8a]/40 text-[9px] transition-colors"
                  >
                    INSPECT
                  </button>
                </div>

                {/* config form */}
                <div className="shrink-0 px-3 py-2.5 border-b border-[#1a2f1a] space-y-2.5 bg-[#030a03]">

                  {/* tool toggle */}
                  <div className="flex items-center gap-3">
                    <span className="text-[#2aff8a]/30 tracking-widest w-20">TOOL</span>
                    <div className="flex rounded border border-[#1a2f1a] overflow-hidden">
                      {(['aircrack-ng', 'hashcat'] as const).map((tool) => {
                        const active = (tool === 'hashcat') === useHashcat
                        return (
                          <button
                            key={tool}
                            onClick={() => setUseHashcat(tool === 'hashcat')}
                            disabled={cracking}
                            className={`px-3 py-1 text-[9px] font-bold tracking-wider border-r border-[#1a2f1a] last:border-r-0 transition-colors ${
                              active
                                ? 'bg-[#2aff8a]/15 text-[#2aff8a]'
                                : 'text-[#2aff8a]/25 hover:text-[#2aff8a]/50'
                            }`}
                          >
                            {tool}
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  {/* wordlist or mask */}
                  <div className="flex items-start gap-3">
                    <span className="text-[#2aff8a]/30 tracking-widest w-20 pt-1">
                      {useHashcat && crackMask ? 'MASK' : 'WORDLIST'}
                    </span>
                    <div className="flex-1 space-y-1.5">
                      {/* mask input (hashcat) */}
                      {useHashcat && (
                        <input
                          className="w-full bg-[#0d1f0d] border border-[#1a2f1a] rounded px-2 py-1 text-[9px] text-[#a8f0c6] placeholder-[#2aff8a]/20 focus:outline-none focus:border-[#2aff8a]/40"
                          placeholder="hashcat mask e.g. ?d?d?d?d?d?d?d?d  (leave blank → use wordlist)"
                          value={crackMask}
                          onChange={(e) => setCrackMask(e.target.value)}
                          disabled={cracking}
                        />
                      )}
                      {/* wordlist dropdown + scan */}
                      {(!useHashcat || !crackMask) && (
                        <div className="flex gap-1.5">
                          <select
                            className="flex-1 bg-[#0d1f0d] border border-[#1a2f1a] rounded px-2 py-1 text-[9px] text-[#a8f0c6] focus:outline-none focus:border-[#2aff8a]/40"
                            value={crackWL}
                            onChange={(e) => setCrackWL(e.target.value)}
                            disabled={cracking || loadingWL}
                          >
                            {wordlists.length === 0 && <option value="">-- press SCAN --</option>}
                            {wordlists.map((wl) => (
                              <option key={wl.path} value={wl.path}>
                                {wl.name}  ({wl.size_mb} MB)
                              </option>
                            ))}
                          </select>
                          <button
                            onClick={fetchWordlists}
                            disabled={loadingWL || cracking}
                            className="px-2 py-1 rounded border border-[#2aff8a]/20 text-[#2aff8a]/40 hover:text-[#2aff8a] hover:border-[#2aff8a]/40 text-[9px] transition-colors disabled:opacity-40"
                          >
                            {loadingWL ? '...' : 'SCAN'}
                          </button>
                        </div>
                      )}
                      {/* custom path override */}
                      <input
                        className="w-full bg-[#0d1f0d] border border-[#1a2f1a] rounded px-2 py-1 text-[9px] text-[#a8f0c6] placeholder-[#2aff8a]/20 focus:outline-none focus:border-[#2aff8a]/40"
                        placeholder="or paste custom path: /path/to/wordlist.txt"
                        value={customWL}
                        onChange={(e) => setCustomWL(e.target.value)}
                        disabled={cracking}
                      />
                    </div>
                  </div>

                  {/* start / stop + result */}
                  <div className="flex items-center gap-3 pt-0.5">
                    {cracking ? (
                      <button
                        onClick={stopCrack}
                        className="px-4 py-1.5 rounded border border-[#ff4444]/50 text-[#ff4444] hover:bg-[#ff4444]/10 text-[9px] font-bold tracking-wider transition-colors"
                      >
                        ■ STOP
                      </button>
                    ) : (
                      <button
                        onClick={startCrack}
                        className="px-4 py-1.5 rounded border border-[#2aff8a]/50 text-[#2aff8a] hover:bg-[#2aff8a]/10 text-[9px] font-bold tracking-wider transition-colors"
                      >
                        ▶ START CRACK
                      </button>
                    )}
                    {cracking && <span className="text-[#ffaa00]/60 animate-pulse text-[9px] tracking-widest">RUNNING...</span>}
                    {crackResult && (
                      <span className="text-[#2aff8a] font-bold text-[9px] tracking-wider">
                        🔓 PASSWORD: <span className="text-white">{crackResult.password}</span>
                      </span>
                    )}
                  </div>
                </div>

                {/* crack log terminal */}
                <div ref={crackRef} className="flex-1 overflow-y-auto p-3 space-y-0.5 leading-5" style={{ background: '#010303' }}>
                  {crackLog.length === 0 && !cracking ? (
                    <div className="text-[#2aff8a]/15 text-center mt-6 tracking-widest">
                      CONFIGURE OPTIONS AND PRESS START
                    </div>
                  ) : (
                    <>
                      <div className="text-[#2aff8a]/40 mb-2 select-none">
                        <span className="text-[#2aff8a]/60">root@kali</span>
                        <span className="text-[#a8f0c6]/30">:~$ </span>
                        <span className="text-[#a8f0c6]/50">
                          {useHashcat ? 'hashcat' : 'aircrack-ng'} {customWL || crackWL || '...'} {crackTarget.file_path}
                        </span>
                      </div>
                      {crackLog.map((entry, i) => (
                        <div key={i} className={`whitespace-pre-wrap break-all ${crackLineColor(entry.type)}`}>
                          {entry.text}
                        </div>
                      ))}
                      {cracking && <div className="text-[#2aff8a]/50 mt-1"><span className="animate-pulse">▋</span></div>}
                    </>
                  )}
                </div>
              </div>
            ) : (
              /* ── FILE CONTENT VIEWER ── */
              <div className="flex flex-col flex-1 min-w-0 bg-[#030608] border border-[#1a2f1a] rounded overflow-hidden font-mono text-[10px]">
                <div className="flex items-center justify-between px-3 py-2 border-b border-[#1a2f1a] bg-[#0a1a0a] shrink-0">
                  <span className="text-[#2aff8a]/30 tracking-widest text-[9px]">
                    {activeHash
                      ? <><span className="text-[#2aff8a]/50">cat </span>{activeHash.file_path}</>
                      : 'SELECT A FILE'}
                  </span>
                  {activeHash && (
                    <div className="flex gap-1.5">
                      <button onClick={() => handleCopy(activeHash.file_path)} className="px-2 py-0.5 rounded border border-[#2aff8a]/20 text-[#2aff8a]/40 hover:text-[#2aff8a] hover:border-[#2aff8a]/40 text-[9px] transition-colors">COPY PATH</button>
                      {content && <button onClick={() => handleCopy(content)} className="px-2 py-0.5 rounded border border-[#2aff8a]/20 text-[#2aff8a]/40 hover:text-[#2aff8a] hover:border-[#2aff8a]/40 text-[9px] transition-colors">COPY HASH</button>}
                    </div>
                  )}
                </div>
                <div ref={termRef} className="flex-1 overflow-y-auto p-3 space-y-0.5 leading-relaxed" style={{ background: '#020406' }}>
                  {!activeHash ? (
                    <div className="text-[#2aff8a]/15 tracking-widest text-center mt-8">SELECT A FILE TO INSPECT</div>
                  ) : loadingFile ? (
                    <div className="flex items-center gap-2 text-[#2aff8a]/40"><span className="animate-pulse">▋</span><span>reading file...</span></div>
                  ) : content !== null ? (
                    <>
                      <div className="text-[#2aff8a]/40 mb-2 select-none">
                        <span className="text-[#2aff8a]/60">root@kali</span>
                        <span className="text-[#a8f0c6]/30">:</span>
                        <span className="text-[#ffaa00]/50">~</span>
                        <span className="text-[#a8f0c6]/30">$ cat </span>
                        <span className="text-[#a8f0c6]/50">{activeHash.file_path}</span>
                      </div>
                      {content.split('\n').map((line, i) => (
                        <div key={i} className={`whitespace-pre-wrap break-all leading-5 ${lineColor(line)}`}>
                          {line || '\u00a0'}
                        </div>
                      ))}
                      <div className="text-[#2aff8a]/60 mt-2 select-none">
                        <span className="text-[#2aff8a]/60">root@kali</span>
                        <span className="text-[#a8f0c6]/30">:</span>
                        <span className="text-[#ffaa00]/50">~</span>
                        <span className="text-[#a8f0c6]/30">$ </span>
                        <span className="animate-pulse">▋</span>
                      </div>
                    </>
                  ) : null}
                </div>
              </div>
            )}

          </div>
        )
      )}
    </div>
  )
}

