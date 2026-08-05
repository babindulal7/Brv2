import Icon from '../../components/ui/Icon'
import { Card, PageHeader, Button, KpiStrip, Rail, SummaryRows, FooterNote, cardStyle } from '../../components/ui/Page'
import type { Kpi } from '../../components/ui/Page'
import { BRAND_TEXT, STATUS } from '../../lib/status'
import { catColor } from '../../components/ui/Charts'
import { TODAY, toBs, formatBs, formatAd } from '../../lib/bs'

/**
 * **System Monitor** — spec-derived. No render covers this screen.
 *
 * Every figure is an observation of the running system, so nothing here is
 * actionable and nothing writes. That is the whole point of the screen: it
 * reports, and the actions live where the thing being reported on lives.
 */

const KPIS: Kpi[] = [
  { label: 'Uptime (30 days)', value: '99.98%', icon: 'activity', accent: 'success', note: '8m 38s downtime' },
  { label: 'API p95 Latency', value: '182 ms', icon: 'timer', accent: 'primary', delta: { direction: 'down', text: '14 ms vs last week', good: true } },
  { label: 'Error Rate', value: '0.06%', icon: 'alert_triangle', accent: 'progress', delta: { direction: 'down', text: '0.02% vs last week', good: true } },
  { label: 'Active Sessions', value: '18', icon: 'users', accent: 'primary', note: 'Across 6 branches' },
  { label: 'DB Storage', value: '486 GB', icon: 'queues', accent: 'primary', note: '38% of 1.2 TB' },
  { label: 'Background Jobs', value: '3', icon: 'refresh', accent: 'success', note: 'Running, none stuck' },
]

const SERVICES: Array<{ name: string; status: 'Operational' | 'Degraded' | 'Down'; latency: string; note: string }> = [
  { name: 'Web App', status: 'Operational', latency: '96 ms', note: 'All regions' },
  { name: 'API', status: 'Operational', latency: '182 ms', note: 'p95' },
  { name: 'Database', status: 'Operational', latency: '11 ms', note: 'Primary + replica' },
  { name: 'File Storage', status: 'Operational', latency: '140 ms', note: 'Object store' },
  { name: 'SMS Gateway', status: 'Degraded', latency: '210 ms', note: 'Vonage slow' },
  { name: 'Payment Gateway', status: 'Operational', latency: '320 ms', note: 'eSewa, Khalti' },
  { name: 'Background Worker', status: 'Operational', latency: '—', note: '3 running' },
  { name: 'Backup Service', status: 'Operational', latency: '—', note: 'Last run 02:15 AM' },
]

const SERVICE_TOKEN = { Operational: 'in', Degraded: 'progress', Down: 'danger' } as const

const RESOURCES = [
  { label: 'CPU', pct: 34 },
  { label: 'Memory', pct: 58 },
  { label: 'Disk', pct: 38 },
  { label: 'DB Connections', pct: 46 },
]

const INCIDENTS = [
  { what: 'SMS gateway latency above threshold', when: '11 min ago', tone: 'progress' as const, open: true },
  { what: 'Backup verification failed', when: '2 h ago', tone: 'danger' as const, open: true },
  { what: 'Scheduled maintenance completed', when: 'Yesterday', tone: 'success' as const, open: false },
  { what: 'API rate limit spike from webhook', when: '2 days ago', tone: 'progress' as const, open: false },
]

const bs = toBs(TODAY)

export default function SystemMonitor() {
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

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 288px', gap: 'var(--sp-md)', alignItems: 'start' }}>
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

          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 'var(--sp-md)' }}>
            <Card title="Resource Usage">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
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
                { label: 'Last deploy', value: '3 days ago' },
                { label: 'Open incidents', value: '2', tone: 'progress' },
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
