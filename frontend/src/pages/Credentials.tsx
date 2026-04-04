import { useEffect, useState } from 'react'
import { useCredentialsStore } from '../store/credentials'

const ATTACK_BADGE: Record<string, string> = {
  wpa_handshake: 'bg-yellow-700 text-yellow-100',
  wps_pixie:     'bg-orange-700 text-orange-100',
  wps_bruteforce:'bg-orange-800 text-orange-200',
  pmkid:         'bg-blue-700 text-blue-100',
}

export function Credentials() {
  const { credentials, loading, fetchCredentials, deleteCredential, handshakes, loadingHandshakes, fetchHandshakes, deleteHandshake } = useCredentialsStore()
  const [search, setSearch] = useState('')

  useEffect(() => { fetchCredentials() }, [fetchCredentials])
  useEffect(() => { fetchHandshakes() }, [fetchHandshakes])

  const filtered = credentials.filter((c) =>
    c.bssid.toLowerCase().includes(search.toLowerCase()) ||
    (c.ssid ?? '').toLowerCase().includes(search.toLowerCase()) ||
    c.attack_type.toLowerCase().includes(search.toLowerCase())
  )

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text).catch(() => {})
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-100">Credenciales Encontradas</h1>
        <span className="text-xs text-gray-500 font-mono">{credentials.length} total</span>
      </div>

      {/* Search */}
      <input
        className="w-full max-w-sm bg-dark-800 border border-dark-600 rounded px-3 py-1.5 text-xs font-mono text-gray-200 focus:outline-none focus:border-brand-500"
        placeholder="Buscar por BSSID, SSID o tipo..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {/* Hashes / Handshakes */}
      <div className="space-y-2">
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-widest">Hashes Capturados</h2>
        {loadingHandshakes ? (
          <div className="text-gray-500 text-sm animate-pulse">Cargando hashes...</div>
        ) : handshakes.length === 0 ? (
          <div className="text-center text-gray-600 py-6 text-sm">Sin hashes capturados.</div>
        ) : (
          <div className="bg-dark-800 border border-dark-600 rounded overflow-x-auto">
            <table className="w-full text-xs font-mono">
              <thead>
                <tr className="text-gray-500 border-b border-dark-600">
                  <th className="text-left py-2 px-3">Red</th>
                  <th className="text-left py-2 px-3">Tipo</th>
                  <th className="text-left py-2 px-3">Verificado</th>
                  <th className="text-left py-2 px-3">Capturado</th>
                  <th className="text-left py-2 px-3">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {handshakes.map((h) => (
                  <tr key={h.id} className="border-b border-dark-700 hover:bg-dark-700 transition-colors">
                    <td className="py-2 px-3">
                      <div className="text-gray-200">{h.ssid ?? <span className="text-gray-600 italic">oculto</span>}</div>
                      <div className="text-gray-500 text-[10px]">{h.bssid}</div>
                    </td>
                    <td className="py-2 px-3">
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-dark-600 text-gray-300 uppercase">{h.file_type}</span>
                    </td>
                    <td className="py-2 px-3">
                      {h.verified
                        ? <span className="text-green-400 font-bold">✓</span>
                        : <span className="text-gray-600">—</span>}
                    </td>
                    <td className="py-2 px-3 text-gray-500">{new Date(h.captured_at).toLocaleString()}</td>
                    <td className="py-2 px-3">
                      <button
                        onClick={() => deleteHandshake(h.id)}
                        className="px-2.5 py-1 rounded bg-dark-600 hover:bg-red-900 text-gray-400 hover:text-red-300 text-xs font-bold transition-colors"
                      >
                        DEL
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Credentials */}
      <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-widest pt-2">Contraseñas Crackeadas</h2>

      {loading ? (
        <div className="text-gray-500 text-sm animate-pulse">Cargando credenciales...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center text-gray-600 py-10 text-sm">
          {credentials.length === 0
            ? 'Sin credenciales. Ejecuta un ataque y crackea un handshake para ver resultados aquí.'
            : 'Sin resultados para la búsqueda.'}
        </div>
      ) : (
        <div className="bg-dark-800 border border-dark-600 rounded overflow-x-auto">
          <table className="w-full text-xs font-mono">
            <thead>
              <tr className="text-gray-500 border-b border-dark-600">
                <th className="text-left py-2 px-3">Red</th>
                <th className="text-left py-2 px-3">Tipo</th>
                <th className="text-left py-2 px-3">Crackeado con</th>
                <th className="text-left py-2 px-3">WPS PIN</th>
                <th className="text-left py-2 px-3">Encontrado</th>
                <th className="text-left py-2 px-3">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr key={c.id} className="border-b border-dark-700 hover:bg-dark-700 transition-colors">
                  <td className="py-2 px-3">
                    <div className="text-gray-200">{c.ssid ?? <span className="text-gray-600 italic">oculto</span>}</div>
                    <div className="text-gray-500 text-[10px]">{c.bssid}</div>
                  </td>
                  <td className="py-2 px-3">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${ATTACK_BADGE[c.attack_type] ?? 'bg-dark-600 text-gray-300'}`}>
                      {c.attack_type}
                    </span>
                  </td>
                  <td className="py-2 px-3 text-gray-400">{c.cracked_by}</td>
                  <td className="py-2 px-3 text-gray-400">{c.wps_pin ?? '—'}</td>
                  <td className="py-2 px-3 text-gray-500">{new Date(c.found_at).toLocaleString()}</td>
                  <td className="py-2 px-3">
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleCopy(c.bssid)}
                        className="px-2.5 py-1 rounded bg-dark-600 hover:bg-dark-500 text-gray-400 hover:text-gray-200 text-xs font-bold transition-colors"
                        title="Copiar BSSID"
                      >
                        BSSID
                      </button>
                      <button
                        onClick={() => deleteCredential(c.id)}
                        className="px-2.5 py-1 rounded bg-dark-600 hover:bg-red-900 text-gray-400 hover:text-red-300 text-xs font-bold transition-colors"
                      >
                        DEL
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
