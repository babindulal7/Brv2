import { Link } from 'react-router-dom'
import Icon from '../../components/ui/Icon'
import { STATUS } from '../../lib/status'
import type { AlertRow } from '../../types/today'
import { cardStyle } from '../../components/ui/Page'
import { PageBody } from '../../components/ui/PageBody'
import { Unavailable } from '../../components/ui/Unavailable'

/**
 * Dashboard.md §8 — priority-sorted.
 *
 * §8: **"every alert carries its own primary action… an alert with no action is
 * a notification, not an alert."** `Dashboard.PNG` draws no button on these
 * rows, and matching the render had left them inert text. **The whole row is the
 * action instead**: it is a `<Link>` to `a.to` carrying `a.action` as its
 * accessible name. That is pixel-identical to the render — no button appears —
 * while every alert is openable and §8 holds.
 *
 * ## Why this no longer filters to Critical
 *
 * ⚠ This panel used to render `CRITICAL_ALERTS` only, and cited exactly one
 * authority for doing so: §5.6's *"the Critical Alerts KPI is 'open alerts at
 * Critical priority only' and 'must equal the Alerts column count'"*. Spec 02
 * §2.1's KPI strip is **Out · In · Overdue · Cash due** — there is no Critical
 * Alerts card left for that invariant to hold against. Keeping the filter would
 * have left it with a dangling justification: the panel would go on hiding every
 * High-priority row (today, the quotes past their stated date) for a reason no
 * longer stated anywhere on the screen.
 *
 * So the filter is gone and **every alert this screen fetched is listed,
 * priority-sorted** — §8's own rule, which never asked for a filter. The
 * card-equals-column half of §5.6 survives in the only form spec 02 leaves room
 * for: `Today.tsx`'s reachable "Alerts" KPI counts the same array it passes
 * here, so the figure and the list cannot drift.
 *
 * ## Where the rows come from now
 *
 * ⛔ This panel used to render `criticalAlertsFor(money)` — six hand-typed rows
 * in `data/today.ts`: a battery three days overdue, a lens needing inspection,
 * invoice #INV-1021 unpaid at Rs 48,000, a missing SmallRig cage, a generator
 * service. Not one had a query behind it, and the money gate was a string sniff
 * (`a.right.startsWith('Rs')`).
 *
 * Every row is now built from a real booking by `overdueAlert` /
 * `quoteLapsedAlert` in `data/today.ts`, off two named filter sets that already
 * existed in `queries/bookings.ts`:
 *
 *   Critical  ← `overdue(businessNowAd())`        — On Rent, due back before now, never returned
 *   High      ← `quotesExpiring(businessNowAd())` — still a Quote, stated date passed
 *
 * **`useCanViewMoney` is gone from this file.** Neither alert carries a rupee
 * figure or a money action, so there is nothing for Law 6 to remove. The five
 * alert kinds that DID need other sources — equipment missing, maintenance due,
 * unpaid invoices, damage findings, inspection jobs — are simply not rendered:
 * `damage_findings` (0003:449), `payments` (0006:176) and the maintenance tables
 * have no list query yet, and an alert nobody can act on is the notification §8
 * says not to draw.
 */
/**
 * §8's order. A `Record` rather than an index lookup, so a fourth priority
 * cannot be added to `AlertRow` without deciding where it sorts.
 */
const PRIORITY_RANK: Record<AlertRow['priority'], number> = { Critical: 0, High: 1, Normal: 2 }

/**
 * §8's order, applied without mutating the caller's array.
 *
 * `Array.prototype.sort` is stable in every engine this ships to, which is the
 * property that matters here: within a priority band the rows keep the order
 * their query returned them in, so Critical rows stay in due-date order rather
 * than being reshuffled by the sort that groups them.
 *
 * Exported so the ordering can be pinned by a test without rendering a router.
 */
export function sortAlerts(alerts: readonly AlertRow[]): AlertRow[] {
  return [...alerts].sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority])
}

