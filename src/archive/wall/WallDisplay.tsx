import Icon from '../../components/ui/Icon'
import { STATUS } from '../../lib/status'
import { PICKUPS, RETURNS, TODAY_DATE, timeOf, statusKeyOf, has } from '../../data/today'
import type { Movement } from '../../types/today'

/**
 * **Wall display — `DEVICE/DEVICES.md` §6 "Strong ideas" / §7 build order item 6.**
 *
 * > "A wall display for the floor. Today Operations, read-only, on a cheap TV
 * > or an old monitor near the packing bench. No auth, no money — it shows
 * > what is due out and what is late. This is Today at 1.4× scale and it
 * > needs almost nothing new."
 *
 * Deliberately does NOT reuse `Today.tsx`'s `MovementList`/`AlertsPanel`: both
 * call `useCanViewMoney()`, which reads the ambient session — and this app's
 * `AuthProvider` currently always seeds a logged-in Owner, so "no session" never
 * actually occurs yet. A screen meant to run unattended in a public warehouse
 * space cannot depend on that being fixed correctly forever; it reads the raw
 * `Movement` rows directly instead, whose type carries no money field at all,
 * so there is nothing to leak by construction — no auth check required, no
 * auth check possible to get wrong.
 *
 * No links, no buttons, no hover cards, no row menu — every one of those on
 * `Today` exists to take an action, and this surface has no one signed in to
 * take one. Purely a read.
 */

const ROW_H = 30

function Row({ m, showDue }: { m: Movement; showDue: boolean }) {
  const key = statusKeyOf(m)
  const c = STATUS[key]
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '90px minmax(0,1fr) auto',
        alignItems: 'center',
        gap: 'var(--sp-lg)',
        padding: `${ROW_H / 2.5}px 4px`,
        borderBottom: '1px solid var(--border)',
      }}
    >
      <span className="figure" style={{ fontWeight: 700, color: 'var(--text)' }}>
        {timeOf(m)}
      </span>
      <span style={{ minWidth: 0 }}>
        <span style={{ display: 'block', fontWeight: 700, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {m.client}
        </span>
        <span style={{ display: 'block', color: 'var(--text2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {m.kit}
        </span>
      </span>
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          height: 34,
          padding: '0 12px',
          borderRadius: 'var(--r-badge)',
          background: c.bg,
          color: c.fg,
          fontWeight: 700,
          whiteSpace: 'nowrap',
        }}
      >
        {showDue && m.statusNote ? m.statusNote : m.status}
      </span>
    </div>
  )
}

function Column({ title, icon, rows, emptyText }: { title: string; icon: 'truck' | 'return_arrow'; rows: Movement[]; emptyText: string }) {
  return (
    <section
      style={{
        flex: 1,
        minWidth: 0,
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--card)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--r-card)',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--sp-md)',
          padding: '18px 20px',
          borderBottom: '2px solid var(--border)',
          background: 'var(--card2)',
        }}
      >
        <Icon name={icon} size={28} style={{ color: 'var(--nav-active-accent)' }} />
        <h2 style={{ margin: 0, fontWeight: 700, color: 'var(--text)' }}>{title}</h2>
        <span
          className="figure"
          style={{ marginLeft: 'auto', fontWeight: 700, color: 'var(--text)' }}
        >
          {rows.length}
        </span>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 20px' }}>
        {rows.length === 0 ? (
          <p style={{ padding: '24px 4px', color: 'var(--muted)' }}>{emptyText}</p>
        ) : (
          rows.map((m) => <Row key={m.id} m={m} showDue={icon === 'return_arrow'} />)
        )}
      </div>
    </section>
  )
}

/**
 * Route is mounted outside `<Shell>` in `App.tsx` — no login redirect, no
 * sidebar, no header, no Scanner FAB. A dedicated kiosk URL, not a page the
 * app's own navigation links to.
 */
export default function WallDisplay() {
  const dueOut = [...PICKUPS].sort((a, b) => a.at - b.at)
  const late = RETURNS.filter((m) => has(m, 'Overdue')).sort((a, b) => a.at - b.at)

  return (
    <div
      data-wall="true"
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        gap: 20,
        padding: 28,
        background: 'var(--app)',
      }}
    >
      <header style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-lg)' }}>
        <span
          aria-hidden
          style={{
            width: 56,
            height: 56,
            borderRadius: 'var(--r-card)',
            display: 'grid',
            placeItems: 'center',
            background: 'var(--nav-active-bg)',
            color: 'var(--nav-active-accent)',
            fontWeight: 700,
            flexShrink: 0,
          }}
          className="title"
        >
          BR
        </span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <h1 style={{ margin: 0, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.01em' }}>
            Today on the Floor
          </h1>
          <span style={{ display: 'block', color: 'var(--text2)' }}>
            Babin Rentals Pvt. Ltd. · Boudha, Kathmandu
          </span>
        </span>
        <span className="figure" style={{ textAlign: 'right', color: 'var(--text)', fontWeight: 700, lineHeight: 1.3 }}>
          {/* `TODAY_DATE.bs` is null outside the Date Engine's BS table; the
              English date takes the lead line rather than leaving this one blank. */}
          <span style={{ display: 'block' }}>{TODAY_DATE.bs ?? TODAY_DATE.ad}</span>
          {TODAY_DATE.bs && (
            <span style={{ display: 'block', fontWeight: 500, color: 'var(--text2)' }}>{TODAY_DATE.ad}</span>
          )}
        </span>
      </header>

      <div style={{ flex: 1, display: 'flex', gap: 20, minHeight: 0 }}>
        <Column title="Due Out Today" icon="truck" rows={dueOut} emptyText="Nothing scheduled to go out." />
        <Column title="Late / Overdue" icon="return_arrow" rows={late} emptyText="Nothing overdue right now." />
      </div>
    </div>
  )
}
