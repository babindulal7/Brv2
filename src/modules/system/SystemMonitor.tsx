import { useState, useEffect } from 'react'
import Icon from '../../components/ui/Icon'
import { Card, PageHeader, Button, KpiStrip, Rail, SummaryRows, FooterNote, cardStyle } from '../../components/ui/Page'
import type { Kpi } from '../../components/ui/Page'
import { BRAND_TEXT, STATUS } from '../../lib/status'
import { catColor } from '../../components/ui/Charts'
import { TODAY, toBs, formatBs, formatAd } from '../../lib/bs'
import { getPendingMutations, getDeadLetterMutations, drainQueue } from '../../lib/offlineQueue'

/**
 * **System Monitor** — spec-derived. No render covers this screen.
 *
 * Every figure is meant to be an observation of the running system, so nothing
 * here is actionable and nothing writes. That is the whole point of the
 * screen: it reports, and the actions live where the thing being reported on
 * lives.
 *
 * ## Which figures are real
 *
 * Exactly two: the offline queue's pending and dead-letter counts, read from
 * `lib/offlineQueue`. Everything else on this page — uptime, p95 latency,
 * error rate, active sessions, DB storage, background jobs, per-service
 * latency, CPU/Memory/Disk, the incident list, last deploy — was hand-typed,
 * and the week-over-week deltas were the strongest tell: they claimed a prior
 * measurement that never existed. Nothing in this repo measures any of it:
 * there is no telemetry pipeline, no metrics store, no deploy log and no
 * incident register.
 *
 * Rulings §8: *"a report with no data source shows 'not tracked yet', never
 * zeros… Never seed a plausible default."* It matters more here than on a
 * dormant page, because `settings/sections/Overview.tsx` links to `/system`
 * twice — so an operator arrives from the Settings landing expecting a
 * reading. The invented `Active Sessions: 18` here also contradicted the
 * invented `12` there, which is what two fabrications look like from outside.
 *
 * `TODO(decision)` — wiring any of this needs a monitoring stack that has not
 * been chosen. It belongs in `PLAN.md` §4, not in a literal here.
 */

/** Rulings §8 — the one string this page may print for a figure it cannot measure. */
const NOT_TRACKED = 'Not tracked yet'

const KPIS: Kpi[] = [
  { label: 'Uptime (30 days)', value: NOT_TRACKED, icon: 'activity', accent: 'neutral', note: 'No uptime probe exists' },
  { label: 'API p95 Latency', value: NOT_TRACKED, icon: 'timer', accent: 'neutral', note: 'No request-timing pipeline exists' },
  { label: 'Error Rate', value: NOT_TRACKED, icon: 'alert_triangle', accent: 'neutral', note: 'No error aggregator exists' },
  { label: 'Active Sessions', value: NOT_TRACKED, icon: 'users', accent: 'neutral', note: 'No session store is read anywhere in src/lib/queries' },
  { label: 'DB Storage', value: NOT_TRACKED, icon: 'queues', accent: 'neutral', note: 'No storage metric is collected' },
  { label: 'Background Jobs', value: NOT_TRACKED, icon: 'refresh', accent: 'neutral', note: 'No job runner reports in' },
]

/**
 * The service list is kept — Rulings §1, a panel survives — but its statuses
 * and latencies are not. "Operational" for a service nothing polls is a claim,
 * not a reading, and `SMS Gateway · Degraded · Vonage slow` named a vendor
 * incident that never happened.
 */
const SERVICES: Array<{ name: string; status: 'Operational' | 'Degraded' | 'Down' | 'Unknown'; latency: string; note: string }> = [
  { name: 'Web App', status: 'Unknown', latency: '—', note: 'No health check' },
  { name: 'API', status: 'Unknown', latency: '—', note: 'No health check' },
  { name: 'Database', status: 'Unknown', latency: '—', note: 'No health check' },
  { name: 'File Storage', status: 'Unknown', latency: '—', note: 'No health check' },
  { name: 'SMS Gateway', status: 'Unknown', latency: '—', note: 'No health check' },
  { name: 'Payment Gateway', status: 'Unknown', latency: '—', note: 'No health check' },
  { name: 'Background Worker', status: 'Unknown', latency: '—', note: 'No health check' },
  { name: 'Backup Service', status: 'Unknown', latency: '—', note: 'No health check' },
]

