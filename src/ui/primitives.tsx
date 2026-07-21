import {
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
} from 'react'
import NumberFlow from '@number-flow/react'
import { Icon, type IconName } from './Icon'
import './ui.css'

export interface AnimatedNumberProps {
  value: number
  className?: string
  fractionDigits?: number
  prefix?: string
  suffix?: string
}

export function AnimatedNumber({
  value,
  className = '',
  fractionDigits = 0,
  prefix,
  suffix,
}: AnimatedNumberProps) {
  return (
    <NumberFlow
      className={className}
      format={{ maximumFractionDigits: fractionDigits }}
      locales="zh-TW"
      opacityTiming={{ duration: 350, easing: 'ease-out' }}
      prefix={prefix}
      spinTiming={{ duration: 750, easing: 'cubic-bezier(.22, 1, .36, 1)' }}
      suffix={suffix}
      transformTiming={{ duration: 750, easing: 'cubic-bezier(.22, 1, .36, 1)' }}
      value={value}
    />
  )
}

export interface NumberStepperProps {
  value: number
  label: string
  onChange: (value: number) => void
  min?: number
  max?: number
  step?: number
  className?: string
  fractionDigits?: number
  renderValue?: (value: number) => ReactNode
}

export function NumberStepper({
  value,
  label,
  onChange,
  min = Number.NEGATIVE_INFINITY,
  max = Number.POSITIVE_INFINITY,
  step = 1,
  className = '',
  fractionDigits = 0,
  renderValue,
}: NumberStepperProps) {
  const [editing, setEditing] = useState(false)
  const [inputValue, setInputValue] = useState(`${value}`)
  const precision = Math.max(fractionDigits, `${step}`.split('.')[1]?.length ?? 0)
  const normalize = (candidate: number) => {
    const next = Math.min(max, Math.max(min, candidate))
    return Number(next.toFixed(precision))
  }
  const update = (direction: -1 | 1) => {
    onChange(normalize(value + direction * step))
  }
  const beginEditing = () => {
    setInputValue(`${value}`)
    setEditing(true)
  }
  const commitInput = () => {
    const next = Number(inputValue)
    if (inputValue.trim() && Number.isFinite(next)) onChange(normalize(next))
    setEditing(false)
  }

  return (
    <div className={`ui-number-stepper ${className}`}>
      <button aria-label={`减小${label}`} disabled={value <= min} onClick={() => update(-1)} type="button">
        <Icon name="minus" size={12} />
      </button>
      {editing ? (
        <input
          aria-label={`输入${label}`}
          autoFocus
          className="ui-number-stepper__input"
          inputMode="decimal"
          max={Number.isFinite(max) ? max : undefined}
          min={Number.isFinite(min) ? min : undefined}
          onBlur={commitInput}
          onChange={(event) => setInputValue(event.target.value)}
          onFocus={(event) => event.currentTarget.select()}
          onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur() }}
          step={step}
          type="number"
          value={inputValue}
        />
      ) : (
        <button aria-label={`编辑${label}，当前值 ${value}`} className="ui-number-stepper__value" onClick={beginEditing} type="button">
          {renderValue ? renderValue(value) : <AnimatedNumber fractionDigits={fractionDigits} value={value} />}
        </button>
      )}
      <button aria-label={`增大${label}`} disabled={value >= max} onClick={() => update(1)} type="button">
        <Icon name="plus" size={12} />
      </button>
    </div>
  )
}

export interface SegmentedControlOption<Value extends string> {
  value: Value
  label: string
}

export interface SegmentedControlProps<Value extends string> {
  value: Value
  label: string
  options: ReadonlyArray<SegmentedControlOption<Value>>
  onChange: (value: Value) => void
  className?: string
  disabled?: boolean
  labelVisible?: boolean
  size?: 'default' | 'compact'
}

