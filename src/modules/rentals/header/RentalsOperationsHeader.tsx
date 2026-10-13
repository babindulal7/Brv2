import { UnsavedChangesIndicator } from '../../../components/ui/header/UnsavedChangesIndicator'
/**
 * src/modules/rentals/header/RentalsOperationsHeader.tsx — Babin Rentals OS
 *
 * Universal Rentals Operations Header Component.
 *
 * Implements the 3-mode operational command deck:
 * 1. No Rental Selected (Default list view with Add Rental CTA)
 * 2. One Rental Selected (Centralized 4-stage Operations dropdown + dynamic primary action)
 * 3. Multiple Rentals Selected (Safe batch selection bar)
 *
 * Seamlessly integrates into RentalsList, BookingDetail, and Operations surfaces.
 */

import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import Icon, { type IconName } from '../../../components/ui/Icon'
import { Button } from '../../../components/ui/Button'
import { Badge } from '../../../components/ui/Badge'
import { OverflowMenu, type OverflowMenuItem } from '../../../components/ui/OverflowMenu'
import { floatingLayer } from '../../../components/ui/floatingLayer'
import { useFloatingMenu } from '../../../components/ui/useFloatingMenu'
import { formatBookingNo } from '../../../lib/format'
import type { BookingStatus, JobName } from '../../../lib/workflow'
import {
  getRentalHeaderOperations,
  type OperationStageMenuItem,
  type RentalWorkflowFacts,
} from '../../../lib/rentalOperationsWorkflow'
import { RentalMoreActions } from '../actions/RentalMoreActions'
import { GlobalAddMenu } from '../../../components/ui/creation/GlobalAddMenu'
import '../../../components/ui/header/pageHeader.css'

export interface SelectedRentalInfo {
  id: string
  bookingNo: string
  status: string
  client?: string | null | undefined
  isCancelled?: boolean | undefined
  isClosed?: boolean | undefined
  isOverdue?: boolean | undefined
  isPartial?: boolean | undefined
  itemCount?: number | undefined
  pickupDate?: string | undefined
  returnDate?: string | undefined
}

export interface RentalsOperationsHeaderProps {
  /** Total count of bookings in current view */
  totalCount: number
  /** Currently selected rental if exactly one is active */
  selectedRental?: SelectedRentalInfo | null | undefined
  /** Count of currently selected rentals */
  selectedCount?: number | undefined
  /** Callback to clear selection */
  onClearSelection?: (() => void) | undefined
  /** Search bar configuration */
  search: {
    value: string
    onChange: (value: string) => void
    placeholder?: string | undefined
    onClear?: (() => void) | undefined
    ariaLabel?: string | undefined
  }
  /** Left slot leading element (e.g. Filter toggle button) */
  leading?: ReactNode | undefined
  /** Operation launcher callback: opens OperationsShell modal */
  onOpenOperations: (bookingNo: string, status: BookingStatus, job: JobName) => void
  /** Summary launcher callback (when reset completed or rental closed) */
  onViewSummary?: ((bookingNo: string) => void) | undefined
  /** Add Rental creation callback */
  onAddRental?: (() => void) | undefined
  /** Quick return modal callback */
  onFastReturn?: (() => void) | undefined
  /** Payment record modal callback */
  onRecordPayment?: (() => void) | undefined
  /** Barcode scanner modal callback */
  onScanBarcode?: (() => void) | undefined
  /** Refresh callback */
  onRefresh?: (() => void) | undefined
  /** Bulk CSV export callback */
  onExportCsv?: (() => void) | undefined
  /** Open detail page callback */
  onViewDetails?: ((bookingNo: string) => void) | undefined
  /** Cancel rental callback */
  onCancelRental?: ((bookingNo: string) => void) | undefined
  /** Permission flags */
  canWriteDesk?: boolean | undefined
  canOperate?: boolean | undefined
  canRecordPayment?: boolean | undefined
  canCloseRental?: boolean | undefined
  /** Visual indicators */
  isDirty?: boolean | undefined
  dataAgeBadge?: ReactNode | undefined
  className?: string | undefined
}

/**
 * Dropdown Menu component for the 4-stage Operations workflow.
 */
