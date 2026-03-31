import { useCallback, useEffect, useState } from 'react'
import { useToastStore, type Toast, type ToastVariant } from '../store/toasts'

// ── Per-variant style maps ────────────────────────────────────────────────────
const BORDER: Record<ToastVariant, string> = {
  error:   'border-l-red-500',
  success: 'border-l-brand-500',
  warning: 'border-l-yellow-500',
  info:    'border-l-blue-400',
}

const TITLE_COLOR: Record<ToastVariant, string> = {
  error:   'text-red-400',
  success: 'text-brand-500',
  warning: 'text-yellow-400',
  info:    'text-blue-400',
}

const BAR_COLOR: Record<ToastVariant, string> = {
  error:   'bg-red-500',
  success: 'bg-brand-500',
  warning: 'bg-yellow-500',
  info:    'bg-blue-400',
}

const ICON: Record<ToastVariant, string> = {
  error:   '✖',
  success: '✔',
  warning: '⚠',
  info:    'ℹ',
}

// ── Single toast item with enter/exit animation ───────────────────────────────
function ToastItem({ toast }: { toast: Toast }) {
  const dismiss = useToastStore((s) => s.dismiss)
  const [exiting, setExiting] = useState(false)

  const exit = useCallback(() => {
    setExiting(true)
    // Wait for CSS exit animation before removing from store
    setTimeout(() => dismiss(toast.id), 300)
  }, [dismiss, toast.id])

  // Auto-dismiss after duration
  useEffect(() => {
    if (!toast.duration) return
    const t = setTimeout(exit, toast.duration)
    return () => clearTimeout(t)
  }, [exit, toast.duration])

  return (
    <div
      role="alert"
      aria-live="assertive"
      className={[
        'relative overflow-hidden',
        'flex items-start gap-3',
        'w-80 rounded-sm',
        'bg-dark-700 border border-dark-500 border-l-4',
        BORDER[toast.variant],
        'px-4 py-3 shadow-2xl',
        'font-mono text-xs',
        exiting ? 'toast-exit' : 'toast-enter',
      ].join(' ')}
    >
      {/* Variant icon */}
      <span className={`shrink-0 mt-0.5 font-bold ${TITLE_COLOR[toast.variant]}`}>
        {ICON[toast.variant]}
      </span>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className={`font-bold leading-snug truncate ${TITLE_COLOR[toast.variant]}`}>
          {toast.title}
        </p>
        {toast.message && (
          <p className="mt-0.5 text-gray-400 leading-snug break-words whitespace-pre-wrap line-clamp-4">
            {toast.message}
          </p>
        )}
      </div>

      {/* Dismiss button */}
      <button
        onClick={exit}
        aria-label="Cerrar notificación"
        className="shrink-0 mt-0.5 text-gray-600 hover:text-gray-300 transition-colors leading-none"
      >
        ×
      </button>

      {/* Progress bar (only when auto-dismiss is active) */}
      {toast.duration > 0 && (
        <div
          className={`absolute bottom-0 left-0 h-[2px] ${BAR_COLOR[toast.variant]} toast-progress`}
          style={{ animationDuration: `${toast.duration}ms` }}
        />
      )}
    </div>
  )
}

// ── Container mounted at root level ──────────────────────────────────────────
export function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts)

  if (toasts.length === 0) return null

  return (
    <div
      aria-label="Notificaciones"
      className="fixed top-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none"
    >
      {toasts.map((t) => (
        <div key={t.id} className="pointer-events-auto">
          <ToastItem toast={t} />
        </div>
      ))}
    </div>
  )
}