export function SegmentedControl<Value extends string>({
  value,
  label,
  options,
  onChange,
  className = '',
  disabled = false,
  labelVisible = true,
  size = 'default',
}: SegmentedControlProps<Value>) {
  const segmentCount = Math.max(1, options.length)
  const selectedIndex = Math.max(0, options.findIndex((option) => option.value === value))
  const compact = size === 'compact'

  return (
    <fieldset className={`ui-segmented-control ui-segmented-control--${size} ${labelVisible ? '' : 'ui-segmented-control--label-hidden'} ${className}`}>
      <legend>{label}</legend>
      <div className="ui-segmented-control__track">
        <span
          aria-hidden="true"
          className="ui-segmented-control__indicator"
          style={{
            left: compact ? '.1875rem' : '0',
            transform: `translateX(${selectedIndex * 100}%)`,
            width: compact ? `calc((100% - .375rem) / ${segmentCount})` : `${100 / segmentCount}%`,
          }}
        />
        {options.map((option) => (
          <button
            aria-pressed={option.value === value}
            disabled={disabled}
            key={option.value}
            onClick={() => onChange(option.value)}
            style={{ width: `${100 / segmentCount}%` }}
            type="button"
          >
            {option.label}
          </button>
        ))}
      </div>
    </fieldset>
  )
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  leadingIcon?: IconName
  fullWidth?: boolean
}

export function Button({
  variant = 'primary',
  leadingIcon,
  fullWidth = false,
  className = '',
  children,
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      className={`ui-button ui-button--${variant} ${fullWidth ? 'ui-button--full' : ''} ${className}`}
      type={type}
      {...props}
    >
      {leadingIcon ? <Icon name={leadingIcon} size={17} /> : null}
      {children}
    </button>
  )
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`ui-card ${className}`}>{children}</section>
}

export interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string
  error?: string
  hint?: string
}

export function Field({ label, error, hint, id, className = '', ...props }: FieldProps) {
  const fieldId = id ?? `field-${label.replace(/\s+/g, '-').toLowerCase()}`
  const descriptionId = error || hint ? `${fieldId}-description` : undefined
  return (
    <label className={`ui-field ${className}`} htmlFor={fieldId}>
      <span className="ui-field__label">{label}</span>
      <input
        aria-describedby={descriptionId}
        aria-invalid={Boolean(error)}
        className="ui-field__input"
        id={fieldId}
        {...props}
      />
      {error || hint ? (
        <span className={error ? 'ui-field__error' : 'ui-field__hint'} id={descriptionId}>
          {error ?? hint}
        </span>
      ) : null}
    </label>
  )
}

export interface DialogProps {
  open: boolean
  title: string
  children: ReactNode
  actions?: ReactNode
  onClose: () => void
  onAfterClose?: () => void
  className?: string
}

export function Dialog({ open, title, children, actions, onClose, onAfterClose, className = '' }: DialogProps) {
  const titleId = useId()
  const dialogRef = useRef<HTMLElement>(null)
  const [rendered, setRendered] = useState(open)
  const [closing, setClosing] = useState(false)
  const onCloseRef = useRef(onClose)
  const onAfterCloseRef = useRef(onAfterClose)

  useEffect(() => {
    onCloseRef.current = onClose
    onAfterCloseRef.current = onAfterClose
  }, [onAfterClose, onClose])

  // Keep the dialog mounted briefly so mobile exit motion can finish.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (open) {
      setRendered(true)
      setClosing(false)
      return
    }
    if (!rendered) return
    const animate = window.matchMedia('(max-width: 47.999rem)').matches
      && !window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (!animate) {
      setRendered(false)
      onAfterCloseRef.current?.()
      return
    }
    setClosing(true)
    const timeout = window.setTimeout(() => {
      setRendered(false)
      setClosing(false)
      onAfterCloseRef.current?.()
    }, 180)
    return () => window.clearTimeout(timeout)
  }, [open, rendered])
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    if (!open || !rendered) return

    const previousFocus = document.activeElement
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCloseRef.current()
    }

    document.addEventListener('keydown', handleKeyDown)
    dialogRef.current?.focus()

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      if (previousFocus instanceof HTMLElement) previousFocus.focus()
    }
  }, [open, rendered])

  if (!rendered) return null
  return (
    <div className={`ui-dialog-backdrop ${closing ? 'ui-dialog-backdrop--closing' : ''}`} onMouseDown={onClose}>
      <section
        aria-labelledby={titleId}
        aria-modal="true"
        className={`ui-dialog ${className}`}
        onMouseDown={(event) => event.stopPropagation()}
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <header className="ui-dialog__header">
          <h2 id={titleId}>{title}</h2>
          <button aria-label="关闭" className="ui-icon-button" onClick={onClose}>×</button>
        </header>
        <div className="ui-dialog__body">{children}</div>
        {actions ? <footer className="ui-dialog__actions">{actions}</footer> : null}
      </section>
    </div>
  )
}