function OperationsDropdown({
  disabled,
  disabledReason,
  stages,
  onSelectJob,
}: {
  disabled: boolean
  disabledReason?: string | null | undefined
  stages: OperationStageMenuItem[]
  onSelectJob: (job: JobName) => void
}) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const menuId = useId()
  const position = useFloatingMenu(open, triggerRef, menuRef)

  const closeMenu = (returnFocus = false) => {
    setOpen(false)
    if (returnFocus) triggerRef.current?.focus()
  }

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

  if (disabled) {
    return (
      <button
        type="button"
        disabled
        title={disabledReason || 'Select a rental to run operations'}
        aria-label="Operations. Select a rental to run operations"
        style={{
          minHeight: 44,
          padding: '0 12px',
          borderRadius: 'var(--r-btn, 8px)',
          border: '1px solid var(--border)',
          background: 'var(--card)',
          color: 'var(--muted)',
          fontWeight: 600,
          fontSize: 'var(--t-meta, 13px)',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          cursor: 'not-allowed',
          fontFamily: 'inherit',
          opacity: 0.65,
        }}
      >
        <Icon name="package" size={15} />
        <span>Operations</span>
        <Icon name="chevron_down" size={14} />
      </button>
    )
  }

  return (
    <div style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((v) => !v)}
        style={{
          minHeight: 44,
          padding: '0 12px',
          borderRadius: 'var(--r-btn, 8px)',
          border: '1px solid var(--border)',
          background: open ? 'var(--hover-card)' : 'var(--card)',
          color: 'var(--text)',
          fontWeight: 600,
          fontSize: 'var(--t-meta, 13px)',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          cursor: 'pointer',
          fontFamily: 'inherit',
          transition: 'background var(--dur-fast, 120ms) var(--ease)',
        }}
      >
        <Icon name="package" size={15} style={{ color: 'var(--text2)' }} />
        <span>Operations</span>
        <Icon name="chevron_down" size={14} />
      </button>

      {open &&
        createPortal(
          <div
            id={menuId}
            ref={menuRef}
            role="menu"
            aria-label="Operations Stages"
            style={{
              position: 'fixed',
              top: position?.top ?? 0,
              left: position?.left ?? 0,
              width: position?.width ? Math.max(position.width, 240) : 260,
              zIndex: floatingLayer(triggerRef.current),
              background: 'var(--card)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--r-card, 8px)',
              boxShadow: 'var(--shadow-card, 0 4px 16px rgba(0,0,0,0.18))',
              padding: 6,
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
            }}
          >
            <div
              style={{
                padding: '6px 10px',
                fontSize: 'var(--t-caption, 11px)',
                fontWeight: 700,
                color: 'var(--muted)',
                letterSpacing: '0.04em',
                borderBottom: '1px solid var(--border)',
                marginBottom: 2,
              }}
            >
              EQUIPMENT MOVEMENT WORKFLOW
            </div>

            {stages.map((stage) => {
              const isLocked = stage.state === 'locked'
              const isCompleted = stage.state === 'completed'
              const isCurrent = stage.state === 'current'

              return (
                <button
                  key={stage.job}
                  type="button"
                  role="menuitem"
                  disabled={isLocked}
                  title={isLocked && stage.disabledReason ? stage.disabledReason : undefined}
                  aria-label={
                    isLocked && stage.disabledReason
                      ? `${stage.label}. Locked: ${stage.disabledReason}`
                      : stage.label
                  }
                  onClick={() => {
                    if (isLocked) return
                    closeMenu(false)
                    onSelectJob(stage.job)
                  }}
                  style={{
                    minHeight: 44,
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '0 12px',
                    borderRadius: 'var(--r-sm, 6px)',
                    border: 'none',
                    background: isCurrent ? 'var(--hover-card, rgba(0,0,0,0.04))' : 'transparent',
                    color: isLocked ? 'var(--muted)' : 'var(--text)',
                    fontSize: 'var(--t-meta, 13px)',
                    fontWeight: isCurrent ? 700 : 500,
                    cursor: isLocked ? 'not-allowed' : 'pointer',
                    textAlign: 'left',
                    opacity: isLocked ? 0.6 : 1,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Icon
                      name={stage.icon}
                      size={16}
                      style={{ color: isCurrent ? 'var(--primary)' : 'var(--text2)' }}
                    />
                    <span>{stage.label}</span>
                  </div>

                  {isCompleted ? (
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 2,
                        fontSize: 'var(--t-caption, 11px)',
                        color: 'var(--success, #16a34a)',
                        fontWeight: 600,
                      }}
                    >
                      <Icon name="check" size={13} /> Done
                    </span>
                  ) : isCurrent ? (
                    <span
                      style={{
                        fontSize: 'var(--t-caption, 10px)',
                        padding: '2px 6px',
                        borderRadius: 4,
                        background: 'var(--primary, #2563eb)',
                        color: '#fff',
                        fontWeight: 700,
                      }}
                    >
                      CURRENT
                    </span>
                  ) : (
                    <Icon name="lock" size={13} style={{ color: 'var(--muted)' }} />
                  )}
                </button>
              )
            })}
          </div>,
          document.body,
        )}
    </div>
  )
}

