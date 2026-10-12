/**
 * src/modules/rentals/actions/RentalMoreActions.tsx — Babin Rentals OS
 *
 * Universal Secondary Header Actions Menu Component (`RentalMoreActions`).
 *
 * Implements the specification:
 * - One universal More (⋯) dropdown menu containing the 5 secondary action groups:
 *   1. Quote (Drafting, preview, PDF, delivery, versioning)
 *   2. Invoice (Drafting, payment status, PDF, duplicate prevention) [Hidden from money-blind staff]
 *   3. Duplicate Rental (Independent draft creation with sanitized copy & availability check)
 *   4. Audit History (Read-only append-only audit trail with category filters & export)
 *   5. Cancel Rental (Pre-handover lifecycle cancellation with packing warnings & reservation release)
 * - Dynamic context adaptation based on selected rental stage and authenticated capabilities.
 * - Submenus for Quote and Invoice.
 * - Dangerous actions visually separated at the bottom in destructive styling.
 * - Outside click and Escape dismissal.
 * - Seamless integration into RentalsList and BookingDetail headers.
 */

import { useEffect, useId, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import Icon, { type IconName } from '../../../components/ui/Icon'
import { useFloatingMenu } from '../../../components/ui/useFloatingMenu'
import { floatingLayer } from '../../../components/ui/floatingLayer'
import { useAuth } from '../../../lib/auth'
import { useCanViewMoney } from '../../../lib/moneyVisibility'
import {
  evaluateRentalSecondaryActions,
  type SelectedRentalBookingFacts,
  type SecondaryActionItem,
} from '../../../lib/rentalMoreActionsRegistry'
import { CancelRentalDialog } from './CancelRentalDialog'
import { DuplicateRentalDialog } from './DuplicateRentalDialog'
import { RentalAuditDrawer, type AuditCategoryFilter } from './RentalAuditDrawer'
import { QuotePreviewModal } from './QuoteActionsMenu'
import { InvoicePaymentStatusModal } from './InvoiceActionsMenu'
import { CreateInvoiceModal } from '../../finance/modals/CreateInvoiceModal'

export interface ExtraOverflowAction {
  label: string
  icon?: IconName | undefined
  onClick: () => void
  disabled?: boolean | undefined
  disabledReason?: string | undefined
  unavailable?: string | undefined
  submenu?: Array<{
    label: string
    onClick: () => void
    unavailable?: string | undefined
  }> | undefined
}

export interface RentalMoreActionsProps {
  /** Currently selected rental facts if any */
  booking?: SelectedRentalBookingFacts | null | undefined
  /** Number of selected bookings (0, 1, or >1) */
  selectedCount?: number | undefined
  /** Optional extra utility items (e.g. Scan Barcode, Refresh, Message client) */
  extraItems?: ExtraOverflowAction[] | undefined
  /** Callback fired after an action is completed */
  onActionCompleted?: (() => void) | undefined
  /** Accessible label for the More button */
  ariaLabel?: string | undefined
  /** Custom trigger button className */
  triggerClassName?: string | undefined
  /** Custom trigger button inline styles */
  triggerStyle?: CSSProperties | undefined
  /** Icon-only 44px trigger for a crowded phone header; the accessible name stays ariaLabel. */
  compact?: boolean | undefined
}

export function RentalMoreActions({
  booking = null,
  selectedCount = booking ? 1 : 0,
  extraItems,
  onActionCompleted,
  ariaLabel = 'More actions',
  triggerClassName = '',
  triggerStyle,
  compact = false,
}: RentalMoreActionsProps) {
  const { user } = useAuth()
  const canViewMoney = useCanViewMoney()

  const [open, setOpen] = useState(false)
  const [activeSubmenu, setActiveSubmenu] = useState<'quote' | 'invoice' | null>(null)

  // Dialog & Drawer states
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false)
  const [duplicateDialogOpen, setDuplicateDialogOpen] = useState(false)
  const [auditDrawerOpen, setAuditDrawerOpen] = useState(false)
  const [auditInitialCategory, setAuditInitialCategory] = useState<AuditCategoryFilter>('all')
  const [quotePreviewOpen, setQuotePreviewOpen] = useState(false)
  const [invoiceStatusOpen, setInvoiceStatusOpen] = useState(false)
  const [createInvoiceOpen, setCreateInvoiceOpen] = useState(false)

  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const menuId = useId()
  const position = useFloatingMenu(open, triggerRef, menuRef)

  const closeMenu = (returnFocus = false) => {
    setOpen(false)
    setActiveSubmenu(null)
    if (returnFocus) triggerRef.current?.focus()
  }

  // Dismiss on outside click and Escape key
  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (
        !menuRef.current?.contains(e.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(e.target as Node)
      ) {
        closeMenu(false)
      }
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        closeMenu(true)
      }
    }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  // Evaluate secondary action groups
  const groups = evaluateRentalSecondaryActions({
    booking,
    selectedCount,
    userRole: user?.role,
    canViewMoney,
    isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
  })

  // Action dispatcher
  const handleItemClick = (item: SecondaryActionItem) => {
    if (item.disabled) return
    closeMenu()

    switch (item.id) {
      case 'rental.cancel':
        setCancelDialogOpen(true)
        break
      case 'rental.duplicate':
        setDuplicateDialogOpen(true)
        break
      case 'audit.full':
        setAuditInitialCategory('all')
        setAuditDrawerOpen(true)
        break
      case 'audit.operational':
        setAuditInitialCategory('operational')
        setAuditDrawerOpen(true)
        break
      case 'audit.financial':
        setAuditInitialCategory('financial')
        setAuditDrawerOpen(true)
        break
      case 'audit.document':
        setAuditInitialCategory('documents')
        setAuditDrawerOpen(true)
        break
      case 'audit.export':
        setAuditInitialCategory('all')
        setAuditDrawerOpen(true)
        break
      case 'quote.view':
      case 'quote.preview':
      case 'quote.download_pdf':
      case 'quote.send':
      case 'quote.create':
      case 'quote.edit_draft':
      case 'quote.duplicate':
      case 'quote.versions':
        setQuotePreviewOpen(true)
        break
      case 'invoice.create':
        setCreateInvoiceOpen(true)
        break
      case 'invoice.payment_status':
      case 'invoice.payment_history':
      case 'invoice.view':
      case 'invoice.edit_draft':
      case 'invoice.preview':
      case 'invoice.download_pdf':
      case 'invoice.send':
      case 'invoice.corrections':
        setInvoiceStatusOpen(true)
        break
    }
  }

  // Find groups
  const quoteGroup = groups.find((g) => g.id === 'quote')
  const invoiceGroup = groups.find((g) => g.id === 'invoice')
  const duplicateGroup = groups.find((g) => g.id === 'duplicate')
  const auditGroup = groups.find((g) => g.id === 'audit')
  const cancelGroup = groups.find((g) => g.id === 'cancel')

  return (
    <>
      <div style={{ position: 'relative', display: 'inline-flex' }}>
        <button
          ref={triggerRef}
          type="button"
          aria-label={ariaLabel}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-controls={menuId}
          onClick={() => {
            setOpen((v) => !v)
            setActiveSubmenu(null)
          }}
          className={`tap ${triggerClassName}`}
          style={{
            minHeight: 44,
            minWidth: 44,
            padding: compact ? 0 : '0 12px',
            borderRadius: 'var(--r-btn, 8px)',
            border: '1px solid var(--border)',
            background: open ? 'var(--hover-card)' : 'var(--card)',
            color: 'var(--text)',
            fontWeight: 600,
            fontSize: 'var(--t-meta, 13px)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            cursor: 'pointer',
            fontFamily: 'inherit',
            transition: 'background var(--dur-fast, 120ms) var(--ease)',
            ...triggerStyle,
          }}
        >
          <Icon name="more_vert" size={15} style={{ color: 'var(--text2)' }} />
          {!compact && <span>More</span>}
          {!compact && <Icon name="chevron_down" size={13} style={{ color: 'var(--muted)' }} />}
        </button>

        {open &&
          createPortal(
            <div
              id={menuId}
              ref={menuRef}
              role="menu"
              aria-label="Secondary rental actions"
              style={{
                position: 'fixed',
                top: position?.top ?? 0,
                left: position?.left ?? 0,
                width: 250,
                zIndex: floatingLayer(triggerRef.current),
                background: 'var(--card)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--r-card, 8px)',
                boxShadow: 'var(--shadow-card, 0 4px 16px rgba(0,0,0,0.18))',
                padding: 6,
                display: 'flex',
                flexDirection: 'column',
                gap: 2,
              }}
            >
              {/* Optional Extra Utility items (e.g. Scan Barcode, Refresh, Message client) */}
              {extraItems && extraItems.length > 0 && (
                <>
                  {extraItems.map((extra, idx) => {
                    const isDis = extra.disabled || Boolean(extra.unavailable)
                    return (
                      <button
                        key={`extra-${idx}`}
                        type="button"
                        role="menuitem"
                        disabled={isDis}
                        title={extra.disabledReason || extra.unavailable || undefined}
                        onClick={() => {
                          if (isDis) return
                          closeMenu()
                          extra.onClick()
                        }}
                        style={{
                          minHeight: 44,
                          width: '100%',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          padding: '0 10px',
                          borderRadius: 'var(--r-sm, 6px)',
                          border: 'none',
                          background: 'transparent',
                          color: isDis ? 'var(--muted)' : 'var(--text)',
                          fontSize: 'var(--t-meta, 13px)',
                          fontWeight: 500,
                          cursor: isDis ? 'not-allowed' : 'pointer',
                          textAlign: 'left',
                          opacity: isDis ? 0.6 : 1,
                        }}
                      >
                        {extra.icon && <Icon name={extra.icon} size={15} style={{ color: 'var(--text2)' }} />}
                        <span>{extra.label}</span>
                      </button>
                    )
                  })}
                  <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
                </>
              )}

              {/* 1. QUOTE GROUP (Submenu Trigger & Expander) */}
              {quoteGroup && (
                <div>
                  <button
                    type="button"
                    role="menuitem"
                    disabled={quoteGroup.disabled}
                    title={quoteGroup.disabledReason}
                    onClick={() => setActiveSubmenu((cur) => (cur === 'quote' ? null : 'quote'))}
                    style={{
                      minHeight: 44,
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '0 10px',
                      borderRadius: 'var(--r-sm, 6px)',
                      border: 'none',
                      background: activeSubmenu === 'quote' ? 'var(--hover-card)' : 'transparent',
                      color: quoteGroup.disabled ? 'var(--muted)' : 'var(--text)',
                      fontSize: 'var(--t-meta, 13px)',
                      fontWeight: 600,
                      cursor: quoteGroup.disabled ? 'not-allowed' : 'pointer',
                      textAlign: 'left',
                      opacity: quoteGroup.disabled ? 0.6 : 1,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Icon name="file" size={15} style={{ color: 'var(--text2)' }} />
                      <span>Quote</span>
                    </div>
                    <Icon
                      name={activeSubmenu === 'quote' ? 'chevron_down' : 'chevron_right'}
                      size={14}
                      style={{ color: 'var(--muted)' }}
                    />
                  </button>

                  {/* Quote Submenu Items */}
                  {activeSubmenu === 'quote' && (
                    <div
                      style={{
                        paddingLeft: 14,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 2,
                        marginTop: 2,
                        borderLeft: '2px solid var(--border)',
                        marginLeft: 10,
                      }}
                    >
                      {quoteGroup.items.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          role="menuitem"
                          disabled={item.disabled}
                          title={item.disabledReason}
                          onClick={() => handleItemClick(item)}
                          style={{
                            minHeight: 44,
                            width: '100%',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                            padding: '0 8px',
                            borderRadius: 'var(--r-sm, 6px)',
                            border: 'none',
                            background: 'transparent',
                            color: item.disabled ? 'var(--muted)' : 'var(--text)',
                            fontSize: 'var(--t-caption, 12px)',
                            fontWeight: 500,
                            cursor: item.disabled ? 'not-allowed' : 'pointer',
                            textAlign: 'left',
                            opacity: item.disabled ? 0.6 : 1,
                          }}
                        >
                          <Icon name={item.icon} size={13} style={{ color: 'var(--muted)' }} />
                          <span>{item.label}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* 2. INVOICE GROUP (Submenu Trigger & Expander, Law 6 gated) */}
              {invoiceGroup && invoiceGroup.visible && (
                <div>
                  <button
                    type="button"
                    role="menuitem"
                    disabled={invoiceGroup.disabled}
                    title={invoiceGroup.disabledReason}
                    onClick={() => setActiveSubmenu((cur) => (cur === 'invoice' ? null : 'invoice'))}
                    style={{
                      minHeight: 44,
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '0 10px',
                      borderRadius: 'var(--r-sm, 6px)',
                      border: 'none',
                      background: activeSubmenu === 'invoice' ? 'var(--hover-card)' : 'transparent',
                      color: invoiceGroup.disabled ? 'var(--muted)' : 'var(--text)',
                      fontSize: 'var(--t-meta, 13px)',
                      fontWeight: 600,
                      cursor: invoiceGroup.disabled ? 'not-allowed' : 'pointer',
                      textAlign: 'left',
                      opacity: invoiceGroup.disabled ? 0.6 : 1,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Icon name="invoice" size={15} style={{ color: 'var(--text2)' }} />
                      <span>Invoice</span>
                    </div>
                    <Icon
                      name={activeSubmenu === 'invoice' ? 'chevron_down' : 'chevron_right'}
                      size={14}
                      style={{ color: 'var(--muted)' }}
                    />
                  </button>

                  {/* Invoice Submenu Items */}
                  {activeSubmenu === 'invoice' && (
                    <div
                      style={{
                        paddingLeft: 14,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 2,
                        marginTop: 2,
                        borderLeft: '2px solid var(--border)',
                        marginLeft: 10,
                      }}
                    >
                      {invoiceGroup.items.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          role="menuitem"
                          disabled={item.disabled}
                          title={item.disabledReason}
                          onClick={() => handleItemClick(item)}
                          style={{
                            minHeight: 44,
                            width: '100%',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                            padding: '0 8px',
                            borderRadius: 'var(--r-sm, 6px)',
                            border: 'none',
                            background: 'transparent',
                            color: item.disabled ? 'var(--muted)' : 'var(--text)',
                            fontSize: 'var(--t-caption, 12px)',
                            fontWeight: 500,
                            cursor: item.disabled ? 'not-allowed' : 'pointer',
                            textAlign: 'left',
                            opacity: item.disabled ? 0.6 : 1,
                          }}
                        >
                          <Icon name={item.icon} size={13} style={{ color: 'var(--muted)' }} />
                          <span>{item.label}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* 3. DUPLICATE RENTAL */}
              {duplicateGroup && (
                <button
                  type="button"
                  role="menuitem"
                  disabled={duplicateGroup.disabled}
                  title={duplicateGroup.disabledReason}
                  onClick={() => {
                    if (duplicateGroup.disabled) return
                    closeMenu()
                    setDuplicateDialogOpen(true)
                  }}
                  style={{
                    minHeight: 44,
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '0 10px',
                    borderRadius: 'var(--r-sm, 6px)',
                    border: 'none',
                    background: 'transparent',
                    color: duplicateGroup.disabled ? 'var(--muted)' : 'var(--text)',
                    fontSize: 'var(--t-meta, 13px)',
                    fontWeight: 500,
                    cursor: duplicateGroup.disabled ? 'not-allowed' : 'pointer',
                    textAlign: 'left',
                    opacity: duplicateGroup.disabled ? 0.6 : 1,
                  }}
                >
                  <Icon name="copy" size={15} style={{ color: 'var(--text2)' }} />
                  <span>Duplicate Rental</span>
                </button>
              )}

              {/* 4. AUDIT HISTORY */}
              {auditGroup && (
                <button
                  type="button"
                  role="menuitem"
                  disabled={auditGroup.disabled}
                  title={auditGroup.disabledReason}
                  onClick={() => {
                    if (auditGroup.disabled) return
                    closeMenu()
                    setAuditInitialCategory('all')
                    setAuditDrawerOpen(true)
                  }}
                  style={{
                    minHeight: 44,
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '0 10px',
                    borderRadius: 'var(--r-sm, 6px)',
                    border: 'none',
                    background: 'transparent',
                    color: auditGroup.disabled ? 'var(--muted)' : 'var(--text)',
                    fontSize: 'var(--t-meta, 13px)',
                    fontWeight: 500,
                    cursor: auditGroup.disabled ? 'not-allowed' : 'pointer',
                    textAlign: 'left',
                    opacity: auditGroup.disabled ? 0.6 : 1,
                  }}
                >
                  <Icon name="activity" size={15} style={{ color: 'var(--text2)' }} />
                  <span>Audit History</span>
                </button>
              )}

              {/* 5. CANCEL RENTAL (Destructive, visually separated at bottom) */}
              {cancelGroup && (
                <>
                  <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
                  <button
                    type="button"
                    role="menuitem"
                    disabled={cancelGroup.disabled}
                    title={cancelGroup.disabledReason}
                    onClick={() => {
                      if (cancelGroup.disabled) return
                      closeMenu()
                      setCancelDialogOpen(true)
                    }}
                    style={{
                      minHeight: 44,
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '0 10px',
                      borderRadius: 'var(--r-sm, 6px)',
                      border: 'none',
                      background: 'transparent',
                      color: cancelGroup.disabled ? 'var(--muted)' : 'var(--danger, #dc2626)',
                      fontSize: 'var(--t-meta, 13px)',
                      fontWeight: 600,
                      cursor: cancelGroup.disabled ? 'not-allowed' : 'pointer',
                      textAlign: 'left',
                      opacity: cancelGroup.disabled ? 0.6 : 1,
                    }}
                  >
                    <Icon
                      name="close"
                      size={15}
                      style={{ color: cancelGroup.disabled ? 'var(--muted)' : 'var(--danger, #dc2626)' }}
                    />
                    <span>Cancel Rental</span>
                  </button>
                </>
              )}
            </div>,
            document.body,
          )}
      </div>

      {/* MODALS & DRAWERS */}
      {booking && (
        <>
          <CancelRentalDialog
            isOpen={cancelDialogOpen}
            onClose={() => setCancelDialogOpen(false)}
            booking={booking}
            onSuccess={onActionCompleted}
          />

          <DuplicateRentalDialog
            isOpen={duplicateDialogOpen}
            onClose={() => setDuplicateDialogOpen(false)}
            booking={booking}
            onSuccess={() => onActionCompleted?.()}
          />

          <RentalAuditDrawer
            isOpen={auditDrawerOpen}
            onClose={() => setAuditDrawerOpen(false)}
            booking={booking}
            initialCategory={auditInitialCategory}
          />

          <QuotePreviewModal
            isOpen={quotePreviewOpen}
            onClose={() => setQuotePreviewOpen(false)}
            booking={booking}
            canViewMoney={canViewMoney}
          />

          <InvoicePaymentStatusModal
            isOpen={invoiceStatusOpen}
            onClose={() => setInvoiceStatusOpen(false)}
            booking={booking}
          />

          <CreateInvoiceModal
            isOpen={createInvoiceOpen}
            onClose={() => setCreateInvoiceOpen(false)}
            bookingNo={booking.bookingNo}
            onSuccess={() => {
              setCreateInvoiceOpen(false)
              onActionCompleted?.()
            }}
          />
        </>
      )}
    </>
  )
}

export default RentalMoreActions
