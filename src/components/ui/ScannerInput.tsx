import React, { useState, useRef, useEffect } from 'react'
import { IconBarcode, IconCheck, IconCornerDownLeft } from '@tabler/icons-react'

export interface ScannerInputProps {
  onScan: (code: string) => void
  placeholder?: string
  autoFocus?: boolean
  continuous?: boolean
  className?: string
}

export const ScannerInput: React.FC<ScannerInputProps> = ({
  onScan,
  placeholder = 'Scan barcode / QR or enter asset code...',
  autoFocus = true,
  continuous = true,
  className = '',
}) => {
  const [value, setValue] = useState('')
  const [recentScan, setRecentScan] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (autoFocus && inputRef.current) {
      inputRef.current.focus()
    }
  }, [autoFocus])

  // Listen for global ⌘+B / Ctrl+B scanner shortcut (Phase 5 requirement)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault()
        inputRef.current?.focus()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = value.trim()
    if (!trimmed) return

    onScan(trimmed)
    setRecentScan(trimmed)
    setValue('')

    if (continuous) {
      inputRef.current?.focus()
    }

    setTimeout(() => {
      setRecentScan(null)
    }, 2500)
  }

  return (
    <div className={className || undefined} style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 8 }}>
      <form onSubmit={handleSubmit} style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
        <div style={{ position: 'absolute', left: 14, display: 'flex', alignItems: 'center', pointerEvents: 'none', color: 'var(--nav-active-accent)' }}>
          <IconBarcode size={20} />
        </div>

        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={placeholder}
          style={{
            width: '100%',
            minHeight: 46,
            paddingLeft: 44,
            paddingRight: 96,
            paddingTop: 10,
            paddingBottom: 10,
            fontSize: 'var(--t-ui)',
            fontFamily: 'monospace',
            borderRadius: 'var(--r-card)',
            background: 'var(--card2)',
            border: '1px solid var(--border)',
            color: 'var(--text)',
            outline: 'none',
            boxShadow: 'var(--shadow-card)',
            transition: 'border-color var(--dur) var(--ease)',
          }}
          onFocus={(e) => {
            e.currentTarget.style.borderColor = 'var(--nav-active-accent)'
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = 'var(--border)'
          }}
        />

        <div style={{ position: 'absolute', right: 4, display: 'flex', alignItems: 'center' }}>
          <button
            type="submit"
            disabled={!value.trim()}
            /* Law 15 — 44×44 touch target */
            style={{
              minHeight: 44,
              minWidth: 44,
              padding: '0 12px',
              borderRadius: 'var(--r-sm)',
              background: 'var(--btn-primary-bg)',
              color: 'var(--btn-primary-fg)',
              border: 'none',
              fontWeight: 600,
              fontSize: 'var(--t-meta)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              cursor: !value.trim() ? 'not-allowed' : 'pointer',
              opacity: !value.trim() ? 0.4 : 1,
              transition: 'opacity var(--dur) var(--ease)',
            }}
          >
            <span>Scan</span>
            <IconCornerDownLeft size={14} />
          </button>
        </div>
      </form>

      {/* Real-time scan confirmation feedback */}
      {recentScan && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 'var(--t-meta)',
            color: 'var(--st-in-fg)',
            background: 'var(--st-in-bg)',
            border: '1px solid var(--st-in-border)',
            padding: '6px 12px',
            borderRadius: 'var(--r-sm)',
          }}
        >
          <IconCheck size={16} style={{ flexShrink: 0 }} />
          <span>
            Scanned: <span style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--text)' }}>{recentScan}</span>
          </span>
        </div>
      )}
    </div>
  )
}
