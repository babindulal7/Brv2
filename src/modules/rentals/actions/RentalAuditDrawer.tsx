/**
 * src/modules/rentals/actions/RentalAuditDrawer.tsx — Babin Rentals OS
 *
 * Immutable, read-only audit history viewer for rentals.
 *
 * Enforces:
 * - Read-only append-only audit trail: No edit or delete paths exist.
 * - Categories: All, Operational, Financial (hidden from money-blind staff), Documents.
 * - Server timestamps displayed in both AD and BS via BsAdDate / formatAdDateTime.
 * - Export History: Generates audit CSV and logs export audit event.
 * - Restricted state: RLS and role checks via auditRestriction.
 */

import { useState, useEffect, useCallback } from 'react'
import { ContextDrawer } from '../../../components/ui/ContextDrawer'
import { Button } from '../../../components/ui/Button'
import Icon from '../../../components/ui/Icon'
import { Badge } from '../../../components/ui/Badge'
import { SegmentedControl } from '../../../components/ui/SegmentedControl'
import { BsAdDate } from '../../../components/ui/BsAdDate'
import { useAuth } from '../../../lib/auth'
import { formatBookingNo } from '../../../lib/format'
import {
  listAuditEvents,
  auditRestriction,
  type AuditEventListRow,
} from '../../../lib/queries/audit'
import { recordExport } from '../../../lib/exportAudit'
import type { SelectedRentalBookingFacts } from '../../../lib/rentalMoreActionsRegistry'

export type AuditCategoryFilter = 'all' | 'operational' | 'financial' | 'documents'

export interface RentalAuditDrawerProps {
  isOpen: boolean
  onClose: () => void
  booking: SelectedRentalBookingFacts
  initialCategory?: AuditCategoryFilter | undefined
}