export interface AlertProps {
  open: boolean
  title: string
  description: string
  confirmLabel?: string
  cancelLabel?: string
  confirmVariant?: ButtonProps['variant']
  pending?: boolean
  onConfirm: () => void
  onClose: () => void
}

export function Alert({
  open,
  title,
  description,
  confirmLabel = '确定',
  cancelLabel,
  confirmVariant = 'primary',
  pending = false,
  onConfirm,
  onClose,
}: AlertProps) {
  const titleId = useId()
  const descriptionId = useId()
  const alertRef = useRef<HTMLElement>(null)
  const onCloseRef = useRef(onClose)

  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    if (!open) return

    const previousFocus = document.activeElement
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !pending) onCloseRef.current()
    }

    document.addEventListener('keydown', handleKeyDown)
    alertRef.current?.focus()

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      if (previousFocus instanceof HTMLElement) previousFocus.focus()
    }
  }, [open, pending])

  if (!open) return null
  return (
    <div className="ui-alert-backdrop" onMouseDown={() => { if (!pending) onClose() }}>
      <section
        aria-describedby={descriptionId}
        aria-labelledby={titleId}
        aria-modal="true"
        className="ui-alert"
        onMouseDown={(event) => event.stopPropagation()}
        ref={alertRef}
        role="alertdialog"
        tabIndex={-1}
      >
        <div className="ui-alert__content">
          <h2 id={titleId}>{title}</h2>
          <p id={descriptionId}>{description}</p>
        </div>
        <footer className="ui-alert__actions">
          {cancelLabel ? (
            <Button disabled={pending} fullWidth onClick={onClose} variant="secondary">
              {cancelLabel}
            </Button>
          ) : null}
          <Button disabled={pending} fullWidth onClick={onConfirm} variant={confirmVariant}>
            {confirmLabel}
          </Button>
        </footer>
      </section>
    </div>
  )
}

export function Progress({ value, label }: { value: number; label?: string }) {
  const normalized = Math.min(100, Math.max(0, value))
  return (
    <div className="ui-progress">
      {label ? <div className="ui-progress__label"><span>{label}</span><span>{Math.round(normalized)}%</span></div> : null}
      <div aria-label={label} aria-valuemax={100} aria-valuemin={0} aria-valuenow={normalized} className="ui-progress__track" role="progressbar">
        <span className="ui-progress__value" style={{ transform: `scaleX(${normalized / 100})` }} />
      </div>
    </div>
  )
}

export interface StatePanelProps {
  kind: 'empty' | 'loading' | 'error' | 'offline' | 'not-found'
  title: string
  description: string
  action?: ReactNode
}

const stateIcons: Record<StatePanelProps['kind'], IconName> = {
  empty: 'empty',
  loading: 'spinner',
  error: 'alert',
  offline: 'cloud-off',
  'not-found': 'alert',
}

export function StatePanel({ kind, title, description, action }: StatePanelProps) {
  return (
    <section className={`ui-state ui-state--${kind}`} role={kind === 'error' ? 'alert' : 'status'}>
      <span className="ui-state__icon"><Icon className={kind === 'loading' ? 'ui-spin' : ''} name={stateIcons[kind]} size={22} /></span>
      <h2>{title}</h2>
      <p>{description}</p>
      {action ? <div className="ui-state__action">{action}</div> : null}
    </section>
  )
}
