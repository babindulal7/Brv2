import { useState } from 'react'
import Icon from '../../components/ui/Icon'
import { Card, PageHeader, Button, KpiStrip, FooterNote, cardStyle } from '../../components/ui/Page'
import { EmptyState } from '../../components/ui/StateViews'
import { STATUS, BRAND, BRAND_TEXT } from '../../lib/status'
import type { StatusKey } from '../../lib/status'
import { TABS, KPIS, PLANS, STACK_NOTE, CHIPS, MEMBERS, LEGEND, SHOWING } from '../../data/membership'
import type { Plan, MemberRow } from '../../data/membership'

function Pill({ text, status, small }: { text: string; status: StatusKey; small?: boolean }) {
  const c = STATUS[status]
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        height: small ? 18 : 21,
        padding: small ? '0 6px' : '0 8px',
        borderRadius: 5,
        background: c.bg,
        color: c.fg,
        // §4.3.6 — the floor is --t-th; raw px also opts out of --ui-scale.
        fontSize: 'var(--t-th)',
        fontWeight: 600,
        whiteSpace: 'nowrap',
      }}
    >
      {text}
    </span>
  )
}

/**
 * Usage bar. A capped row is coloured and labelled "Limit reached" — the label
 * is what carries the meaning, the colour only reinforces it.
 */
function Usage({ u }: { u: { text: string; pct: number; capped?: boolean; suspended?: boolean } }) {
  const tone = u.suspended ? 'neutral' : u.capped ? 'danger' : 'primary'
  return (
    <span style={{ display: 'block', minWidth: 74 }}>
      <span className="figure" style={{ fontSize: 'var(--t-meta)', color: 'var(--text)' }}>
        {u.text}
      </span>
      <span
        aria-hidden
        style={{ display: 'block', height: 4, borderRadius: 999, background: 'var(--card2)', marginTop: 4, overflow: 'hidden' }}
      >
        <span style={{ display: 'block', width: `${u.pct}%`, height: '100%', background: BRAND[tone], borderRadius: 999 }} />
      </span>
      {(u.capped || u.suspended) && (
        <span style={{ display: 'block', fontSize: 'var(--t-meta)', color: BRAND_TEXT[tone], marginTop: 2 }}>
          {u.suspended ? 'Suspended' : 'Limit reached'}
        </span>
      )}
    </span>
  )
}

