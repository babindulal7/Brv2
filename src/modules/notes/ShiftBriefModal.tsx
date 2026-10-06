/**
 * ShiftBriefModal — Shift Handover Brief Preview & WhatsApp/Telegram Exporter
 * Babin Rentals OS
 */

import { useState, useMemo } from 'react'
import { Modal } from '../../components/ui'
import Icon from '../../components/ui/Icon'
import { Button } from '../../components/ui/Button'
import { useOptionalToast } from '../../components/ui/Toast'
import {
  type InternalNote,
  formatShiftHandoverMarkdown,
} from '../../lib/queries/internalNotes'

interface ShiftBriefModalProps {
  isOpen: boolean
  onClose: () => void
  notes: InternalNote[]
}

export default function ShiftBriefModal({ isOpen, onClose, notes }: ShiftBriefModalProps) {
  const toast = useOptionalToast()
  const [includeGearAlerts, setIncludeGearAlerts] = useState(true)
  const [includeHandovers, setIncludeHandovers] = useState(true)
  const [includeLogistics, setIncludeLogistics] = useState(true)
  const [includeClients, setIncludeClients] = useState(true)
  const [includeGeneral, setIncludeGeneral] = useState(true)

  // Filter notes by selected sections
  const filteredNotes = useMemo(() => {
    return notes.filter(n => {
      if (n.status === 'resolved') return false
      if ((n.category === 'Gear Alert' || n.category === 'Equipment Alert') && !includeGearAlerts) return false
      if (n.category === 'Shift Handover' && !includeHandovers) return false
      if (n.category === 'Logistics & Transport' && !includeLogistics) return false
      if (n.category === 'Client Remark' && !includeClients) return false
      if (n.category === 'General' && !includeGeneral) return false
      return true
    })
  }, [notes, includeGearAlerts, includeHandovers, includeLogistics, includeClients, includeGeneral])

  const briefText = useMemo(() => {
    return formatShiftHandoverMarkdown(filteredNotes)
  }, [filteredNotes])

  const handleCopy = () => {
    if (navigator.clipboard) {
      void navigator.clipboard.writeText(briefText).then(() => {
        toast?.showSuccessToast('Brief Copied', 'Shift handover brief copied for WhatsApp / Telegram.')
      })
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Shift Brief & Handoff Summary"
      size="lg"
      footer={
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', width: '100%' }}>
          <Button variant="secondary" onClick={onClose} style={{ minHeight: 44 }}>
            Close
          </Button>
          <Button variant="primary" onClick={handleCopy} style={{ minHeight: 44 }}>
            <Icon name="copy" size={16} />
            Copy Shift Brief
          </Button>
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Category Toggles */}
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 12,
            padding: '10px 14px',
            borderRadius: 'var(--r-sm)',
            background: 'var(--surface-2)',
            border: '1px solid var(--border)',
            fontSize: '12px',
          }}
        >
          <span style={{ fontWeight: 600, color: 'var(--text)', alignSelf: 'center' }}>Include Sections:</span>
          <label style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={includeGearAlerts}
              onChange={e => setIncludeGearAlerts(e.target.checked)}
            />
            🚨 Equipment Alerts
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={includeHandovers}
              onChange={e => setIncludeHandovers(e.target.checked)}
            />
            🔄 Handovers
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={includeLogistics}
              onChange={e => setIncludeLogistics(e.target.checked)}
            />
            🚚 Logistics
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={includeClients}
              onChange={e => setIncludeClients(e.target.checked)}
            />
            👤 Client Remarks
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={includeGeneral}
              onChange={e => setIncludeGeneral(e.target.checked)}
            />
            📝 General
          </label>
        </div>

        {/* Markdown Brief Preview */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase' }}>
            Formatted Brief Preview ({filteredNotes.length} active items):
          </div>
          <pre
            style={{
              padding: '14px 16px',
              borderRadius: 'var(--r-card)',
              background: 'var(--input-bg)',
              border: '1px solid var(--border)',
              color: 'var(--text)',
              fontSize: '13px',
              fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)',
              lineHeight: 1.6,
              whiteSpace: 'pre-wrap',
              maxHeight: 340,
              overflowY: 'auto',
              margin: 0,
            }}
          >
            {briefText}
          </pre>
        </div>
      </div>
    </Modal>
  )
}
