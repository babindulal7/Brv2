/**
 * EquipmentHoverCard — §25–§30.
 * Tabs: Current | History | Packing | Notes | Info (§107).
 * Packing state is per-booking, never global (§26).
 */

import { useState, type ReactNode } from 'react'
import { SmartHoverTabs } from '../SmartHoverShell'
import Icon from '../../ui/Icon'
import type { EquipmentPreview } from '../previewTypes'

export function EquipmentHoverCard({
  preview,
  canViewFinance,
  defaultTab,
  notesContent,
  onAction,
  onOpenRental,
}: {
  preview: EquipmentPreview
  canViewFinance: boolean
  defaultTab: string
  notesContent?: ReactNode
  onAction?: (id: string) => void
  onOpenRental?: (rentalNo: string) => void
}) {
  const [tab, setTab] = useState(defaultTab)
  return (
    <div>
      <div id="smart-hover-title" style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '14px 14px 8px' }}>
        <span aria-hidden="true" style={{ width: 36, height: 36, borderRadius: 8, background: 'var(--w08)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="box" size={18} />
        </span>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 15 }}>{preview.name}</div>
          <div className="identifier" style={{ fontSize: 12, color: 'var(--muted)' }}>{preview.assetCode}{preview.serial ? ` · ${preview.serial}` : ''} · {preview.statusLabel}</div>
          {preview.external === true ? (
            <span style={{ fontSize: 11, color: 'var(--ext-fg)', border: '1px solid var(--ext-line)', borderRadius: 'var(--r-chip)', padding: '2px 6px' }}>Sub-rented</span>
          ) : null}
        </div>
      </div>
      <SmartHoverTabs
        tabs={[
          { id: 'current', label: 'Current', count: preview.current.length },
          { id: 'history', label: 'History', count: preview.history.length },
          { id: 'packing', label: 'Packing' },
          { id: 'notes', label: 'Notes', count: preview.notes.length },
          { id: 'info', label: 'Info' },
        ]}
        active={tab}
        onChange={setTab}
      />
      <div role="tabpanel">
        {tab === 'current' ? (
          <ul style={{ margin: 0, padding: 0 }}>
            {preview.current.map((b) => (
              <li key={`${b.rentalId}-${b.pickupAt}`} style={{ listStyle: 'none', padding: '8px 0', borderTop: '1px solid var(--border)', fontSize: 13 }}>
                <div><strong>{b.clientName}</strong> · {onOpenRental ? <button type="button" onClick={() => onOpenRental(b.rentalNo)} style={{ minHeight: 'var(--tap)', border: 0, background: 'none', color: 'var(--link)', cursor: 'pointer' }}>#{b.rentalNo}</button> : `#${b.rentalNo}`}</div>
                <div style={{ fontSize: 12, color: 'var(--muted)' }}><span style={{ color: 'var(--booking-date-text)' }}>{b.pickupAt} → {b.returnAt}</span> · {b.qty}×</div>
                {b.packingLabel ? <div style={{ fontSize: 12 }}>{b.packingLabel}</div> : null}
              </li>
            ))}
            {preview.current.length === 0 ? <li style={{ listStyle: 'none', fontSize: 13, color: 'var(--muted)' }}>{preview.relationsLoaded === false ? 'Booking relationships not loaded.' : 'No current or upcoming bookings.'}</li> : null}
          </ul>
        ) : null}
        {tab === 'history' ? (
          <ul style={{ margin: 0, padding: 0 }}>
            {preview.history.map((h, i) => (
              <li key={`${h.rentalId}-${i}`} style={{ listStyle: 'none', padding: '8px 0', borderTop: '1px solid var(--border)', fontSize: 13 }}>
                <div><strong>{h.clientName}</strong> · {onOpenRental ? <button type="button" onClick={() => onOpenRental(h.rentalNo)} style={{ minHeight: 'var(--tap)', border: 0, background: 'none', color: 'var(--link)', cursor: 'pointer' }}>#{h.rentalNo}</button> : `#${h.rentalNo}`}</div>
                <div style={{ fontSize: 12, color: 'var(--muted)' }}><span style={{ color: 'var(--booking-date-text)' }}>{h.pickupAt} → {h.returnAt}</span></div>
                {h.note ? <div style={{ fontSize: 12 }}>{h.note}</div> : null}
              </li>
            ))}
            {preview.history.length === 0 && preview.relationsLoaded === false ? <li style={{ listStyle: 'none', fontSize: 13, color: 'var(--muted)' }}>Rental history not loaded.</li> : null}
          </ul>
        ) : null}
        {tab === 'packing' ? (
          preview.packing ? (
            <div>
              <p style={{ fontSize: 13, margin: '0 0 6px' }}>#{preview.packing.rentalNo} — packed for this booking, not globally.</p>
              <ul style={{ margin: 0, padding: 0 }}>
                {preview.packing.lines.map((l) => (
                  <li key={l.id} style={{ listStyle: 'none', padding: '6px 0', borderTop: '1px solid var(--border)', fontSize: 13 }}>
                    {l.status === 'packed' ? '✓ ' : l.status === 'blocked' || l.status === 'missing' || l.status === 'damaged' ? '🔴 ' : '○ '}
                    {l.label}{l.serial ? ` · ${l.serial}` : ''} — {l.status.replace(/_/g, ' ')}
                  </li>
                ))}
              </ul>
              {preview.packing.packedBy ? <p style={{ fontSize: 12, color: 'var(--muted)' }}>Packed by {preview.packing.packedBy}{preview.packing.updatedAt ? ` · ${preview.packing.updatedAt}` : ''}</p> : null}
              {onAction ? <button type="button" style={{ minHeight: 'var(--tap)', background: 'none', border: 'none', color: 'var(--link)', cursor: 'pointer' }} onClick={() => onAction('mark_packed')}>Mark packed</button> : null}
            </div>
          ) : (
            <p style={{ fontSize: 13, color: 'var(--muted)' }}>{preview.relationsLoaded === false ? 'Packing relationship not loaded.' : preview.current.length > 0 ? 'Open a booking to inspect packing for that rental.' : 'No active packing relationship for this equipment.'}</p>
          )
        ) : null}
        {tab === 'notes' ? (
          notesContent ?? <div>
            <ul style={{ margin: 0, padding: 0 }}>
              {preview.notes.map((n) => (
                <li key={n.id} style={{ listStyle: 'none', padding: '8px 0', borderTop: '1px solid var(--border)', fontSize: 13 }}>
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>{n.at} · {n.by}</div>
                  <div>{n.text}</div>
                </li>
              ))}
            </ul>
            {onAction ? <button type="button" style={{ minHeight: 'var(--tap)', background: 'none', border: 'none', color: 'var(--link)', cursor: 'pointer' }} onClick={() => onAction('add_note')}>+ Add note</button> : null}
          </div>
        ) : null}
        {tab === 'info' ? (
          <dl style={{ margin: 0, fontSize: 13, display: 'grid', gap: 6 }}>
            {preview.info.map((f) => (
              <div key={f.label}><dt style={{ color: 'var(--muted)', fontSize: 11 }}>{f.label.toUpperCase()}</dt><dd style={{ margin: 0 }}>{f.value}</dd></div>
            ))}
            {canViewFinance && preview.finance ? (
              <div><dt style={{ color: 'var(--muted)', fontSize: 11 }}>FINANCE</dt><dd style={{ margin: 0 }}>{preview.finance.map((f) => `${f.label}: ${f.value}`).join(' · ')}</dd></div>
            ) : null}
          </dl>
        ) : null}
      </div>
    </div>
  )
}
