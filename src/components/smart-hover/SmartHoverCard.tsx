/**
 * SmartHoverCard — orchestrator (§3, §56, §75).
 *
 * One component for every surface: dashboard, calendar, rentals, packing,
 * payments, search. `context` changes emphasis (default tab + actions),
 * never the component (§56). Entity → entity moves push an internal stack
 * with ← Back; Esc unwinds the stack before closing (§75).
 */

import { useMemo, useState } from 'react'
import {
  defaultTabForContext,
  getHoverActions,
  type BookingStage,
  type HoverActionId,
  type HoverContext,
  type HoverEntity,
  type PackingStatus,
} from '../../lib/smartHover'
import type { SystemRole } from '../../types/database'
import { SmartHoverFooter, SmartHoverShell, HoverActionButton } from './SmartHoverShell'
import Icon, { type IconName } from '../ui/Icon'
import { ClientHoverCard } from './cards/ClientHoverCard'
import { EquipmentHoverCard } from './cards/EquipmentHoverCard'
import { RentalHoverCard } from './cards/RentalHoverCard'
import { DocumentHoverCard } from './cards/DocumentHoverCard'
import type { ClientPreview, EquipmentPreview, InvoicePreview, RentalPreview } from './previewTypes'

export interface CardPreviewMap {
  client: ClientPreview
  equipment: EquipmentPreview
  rental: RentalPreview
  invoice: InvoicePreview
  document: InvoicePreview
  payment: InvoicePreview
}

export interface HoverCardStackEntry {
  entityType: HoverEntity
  preview: ClientPreview | EquipmentPreview | RentalPreview | InvoicePreview
  clientPreview?: ClientPreview | undefined
}

const ACTION_LABEL: Record<HoverActionId, { label: string; icon: IconName }> = {
  new_rental: { label: 'New Rental', icon: 'plus' },
  open_entity: { label: 'Open', icon: 'arrow_right' },
  select_client: { label: 'Select', icon: 'check' },
  add_equipment: { label: 'Add', icon: 'plus' },
  reserve_equipment: { label: 'Reserve', icon: 'calendar' },
  assign_serial: { label: 'Assign Serial', icon: 'barcode' },
  swap_equipment: { label: 'Assign / Swap', icon: 'refresh' },
  start_packing: { label: 'Start Packing', icon: 'package' },
  continue_packing: { label: 'Continue Packing', icon: 'package' },
  mark_packed: { label: 'Mark Packed', icon: 'check' },
  mark_all_ready: { label: 'Mark All Ready', icon: 'checklist' },
  verify_handover: { label: 'Verify', icon: 'check' },
  handover: { label: 'Handover', icon: 'truck' },
  receive_return: { label: 'Receive Return', icon: 'return_arrow' },
  inspect: { label: 'Inspect', icon: 'eye' },
  close_rental: { label: 'Close Rental', icon: 'check' },
  resolve_requirements: { label: 'Resolve Requirements', icon: 'alert_triangle' },
  record_payment: { label: 'Record Payment', icon: 'card' },
  request_payment: { label: 'Request Payment', icon: 'bell' },
  record_deposit: { label: 'Record Deposit', icon: 'card' },
  refund_deposit: { label: 'Refund Deposit', icon: 'return_arrow' },
  open_invoice: { label: 'Open Invoice', icon: 'invoice' },
  view_ledger: { label: 'View Ledger', icon: 'receipt' },
  add_note: { label: 'Add Note', icon: 'edit' },
  call_client: { label: 'Call', icon: 'phone' },
  email_client: { label: 'Email', icon: 'mail' },
  view_timeline: { label: 'Timeline', icon: 'activity' },
  view_documents: { label: 'Documents', icon: 'file' },
  print_packing_slip: { label: 'Packing Slip', icon: 'download' },
  review_account: { label: 'Review Account', icon: 'eye' },
  repair_ticket: { label: 'Repair Ticket', icon: 'tool' },
}