function PlanCard({ p }: { p: Plan }) {
  return (
    <article style={{ ...cardStyle, padding: 14, display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
        <span
          style={{
            width: 34,
            height: 34,
            borderRadius: 9,
            display: 'grid',
            placeItems: 'center',
            background: STATUS[p.badgeKey].bg,
            color: STATUS[p.badgeKey].fg,
            flexShrink: 0,
          }}
        >
          <Icon name={p.icon} size={18} fill />
        </span>
        <span style={{ minWidth: 0 }}>
          <span
            style={{ display: 'block', fontSize: 'var(--t-ui)', fontWeight: 700, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
          >
            {p.name}
          </span>
          <span style={{ display: 'block', marginTop: 3 }}>
            <Pill text={p.badge} status={p.badgeKey} small />
          </span>
        </span>
      </div>

      <div>
        <span className="figure" style={{ fontSize: p.per ? 19 : 14, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.02em' }}>
          {p.price}
        </span>
        {p.per && <span style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)', marginLeft: 4 }}>{p.per}</span>}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {p.discounts.map((d) => (
          <span key={d} style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
            {d}
          </span>
        ))}
      </div>

      <div style={{ borderTop: '1px dashed var(--border)', paddingTop: 9, display: 'flex', flexDirection: 'column', gap: 5 }}>
        {p.limits.map((l) => (
          <span key={l.label} style={{ display: 'flex', gap: 8, fontSize: 'var(--t-meta)', alignItems: 'baseline' }}>
            <span style={{ color: 'var(--text2)', flex: 1, minWidth: 0 }}>{l.label}</span>
            <span className="figure" style={{ fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap' }}>
              {l.value}
            </span>
          </span>
        ))}
      </div>

      <div style={{ borderTop: '1px dashed var(--border)', paddingTop: 9, display: 'flex', flexDirection: 'column', gap: 5 }}>
        {p.features.map((f) => (
          <span key={f.text} style={{ display: 'flex', gap: 6, fontSize: 'var(--t-meta)', alignItems: 'center' }}>
            <Icon
              name={f.kind === 'off' ? 'close' : f.kind === 'pending' ? 'timer' : 'dot'}
              size={12}
              style={{
                color:
                  f.kind === 'neutral'
                    ? 'var(--st-progress-fg)'
                    : f.kind === 'on'
                      ? 'var(--success-text)'
                      : 'var(--disabled)',
                flexShrink: 0,
              }}
            />
            <span style={{ color: f.kind === 'off' ? 'var(--muted)' : 'var(--text2)' }}>{f.text}</span>
          </span>
        ))}
      </div>

      <div style={{ marginTop: 'auto', borderTop: '1px solid var(--border)', paddingTop: 9 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
          <Icon name="users" size={13} style={{ color: 'var(--muted)' }} />
          {p.members}
        </span>
        <span
          style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 7, fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--link)', textDecoration: 'none' }} aria-disabled title="Not built yet — see SCREENS.md for what is done">
          View members
          <Icon name="arrow_right" size={12} />
        </span>
      </div>
    </article>
  )
}

const th = {
  textAlign: 'left' as const,
  padding: '9px 10px',
  fontSize: 'var(--t-th)',
  fontWeight: 600,
  color: 'var(--text2)',
  whiteSpace: 'nowrap' as const,
  borderBottom: '1px solid var(--border)',
}
const td = { padding: '10px', fontSize: 'var(--t-meta)', color: 'var(--text)', whiteSpace: 'nowrap' as const, verticalAlign: 'top' as const }

/**
 * Clients → **Membership**, built from render `4505348F`.
 *
 * Dates render **AD above BS** in this table because the render does — the
 * column headers say "Join Date (AD / BS)". Foundation's BS-leads rule governs
 * the Nepal Mode date pill and calendars; a two-line table cell that names its
 * own order in the header is not that case.
 */
export default function Membership() {
  const [tab, setTab] = useState<(typeof TABS)[number]>('Membership')
  const [chip, setChip] = useState('All')

  const filteredMembers = MEMBERS.filter((m) => {
    if (chip === 'All') return true
    return m.status === chip
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
      <PageHeader
        title="Clients"
        actions={
          <>
            <Button icon="plus" variant="primary">
              New Membership
            </Button>
            <Button icon="settings">Settings</Button>
          </>
        }
      />

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
                padding: '0 12px',
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

      {tab !== 'Membership' ? (
        <div style={{ ...cardStyle, padding: '40px 24px', textAlign: 'center' }}>
          <p style={{ margin: 0, fontSize: 'var(--t-ui)', color: 'var(--text2)' }}>
            The <strong style={{ color: 'var(--text)' }}>{tab}</strong> tab is not built yet — render `4505348F` only
            shows Membership in detail.
          </p>
        </div>
      ) : (
        <>
          <KpiStrip items={KPIS} columns={4} />

          <Card
            title="Membership Plans"
            action={
              <>
                <Button icon="queues">Cards</Button>
                <Button>Comparison Table</Button>
                <Button icon="tool">Edit Plans</Button>
              </>
            }
          >
            <p style={{ margin: '-4px 0 12px', fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
              Credit limits shown are defaults. Actual approved limit may vary per member.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0,1fr))', gap: 10, alignItems: 'stretch' }}>
              {PLANS.map((p) => (
                <PlanCard key={p.name} p={p} />
              ))}
            </div>
            <p
              style={{
                margin: '12px 0 0',
                display: 'flex',
                gap: 6,
                alignItems: 'flex-start',
                fontSize: 'var(--t-meta)',
                color: 'var(--text2)',
              }}
            >
              <Icon name="info" size={13} style={{ color: 'var(--muted)', flexShrink: 0, marginTop: 1 }} />
              {STACK_NOTE}
            </p>
          </Card>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            {CHIPS.map((c) => {
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
                    gap: 7,
                    height: 32,
                    padding: '0 11px',
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
                  <span
                    className="figure"
                    style={{
                      minWidth: 18,
                      height: 18,
                      borderRadius: 5,
                      display: 'inline-grid',
                      placeItems: 'center',
                      background: 'var(--card2)',
                      color: 'var(--text)',
                      fontSize: 'var(--t-meta)',
                      fontWeight: 700,
                      padding: '0 4px',
                    }}
                  >
                    {c.count}
                  </span>
                </button>
              )
            })}
            <span style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
              <Button icon="calendar">Renews within 30 days</Button>
              <Button icon="queues">More filters</Button>
              <Button icon="download">Export</Button>
            </span>
          </div>

          <Card bodyStyle={{ padding: 0 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '9px 12px',
                borderBottom: '1px solid var(--border)',
                background: 'var(--card2)',
                flexWrap: 'wrap',
              }}
            >
              <input type="checkbox" aria-label="Select all members" />
              <span style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>0 selected</span>
              {['Send Reminder', 'Export', 'Change Level', 'More'].map((b) => (
                <span key={b} style={{ opacity: 0.5 }}>
                  <Button>{b}</Button>
                </span>
              ))}
              <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
                Rows per page
                <span
                  className="figure"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 4, height: 26, padding: '0 8px', borderRadius: 7, border: '1px solid var(--border)' }}
                >
                  25
                  <Icon name="chevron_down" size={11} style={{ color: 'var(--muted)' }} />
                </span>
              </span>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1240 }}>
                <thead>
                  <tr style={{ background: 'var(--th-bg)' }}>
                    {['', 'Member', 'Level', 'Status', 'Join Date (AD / BS)', 'Renewal Date (AD / BS)', 'Days Left', 'Paid (Fee)', 'Membership Savings (vs full price)', 'Lifetime Spend', 'Bookings (This Month)', 'Active Rentals', 'Credit Limit (Rs)', 'Actions'].map(
                      (h, i) => (
                        <th key={h || i} style={th}>
                          {h}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody>
                  {filteredMembers.length === 0 ? (
                    <tr>
                      <td colSpan={14} style={{ padding: '24px 16px' }}>
                        <EmptyState
                          title="No members match this filter"
                          description={`No member records found for "${chip}".`}
                          actionLabel="Reset to All"
                          onAction={() => setChip('All')}
                        />
                      </td>
                    </tr>
                  ) : (
                    filteredMembers.map((m: MemberRow) => (
                      <tr key={m.name} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ ...td, width: 28 }}>
                          <input type="checkbox" aria-label={`Select ${m.name}`} />
                        </td>
                      <td style={td}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span
                            aria-hidden
                            style={{
                              width: 28,
                              height: 28,
                              borderRadius: 7,
                              background: m.avatarBg,
                              color: '#fff',
                              display: 'grid',
                              placeItems: 'center',
                              fontSize: 'var(--t-meta)',
                              fontWeight: 700,
                              flexShrink: 0,
                            }}
                          >
                            {m.initials}
                          </span>
                          <span style={{ minWidth: 0 }}>
                            <span style={{ display: 'block', fontWeight: 600 }}>{m.name}</span>
                            <span style={{ display: 'block', fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>{m.kind}</span>
                          </span>
                        </span>
                      </td>
                      <td style={td}>
                        <Pill text={m.level} status={m.levelKey} small />
                      </td>
                      <td style={td}>
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 5,
                            fontSize: 'var(--t-meta)',
                            fontWeight: 600,
                            color: m.status === 'Active' ? 'var(--success-text)' : 'var(--danger-text)',
                          }}
                        >
                          <Icon name="dot" size={9} />
                          {m.status}
                        </span>
                        <span style={{ display: 'block', fontSize: 'var(--t-meta)', color: 'var(--muted)', marginTop: 2 }}>{m.statusNote}</span>
                      </td>
                      <td style={td}>
                        <span className="figure" style={{ display: 'block' }}>{m.joinAd}</span>
                        <span className="figure" style={{ display: 'block', fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>{m.joinBs}</span>
                      </td>
                      <td style={td}>
                        <span className="figure" style={{ display: 'block' }}>{m.renewAd}</span>
                        <span className="figure" style={{ display: 'block', fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>{m.renewBs}</span>
                      </td>
                      <td className="figure" style={{ ...td, color: m.overdue ? 'var(--danger-text)' : 'var(--text)', fontWeight: 600 }}>
                        {m.daysLeft}
                      </td>
                      <td className="figure" style={td}>{m.fee}</td>
                      <td style={td}>
                        <span className="figure" style={{ display: 'block', color: 'var(--success-text)', fontWeight: 600 }}>{m.savings}</span>
                        <span className="figure" style={{ display: 'block', fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>{m.savingsPct}</span>
                      </td>
                      <td className="figure" style={{ ...td, fontWeight: 600 }}>{m.lifetime}</td>
                      <td style={td}>
                        <Usage u={m.bookings} />
                      </td>
                      <td style={td}>
                        <Usage u={m.rentals} />
                      </td>
                      <td style={td}>
                        <span className="figure" style={{ display: 'block', fontWeight: 600 }}>
                          {m.credit}
                        </span>
                        {m.creditNote && (
                          <span
                            className="figure"
                            style={{
                              display: 'block',
                              fontSize: 'var(--t-meta)',
                              color: 'var(--muted)',
                              textDecoration: m.creditStruck ? 'line-through' : 'none',
                            }}
                          >
                            {m.creditNote}
                          </span>
                        )}
                      </td>
                      <td style={{ ...td, width: 30, color: 'var(--muted)' }}>
                        <Icon name="more_vert" size={15} />
                      </td>
                    </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                padding: '10px 14px',
                flexWrap: 'wrap',
                fontSize: 'var(--t-meta)',
                color: 'var(--text2)',
              }}
            >
              <span>{SHOWING}</span>
              <span style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                {LEGEND.map((l) => (
                  <span key={l.text} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                    <Icon name="dot" size={9} style={{ color: BRAND[l.tone] }} />
                    {l.text}
                  </span>
                ))}
              </span>
              <span style={{ marginLeft: 'auto', display: 'flex', gap: 3 }}>
                {['1', '2', '›'].map((p) => {
                  const on = p === '1'
                  return (
                    <button
                      key={p}
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
        </>
      )}

      <FooterNote extra={['Discount stacking is capped at 25%']} />
    </div>
  )
}
