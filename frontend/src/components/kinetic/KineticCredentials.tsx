import { useEffect, useRef, useState } from 'react'
import { useCredentialsStore } from '../../store/credentials'
import { credentialsApi }      from '../../api/credentials'
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

// colourize individual lines of hc22000 / hex-dump output
function lineColor(line: string): string {
  if (line.startsWith('#'))          return 'text-[#2aff8a]/30'
  if (line.startsWith('WPA*02*'))    return 'text-[#2aff8a]'
  if (line.startsWith('WPA*01*'))    return 'text-[#ffaa00]'
  if (/^[0-9a-f]{8}  /.test(line))  return 'text-[#a8f0c6]/80'   // hex dump offset line
  if (line === '')                   return 'text-transparent'
  return 'text-[#a8f0c6]/60'
}

type Tab = 'credentials' | 'hashes'

export function KineticCredentials() {
  const {
    credentials, loading,            fetchCredentials, deleteCredential,
    handshakes,  loadingHandshakes,  fetchHandshakes,  deleteHandshake,
  } = useCredentialsStore()

  const [tab,        setTab]        = useState<Tab>('credentials')
  const [search,     setSearch]     = useState('')
  const [activeHash, setActiveHash] = useState<Handshake | null>(null)
  const [content,    setContent]    = useState<string | null>(null)
  const [loading2,   setLoading2]   = useState(false)
  const termRef = useRef<HTMLDivElement>(null)

  useEffect(() => { fetchCredentials() }, [fetchCredentials])
  useEffect(() => { fetchHandshakes()  }, [fetchHandshakes])

  // auto-select first hash when switching to tab
  useEffect(() => {
    if (tab === 'hashes' && handshakes.length > 0 && !activeHash) {
      loadContent(handshakes[0])
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, handshakes])

  // scroll terminal to bottom whenever content changes
  useEffect(() => {
    if (termRef.current) termRef.current.scrollTop = termRef.current.scrollHeight
  }, [content])

  const loadContent = async (h: Handshake) => {
    setActiveHash(h)
    setContent(null)
    setLoading2(true)
    try {
      const text = await credentialsApi.handshakeContent(h.id)
      setContent(text)
    } catch {
      setContent(`# ERROR: could not read file\n# ${h.file_path}`)
    } finally {
      setLoading2(false)
    }
  }

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

  const handleCopy = (text: string) => navigator.clipboard.writeText(text).catch(() => {})

  const tabCls = (t: Tab) =>
    `px-4 py-1.5 text-[10px] font-bold tracking-widest rounded-t border-b-0 transition-all ${
      tab === t
        ? 'border border-[#2aff8a]/40 border-b-[#080c10] text-[#2aff8a] bg-[#080c10]'
        : 'border border-transparent text-[#2aff8a]/30 hover:text-[#2aff8a]/60'
    }`

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
                  <th className="text-left py-2 px-3 tracking-wider">TYPE</th>
                  <th className="text-left py-2 px-3 tracking-wider">CRACKER</th>
                  <th className="text-left py-2 px-3 tracking-wider">WPS PIN</th>
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
                      <span className={`px-2 py-0.5 rounded border text-[9px] font-bold ${ATTACK_BADGE[c.attack_type] ?? 'border-[#2aff8a]/20 text-[#2aff8a]/40'}`}>
                        {c.attack_type.toUpperCase()}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-[#2aff8a]/50">{c.cracked_by}</td>
                    <td className="py-2.5 px-3 text-[#2aff8a]/50">{c.wps_pin ?? '—'}</td>
                    <td className="py-2.5 px-3 text-[#2aff8a]/30">{new Date(c.found_at).toLocaleString()}</td>
                    <td className="py-2.5 px-3">
                      <div className="flex gap-1.5">
                        <button onClick={() => handleCopy(c.bssid)} className="px-2 py-0.5 rounded border border-[#2aff8a]/20 text-[#2aff8a]/40 hover:text-[#2aff8a] hover:border-[#2aff8a]/50 text-[9px] transition-colors">COPY</button>
                        <button onClick={() => deleteCredential(c.id)} className="px-2 py-0.5 rounded border border-[#ff4444]/20 text-[#ff4444]/40 hover:text-[#ff4444] hover:border-[#ff4444]/50 text-[9px] transition-colors">DEL</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {/* ── HASHES TAB — terminal split ── */}
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

            {/* ── Left: file list as terminal ── */}
            <div className="flex flex-col w-72 shrink-0 bg-[#030608] border border-[#1a2f1a] rounded overflow-hidden font-mono text-[10px]">
              {/* fake terminal title bar */}
              <div className="flex items-center gap-1.5 px-3 py-2 border-b border-[#1a2f1a] bg-[#0a1a0a] shrink-0">
                <span className="w-2.5 h-2.5 rounded-full bg-[#ff4444]/60" />
                <span className="w-2.5 h-2.5 rounded-full bg-[#ffaa00]/60" />
                <span className="w-2.5 h-2.5 rounded-full bg-[#2aff8a]/40" />
                <span className="ml-2 text-[#2aff8a]/30 tracking-widest text-[9px]">ls -la captures/</span>
              </div>
              {/* prompt + ls output */}
              <div className="overflow-y-auto flex-1 p-3 space-y-0.5">
                <div className="text-[#2aff8a]/30 mb-2">
                  <span className="text-[#2aff8a]/50">root@kali</span>
                  <span className="text-[#a8f0c6]/30">:</span>
                  <span className="text-[#ffaa00]/50">~/captures</span>
                  <span className="text-[#a8f0c6]/30">$ </span>
                  <span className="text-[#a8f0c6]/50">ls -la</span>
                </div>
                <div className="text-[#2aff8a]/20 mb-1 text-[9px]">total {filteredHashes.length}</div>
                {filteredHashes.map((h) => {
                  const col   = FT_COLOR[h.file_type] ?? '#2aff8a'
                  const fname = h.file_path.split('/').pop() ?? h.file_path
                  const active = activeHash?.id === h.id
                  return (
                    <button
                      key={h.id}
                      onClick={() => loadContent(h)}
                      className="w-full text-left px-1.5 py-1 rounded transition-all hover:bg-[#2aff8a]/8 flex items-start gap-2 group"
                      style={{ background: active ? 'rgba(42,255,138,0.08)' : undefined }}
                    >
                      <span className="text-[#2aff8a]/25 shrink-0 mt-0.5">-rw-r--r--</span>
                      <span className="shrink-0 px-1 rounded text-[8px] font-bold"
                        style={{ color: col, border: `1px solid ${col}30` }}>
                        {h.file_type.toUpperCase()}
                      </span>
                      <span className="truncate" style={{ color: active ? col : `${col}70` }}>{fname}</span>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* ── Right: terminal content viewer ── */}
            <div className="flex flex-col flex-1 min-w-0 bg-[#030608] border border-[#1a2f1a] rounded overflow-hidden font-mono text-[10px]">
              {/* title bar */}
              <div className="flex items-center justify-between px-3 py-2 border-b border-[#1a2f1a] bg-[#0a1a0a] shrink-0">
                <div className="flex items-center gap-2">
                  <span className="text-[#2aff8a]/30 tracking-widest text-[9px]">
                    {activeHash
                      ? <><span className="text-[#2aff8a]/50">cat </span>{activeHash.file_path}</>
                      : 'SELECT A FILE'}
                  </span>
                </div>
                {activeHash && (
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => handleCopy(activeHash.file_path)}
                      className="px-2 py-0.5 rounded border border-[#2aff8a]/20 text-[#2aff8a]/40 hover:text-[#2aff8a] hover:border-[#2aff8a]/40 text-[9px] transition-colors"
                    >
                      COPY PATH
                    </button>
                    {content && (
                      <button
                        onClick={() => handleCopy(content)}
                        className="px-2 py-0.5 rounded border border-[#2aff8a]/20 text-[#2aff8a]/40 hover:text-[#2aff8a] hover:border-[#2aff8a]/40 text-[9px] transition-colors"
                      >
                        COPY HASH
                      </button>
                    )}
                    <button
                      onClick={() => { deleteHandshake(activeHash.id); setActiveHash(null); setContent(null) }}
                      className="px-2 py-0.5 rounded border border-[#ff4444]/20 text-[#ff4444]/40 hover:text-[#ff4444] hover:border-[#ff4444]/40 text-[9px] transition-colors"
                    >
                      DEL
                    </button>
                  </div>
                )}
              </div>

              {/* terminal output */}
              <div
                ref={termRef}
                className="flex-1 overflow-y-auto p-3 space-y-0.5 leading-relaxed"
                style={{ background: '#020406' }}
              >
                {!activeHash ? (
                  <div className="text-[#2aff8a]/15 tracking-widest text-center mt-8">
                    SELECT A FILE TO INSPECT
                  </div>
                ) : loading2 ? (
                  <div className="flex items-center gap-2 text-[#2aff8a]/40">
                    <span className="animate-pulse">▋</span>
                    <span>reading file...</span>
                  </div>
                ) : content === null ? null : (
                  <>
                    {/* prompt line */}
                    <div className="text-[#2aff8a]/40 mb-2 select-none">
                      <span className="text-[#2aff8a]/60">root@kali</span>
                      <span className="text-[#a8f0c6]/30">:</span>
                      <span className="text-[#ffaa00]/50">~</span>
                      <span className="text-[#a8f0c6]/30">$ cat </span>
                      <span className="text-[#a8f0c6]/50">{activeHash.file_path}</span>
                    </div>
                    {/* file content — one line at a time */}
                    {content.split('\n').map((line, i) => (
                      <div key={i} className={`whitespace-pre-wrap break-all leading-5 ${lineColor(line)}`}>
                        {line || '\u00a0'}
                      </div>
                    ))}
                    {/* blinking cursor */}
                    <div className="text-[#2aff8a]/60 mt-2 select-none">
                      <span className="text-[#2aff8a]/60">root@kali</span>
                      <span className="text-[#a8f0c6]/30">:</span>
                      <span className="text-[#ffaa00]/50">~</span>
                      <span className="text-[#a8f0c6]/30">$ </span>
                      <span className="animate-pulse">▋</span>
                    </div>
                  </>
                )}
              </div>
            </div>

          </div>
        )
      )}
    </div>
  )
}

