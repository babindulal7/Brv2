import Icon from './Icon'

export interface StepItem {
  id: number | string
  label: string
  description?: string
  optional?: boolean
}

export interface StepperProps {
  steps: StepItem[]
  currentStep: number // 1-indexed
  onStepClick?: (step: number) => void
  maxClickableStep?: number
  /** Completion must come from validation, never from which section was visited. */
  completedStepIds?: ReadonlyArray<StepItem['id']>
  className?: string
}

export function Stepper({
  steps,
  currentStep,
  onStepClick,
  maxClickableStep = steps.length,
  completedStepIds = [],
  className = '',
}: StepperProps) {
  return (
    <nav className={`rental-stepper ${className}`} aria-label="Workflow Steps">
      <ol className="rental-stepper__list">
        {steps.map((step, index) => {
          const stepNumber = index + 1
          const isCompleted = completedStepIds.includes(step.id)
          const isCurrent = stepNumber === currentStep
          const canClick = onStepClick && (stepNumber <= maxClickableStep || stepNumber <= currentStep)

          return (
            <li
              key={step.id}
              className={`rental-stepper__item ${
                isCompleted ? 'is-completed' : isCurrent ? 'is-current' : 'is-upcoming'
              }`}
              aria-current={isCurrent ? 'step' : undefined}
            >
              <button
                type="button"
                className="rental-stepper__button"
                disabled={!canClick || isCurrent}
                onClick={() => canClick && onStepClick?.(stepNumber)}
                aria-label={`Step ${stepNumber}: ${step.label}${isCompleted ? ' (Completed)' : isCurrent ? ' (Current)' : ''}`}
              >
                <span className="rental-stepper__indicator" aria-hidden="true">
                  {isCompleted ? (
                    <Icon name="check" size={14} />
                  ) : (
                    <span className="rental-stepper__number">{stepNumber}</span>
                  )}
                </span>
                <span className="rental-stepper__text">
                  <span className="rental-stepper__label">{step.label}</span>
                  {step.optional && <span className="rental-stepper__badge">Optional</span>}
                  {step.description && (
                    <span className="rental-stepper__desc">{step.description}</span>
                  )}
                </span>
              </button>
              {index < steps.length - 1 && (
                <div
                  className={`rental-stepper__track ${isCompleted ? 'is-filled' : ''}`}
                  aria-hidden="true"
                />
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