export function RentalAuditDrawer({
  isOpen,
  onClose,
  booking,
  initialCategory = 'all',
}: RentalAuditDrawerProps) {
  const { user } = useAuth()
  const role = user?.role ?? 'Client'
  const restriction = auditRestriction(role)

  const [category, setCategory] = useState<AuditCategoryFilter>(initialCategory)
  const [events, setEvents] = useState<AuditEventListRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)

  const canSeeMoney = role === 'Owner' || role === 'Admin' || role === 'Manager' || role === 'Accounts'

  const fetchAuditTrail = useCallback(async () => {
    if (!isOpen || restriction.restricted) return
    setLoading(true)
    setError(null)

    try {
      // Query audit events for this specific booking
      const res = await listAuditEvents({
        chips: {
          table_name: ['bookings'],
          record_id: [booking.id],
        },
        sort: { column: 'created_at', ascending: false },
      })
      setEvents(res.rows)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [isOpen, booking.id, restriction.restricted])

  useEffect(() => {
    if (isOpen) {
      void fetchAuditTrail()
    }
  }, [isOpen, fetchAuditTrail])

  // Filter events by selected category
  const filteredEvents = events.filter((ev) => {
    if (category === 'all') return true
    if (category === 'operational') {
      const act = ev.action.toLowerCase()
      return (
        act.includes('pack') ||
        act.includes('handover') ||
        act.includes('return') ||
        act.includes('reset') ||
        act.includes('cancel') ||
        ev.category?.toLowerCase() === 'operation'
      )
    }
    if (category === 'financial') {
      if (!canSeeMoney) return false
      const act = ev.action.toLowerCase()
      return (
        act.includes('payment') ||
        act.includes('invoice') ||
        act.includes('refund') ||
        act.includes('deposit') ||
        ev.category?.toLowerCase() === 'finance'
      )
    }
    if (category === 'documents') {
      const act = ev.action.toLowerCase()
      return (
        act.includes('quote') ||
        act.includes('contract') ||
        act.includes('document') ||
        act.includes('pdf') ||
        ev.category?.toLowerCase() === 'document'
      )
    }
    return true
  })

  // Export Audit CSV
  const handleExportCsv = async () => {
    if (!user) return
    setExporting(true)
    try {
      const headers = ['Timestamp', 'Action', 'Actor', 'Role', 'Status', 'Severity', 'Reason']
      const rows = filteredEvents.map((e) => [
        `"${e.createdAtAd}"`,
        `"${e.action}"`,
        `"${e.actorId || ''}"`,
        `"${e.actorRole || ''}"`,
        `"${e.status || ''}"`,
        `"${e.severity || ''}"`,
        `"${(e.reason || '').replace(/"/g, '""')}"`,
      ])

      const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n')
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', `Audit_History_${booking.bookingNo}.csv`)
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)

      // Audit the export action
      recordExport({
        module: 'Rentals',
        list: 'Audit_History',
        rowCount: filteredEvents.length,
      })
    } finally {
      setExporting(false)
    }
  }

  const categoryOptions = [
    { id: 'all' as const, label: 'All' },
    { id: 'operational' as const, label: 'Operational' },
    ...(canSeeMoney ? [{ id: 'financial' as const, label: 'Financial' }] : []),
    { id: 'documents' as const, label: 'Documents' },
  ]

  return (
    <ContextDrawer
      id="rental-audit-drawer"
      open={isOpen}
      onClose={onClose}
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>Audit History</span>
          <span style={{ color: 'var(--muted)', fontWeight: 500 }}>
            · {formatBookingNo(booking.bookingNo)}
          </span>
        </div>
      }
      subtitle={booking.clientName ? `Client: ${booking.clientName}` : undefined}
      width={560}
      actions={
        !restriction.restricted && (
          <Button
            variant="secondary"
            icon="download"
            disabled={exporting || filteredEvents.length === 0}
            onClick={handleExportCsv}
          >
            {exporting ? 'Exporting…' : 'Export CSV'}
          </Button>
        )
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md, 16px)' }}>
        {/* Restricted state guard */}
        {restriction.restricted ? (
          <div
            role="alert"
            style={{
              padding: 16,
              borderRadius: 'var(--r-card, 8px)',
              background: 'var(--card2, #f9fafb)',
              border: '1px solid var(--border, #e5e7eb)',
              color: 'var(--text2, #4b5563)',
              fontSize: 'var(--t-meta, 13px)',
              lineHeight: 1.5,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, color: 'var(--text)' }}>
              <Icon name="lock" size={16} />
              <span>Audit Access Restricted</span>
            </div>
            <div style={{ marginTop: 8 }}>{restriction.restrictedReason}</div>
            <div style={{ marginTop: 8, fontSize: 'var(--t-caption, 11px)', color: 'var(--muted)' }}>
              Requires role: {restriction.restrictedRequiredRole} or higher.
            </div>
          </div>
        ) : (
          <>
            {/* Category Segmented Control */}
            <SegmentedControl<AuditCategoryFilter>
              ariaLabel="Filter audit category"
              options={categoryOptions}
              value={category}
              onChange={(next) => setCategory(next)}
            />

            {/* Error view */}
            {error && (
              <div
                role="alert"
                style={{
                  padding: 10,
                  borderRadius: 'var(--r-sm, 6px)',
                  background: 'color-mix(in srgb, var(--danger, #dc2626) 8%, var(--card))',
                  border: '1px solid var(--danger, #dc2626)',
                  color: 'var(--danger-text, #991b1b)',
                  fontSize: 'var(--t-meta, 13px)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <span>{error}</span>
                <Button variant="secondary" icon="refresh" onClick={fetchAuditTrail}>
                  Retry
                </Button>
              </div>
            )}

            {/* Loading Skeleton */}
            {loading ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {[1, 2, 3, 4].map((i) => (
                  <div
                    key={i}
                    style={{
                      height: 64,
                      borderRadius: 'var(--r-card, 8px)',
                      background: 'var(--card2, #f3f4f6)',
                      animation: 'pulse 1.5s infinite ease-in-out',
                    }}
                  />
                ))}
              </div>
            ) : filteredEvents.length === 0 ? (
              /* Empty state */
              <div
                style={{
                  padding: '32px 16px',
                  textAlign: 'center',
                  color: 'var(--muted, #6b7280)',
                  fontSize: 'var(--t-meta, 13px)',
                }}
              >
                <Icon name="activity" size={28} style={{ opacity: 0.4, marginBottom: 8 }} />
                <div>No audit events found for category: <strong>{category}</strong></div>
              </div>
            ) : (
              /* Timeline event list */
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {filteredEvents.map((event) => (
                  <div
                    key={event.id}
                    style={{
                      padding: 12,
                      borderRadius: 'var(--r-card, 8px)',
                      background: 'var(--card, #fff)',
                      border: '1px solid var(--border, #e5e7eb)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 6,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontWeight: 700, fontSize: 'var(--t-ui, 13px)' }}>
                        {event.action}
                      </span>
                      <span style={{ fontSize: 'var(--t-caption, 11px)', color: 'var(--muted)' }}>
                        <BsAdDate date={event.createdAtAd} tone="booking" />
                      </span>
                    </div>

                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        fontSize: 'var(--t-caption, 12px)',
                        color: 'var(--text2, #4b5563)',
                        flexWrap: 'wrap',
                      }}
                    >
                      <span>
                        Actor: <strong>{event.actorId || 'System'}</strong>
                      </span>
                      {event.actorRole && (
                        <Badge label={event.actorRole} tone="neutral" size="sm" />
                      )}
                      {event.status && event.status !== 'Success' && (
                        <Badge label={event.status} tone="danger" size="sm" />
                      )}
                    </div>

                    {event.reason && (
                      <div
                        style={{
                          fontSize: 'var(--t-caption, 12px)',
                          color: 'var(--text, #111827)',
                          background: 'var(--card2, #f9fafb)',
                          padding: '4px 8px',
                          borderRadius: 4,
                          marginTop: 2,
                        }}
                      >
                        <em>"{event.reason}"</em>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </ContextDrawer>
  )
}

export default RentalAuditDrawer