export function RentalsOperationsHeader({
  totalCount,
  selectedRental,
  selectedCount = 0,
  onClearSelection,
  search,
  leading,
  onOpenOperations,
  onViewSummary,
  onAddRental,
  onFastReturn,
  onRecordPayment,
  onScanBarcode,
  onRefresh,
  onExportCsv,
  onViewDetails,
  onCancelRental,
  canWriteDesk = true,
  canOperate = true,
  canRecordPayment = true,
  canCloseRental = false,
  isDirty = false,
  dataAgeBadge,
  className = '',
}: RentalsOperationsHeaderProps) {
  const searchInputRef = useRef<HTMLInputElement>(null)

  // Keyboard shortcut '/' to jump to search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === '/') {
        const target = e.target instanceof Element ? e.target : null
        if (
          target &&
          (target.matches('input, textarea, select') ||
            (target as HTMLElement).isContentEditable ||
            target.closest?.('[role="dialog"]'))
        ) {
          return
        }
        if (searchInputRef.current) {
          e.preventDefault()
          searchInputRef.current.focus()
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  // Resolve mode: 0 selected, 1 selected, or multiple selected (>1)
  const isMultiSelect = selectedCount > 1
  const isSingleSelect = selectedCount === 1 && Boolean(selectedRental)

  // Evaluate operational workflow for single rental
  const rentalFacts: RentalWorkflowFacts = {
    bookingNo: selectedRental?.bookingNo,
    clientName: selectedRental?.client,
    isCancelled: selectedRental?.isCancelled,
    isClosed: selectedRental?.isClosed,
    isOverdue: selectedRental?.isOverdue,
    isPartial: selectedRental?.isPartial,
    canOperate,
    canCloseRental,
    totalItemCount: selectedRental?.itemCount,
  }

  const opState = selectedRental
    ? getRentalHeaderOperations(selectedRental.status, rentalFacts)
    : null

  // Overflow menu actions
  const overflowItems: OverflowMenuItem[] = isSingleSelect && selectedRental
    ? [
        {
          label: 'Open Booking Dossier',
          icon: 'external_link',
          onClick: () => {
            if (onViewDetails) onViewDetails(selectedRental.bookingNo)
          },
        },
        ...(onViewSummary
          ? [
              {
                label: 'View Summary',
                icon: 'file_text' as IconName,
                onClick: () => onViewSummary(selectedRental.bookingNo),
              },
            ]
          : []),
        ...(onExportCsv
          ? [
              {
                label: 'Export CSV',
                icon: 'download' as IconName,
                onClick: onExportCsv,
              },
            ]
          : []),
        ...(canWriteDesk && onCancelRental && !selectedRental.isCancelled
          ? [
              {
                label: 'Cancel Booking',
                icon: 'close' as IconName,
                onClick: () => onCancelRental(selectedRental.bookingNo),
              },
            ]
          : []),
        ...(onClearSelection
          ? [
              {
                label: 'Clear Selection',
                icon: 'close' as IconName,
                onClick: onClearSelection,
              },
            ]
          : []),
      ]
    : [
        ...(onExportCsv
          ? [
              {
                label: 'Export CSV',
                icon: 'download' as IconName,
                onClick: onExportCsv,
              },
            ]
          : []),
        ...(onScanBarcode
          ? [
              {
                label: 'Scan Barcode',
                icon: 'search' as IconName,
                onClick: onScanBarcode,
              },
            ]
          : []),
        ...(onRefresh
          ? [
              {
                label: 'Refresh',
                icon: 'refresh' as IconName,
                onClick: onRefresh,
              },
            ]
          : []),
      ]

  return (
    <header
      className={`page-header universal-page-header animate-entrance ${className}`}
      role="banner"
      aria-label="Rentals operations header"
    >
      {/* MODE 3: MULTI-RENTAL BATCH SELECTION BAR */}
      {isMultiSelect ? (
        <div
          className="universal-page-header__bulk-bar"
          style={{ width: '100%', justifyContent: 'space-between', display: 'flex', alignItems: 'center' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Icon name="check" size={16} />
            <span style={{ fontWeight: 600 }}>{selectedCount} rentals selected</span>
            {onClearSelection && (
              <button
                type="button"
                onClick={onClearSelection}
                style={{
                  minHeight: 44,
                  padding: '0 8px',
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--link, #2563eb)',
                  cursor: 'pointer',
                  fontWeight: 600,
                  fontSize: 'var(--t-meta, 13px)',
                }}
              >
                Clear selection
              </button>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {onExportCsv && (
              <Button variant="secondary" icon="download" onClick={onExportCsv}>
                Export CSV
              </Button>
            )}
            {canOperate && onFastReturn && (
              <Button variant="secondary" icon="return_arrow" onClick={onFastReturn}>
                Fast Return
              </Button>
            )}
          </div>
        </div>
      ) : (
        <>
          {/* ZONE 1: LEFT ZONE (Identification & Stage Status) */}
          <div className="universal-page-header__left" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {leading}

            {isSingleSelect && selectedRental ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {onClearSelection ? (
                    <button
                      type="button"
                      onClick={onClearSelection}
                      title="Clear selection"
                      aria-label="Back to all rentals"
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--muted)',
                        cursor: 'pointer',
                        padding: 0,
                        display: 'inline-flex',
                        alignItems: 'center',
                        fontSize: 'var(--t-caption, 12px)',
                        fontWeight: 600,
                      }}
                    >
                      <Icon name="chevron_left" size={14} /> Rentals
                    </button>
                  ) : (
                    <span className="eyebrow-pill" style={{ letterSpacing: 'normal', textTransform: 'none' }}>
                      Rentals
                    </span>
                  )}
                  <span style={{ color: 'var(--border)' }}>/</span>
                  <span
                    style={{
                      fontSize: 'var(--t-caption, 12px)',
                      color: 'var(--text2)',
                      fontWeight: 600,
                    }}
                  >
                    {opState?.stageHint}
                  </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <h1
                    className="universal-page-header__title"
                    style={{ margin: 0, fontSize: 'var(--t-h2, 20px)', fontWeight: 700 }}
                  >
                    {formatBookingNo(selectedRental.bookingNo)}
                  </h1>
                  <Badge
                    tone={
                      selectedRental.status === 'On Rent'
                        ? 'out'
                        : selectedRental.status === 'Returned'
                          ? 'in'
                          : selectedRental.status === 'Packed'
                            ? 'progress'
                            : 'primary'
                    }
                    label={opState?.displayStatus || selectedRental.status}
                    size="sm"
                  />
                  {selectedRental.client && (
                    <span style={{ fontSize: 'var(--t-meta, 13px)', color: 'var(--muted)', fontWeight: 500 }}>
                      · {selectedRental.client}
                    </span>
                  )}
                  {isDirty && (
                    <UnsavedChangesIndicator />
                  )}
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <h1
                    className="universal-page-header__title"
                    style={{ margin: 0, fontSize: 'var(--t-h1, 24px)', fontWeight: 700 }}
                  >
                    Rentals
                  </h1>
                  <span
                    className="eyebrow-pill"
                    style={{
                      textTransform: 'none',
                      fontWeight: 600,
                      fontSize: 'var(--t-meta, 13px)',
                      letterSpacing: 'normal',
                    }}
                  >
                    {totalCount} {totalCount === 1 ? 'booking' : 'bookings'}
                  </span>
                  {isDirty && (
                    <UnsavedChangesIndicator />
                  )}
                </div>
                <div style={{ fontSize: 'var(--t-meta, 13px)', color: 'var(--muted)' }}>
                  Manage bookings, pickups, returns, and the next action.
                </div>
              </div>
            )}
          </div>

          {/* ZONE 2: CENTER ZONE (Universal Search) */}
          <div className="universal-page-header__center">
            <div className="universal-page-header__search-wrap">
              <Icon name="search" size={15} className="universal-page-header__search-icon" />
              <input
                ref={searchInputRef}
                type="search"
                className="universal-page-header__search-input"
                placeholder={search.placeholder ?? 'Search rentals, clients, equipment… (press /)'}
                value={search.value}
                onChange={(e) => search.onChange(e.target.value)}
                aria-label={search.ariaLabel ?? 'Search rentals'}
              />
              {search.value && (
                <button
                  type="button"
                  className="universal-page-header__search-clear"
                  onClick={() => {
                    search.onChange('')
                    search.onClear?.()
                    searchInputRef.current?.focus()
                  }}
                  aria-label="Clear search query"
                >
                  <Icon name="close" size={14} />
                </button>
              )}
            </div>
          </div>

          {/* ZONE 3: RIGHT ZONE (Operations Dropdown, Dynamic Primary CTA, More Actions) */}
          <div className="universal-page-header__right" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {isSingleSelect && selectedRental && opState ? (
              <>
                {/* 0. Universal Add Dropdown with selected rental context */}
                <GlobalAddMenu
                  module="rentals"
                  contextData={{
                    bookingNo: selectedRental.bookingNo,
                    rentalId: selectedRental.id,
                    clientId: selectedRental.client,
                    clientName: selectedRental.client,
                  }}
                />

                {/* 1. Authoritative Operations Dropdown */}
                <OperationsDropdown
                  disabled={!opState.canRunOperations}
                  stages={opState.operationsMenu}
                  onSelectJob={(job) => {
                    onOpenOperations(
                      selectedRental.bookingNo,
                      (selectedRental.status as BookingStatus) || 'Booked',
                      job,
                    )
                  }}
                />

                {/* 2. Universal More (⋯) Secondary Actions */}
                <RentalMoreActions
                  booking={{
                    id: selectedRental.id,
                    bookingNo: selectedRental.bookingNo,
                    clientName: selectedRental.client,
                    stage: selectedRental.status,
                    isCancelled: selectedRental.isCancelled,
                    isClosed: selectedRental.isClosed,
                    isOverdue: selectedRental.isOverdue,
                    isPartial: selectedRental.isPartial,
                    itemCount: selectedRental.itemCount,
                    pickupDate: selectedRental.pickupDate,
                    returnDate: selectedRental.returnDate,
                  }}
                  selectedCount={1}
                  ariaLabel="More actions for rental"
                  extraItems={overflowItems.map((item) => ({
                    label: item.label,
                    icon: item.icon,
                    onClick: item.onClick,
                    unavailable: item.unavailable,
                  }))}
                  onActionCompleted={onRefresh}
                />

                {/* 3. Single Prominent Context-Aware Primary Action */}
                <Button
                  variant="primary"
                  icon={opState.primaryAction.icon}
                  disabled={opState.primaryAction.disabled}
                  title={opState.primaryAction.disabledReason || opState.primaryAction.label}
                  onClick={() => {
                    if (opState.primaryAction.actionType === 'summary') {
                      if (onViewSummary) {
                        onViewSummary(selectedRental.bookingNo)
                      } else if (onViewDetails) {
                        onViewDetails(selectedRental.bookingNo)
                      }
                      return
                    }

                    if (opState.primaryAction.actionType === 'view' && onViewDetails) {
                      onViewDetails(selectedRental.bookingNo)
                      return
                    }

                    if (opState.primaryAction.job) {
                      onOpenOperations(
                        selectedRental.bookingNo,
                        (selectedRental.status as BookingStatus) || 'Booked',
                        opState.primaryAction.job,
                      )
                    }
                  }}
                  style={{ minHeight: 44, padding: '0 16px', fontWeight: 700 }}
                >
                  {opState.primaryAction.label}
                </Button>
              </>
            ) : (
              <>
                {/* IDLE MODE (0 Selected) */}
                {/* 1. Universal Add Dropdown (New Rental default, Quote, Client) */}
                {canWriteDesk && (
                  onAddRental ? (
                    <Button
                      variant="primary"
                      icon="plus"
                      onClick={onAddRental}
                      style={{ minHeight: 44, padding: '0 16px', fontWeight: 700 }}
                    >
                      Add Rental
                    </Button>
                  ) : (
                    <GlobalAddMenu module="rentals" />
                  )
                )}

                {/* 2. Operations Button (disabled explaining selection requirement) */}
                <OperationsDropdown
                  disabled={true}
                  disabledReason="Select a rental to run operations"
                  stages={[]}
                  onSelectJob={() => {}}
                />

                {/* 3. Secondary Fast Return & Payment CTAs */}
                {canOperate && onFastReturn && (
                  <Button
                    variant="secondary"
                    icon="return_arrow"
                    onClick={onFastReturn}
                    title="Fast Return check-in"
                  >
                    Fast Return
                  </Button>
                )}

                {canRecordPayment && onRecordPayment && (
                  <Button
                    variant="secondary"
                    icon="invoice"
                    onClick={onRecordPayment}
                    title="Record payment against invoice"
                  >
                    Record Payment
                  </Button>
                )}

                {/* 4. Overflow Actions */}
                <OverflowMenu ariaLabel="More actions" items={overflowItems} />

                {dataAgeBadge}
              </>
            )}
          </div>
        </>
      )}
    </header>
  )
}

export default RentalsOperationsHeader
