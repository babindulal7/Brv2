import { useState, useRef, useEffect } from 'react'
import type { ReactNode } from 'react'

export interface MoreActionItem {
  id: string
  label: string
  icon?: ReactNode
  category?: 'document' | 'communication' | 'lifecycle' | 'danger'
  onClick: () => void
  disabled?: boolean
  danger?: boolean
}

export interface RentalMoreActionsMenuProps {
  orderId: string
  orderNumber: string
  clientName: string
  actions?: MoreActionItem[]
  onPrintPicklist?: () => void
  onPrintPackingSlip?: () => void
  onDownloadInvoice?: () => void
  onSendWhatsApp?: () => void
  onSendEmail?: () => void
  onCloneBooking?: () => void
  onExtendBooking?: () => void
  onCancelBooking?: () => void
  className?: string
}

/**
 * RentalMoreActionsMenu — Kebab (...) secondary actions dropdown for rentals.
 * Adheres to Babin Rentals OS Law 17 ("Client", never "customer") and Law 15 (touch targets).
 */
export function RentalMoreActionsMenu({
  orderId,
  orderNumber,
  clientName,
  actions,
  onPrintPicklist,
  onPrintPackingSlip,
  onDownloadInvoice,
  onSendWhatsApp,
  onSendEmail,
  onCloneBooking,
  onExtendBooking,
  onCancelBooking,
  className = '',
}: RentalMoreActionsMenuProps) {
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [open])

  // Default actions list if not explicitly provided
  const defaultActions: MoreActionItem[] = [
    {
      id: 'print_picklist',
      label: 'Print Warehouse Picklist',
      category: 'document',
      onClick: () => onPrintPicklist?.(),
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="6 9 6 2 18 2 18 9" />
          <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
          <rect x="6" y="14" width="12" height="8" />
        </svg>
      ),
    },
    {
      id: 'print_slip',
      label: 'Print Packing Slip (Client Copy)',
      category: 'document',
      onClick: () => onPrintPackingSlip?.(),
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
        </svg>
      ),
    },
    {
      id: 'download_invoice',
      label: 'Download Tax Invoice (13% VAT)',
      category: 'document',
      onClick: () => onDownloadInvoice?.(),
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="2" y="3" width="20" height="14" rx="2" />
          <line x1="8" y1="21" x2="16" y2="21" />
          <line x1="12" y1="17" x2="12" y2="21" />
        </svg>
      ),
    },
    {
      id: 'whatsapp_link',
      label: 'Send WhatsApp Handover Link',
      category: 'communication',
      onClick: () => onSendWhatsApp?.(),
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
        </svg>
      ),
    },
    {
      id: 'email_confirmation',
      label: 'Email Client Confirmation',
      category: 'communication',
      onClick: () => onSendEmail?.(),
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
          <polyline points="22,6 12,13 2,6" />
        </svg>
      ),
    },
    {
      id: 'clone_booking',
      label: 'Clone / Re-order Equipment',
      category: 'lifecycle',
      onClick: () => onCloneBooking?.(),
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="9" y="9" width="13" height="13" rx="2" />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
      ),
    },
    {
      id: 'extend_booking',
      label: 'Extend Rental Duration',
      category: 'lifecycle',
      onClick: () => onExtendBooking?.(),
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
      ),
    },
    {
      id: 'cancel_booking',
      label: 'Cancel Booking',
      category: 'danger',
      danger: true,
      onClick: () => onCancelBooking?.(),
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10" />
          <line x1="15" y1="9" x2="9" y2="15" />
          <line x1="9" y1="9" x2="15" y2="15" />
        </svg>
      ),
    },
  ]

  const items = actions ?? defaultActions

  return (
    <div
      ref={menuRef}
      data-order-id={orderId}
      className={`rental-more-actions ${className}`}
      style={{ position: 'relative', display: 'inline-block' }}
    >
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={`More actions for order ${orderNumber}`}
        style={{
          display: 'grid',
          placeItems: 'center',
          width: '44px', // Law 15 minimum touch target
          height: '44px',
          borderRadius: '6px',
          border: '1px solid var(--border, #CBD5E1)',
          background: 'var(--surface, #FFFFFF)',
          color: 'var(--text-secondary, #475569)',
          cursor: 'pointer',
          padding: 0,
        }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
          <circle cx="12" cy="12" r="2" />
          <circle cx="19" cy="12" r="2" />
          <circle cx="5" cy="12" r="2" />
        </svg>
      </button>

      {open && (
        <div
          role="menu"
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            right: 0,
            width: '240px',
            background: '#FFFFFF',
            border: '1px solid #E2E8F0',
            borderRadius: '8px',
            boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
            padding: '6px',
            zIndex: 60,
          }}
        >
          <div
            style={{
              padding: '6px 10px 4px 10px',
              fontSize: '11px',
              fontWeight: 700,
              color: '#94A3B8',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}
          >
            Order #{orderNumber} · {clientName}
          </div>

          <div style={{ height: '1px', background: '#F1F5F9', margin: '4px 0' }} />

          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              role="menuitem"
              disabled={item.disabled}
              onClick={() => {
                setOpen(false)
                item.onClick()
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                width: '100%',
                padding: '8px 10px',
                minHeight: '36px',
                border: 'none',
                background: 'transparent',
                textAlign: 'left',
                borderRadius: '4px',
                fontSize: '13px',
                fontWeight: 500,
                color: item.danger ? '#DC2626' : '#1E293B',
                cursor: item.disabled ? 'not-allowed' : 'pointer',
                opacity: item.disabled ? 0.4 : 1,
              }}
              onMouseEnter={(e) => {
                if (!item.disabled) {
                  e.currentTarget.style.background = item.danger ? 'rgba(239,68,68,0.08)' : '#F8FAFC'
                }
              }}
              onMouseLeave={(e) => {
                if (!item.disabled) {
                  e.currentTarget.style.background = 'transparent'
                }
              }}
            >
              {item.icon && (
                <span
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    color: item.danger ? '#DC2626' : '#64748B',
                  }}
                >
                  {item.icon}
                </span>
              )}
              <span style={{ flex: 1 }}>{item.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
export default RentalMoreActionsMenu
