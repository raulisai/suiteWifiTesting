import { useEffect, useRef } from 'react'
import { useTerminalStore, type TerminalLine } from '../store/terminal'

function lineColor(line: TerminalLine): string {
  switch (line.event.type) {
    case 'error':     return 'text-red-400'
    case 'warning':   return 'text-yellow-400'
    case 'done':      return 'text-brand-500'
    case 'handshake': return 'text-cyan-400'
    case 'credential':return 'text-purple-400'
    case 'step':      return 'text-blue-400'
    case 'start':     return 'text-brand-500'
    default:          return 'text-gray-300'
  }
}

function linePrefix(line: TerminalLine): string {
  switch (line.event.type) {
    case 'error':      return '[!]'
    case 'warning':    return '[W]'
    case 'done':       return '[+]'
    case 'handshake':  return '[H]'
    case 'credential': return '[K]'
    case 'step':       return '[*]'
    case 'start':      return '[>]'
    default:           return '   '
  }
}

export function LiveTerminal() {
  const { lines, clear } = useTerminalStore()
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [lines])

  return (
    <div className="flex flex-col h-full bg-dark-900 rounded border border-dark-600">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-dark-600">
        <span className="text-xs text-gray-500 font-mono">terminal</span>
        <button
          onClick={clear}
          className="text-[10px] text-gray-600 hover:text-gray-300 font-mono transition-colors"
        >
          clear
        </button>
      </div>

      {/* Output */}
      <div className="flex-1 overflow-y-auto p-3 font-mono text-xs leading-5 space-y-0.5">
        {lines.length === 0 ? (
          <span className="text-gray-700">Esperando output...</span>
        ) : (
          lines.map((line) => (
            <div key={line.id} className={`flex gap-2 ${lineColor(line)}`}>
              <span className="text-gray-600 shrink-0">{line.timestamp}</span>
              <span className="text-gray-500 shrink-0">{linePrefix(line)}</span>
              <span className="break-all">{line.event.message}</span>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}