export function SmartHoverCard({
  entityType,
  context,
  role,
  preview,
  clientPreview,
  canViewFinance,
  stage,
  packingStatus,
  restricted,
  sheet = false,
  onClose,
  onAction,
}: {
  entityType: HoverEntity
  context: HoverContext
  role: SystemRole
  preview: ClientPreview | EquipmentPreview | RentalPreview | InvoicePreview
  clientPreview?: ClientPreview | undefined
  canViewFinance: boolean
  stage?: BookingStage | undefined
  packingStatus?: PackingStatus | undefined
  restricted?: boolean | undefined
  sheet?: boolean
  onClose: () => void
  onAction: (id: HoverActionId) => void
}) {
  const [stack, setStack] = useState<HoverCardStackEntry[]>([{ entityType, preview, clientPreview }])
  const top = stack[stack.length - 1]
  const current = useMemo(
    () => (top === undefined ? { entityType, preview } : top),
    [top, entityType, preview],
  )
  const large = current.entityType === 'rental'

  const actions = useMemo(
    () =>
      getHoverActions({
        entityType: current.entityType,
        context,
        role,
        stage: current.entityType === 'rental' ? stage : undefined,
        packingStatus: packingStatus,
        restricted,
      }),
    [context, current.entityType, packingStatus, restricted, role, stage],
  )

  const openClient = useMemo(() => {
    const cp = current.entityType === 'rental' ? (current as { clientPreview?: ClientPreview | undefined }).clientPreview : undefined
    if (current.entityType !== 'rental' || cp === undefined) return null
    return () => setStack((s) => [...s, { entityType: 'client', preview: cp }])
  }, [current])

  const goBack = (): void => setStack((s) => (s.length > 1 ? s.slice(0, -1) : s))

  const handleAction = (id: HoverActionId): void => {
    onAction(id)
  }

  const defaultTab = defaultTabForContext(current.entityType, context)
  const innerAction = (id: string): void => {
    const known = id as HoverActionId
    handleAction(known)
  }

  return (
    <SmartHoverShell
      labelledBy="smart-hover-title"
      large={large}
      sheet={sheet}
      onClose={() => {
        if (stack.length > 1) goBack()
        else onClose()
      }}
      header={
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: stack.length > 1 ? '8px 14px 0' : '0 14px' }}>
          {stack.length > 1 ? (
            <button type="button" onClick={goBack} aria-label="Back to previous preview" style={{ minHeight: 'var(--tap)', background: 'none', border: 'none', color: 'var(--link)', cursor: 'pointer', display: 'inline-flex', gap: 4, alignItems: 'center' }}>
              <Icon name="chevron_left" size={16} /> Back
            </button>
          ) : null}
        </div>
      }
      footer={
        <SmartHoverFooter
          primary={actions.primary ? <ActionButton id={actions.primary} primary onAction={handleAction} /> : null}
          secondary={actions.secondary && actions.secondary !== actions.primary ? <ActionButton id={actions.secondary} onAction={handleAction} /> : null}
          overflow={actions.overflow.length > 0 ? <OverflowMenu ids={actions.overflow} onAction={handleAction} /> : null}
        />
      }
    >
      {current.entityType === 'client' ? (
        <ClientHoverCard preview={current.preview as ClientPreview} canViewFinance={canViewFinance} defaultTab={defaultTab} onAction={innerAction} />
      ) : null}
      {current.entityType === 'equipment' ? (
        <EquipmentHoverCard preview={current.preview as EquipmentPreview} canViewFinance={canViewFinance} defaultTab={defaultTab} onAction={innerAction} />
      ) : null}
      {current.entityType === 'rental' ? (
        <RentalHoverCard
          preview={current.preview as RentalPreview}
          canViewFinance={canViewFinance}
          defaultTab={defaultTab}
          onAction={innerAction}
          onOpenClient={openClient ?? (() => undefined)}
        />
      ) : null}
      {current.entityType === 'invoice' || current.entityType === 'document' || current.entityType === 'payment' ? (
        <DocumentHoverCard preview={current.preview as InvoicePreview} canViewFinance={canViewFinance} />
      ) : null}
    </SmartHoverShell>
  )
}

function ActionButton({ id, primary = false, onAction }: { id: HoverActionId; primary?: boolean; onAction: (id: HoverActionId) => void }) {
  const meta = ACTION_LABEL[id]
  return <HoverActionButton label={meta.label} primary={primary} onAction={() => onAction(id)} icon={<Icon name={meta.icon} size={15} />} />
}

function OverflowMenu({ ids, onAction }: { ids: HoverActionId[]; onAction: (id: HoverActionId) => void }) {
  const [open, setOpen] = useState(false)
  return (
    <span style={{ position: 'relative' }}>
      <button
        type="button"
        aria-label="More actions"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((v) => !v)}
        style={{ minWidth: 'var(--tap)', minHeight: 'var(--tap)', borderRadius: 999, border: '1px solid var(--btn-secondary-border)', background: 'transparent', color: 'var(--text)', cursor: 'pointer' }}
      >
        <Icon name="more_vert" size={18} />
      </button>
      {open ? (
        <span role="menu" style={{ position: 'absolute', right: 0, bottom: 'calc(100% + 8px)', minWidth: 200, background: 'var(--dropdown)', border: '1px solid var(--border)', borderRadius: 'var(--r-modal)', boxShadow: 'var(--shadow-modal)', padding: 4, zIndex: 'var(--z-dropdown)' }}>
          {ids.map((id) => (
            <button
              key={id}
              role="menuitem"
              type="button"
              onClick={() => {
                setOpen(false)
                onAction(id)
              }}
              style={{ display: 'flex', width: '100%', gap: 8, alignItems: 'center', minHeight: 'var(--tap)', padding: '8px 10px', background: 'none', border: 'none', color: 'var(--text)', fontSize: 13, cursor: 'pointer', textAlign: 'left' }}
            >
              <Icon name={ACTION_LABEL[id].icon} size={15} />
              {ACTION_LABEL[id].label}
            </button>
          ))}
        </span>
      ) : null}
    </span>
  )
}
