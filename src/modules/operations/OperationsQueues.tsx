import { Link, useSearchParams, useNavigate } from 'react-router-dom'
import Icon from '../../components/ui/Icon'
import { Card, PageHeader, Button, Rail, FooterNote, cardStyle } from '../../components/ui/Page'
import { STATUS, BRAND } from '../../lib/status'
import { statusToken, JOBS as JOBS_META } from '../../lib/workflow'
import { QUEUES, JOBS, CREW_LOAD, NO_MONEY_NOTE } from '../../data/operations'
import { useTabularLayout } from '../../lib/device'
import CasesQueue from './CasesQueue'

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
 * **Operations Queues** — spec-derived (`04 Operations/README.md`, the canonical
 * 12-stage workflow). No render covers this screen.
 *
 * Every queue *is* a Foundation stage — the `Queue.stage` field is typed to the
 * four verbs of §1.5 — so the queue list cannot drift from the workflow. §README:
 * "No page defines its own status names."
 *
 * This is a warehouse screen, so it shows **no money at all**. That is one of
 * the rules `CLAUDE.md` flags as most easily broken.
 */
/**
 * §5.1's sidebar links each queue as `?queue=packing` and Today's count strip
 * and Pulse link here the same way. Those links navigated and scoped nothing:
 * **no screen in the app read the query string at all**, so the filter chip
 * highlighted and the table below it never moved. The URL is the state now, so
 * a queue is linkable, shareable and survives a reload — and the chip and the
 * sidebar child cannot disagree about which queue is open.
 */
const QUEUE_PARAM: Record<string, string> = {
  packing: 'Pack',
  handover: 'Handover',
  return: 'Return',
  reset: 'Reset',
  cases: 'Cases',
}

