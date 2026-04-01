import React from 'react'

export interface AttackStep {
  id: string
  label: string
  icon: string
}

interface AttackStepDiagramProps {
  steps: AttackStep[]
  /** 0-based index of the active step (-1 = none started yet) */
  currentIndex: number
  /** 'idle' | 'running' | 'done' | 'error' */
  status: 'idle' | 'running' | 'done' | 'error'
}

export function AttackStepDiagram({ steps, currentIndex, status }: AttackStepDiagramProps) {
  return (
    <div className="w-full overflow-x-auto">
      <div className="flex items-center min-w-max px-1 py-2">
        {steps.map((step, idx) => {
          const isCompleted = idx < currentIndex || (status === 'done' && idx === currentIndex)
          const isActive    = idx === currentIndex && status !== 'done' && status !== 'error'
          const isError     = idx === currentIndex && status === 'error'
          const isFuture    = idx > currentIndex

          return (
            <React.Fragment key={step.id}>
              {/* Step bubble */}
              <div className="flex flex-col items-center gap-1">
                <div
                  className={`
                    w-9 h-9 rounded-full flex items-center justify-center text-base font-bold
                    border-2 transition-all duration-300
                    ${isCompleted
                      ? 'bg-brand-600 border-brand-500 text-white shadow-[0_0_8px_rgba(34,197,94,0.5)]'
                      : isActive
                      ? 'bg-brand-900 border-brand-400 text-brand-300 animate-pulse shadow-[0_0_12px_rgba(74,222,128,0.4)]'
                      : isError
                      ? 'bg-red-900 border-red-500 text-red-400'
                      : 'bg-dark-700 border-dark-500 text-gray-600'
                    }
                  `}
                >
                  {isCompleted ? '✓' : isError ? '✕' : step.icon}
                </div>
                <span
                  className={`text-[10px] font-mono font-semibold text-center leading-tight max-w-[4.5rem] ${
                    isCompleted ? 'text-brand-400' :
                    isActive    ? 'text-brand-300' :
                    isError     ? 'text-red-400'   :
                    isFuture    ? 'text-gray-600'  :
                    'text-gray-500'
                  }`}
                >
                  {step.label}
                </span>
              </div>

              {/* Connector line (not after last step) */}
              {idx < steps.length - 1 && (
                <div
                  className={`
                    flex-1 h-0.5 mx-1 min-w-[1.5rem] transition-colors duration-300
                    ${idx < currentIndex
                      ? 'bg-brand-600'
                      : isError && idx === currentIndex
                      ? 'bg-red-700'
                      : 'bg-dark-600'
                    }
                  `}
                />
              )}
            </React.Fragment>
          )
        })}
      </div>
    </div>
  )
}