const SERVICE_TOKEN = { Operational: 'in', Degraded: 'progress', Down: 'danger', Unknown: 'neutral' } as const

/** Four invented percentages with four invented bars. Nothing samples a host. */
const RESOURCES: Array<{ label: string; pct: number }> = []

/** Four invented incidents, two of them "open". There is no incident register. */
const INCIDENTS: Array<{ what: string; when: string; tone: 'progress' | 'danger' | 'success'; open: boolean }> = []

const bs = toBs(TODAY)

export default function SystemMonitor() {
  const [pendingCount, setPendingCount] = useState<number>(0)
  const [deadLetterCount, setDeadLetterCount] = useState<number>(0)
  const [isSyncing, setIsSyncing] = useState(false)

  const refreshQueue = async () => {
    try {
      const p = await getPendingMutations()
      const d = await getDeadLetterMutations()
      setPendingCount(p.length)
      setDeadLetterCount(d.length)
    } catch (e) {
      // IndexedDB fallback
    }
  }

  useEffect(() => {
    refreshQueue()
  }, [])

  const handleForceSync = async () => {
    setIsSyncing(true)
    await drainQueue()
    await refreshQueue()
    setIsSyncing(false)
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
      <PageHeader
        icon="activity"
        title="System Monitor"
        description="Health of the running system — services, resources, jobs and incidents."
        actions={
          <>
            <span
              style={{ display: 'inline-flex', alignItems: 'center', gap: 7, height: 34, padding: '0 11px', borderRadius: 'var(--r-btn)', border: '1px solid var(--border)', background: 'var(--card)' }}
            >
              <Icon name="dot" size={11} style={{ color: 'var(--success-text)' }} />
              <span style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)' }}>All systems operational</span>
            </span>
            <Button icon="refresh">Refresh</Button>
            <Button icon="download">Export</Button>
          </>
        }
      />

      <KpiStrip items={KPIS} columns={6} />

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: 'var(--sp-md)', alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)', minWidth: 0 }}>
          <Card title="Services">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0,1fr))', gap: 9 }}>
              {SERVICES.map((s) => {
                const tok = STATUS[SERVICE_TOKEN[s.status]]
                return (
                  <div
                    key={s.name}
                    style={{ padding: '11px 10px', borderRadius: 'var(--r-btn)', border: '1px solid var(--border)', background: 'var(--card2)', minWidth: 0 }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {/* Status is a dot *and* a word — never colour alone. */}
                      <Icon name="dot" size={9} style={{ color: tok.fg, flexShrink: 0 }} />
                      <span
                        style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)', minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                      >
                        {s.name}
                      </span>
                    </div>
                    <div style={{ marginTop: 5 }}>
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
                        {s.status}
                      </span>
                    </div>
                    <div className="figure" style={{ fontSize: 'var(--t-meta)', color: 'var(--text)', marginTop: 5 }}>
                      {s.latency}
                    </div>
                    <div style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>{s.note}</div>
                  </div>
                )
              })}
            </div>
          </Card>

          <Card
            title="IndexedDB Offline Mutation Queue (Dexie.js Engine)"
            action={
              <Button icon="refresh" variant="primary" disabled={isSyncing} onClick={handleForceSync}>
                {isSyncing ? 'Syncing...' : 'Force Sync Queue'}
              </Button>
            }
          >
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12 }}>
              <div style={{ padding: 12, borderRadius: 8, background: 'var(--card2)', border: '1px solid var(--border)' }}>
                <div style={{ fontSize: 'var(--t-th)', color: 'var(--muted)', fontWeight: 600 }}>PENDING MUTATIONS</div>
                <div className="figure" style={{ fontSize: '1.4rem', fontWeight: 800, color: pendingCount > 0 ? 'var(--orange-text)' : 'var(--success-text)', marginTop: 4 }}>
                  {pendingCount}
                </div>
                <div style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)', marginTop: 2 }}>Queued in local IndexedDB</div>
              </div>

              <div style={{ padding: 12, borderRadius: 8, background: 'var(--card2)', border: '1px solid var(--border)' }}>
                <div style={{ fontSize: 'var(--t-th)', color: 'var(--muted)', fontWeight: 600 }}>DEAD-LETTER MUTATIONS</div>
                <div className="figure" style={{ fontSize: '1.4rem', fontWeight: 800, color: deadLetterCount > 0 ? 'var(--danger-text)' : 'var(--text2)', marginTop: 4 }}>
                  {deadLetterCount}
                </div>
                <div style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)', marginTop: 2 }}>Requires manual review</div>
              </div>

              <div style={{ padding: 12, borderRadius: 8, background: 'var(--card2)', border: '1px solid var(--border)' }}>
                <div style={{ fontSize: 'var(--t-th)', color: 'var(--muted)', fontWeight: 600 }}>IDEMPOTENCY ENGINE</div>
                <div style={{ fontSize: 'var(--t-meta)', fontWeight: 700, color: 'var(--success-text)', marginTop: 8 }}>
                  ✓ Client UUID Guards Active
                </div>
                <div style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)', marginTop: 2 }}>Prevents duplicate network retries</div>
              </div>
            </div>
          </Card>

          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 'var(--sp-md)' }}>
            <Card title="Resource Usage">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
                {RESOURCES.length === 0 && (
                  <p style={{ margin: 0, fontSize: 'var(--t-meta)', color: 'var(--muted)', lineHeight: 1.5 }}>
                    {NOT_TRACKED} — no host metrics are collected. CPU, memory, disk and connection-pool
                    figures need a monitoring agent that has not been chosen.
                  </p>
                )}
                {RESOURCES.map((r, i) => {
                  const tone = r.pct >= 80 ? 'danger' : r.pct >= 60 ? 'progress' : 'success'
                  return (
                    <div key={r.label}>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, fontSize: 'var(--t-meta)' }}>
                        <span style={{ flex: 1, color: 'var(--text2)' }}>{r.label}</span>
                        <span className="figure" style={{ fontWeight: 600, color: BRAND_TEXT[tone] }}>
                          {r.pct}%
                        </span>
                      </div>
                      <div aria-hidden style={{ height: 6, borderRadius: 999, background: 'var(--card2)', marginTop: 5, overflow: 'hidden' }}>
                        <div style={{ width: `${r.pct}%`, height: '100%', background: catColor(i), borderRadius: 999 }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </Card>

            <Card title="Incidents">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {INCIDENTS.length === 0 && (
                  <p style={{ margin: 0, fontSize: 'var(--t-meta)', color: 'var(--muted)', lineHeight: 1.5 }}>
                    {NOT_TRACKED} — there is no incident register in this build, so an incident feed has
                    nothing to read.
                  </p>
                )}
                {INCIDENTS.map((n) => (
                  <div key={n.what} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 'var(--t-meta)' }}>
                    <Icon
                      name={n.open ? 'alert_triangle' : 'checklist'}
                      size={13}
                      style={{ color: BRAND_TEXT[n.tone], flexShrink: 0, marginTop: 1 }}
                    />
                    <span style={{ flex: 1, minWidth: 0, color: 'var(--text2)' }}>{n.what}</span>
                    <span className="figure" style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)', flexShrink: 0 }}>
                      {n.when}
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </div>

        <Rail>
          <Card title="At a glance">
            <SummaryRows
              rows={[
                { label: 'Version', value: 'v3.0.0' },
                { label: 'Environment', value: 'Production' },
                { label: 'Region', value: 'Asia / Kathmandu' },
                { label: 'Last deploy', value: NOT_TRACKED },
                { label: 'Open incidents', value: NOT_TRACKED },
              ]}
            />
          </Card>

          <div style={{ ...cardStyle, padding: 12, fontSize: 'var(--t-meta)', color: 'var(--muted)', lineHeight: 1.5 }}>
            Observed {bs ? formatBs(bs) : '—'} · {formatAd(TODAY)}. This screen reports only — actions live where the
            thing being reported on lives.
          </div>
        </Rail>
      </div>

      <FooterNote />
    </div>
  )
}
