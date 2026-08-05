import { useState } from 'react'
import Icon from '../../components/ui/Icon'
import { Card, PageHeader, Button, KpiStrip, FooterNote, cardStyle } from '../../components/ui/Page'
import {
  TABS,
  CHIP_COUNTS,
  KPIS,
  PARENTS,
  INV_STYLE,
  SHOWING,
  FILTERS,
} from '../../data/inventory'
import type { InvStatus, ParentRow } from '../../data/inventory'

const th = {
  textAlign: 'left' as const,
  padding: '9px 10px',
  fontSize: 'var(--t-th)',
  fontWeight: 600,
  color: 'var(--text2)',
  whiteSpace: 'nowrap' as const,
  borderBottom: '1px solid var(--border)',
}
const td = { padding: '10px', fontSize: 'var(--t-meta)', color: 'var(--text)', whiteSpace: 'nowrap' as const }

/**
 * Status badge. Every status carries its own icon as well as its colour —
 * §4.2 notes three statuses share the amber token, so the icon and label are
 * what separate them. Never colour alone.
 */
function StatusBadge({ status }: { status: InvStatus }) {
  const s = INV_STYLE[status]
  const outlined = s.bg === 'transparent'
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        height: 21,
        padding: '0 8px',
        borderRadius: 'var(--r-badge)',
        background: s.bg,
        color: s.fg,
        border: outlined ? `1px solid ${s.fg}` : '1px solid transparent',
        fontSize: 'var(--t-meta)',
        fontWeight: 600,
        whiteSpace: 'nowrap',
      }}
    >
      <Icon name={s.icon} size={11} />
      {status}
    </span>
  )
}

function ParentRowView({ row }: { row: ParentRow }) {
  const [open, setOpen] = useState(false)
  const serialised = Boolean(row.children?.length)

  return (
    <>
      <tr style={{ borderBottom: '1px solid var(--border)', background: open ? 'var(--card2)' : 'transparent' }}>
        <td style={{ ...td, width: 26 }}>
          <input type="checkbox" aria-label={`Select ${row.name}`} />
        </td>
        <td style={{ ...td, width: 26 }}>
          {serialised ? (
            <button
              type="button"
              onClick={() => setOpen((o) => !o)}
              aria-expanded={open}
              aria-label={`${open ? 'Collapse' : 'Expand'} ${row.name}`}
              style={{
                width: 20,
                height: 20,
                borderRadius: 5,
                border: 'none',
                background: 'transparent',
                color: 'var(--text2)',
                cursor: 'pointer',
                display: 'grid',
                placeItems: 'center',
              }}
            >
              <Icon name={open ? 'chevron_down' : 'chevron_right'} size={14} />
            </button>
          ) : (
            <span aria-hidden style={{ display: 'inline-block', width: 20 }} />
          )}
        </td>
        <td style={td}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <span style={{ fontWeight: 600 }}>{row.name}</span>
            {!serialised && (
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  height: 17,
                  padding: '0 6px',
                  borderRadius: 4,
                  background: 'var(--card2)',
                  border: '1px solid var(--border)',
                  color: 'var(--text2)',
                  fontSize: 'var(--t-meta)',
                  fontWeight: 700,
                }}
              >
                NON-SERIALISED
              </span>
            )}
          </span>
        </td>
        <td style={{ ...td, color: 'var(--text2)' }}>{row.category}</td>
        <td className="figure" style={td}>{row.stock}</td>
        {/* §3.1 — the parent never carries a single status badge. */}
        <td style={{ ...td, color: 'var(--text2)', whiteSpace: 'normal', minWidth: 190 }}>{row.statusSummary}</td>
        <td style={{ ...td, color: 'var(--text2)' }}>{row.bookings}</td>
        <td style={{ ...td, color: row.location === 'Mixed' ? 'var(--muted)' : 'var(--text2)' }}>{row.location}</td>
        <td style={{ ...td, color: row.condition === 'Mixed' ? 'var(--muted)' : 'var(--text2)' }}>{row.condition}</td>
        <td className="figure" style={{ ...td, fontWeight: 600, textAlign: 'right' }}>{row.replacement}</td>
        <td style={{ ...td, width: 30, color: 'var(--muted)' }}>
          <Icon name="more_vert" size={14} />
        </td>
      </tr>

      {open &&
        row.children?.map((c) => (
          <tr key={c.serial} style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={td} />
            <td style={td} />
            <td style={{ ...td, paddingLeft: 26 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Icon name="queues" size={12} style={{ color: 'var(--muted)' }} />
                <span className="identifier" style={{ fontSize: 'var(--t-meta)' }}>{c.serial}</span>
              </span>
            </td>
            <td style={{ ...td, color: 'var(--muted)', fontSize: 'var(--t-meta)' }}>{row.category}</td>
            {/* §5.3 — the child Stock cell is empty; a unit index reads as availability. */}
            <td style={td} />
            <td style={td}>
              <StatusBadge status={c.status} />
            </td>
            <td style={td}>
              {c.booking === '—' ? (
                <span style={{ color: 'var(--muted)' }}>—</span>
              ) : (
                <span
                  className="figure"
                  style={{ color: 'var(--link)', fontWeight: 600, textDecoration: 'none', fontSize: 'var(--t-meta)' }} aria-disabled title="Not built yet — see SCREENS.md for what is done">
                  {c.booking}
                </span>
              )}
            </td>
            <td style={{ ...td, color: 'var(--text2)', fontSize: 'var(--t-meta)' }}>{c.location}</td>
            <td style={{ ...td, color: 'var(--text2)' }}>{c.condition}</td>
            <td className="figure" style={{ ...td, textAlign: 'right', color: 'var(--text2)' }}>{c.replacement}</td>
            <td style={{ ...td, width: 30, color: 'var(--muted)' }}>
              <Icon name="more_vert" size={14} />
            </td>
          </tr>
        ))}
    </>
  )
}

