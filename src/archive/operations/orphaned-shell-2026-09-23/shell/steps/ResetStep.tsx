import Icon from '../../../../components/ui/Icon'
import { cardStyle } from '../../../../components/ui/Page'
import type { OperationItem } from '../../../../data/operationsShell'

/**
 * Reset — absorbs Cleaning (`lib/workflow.ts` §1.5, already locked: "Reset
 * absorbs Cleaning… its per-item category checklists move inside Reset").
 * Acts on the returned set. Missing/Damaged items block reset for that item
 * only (§1.5: "Reset blocks the item returning to Available, never the
 * booking") — they need a Case resolved first, not invented here.
 *
 * `resetDone` is lifted to `OperationsShell` (matching `items`/`corrections`)
 * rather than local state — this panel unmounts every time another rail tab
 * is selected (`{step === 'Reset' && <ResetStep ... />}`), and a local
 * `useState` here silently lost every checked box on the way out.
 */
export default function ResetStep({
  items,
  readOnly,
  resetDone,
  onToggleReset,
}: {
  items: OperationItem[]
  readOnly: boolean
  resetDone: Set<string>
  onToggleReset: (itemId: string) => void
}) {
  const returned = items.filter((i) => i.returnState === 'Returned')
  const needsCase = items.filter((i) => i.returnState === 'Missing' || i.returnState === 'Damaged')
  const notYetBack = items.filter((i) => i.packState !== 'Pending' && i.returnState === 'Pending')

  if (items.every((i) => i.packState === 'Pending')) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--sp-sm)', padding: '40px 0', textAlign: 'center' }}>
        <Icon name="info" size={22} style={{ color: 'var(--muted)' }} />
        <p style={{ margin: 0, fontSize: 'var(--t-meta)', color: 'var(--text2)', maxWidth: 360 }}>
          Reset has nothing to do until items come back through Return.
        </p>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {returned.length > 0 && (
        <section>
          <h3 style={{ margin: '0 0 8px', fontSize: 'var(--t-meta)', fontWeight: 700, color: 'var(--text2)' }}>
            Clean &amp; re-shelve ({returned.filter((i) => !resetDone.has(i.id)).length} of {returned.length} remaining)
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {returned.map((it) => {
              const done = resetDone.has(it.id)
              /*
                The 18px box stays 18px — a 44px native checkbox is grotesque.
                The label is the target instead: a label forwards its clicks to
                the control it wraps, so a row carrying `minHeight: 44` gives
                §7.3 its hit area without touching the paint. Before this the
                row was only its 10px padding plus two short lines of
                --t-meta/--t-th text, which lands under 44 — a fingertip-sized
                miss for a caretaker checking items off on a docked tablet.
                Written as the bare number rather than var(--tap) to match the
                identical label wrappers in PackingWorkspace and
                ResetWorkspace. Growing the box rather than pasting a .tap
                ::after on it also matters here: these rows sit in a 6px-gap
                column, and two 44px pseudo-elements would have overlapped and
                stolen each other's clicks.
              */
              return (
                <label
                  key={it.id}
                  style={{ ...cardStyle, padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 10, minHeight: 44, cursor: readOnly ? 'default' : 'pointer', opacity: done ? 0.7 : 1 }}
                >
                  <input
                    type="checkbox"
                    checked={done}
                    disabled={readOnly}
                    onChange={() => onToggleReset(it.id)}
                    style={{ width: 18, height: 18, accentColor: 'var(--nav-active-accent)' }}
                  />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'block', fontWeight: 600, color: 'var(--text)', fontSize: 'var(--t-meta)', textDecoration: done ? 'line-through' : 'none' }}>{it.name}</span>
                    <span className="figure" style={{ fontSize: 'var(--t-th)', color: 'var(--muted)' }}>
                      Back to {it.location} · {it.trackingMode === 'serial' ? it.packedSerial : `${it.qtyReturned} units`}
                    </span>
                  </span>
                  {done && <Icon name="checklist" size={16} style={{ color: 'var(--success-text)' }} />}
                </label>
              )
            })}
          </div>
        </section>
      )}

      {needsCase.length > 0 && (
        <section>
          <h3 style={{ margin: '0 0 8px', fontSize: 'var(--t-meta)', fontWeight: 700, color: 'var(--danger-text)' }}>Blocked — needs a Case ({needsCase.length})</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {needsCase.map((it) => (
              <div key={it.id} style={{ ...cardStyle, padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 10 }}>
                <Icon name="alert_triangle" size={16} style={{ color: 'var(--danger-text)', flexShrink: 0 }} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontWeight: 600, color: 'var(--text)', fontSize: 'var(--t-meta)' }}>{it.name}</span>
                  <span style={{ fontSize: 'var(--t-th)', color: 'var(--muted)' }}>
                    {it.returnState} — this item stays out of Available until its Case resolves. §1.5: blocks the item, never the booking.
                  </span>
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {notYetBack.length > 0 && (
        <section>
          <h3 style={{ margin: '0 0 8px', fontSize: 'var(--t-meta)', fontWeight: 700, color: 'var(--text2)' }}>Still with the client ({notYetBack.length})</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {notYetBack.map((it) => (
              <div key={it.id} style={{ ...cardStyle, padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 10, color: 'var(--muted)' }}>
                <Icon name="dot" size={16} style={{ flexShrink: 0 }} />
                <span style={{ fontSize: 'var(--t-meta)' }}>{it.name} — not yet returned</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
