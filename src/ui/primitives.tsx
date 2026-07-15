import {
  useEffect,
  useId,
  useRef,
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
      prefix={prefix}
      suffix={suffix}
      value={value}
    />
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
}

export function Dialog({ open, title, children, actions, onClose }: DialogProps) {
  const titleId = useId()
  const dialogRef = useRef<HTMLElement>(null)

  useEffect(() => {
    if (!open) return

    const previousFocus = document.activeElement
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }

    document.addEventListener('keydown', handleKeyDown)
    dialogRef.current?.focus()

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      if (previousFocus instanceof HTMLElement) previousFocus.focus()
    }
  }, [onClose, open])

  if (!open) return null
  return (
    <div className="ui-dialog-backdrop" onMouseDown={onClose}>
      <section
        aria-labelledby={titleId}
        aria-modal="true"
        className="ui-dialog"
        onMouseDown={(event) => event.stopPropagation()}
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <div className="ui-dialog__handle" />
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
  onCloseRef.current = onClose

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
        <span className="ui-progress__value" style={{ width: `${normalized}%` }} />
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
  empty: 'plus',
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