export default function OperationsQueues() {
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  /* DEVICES.md §7 build order item 1 — the job table and the fixed 288px Crew
     Load rail both break below 768. Law 13: branch on capability. */
  const tabular = useTabularLayout()
  const active = QUEUE_PARAM[params.get('queue') ?? ''] ?? null
  const setActive = (job: string | null) => {
    const key = Object.keys(QUEUE_PARAM).find((k) => QUEUE_PARAM[k] === job)
    if (key) setParams({ queue: key })
    else setParams({})
  }
  const jobs = active ? JOBS.filter((j) => j.job === active) : JOBS

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
      <PageHeader
        icon="queues"
        title="Operations Queues"
        description="Warehouse work, grouped by the stage it drains."
        actions={
          <>
            <Button icon="search" variant="primary">
              Scan Item
            </Button>
            <Button icon="refresh">Refresh</Button>
          </>
        }
      />

      {/* One card per queue. Selecting one filters the job list below. */}
      <section
        aria-label="Queues"
        style={{ display: 'grid', gridTemplateColumns: `repeat(${QUEUES.length}, minmax(0,1fr))`, gap: 'var(--sp-md)' }}
      >
        {QUEUES.map((q) => {
          const on = active === q.job
          // A queue's tone comes from the status its job runs at (§1.5).
          const tok = STATUS[q.job === 'Cases' ? 'danger' : statusToken(JOBS_META[q.job].runsAt)]
          return (
            <button
              key={q.job}
              type="button"
              onClick={() => setActive(on ? null : q.job)}
              aria-pressed={on}
              className="lift"
              style={{
                ...cardStyle,
                padding: '13px 14px',
                minWidth: 0,
                textAlign: 'left',
                cursor: 'pointer',
                fontFamily: 'inherit',
                borderColor: on ? 'var(--nav-active-accent)' : 'var(--border)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span
                  style={{ width: 28, height: 28, borderRadius: 8, display: 'grid', placeItems: 'center', background: tok.bg, color: tok.fg, flexShrink: 0 }}
                >
                  <Icon name={q.icon} size={15} fill />
                </span>
                <span
                  style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)', minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                >
                  {q.title}
                </span>
              </div>
              <div className="figure" style={{ fontSize: 'var(--t-h2)', fontWeight: 700, color: 'var(--text)', marginTop: 8, letterSpacing: '-0.02em' }}>
                {q.count}
              </div>
              <div style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)', marginTop: 2 }}>{q.action}</div>
              {/* Only renders above zero — a "0 overdue" line is noise. */}
              {q.overdue > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 6, fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--danger-text)' }}>
                  <Icon name="alert_triangle" size={11} fill />
                  {q.overdue} overdue
                </div>
              )}
              <div style={{ marginTop: 7 }}>
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    height: 18,
                    padding: '0 6px',
                    borderRadius: 4,
                    background: tok.bg,
                    color: tok.fg,
                    fontSize: 'var(--t-meta)',
                    fontWeight: 700,
                  }}
                >
                  {q.title}
                </span>
              </div>
            </button>
          )
        })}
      </section>

      {/*
        Cases is a queue with its own owner, not one of §1.5's four jobs, so it
        has no row in `JOBS` and its columns (Type, Disposition, Priority,
        Counterparty, Assessed, Outstanding) do not fit the generic job table.
        Selecting it used to filter `JOBS` to nothing and render an empty table.
        The queue cards stay above so this is still a place you can leave.
      */}
      {active === 'Cases' ? (
        <CasesQueue />
      ) : (
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: tabular ? 'minmax(0,1fr) 288px' : '1fr',
          gap: 'var(--sp-md)',
          alignItems: 'start',
        }}
      >
        <Card
          title={active ? `${active} — ${jobs.length} jobs` : `All jobs — ${jobs.length}`}
          action={active ? <Button onClick={() => setActive(null)}>Clear filter</Button> : undefined}
          bodyStyle={{ padding: tabular ? 0 : 10 }}
        >
          {!tabular && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {jobs.map((j) => {
                const tok = STATUS[statusToken(j.status)]
                return (
                  <article
                    key={j.id}
                    style={{
                      ...cardStyle,
                      padding: 12,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 6,
                      borderLeft: j.overdue ? '2px solid var(--danger)' : '1px solid var(--border)',
                      background: j.overdue ? 'var(--danger-soft)' : 'var(--card)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                      <span className="identifier" style={{ fontWeight: 700, color: 'var(--text)' }}>
                        {j.id}
                      </span>
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          height: 20,
                          padding: '0 8px',
                          borderRadius: 'var(--r-badge)',
                          background: tok.bg,
                          color: tok.fg,
                          fontSize: 'var(--t-meta)',
                          fontWeight: 600,
                          flexShrink: 0,
                        }}
                      >
                        {j.status}
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--t-meta)' }}>
                      <Link
                        to={`/rentals/${j.booking}`}
                        className="identifier"
                        style={{ color: 'var(--link)', fontWeight: 600, textDecoration: 'none' }}
                      >
                        {j.booking}
                      </Link>
                      <span style={{ color: 'var(--muted)' }}>·</span>
                      <span style={{ color: 'var(--text2)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {j.client}
                      </span>
                    </div>

                    <div style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
                      {j.kit}
                      <span style={{ color: 'var(--muted)', marginLeft: 6 }}>{j.items}</span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, fontSize: 'var(--t-meta)' }}>
                      <span style={{ color: 'var(--text2)' }}>{j.assignee}</span>
                      <span className="figure" style={{ color: j.overdue ? 'var(--danger-text)' : 'var(--text2)', fontWeight: j.overdue ? 700 : 400 }}>
                        {j.due}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        if ((j.job as string) === 'Cases') {
                          navigate('/operations/cases')
                        } else {
                          navigate(`/rentals/${j.booking}/${j.job.toLowerCase()}`)
                        }
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: '100%',
                        height: 40,
                        marginTop: 2,
                        borderRadius: 'var(--r-btn)',
                        border: '1px solid transparent',
                        background: 'var(--btn-primary-bg)',
                        color: 'var(--btn-primary-fg)',
                        fontSize: 'var(--t-meta)',
                        fontWeight: 600,
                        fontFamily: 'inherit',
                        cursor: 'pointer',
                      }}
                    >
                      Open Job
                    </button>
                  </article>
                )
              })}
            </div>
          )}
          {tabular && (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 820 }}>
              <thead>
                <tr style={{ background: 'var(--th-bg)' }}>
                  {['Job', 'Status', 'Booking', 'Client', 'Kit', 'Assignee', 'Due', 'Action'].map((h) => (
                    <th key={h} style={th}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {jobs.map((j) => {
                  const tok = STATUS[statusToken(j.status)]
                  return (
                    <tr
                      key={j.id}
                      style={{
                        borderBottom: '1px solid var(--border)',
                        borderLeft: j.overdue ? '2px solid var(--danger)' : '2px solid transparent',
                        background: j.overdue ? 'var(--danger-soft)' : 'transparent',
                      }}
                    >
                      <td className="identifier" style={{ ...td, fontWeight: 700 }}>{j.id}</td>
                      <td style={td}>
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            height: 20,
                            padding: '0 8px',
                            borderRadius: 'var(--r-badge)',
                            background: tok.bg,
                            color: tok.fg,
                            fontSize: 'var(--t-meta)',
                            fontWeight: 600,
                          }}
                        >
                          {j.status}
                        </span>
                      </td>
                      <td style={td}>
                        <Link to={`/rentals/${j.booking}`} className="identifier" style={{ color: 'var(--link)', fontWeight: 600, textDecoration: 'none', fontSize: 'var(--t-meta)' }}>
                          {j.booking}
                        </Link>
                      </td>
                      <td style={td}>{j.client}</td>
                      <td style={{ ...td, color: 'var(--text2)' }}>
                        {j.kit}
                        <span style={{ color: 'var(--muted)', marginLeft: 6, fontSize: 'var(--t-meta)' }}>{j.items}</span>
                      </td>
                      <td style={{ ...td, color: 'var(--text2)' }}>{j.assignee}</td>
                      <td className="figure" style={{ ...td, color: j.overdue ? 'var(--danger-text)' : 'var(--text2)', fontWeight: j.overdue ? 700 : 400 }}>
                        {j.due}
                      </td>
                      <td style={td}>
                        <Button
                          onClick={() => {
                            if ((j.job as string) === 'Cases') {
                              navigate('/operations/cases')
                            } else {
                              navigate(`/rentals/${j.booking}/${j.job.toLowerCase()}`)
                            }
                          }}
                        >
                          Open Job
                        </Button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          )}
        </Card>

        <Rail>
          <Card title="Crew Load">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {CREW_LOAD.map((c) => {
                const pct = Math.round((c.open / c.capacity) * 100)
                const tone = pct >= 100 ? 'danger' : pct >= 75 ? 'progress' : 'success'
                return (
                  <div key={c.name}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 7, fontSize: 'var(--t-meta)' }}>
                      <span style={{ flex: 1, minWidth: 0, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {c.name}
                      </span>
                      <span className="figure" style={{ fontWeight: 600, color: 'var(--text)' }}>
                        {c.open}/{c.capacity}
                      </span>
                    </div>
                    <div style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>{c.role}</div>
                    <div aria-hidden style={{ height: 5, borderRadius: 999, background: 'var(--card2)', marginTop: 5, overflow: 'hidden' }}>
                      <div style={{ width: `${Math.min(pct, 100)}%`, height: '100%', background: BRAND[tone], borderRadius: 999 }} />
                    </div>
                  </div>
                )
              })}
            </div>
          </Card>

          <div style={{ ...cardStyle, padding: 12, display: 'flex', gap: 7, alignItems: 'flex-start', fontSize: 'var(--t-meta)', color: 'var(--muted)', lineHeight: 1.5 }}>
            <Icon name="info" size={13} style={{ flexShrink: 0, marginTop: 1 }} />
            {NO_MONEY_NOTE}
          </div>
        </Rail>
      </div>
      )}

      <FooterNote extra={['Queues are stages — no page defines its own status names']} />
    </div>
  )
}