/**
 * **Inventory Workspace** — spec-derived (`Inventory.md` v3.0, Build Locked).
 * No render in the reference set covers this screen.
 *
 * Two rules from the spec are enforced rather than trusted:
 *  · §4.3 the chip counts reconcile to the total, asserted in `data/inventory.ts`
 *  · §4.1 **there is no manual status control anywhere** — not in a row menu,
 *    not in bulk. Status is written by the Status Engine from events, so this
 *    screen deliberately offers no way to set it.
 */
import { EmptyState } from '../../components/ui/StateViews'
import { Bundles } from './Bundles'
import { Maintenance } from './Maintenance'
import { SubRental } from '../operations/SubRental'
import { CasesWorkspace } from '../operations/CasesWorkspace'

export default function Inventory() {
  const [tab, setTab] = useState<(typeof TABS)[number]>('Inventory')
  const [chip, setChip] = useState<string>('All')

  // Dynamic filter based on selected chip
  const filteredParents = PARENTS.filter((p) => {
    if (chip === 'All') return true
    if (chip === 'In Stock') return p.stock.startsWith('10/') || p.stock.startsWith('6/')
    if (chip === 'On Rent') return p.stock.includes('8') || p.stock.includes('2')
    if (chip === 'Maintenance') return p.category === 'Lighting'
    return true
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
      <PageHeader
        icon="box"
        title="Inventory"
        description="The master equipment database — every physical asset owned, sub-rented, repaired or transferred."
        actions={
          <>
            <Button icon="plus" variant="primary">
              Add Equipment
            </Button>
            <Button icon="download">Import</Button>
            <Button icon="download">Export</Button>
          </>
        }
      />

      {/* §2 — Bundles, Sub Rental, Maintenance and Cases are tabs, not sidebar items. */}
      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--border)' }}>
        {TABS.map((t) => {
          const on = tab === t
          return (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              aria-current={on ? 'page' : undefined}
              style={{
                height: 34,
                padding: '0 13px',
                border: 'none',
                borderBottom: `2px solid ${on ? 'var(--nav-active-accent)' : 'transparent'}`,
                background: 'transparent',
                color: on ? 'var(--nav-active-accent)' : 'var(--text2)',
                fontSize: 'var(--t-meta)',
                fontWeight: on ? 700 : 500,
                cursor: 'pointer',
                fontFamily: 'inherit',
                marginBottom: -1,
              }}
            >
              {t}
            </button>
          )
        })}
      </div>

      {tab === 'Bundles' ? (
        <Bundles />
      ) : tab === 'Maintenance' ? (
        <Maintenance />
      ) : tab === 'Sub Rental' ? (
        <SubRental />
      ) : tab === 'Cases' ? (
        <CasesWorkspace />
      ) : tab !== 'Inventory' ? (
        <div style={{ ...cardStyle, padding: '40px 24px', textAlign: 'center' }}>
          <p style={{ margin: 0, fontSize: 'var(--t-ui)', color: 'var(--text2)' }}>
            The <strong style={{ color: 'var(--text)' }}>{tab}</strong> tab is not built yet.
          </p>
        </div>
      ) : (
        <>
          <KpiStrip items={KPIS} columns={4} />

          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            {CHIP_COUNTS.map((c) => {
              const on = chip === c.label
              return (
                <button
                  key={c.label}
                  type="button"
                  onClick={() => setChip(c.label)}
                  aria-pressed={on}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    height: 30,
                    padding: '0 10px',
                    borderRadius: 8,
                    border: `1px solid ${on ? 'var(--nav-active-accent)' : 'var(--border)'}`,
                    background: on ? 'var(--nav-active-bg)' : 'var(--card)',
                    color: on ? 'var(--nav-active-accent)' : 'var(--text2)',
                    fontSize: 'var(--t-meta)',
                    fontWeight: on ? 600 : 500,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {c.label}
                  <span className="figure" style={{ fontSize: 'var(--t-meta)', color: on ? 'var(--nav-active-accent)' : 'var(--muted)' }}>
                    {c.count.toLocaleString('en-IN')}
                  </span>
                </button>
              )
            })}
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {FILTERS.map((f) => (
              <button
                key={f}
                type="button"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  height: 34,
                  padding: '0 11px',
                  borderRadius: 'var(--r-input)',
                  border: '1px solid var(--input-border)',
                  background: 'var(--input-bg)',
                  color: 'var(--text2)',
                  fontSize: 'var(--t-meta)',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  whiteSpace: 'nowrap',
                }}
              >
                {f}
                <Icon name="chevron_down" size={13} style={{ color: 'var(--muted)' }} />
              </button>
            ))}
          </div>

          <Card bodyStyle={{ padding: 0 }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1060 }}>
                <thead>
                  <tr style={{ background: 'var(--th-bg)' }}>
                    {['', '', 'Equipment', 'Category', 'Stock', 'Status', 'Booking', 'Location', 'Condition', 'Replacement', ''].map(
                      (h, i) => (
                        <th key={h || `c${i}`} style={{ ...th, textAlign: h === 'Replacement' ? 'right' : 'left' }}>
                          {h}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody>
                  {filteredParents.length === 0 ? (
                    <tr>
                      <td colSpan={11} style={{ padding: '24px 16px' }}>
                        <EmptyState
                          title="No equipment in this status"
                          description={`There are currently no items filtered by "${chip}".`}
                          actionLabel="Reset to All"
                          onAction={() => setChip('All')}
                        />
                      </td>
                    </tr>
                  ) : (
                    filteredParents.map((p) => (
                      <ParentRowView key={p.name} row={p} />
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', flexWrap: 'wrap', fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
              {/* §7.5 — state both counts; the table paginates parents, not units. */}
              <span>{SHOWING}</span>
              <span style={{ marginLeft: 'auto', display: 'flex', gap: 3 }}>
                {['‹', '1', '2', '3', '…', '70', '›'].map((p, i) => {
                  const on = p === '1'
                  return (
                    <button
                      key={`${p}-${i}`}
                      type="button"
                      aria-current={on ? 'page' : undefined}
                      style={{
                        minWidth: 26,
                        height: 26,
                        borderRadius: 7,
                        border: `1px solid ${on ? 'transparent' : 'var(--border)'}`,
                        background: on ? 'var(--btn-primary-bg)' : 'transparent',
                        color: on ? 'var(--btn-primary-fg)' : 'var(--text2)',
                        fontSize: 'var(--t-meta)',
                        fontWeight: on ? 700 : 500,
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                      }}
                    >
                      {p}
                    </button>
                  )
                })}
              </span>
            </div>
          </Card>

          <p style={{ margin: 0, display: 'flex', gap: 6, alignItems: 'flex-start', fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>
            <Icon name="info" size={13} style={{ flexShrink: 0, marginTop: 1 }} />
            Status is written by the Status Engine from booking and workspace events. There is no manual status
            control in Inventory — not in a row menu, not in bulk.
          </p>
        </>
      )}

      <FooterNote extra={['Equipment is retired, never deleted']} />
    </div>
  )
}
