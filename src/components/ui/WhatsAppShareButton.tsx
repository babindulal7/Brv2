import { useState, useRef, useEffect } from 'react'
import Icon from './Icon'
import { Button } from './Page'
import { useAuth } from '../../lib/auth'
import { openWaLink } from '../../lib/whatsapp'
import {
  whatsappActionsFor,
  type WaBookingFacts,
  type WaSettings,
} from '../../lib/whatsappActions'
import { getSetting } from '../../lib/settingsStore'

export interface WhatsAppShareButtonProps {
  facts: WaBookingFacts
  clientPhone: string | null
  variant?: 'primary' | 'secondary' | 'ghost'
  size?: 'sm' | 'md'
}

export function WhatsAppShareButton({
  facts,
  clientPhone,
  variant = 'secondary',
  size = 'md',
}: WhatsAppShareButtonProps) {
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  const orgName = String(getSetting('organisationName') || 'Babin Rentals')
  const settings: WaSettings = {
    businessName: orgName,
    businessPhone: '9800000000',
    defaultPickupTime: '10:00 AM',
    defaultReturnTime: '06:00 PM',
  }

  const role = user?.role || 'Warehouse'
  const actions = whatsappActionsFor({
    facts,
    settings,
    role,
    clientPhone,
  })

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  if (actions.length === 0) {
    return null
  }

  return (
    <div ref={menuRef} style={{ position: 'relative', display: 'inline-block' }}>
      <Button
        variant={variant}
        size={size}
        onClick={() => setOpen((prev) => !prev)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          borderColor: open ? 'var(--st-in-fg)' : undefined,
        }}
        aria-haspopup="true"
        aria-expanded={open}
      >
        <span
          style={{
            color: '#25D366',
            display: 'inline-flex',
            alignItems: 'center',
          }}
        >
          <Icon name="phone" size={size === 'sm' ? 14 : 16} />
        </span>
        <span>WhatsApp</span>
        <Icon name="chevron_down" size={12} />
      </Button>

      {open && (
        <div
          role="menu"
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            right: 0,
            zIndex: 100,
            minWidth: 240,
            background: 'var(--card)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--r-md)',
            boxShadow: 'var(--shadow-card)',
            padding: 4,
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
          }}
        >
          <div
            style={{
              padding: '6px 10px',
              fontSize: '11px',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              color: 'var(--muted)',
              borderBottom: '1px solid var(--border)',
            }}
          >
            WhatsApp Slips & Notices
          </div>

          {actions.map((act) => {
            const disabled = !act.href || Boolean(act.unavailable)
            return (
              <button
                key={act.id}
                role="menuitem"
                disabled={disabled}
                onClick={() => {
                  if (act.href) {
                    openWaLink(act.href)
                    setOpen(false)
                  }
                }}
                title={act.unavailable}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'flex-start',
                  padding: '8px 10px',
                  borderRadius: 'var(--r-sm)',
                  border: 'none',
                  background: 'transparent',
                  color: disabled ? 'var(--muted)' : 'var(--text)',
                  cursor: disabled ? 'not-allowed' : 'pointer',
                  textAlign: 'left',
                  fontSize: 'var(--t-meta)',
                  opacity: disabled ? 0.6 : 1,
                  transition: 'background 0.15s ease',
                }}
                onMouseEnter={(e) => {
                  if (!disabled) e.currentTarget.style.background = 'var(--card2)'
                }}
                onMouseLeave={(e) => {
                  if (!disabled) e.currentTarget.style.background = 'transparent'
                }}
              >
                <div style={{ fontWeight: 600 }}>{act.label}</div>
                {act.unavailable && (
                  <div style={{ fontSize: '10px', color: 'var(--danger-text)', marginTop: 2 }}>
                    {act.unavailable}
                  </div>
                )}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