export default function AlertsPanel({
  alerts,
  loading,
  error,
  onRetry,
}: {
  /** Every alert this screen fetched, at any priority, already built from query rows. */
  alerts: AlertRow[]
  loading: boolean
  error: string | null
  onRetry: () => void
}) {
  /* Sorted here rather than by the caller: the order is this panel's rule (§8). */
  const rows = sortAlerts(alerts)
  const critical = rows.filter((a) => a.priority === 'Critical').length

  return (
    <section style={{ ...cardStyle, display: 'flex', flexDirection: 'column', minWidth: 0, height: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', padding: '13px 15px', borderBottom: '1px solid var(--border)' }}>
        <h2 style={{ margin: 0, fontSize: 'var(--t-ui)', fontWeight: 700, color: 'var(--text)' }}>Alerts</h2>
        {/* Law 11 — never colour alone. The pill was a bare red number; it now
            carries an icon and states, in its accessible name and beside it,
            how many of the total are Critical. The red is the third signal, not
            the only one. */}
        <span
          style={{
            marginLeft: 'var(--sp-sm)',
            height: 21,
            padding: '0 8px',
            borderRadius: 'var(--r-badge)',
            background: 'var(--st-danger-bg)',
            color: 'var(--st-danger-fg)',
            fontSize: 'var(--t-meta)',
            fontWeight: 700,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
          }}
          aria-label={loading ? 'Alert count loading' : `${rows.length} alerts, ${critical} critical`}
        >
          <Icon name="alert_triangle" size={12} fill />
          {/* Not a count of anything until the query has answered — an
              authoritative "0" over a still-loading list is a wrong figure. */}
          <span className="figure">{loading ? '—' : rows.length}</span>
          {!loading && critical > 0 && (
            <span className="figure" style={{ fontWeight: 600, opacity: 0.85 }}>
              · {critical} critical
            </span>
          )}
        </span>
        <Unavailable reason="Notification Center is not built yet — all active operational alerts are displayed in this panel.">
          <span
            style={{ marginLeft: 'auto', fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--muted)', cursor: 'not-allowed' }}
          >
            View all
          </span>
        </Unavailable>
      </div>

      {/*
        ⛔ This panel had NO empty state at all: an empty list rendered a header,
        a `0` badge and a blank body. Zero alerts is the best state this screen
        can be in and it should say so.
      */}
      <div style={{ flex: 1, ...(loading || error !== null || rows.length === 0 ? { padding: '14px 15px' } : {}) }}>
        <PageBody
          loading={loading}
          error={error}
          hasRows={rows.length > 0}
          onRetry={onRetry}
          empty={!loading && error === null && rows.length === 0}
          noun="alerts"
          skeleton="table"
          skeletonRows={3}
          emptyTitle="Nothing needs attention"
          emptyMessage="No booking is overdue and no quote has passed its stated date."
        >
          {rows.map((a, i) => {
            const c = STATUS[a.statusKey]
            return (
              <Link
                key={a.to + a.title}
                to={a.to}
                aria-label={`${a.action}: ${a.priority} — ${a.title} — ${a.detail}`}
                className="lift"
                style={{
                  display: 'grid',
                  gridTemplateColumns: '34px minmax(0,1fr) auto',
                  gap: 12,
                  padding: '12px 15px',
                  borderBottom: i < rows.length - 1 ? '1px solid var(--border)' : 'none',
                  alignItems: 'center',
                  color: 'inherit',
                  textDecoration: 'none',
                  transition: 'background-color 0.15s ease',
                }}
              >
                <span
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 10,
                    background: c.bg,
                    color: c.fg,
                    display: 'grid',
                    placeItems: 'center',
                    flexShrink: 0,
                    boxShadow: 'var(--shadow-sm)',
                  }}
                >
                  <Icon name={a.icon} size={16} fill />
                </span>

                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
                    <span
                      title={a.title}
                      style={{
                        fontSize: 'var(--t-ui)',
                        fontWeight: 700,
                        color: 'var(--text)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {a.title}
                    </span>
                    {/* Law 11 — the priority the list is sorted by is a word on
                        the row, not an inference from the icon's tint. */}
                    <span
                      style={{
                        flexShrink: 0,
                        fontSize: 'var(--t-meta)',
                        fontWeight: 700,
                        letterSpacing: '0.05em',
                        textTransform: 'uppercase',
                        /* --danger-text, not --st-danger-fg. This word sits
                           bare on the row — its sibling branch is --muted, not
                           a fill — and --st-danger-fg is --on-danger = #ffffff
                           in both themes. The CRITICAL label was white on the
                           card, so Law 11's required WORD was missing exactly
                           on the rows that most need it. */
                        color: a.priority === 'Critical' ? 'var(--danger-text)' : 'var(--muted)',
                      }}
                    >
                      {a.priority}
                    </span>
                  </div>
                  <div
                    title={a.detail}
                    style={{
                      marginTop: 2,
                      fontSize: 'var(--t-meta)',
                      color: 'var(--text2)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {a.detail}
                  </div>
                </div>

                <span
                  style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: STATUS[a.rightTone].fg, whiteSpace: 'nowrap', paddingTop: 2 }}
                >
                  {a.right}
                </span>
              </Link>
            )
          })}
        </PageBody>
      </div>

      {/*
        ⛔ The "+ N more alerts" footer is gone with the Critical-only filter it
        existed to apologise for: the N it counted was the High-priority rows
        this panel was hiding, and they are now in the list above it. "View all"
        in the header still reaches the full notification history, which is a
        different and larger set.
      */}
    </section>
  )
}
