import { useEffect } from 'react'
import Icon from '../../components/ui/Icon'
import { Card, PageHeader, Button, KpiStrip, ReflowRail, SummaryRows, FooterNote, useRailGridColumns } from '../../components/ui/Page'
import { DataTableShell } from '../../components/ui/DataTable'
import { Donut, Legend, catColor } from '../../components/ui/Charts'
import { Unavailable } from '../../components/ui/Unavailable'
import { useAuth } from '../../lib/auth'
import { useViewport } from '../../lib/device'
import { canManageSettings } from '../../lib/rbac'
import { STATUS, BRAND, BRAND_TEXT } from '../../lib/status'
import {
  getAuditSettingsSummary,
  KPIS,
  LOG_EVENTS,
  CATEGORIES,
  RETENTION,
  AUDIT_RULES,
  COMPLIANCE,
  LEGAL_HOLD,
  BY_MODULE,
  TOTAL_EVENTS,
  BY_USER,
  BY_BRANCH,
  HIGH_RISK,
  GROWTH,
  INSIGHTS,
  SUMMARY,
  ALERTS,
  QUICK_ACTIONS,
  ACTIVITY,
} from '../../lib/queries/audit'

const th = {
  textAlign: 'left' as const,
  padding: '8px 10px',
  fontSize: 'var(--t-th)',
  fontWeight: 600,
  color: 'var(--text2)',
  whiteSpace: 'nowrap' as const,
  borderBottom: '1px solid var(--border)',
}
/*
 * §7.3's row floor ("rows >= 56px") written with the token rather than as
 * padding arithmetic — `height` on a `<td>` behaves as a MINIMUM, so the short
 * rows come up to the floor and nothing else on the row moves.
 *
 * Why this is data integrity and not taste: one object dresses BOTH tables here
 * and they are not the same shape. Audit Rules ends every row with a 44x44
 * actions target, so those rows already pitch around 62 and satisfy the floor
 * incidentally. Retention Policies carries only a status pill and pitches
 * around 38 — precisely the shape where a 44px target overhangs its neighbours
 * by a few pixels at each edge and the LATER row in the DOM takes a tap landing
 * in that band. Retention Policies has no row control today, but it sits one
 * ungated "Add Retention Policy" away from having one, and a floor that holds
 * only on the table that already has actions is not a floor.
 */
const td = { height: 'var(--row-min-h)', padding: '9px 10px', fontSize: 'var(--t-meta)', color: 'var(--text)', whiteSpace: 'nowrap' as const }
const link = { fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--link)', textDecoration: 'none' } as const

/* ── Phase 2.7 named reasons ──────────────────────────────────────────────
   Two different sentences on purpose: a Coordinator or Accounts session is
   stopped by the GATE; the settings tier is stopped by the missing WRITE
   PATH. Reading the wrong one would misstate why the control is parked. */

/**
 * The settings gate — `canManageSettings`, the same tier Settings edits under
 * (Owner today; the role set lives in `rbac.ts`, not here). Audit
 * configuration decides what is logged and how long it is kept for every
 * role, so reaching this page (any money-sighted role can) is not the same
 * as being allowed to change it.
 */
const SETTINGS_ONLY_UNAVAILABLE =
  'Gated by canManageSettings — the same tier Settings edits under (Owner today). ' +
  'Audit configuration decides what is logged and how long it is kept for every role.'

/** The wiring reason the settings tier reads on every write-shaped control. */
const AUDIT_WRITES_UNAVAILABLE =
  'Not available in this build — no audit-settings table or action path exists yet, ' +
  'so nothing this control changed would persist.'

/** Read-shaped controls (verify, export, report) with no service behind them. */
const NOT_BUILT_UNAVAILABLE = 'Specified but not built — this build has no audit-settings service to run it against.'

/** Refresh — same sentence the Numbering seed build used before its conversion. */
const NOTHING_TO_REFRESH =
  'Nothing to refresh — every figure on this page is still the transcribed seed; a live read arrives with this screen’s conversion.'

/** The per-row overflow menu on Audit Rules. */
const ROW_MENU_UNAVAILABLE = 'The rule row menu is specified but not built yet.'

/** Law 16 — no AI panel until it is backed by a validated computation. */
const ASSISTANT_UNAVAILABLE =
  /* No AI assistant runs in this build (Law 16 — no AI panel until it is backed by a validated computation), so this box would send the question nowhere. */ "The audit assistant is not available yet."

/**
 * The one stored fact the "Global Audit Logging" row claims. A seed value
 * today — when an audit-settings table exists this becomes a live read. The
 * switch and the word beside it BOTH derive from this constant, so they can
 * never disagree again (the old build hard-coded the word "Enabled" beside a
 * switch that could be flipped off).
 */
const GLOBAL_AUDIT_ON = true

/**
 * A read-only switch indicator. Phase 2.7: no audit-settings table or action
 * path exists in this build, so an operable switch here would flip local
 * state and persist nothing — the previous build did exactly that, and a
 * remount silently restored the seed. Every toggle now renders inert inside
 * `Unavailable`; the caller's reason says whether the operator is stopped by
 * the settings gate or by the missing write path.
 */
function GatedToggle({ on, label, reason }: { on: boolean; label: string; reason: string }) {
  return (
    /* Law 15 — the wrapper is the focus/long-press target, so it is the thing
       that must reach 44px, not the drawn 30×17 track. */
    <Unavailable reason={reason} style={{ minHeight: 44, alignItems: 'center', flexShrink: 0 }}>
      <span
        role="switch"
        aria-checked={on}
        aria-disabled
        aria-label={label}
        style={{
          width: 30,
          height: 17,
          borderRadius: 'var(--r-badge)',
          padding: 2,
          background: on ? 'var(--success)' : 'var(--disabled)',
          opacity: 0.7,
          flexShrink: 0,
          display: 'flex',
          justifyContent: on ? 'flex-end' : 'flex-start',
        }}
      >
        <span aria-hidden style={{ width: 13, height: 13, borderRadius: 'var(--r-badge)', background: 'var(--on-accent)', display: 'block' }} />
      </span>
    </Unavailable>
  )
}

function StatusPill({ text }: { text: string }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        height: 19,
        padding: '0 7px',
        borderRadius: 5,
        background: STATUS.in.bg,
        color: STATUS.in.fg,
        fontSize: 'var(--t-meta)',
        fontWeight: 600,
      }}
    >
      {text}
    </span>
  )
}

/** Ranked horizontal bars — one hue, because rank is not a category. */
function RankBars({ rows, tone }: { rows: Array<{ name: string; value: string; pct: number }>; tone: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
      {rows.map((r) => (
        <div key={r.name} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <span
            style={{ width: 88, flexShrink: 0, fontSize: 'var(--t-meta)', color: 'var(--text2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
          >
            {r.name}
          </span>
          <span aria-hidden style={{ flex: 1, minWidth: 0, height: 11, background: 'var(--card2)', borderRadius: 3 }}>
            <span style={{ display: 'block', width: `${r.pct}%`, height: '100%', background: catColor(tone), borderRadius: 3 }} />
          </span>
          <span className="figure" style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)', flexShrink: 0, minWidth: 40, textAlign: 'right' }}>
            {r.value}
          </span>
        </div>
      ))}
    </div>
  )
}

function MiniLine({ d, tone }: { d: { yTicks: string[]; labels: string[]; points: number[] }; tone: number }) {
  const w = 100
  const h = 100
  const max = Math.max(...d.points)
  return (
    <div>
      <div style={{ display: 'flex', gap: 6 }}>
        <div
          aria-hidden
          style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', height: 80, fontSize: 'var(--t-meta)', color: 'var(--muted)', textAlign: 'right', flexShrink: 0 }}
        >
          {d.yTicks.map((t) => (
            <span key={t} className="figure">
              {t}
            </span>
          ))}
        </div>
        <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden style={{ width: '100%', height: 80 }}>
          <polyline
            points={d.points.map((p, i) => `${(i / (d.points.length - 1)) * w},${h - (p / max) * h}`).join(' ')}
            fill="none"
            stroke={catColor(tone)}
            strokeWidth={1.8}
            vectorEffect="non-scaling-stroke"
            strokeLinejoin="round"
          />
          {d.points.map((p, i) => (
            <circle
              key={i}
              cx={(i / (d.points.length - 1)) * w}
              cy={h - (p / max) * h}
              r={1.8}
              fill={catColor(tone)}
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </svg>
      </div>
      <div aria-hidden style={{ display: 'flex', justifyContent: 'space-between', paddingLeft: 26, marginTop: 'var(--sp-xs)', fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>
        {d.labels.map((l) => (
          <span key={l} className="figure">
            {l}
          </span>
        ))}
      </div>
    </div>
  )
}

/**
 * Administration → **Audit Settings**, built from render `13590713`.
 *
 * The Audit Logs retention row reads "Forever / Never Delete" and is the one
 * row with no expiry — that is Foundation's "nothing is deleted" rule showing
 * up in the retention table, not a data-entry accident.
 *
 * ## Phase 2.7 — the gate, and the end of the working-looking controls
 *
 * The route guard admits every money-sighted role (`/admin` is a money
 * surface), so Coordinator and Accounts sessions reach this screen. Before
 * this pass they found 16 operable toggles and nine manage buttons — the
 * toggles flipped local state that persisted nowhere, and the buttons had no
 * handler at all. Every write-shaped control is now inert inside
 * `Unavailable`: a non-settings role reads the gate
 * (`SETTINGS_ONLY_UNAVAILABLE`); the settings tier reads the missing write
 * path (`AUDIT_WRITES_UNAVAILABLE`). The figures on the page are still the
 * transcribed seed — converting the reads is later wiring, not this pass's.
 *
 * ## Phase 3.1 — reflow, not hide
 *
 * The rail is `ReflowRail` over `useRailGridColumns()` (Rulings §7, binding):
 * below 1280 the five rail cards reflow underneath as a plain column instead
 * of collapsing to a 44px handle on the warehouse tablet.
 */
export default function AuditSettings() {
  const viewport = useViewport()
  const { user } = useAuth()
  /** Phase 2.7 — the same tier Settings edits under. The role set lives in `rbac.ts`. */
  const mayManage = canManageSettings(user?.role ?? 'Client')
  /** Which sentence a write-shaped control states: the gate outranks the wiring gap. */
  const whyNoWrite = mayManage ? AUDIT_WRITES_UNAVAILABLE : SETTINGS_ONLY_UNAVAILABLE
  const railGridColumns = useRailGridColumns()

  useEffect(() => {
    getAuditSettingsSummary().catch(() => {})
  }, [])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
      <PageHeader
        icon="settings"
        title="Audit Settings"
        description="Configure audit logging, retention policies and compliance rules to ensure accountability and data integrity."
        actions={
          <>
            <Unavailable reason={whyNoWrite}>
              <Button icon="plus" variant="primary" disabled>
                Create Audit Rule
              </Button>
            </Unavailable>
            <Unavailable reason={NOT_BUILT_UNAVAILABLE}>
              <Button icon="download" disabled>
                Export
              </Button>
            </Unavailable>
            <Unavailable reason={NOT_BUILT_UNAVAILABLE}>
              <Button icon="checklist" disabled>
                Verify Logs
              </Button>
            </Unavailable>
            <Unavailable reason={NOTHING_TO_REFRESH}>
              <Button icon="refresh" disabled>
                Refresh
              </Button>
            </Unavailable>
          </>
        }
      />

      <div style={{ display: 'grid', gridTemplateColumns: railGridColumns, gap: 'var(--sp-md)', alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)', minWidth: 0 }}>
          <KpiStrip items={KPIS} columns={viewport === 'phone' ? 1 : viewport === 'tablet' ? 2 : 6} />

          <div
            style={{
              display: 'grid',
              gridTemplateColumns:
                viewport === 'phone'
                  ? 'minmax(0,1fr)'
                  : viewport === 'tablet'
                    ? 'repeat(2, minmax(0,1fr))'
                    : 'minmax(0,1fr) minmax(0,1.05fr) minmax(0,1.25fr)',
              gap: 'var(--sp-md)',
            }}
          >
            <Card title="Audit Configuration">
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 9,
                  padding: '8px 10px',
                  borderRadius: 'var(--r-btn)',
                  background: 'var(--card2)',
                  border: '1px solid var(--border)',
                }}
              >
                <span style={{ flex: 1, fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)' }}>Global Audit Logging</span>
                <GatedToggle on={GLOBAL_AUDIT_ON} label="Global audit logging" reason={whyNoWrite} />
                {/* Derived from the same constant as the switch — the old
                    hard-coded "Enabled" could sit beside an off switch. */}
                <span
                  style={{
                    fontSize: 'var(--t-meta)',
                    color: GLOBAL_AUDIT_ON ? 'var(--success-text)' : 'var(--muted)',
                    fontWeight: 600,
                  }}
                >
                  {GLOBAL_AUDIT_ON ? 'Enabled' : 'Disabled'}
                </span>
              </div>

              <div style={{ marginTop: 11 }}>
                <div style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)' }}>Audit Level (Granularity)</div>
                <Unavailable reason={whyNoWrite} style={{ width: '100%' }}>
                  <span
                    aria-label="Audit level: Detailed"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      width: '100%',
                      /* Law 15 — 44px, matching every other gated field. */
                      minHeight: 44,
                      marginTop: 5,
                      padding: '0 9px',
                      borderRadius: 'var(--r-input)',
                      border: '1px solid var(--input-border)',
                      background: 'var(--input-bg)',
                      color: 'var(--text2)',
                      fontSize: 'var(--t-meta)',
                      fontFamily: 'inherit',
                    }}
                  >
                    <span style={{ flex: 1, textAlign: 'left' }}>Detailed</span>
                    <Icon name="chevron_down" size={13} style={{ color: 'var(--muted)' }} />
                  </span>
                </Unavailable>
                <p style={{ margin: '5px 0 0', fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>
                  Captures detailed context for all critical actions.
                </p>
              </div>

              <div style={{ marginTop: 'var(--sp-md)' }}>
                <div style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>Log These Events</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '5px 10px' }}>
                  {LOG_EVENTS.map((e, i) => (
                    <span key={e.label} style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                      <Icon name="checklist" size={12} style={{ color: catColor(i % 8), flexShrink: 0 }} />
                      <span
                        style={{ flex: 1, minWidth: 0, fontSize: 'var(--t-meta)', color: 'var(--text2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                      >
                        {e.label}
                      </span>
                      <GatedToggle on={e.on} label={e.label} reason={whyNoWrite} />
                    </span>
                  ))}
                </div>
              </div>

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 7,
                  marginTop: 'var(--sp-md)',
                  paddingTop: 10,
                  borderTop: '1px solid var(--border)',
                }}
              >
                <span style={{ flex: 1, fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>Exclude System Heartbeat Logs</span>
                <Icon name="info" size={12} style={{ color: 'var(--muted)' }} />
                <GatedToggle on={false} label="Exclude system heartbeat logs" reason={whyNoWrite} />
              </div>
            </Card>

            <Card
              title="Audit Categories"
              action={
                <span style={link} aria-disabled title="Not built yet">
                  View all →
                </span>
              }
            >
              <div style={{ display: 'grid', gridTemplateColumns: viewport === 'phone' ? 'repeat(2, minmax(0,1fr))' : 'repeat(3, minmax(0,1fr))', gap: 'var(--sp-sm)' }}>
                {CATEGORIES.map((c, i) => (
                  <div
                    key={c.name}
                    style={{
                      padding: '10px 8px',
                      borderRadius: 'var(--r-btn)',
                      border: '1px solid var(--border)',
                      background: 'var(--card2)',
                      minWidth: 0,
                    }}
                  >
                    <Icon name={c.icon} size={16} style={{ color: catColor(i) }} />
                    <div
                      style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)', marginTop: 5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                    >
                      {c.name}
                    </div>
                    <div className="figure" style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)', marginTop: 2 }}>
                      {c.events}
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            <Card
              title="Retention Policies"
              action={
                <span style={link} aria-disabled title="Not built yet">
                  Manage Policies →
                </span>
              }
              bodyStyle={{ padding: 0 }}
            >
              <DataTableShell ariaLabel="Retention policies" data-table-scroll style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 380 }}>
                  <thead>
                    <tr style={{ background: 'var(--th-bg)' }}>
                      {['Module', 'Retention Period', 'Action After Expiry', 'Status'].map((h) => (
                        <th key={h} style={th}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {RETENTION.map((r) => (
                      <tr key={r.module} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={td}>{r.module}</td>
                        <td style={{ ...td, color: 'var(--text2)' }}>{r.period}</td>
                        <td
                          style={{
                            ...td,
                            color: r.action === 'Never Delete' ? 'var(--progress-text)' : 'var(--text2)',
                            fontWeight: r.action === 'Never Delete' ? 600 : 400,
                          }}
                        >
                          {r.action}
                        </td>
                        <td style={td}>
                          <StatusPill text="Active" />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </DataTableShell>
              <div style={{ padding: '10px 12px', borderTop: '1px solid var(--border)' }}>
                <Unavailable reason={whyNoWrite}>
                  <Button icon="plus" disabled>
                    Add Retention Policy
                  </Button>
                </Unavailable>
              </div>
            </Card>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns:
                viewport === 'phone'
                  ? 'minmax(0,1fr)'
                  : viewport === 'tablet'
                    ? 'repeat(2, minmax(0,1fr))'
                    : 'minmax(0,1.5fr) minmax(0,1fr) minmax(0,1fr)',
              gap: 'var(--sp-md)',
            }}
          >
            <Card
              title="Audit Rules"
              action={
                <span style={link} aria-disabled title="Not built yet">
                  View all rules →
                </span>
              }
              bodyStyle={{ padding: 0 }}
            >
              <DataTableShell ariaLabel="Audit rules" data-table-scroll style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 560 }}>
                  <thead>
                    <tr style={{ background: 'var(--th-bg)' }}>
                      {['Rule Name', 'Module / Category', 'Condition', 'Audit Level', 'Status', 'Last Updated', ''].map((h, i) => (
                        <th key={h || i} style={th}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {AUDIT_RULES.map((r) => (
                      <tr key={r.name} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={td}>{r.name}</td>
                        <td style={{ ...td, color: 'var(--text2)' }}>{r.module}</td>
                        <td style={{ ...td, color: 'var(--text2)' }}>{r.condition}</td>
                        <td style={{ ...td, color: 'var(--text2)' }}>{r.level}</td>
                        <td style={td}>
                          <StatusPill text="Active" />
                        </td>
                        <td className="figure" style={{ ...td, fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>{r.at}</td>
                        <td style={{ ...td, color: 'var(--muted)' }}>
                          <Unavailable reason={ROW_MENU_UNAVAILABLE}>
                            {/* Law 15 — 44×44; the render drew a bare 14px glyph. */}
                            <span aria-label={`Actions for rule ${r.name}`} style={{ display: 'grid', placeItems: 'center', minWidth: 44, minHeight: 44 }}>
                              <Icon name="more_vert" size={14} />
                            </span>
                          </Unavailable>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </DataTableShell>
              <div style={{ padding: '10px 12px', borderTop: '1px solid var(--border)' }}>
                <Unavailable reason={whyNoWrite}>
                  <Button icon="plus" disabled>
                    Create Audit Rule
                  </Button>
                </Unavailable>
              </div>
            </Card>

            <Card
              title="Compliance Rules"
              action={
                <span style={link} aria-disabled title="Not built yet">
                  View all →
                </span>
              }
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                {COMPLIANCE.map((c) => (
                  <div key={c.name} style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-sm)', fontSize: 'var(--t-meta)' }}>
                    <Icon name="checklist" size={13} style={{ color: 'var(--success-text)', flexShrink: 0 }} />
                    <span style={{ flex: 1, minWidth: 0, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {c.name}
                    </span>
                    <span style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)', flexShrink: 0 }}>{c.cadence}</span>
                    <StatusPill text="Compliant" />
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 11 }}>
                <Unavailable reason={whyNoWrite}>
                  <Button icon="plus" disabled>
                    Create Compliance Rule
                  </Button>
                </Unavailable>
              </div>
            </Card>

            <Card title="Legal Hold">
              <p style={{ margin: 0, fontSize: 'var(--t-meta)', color: 'var(--text2)', lineHeight: 1.5 }}>{LEGAL_HOLD.note}</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 10, fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--progress-text)' }}>
                <Icon name="alert_triangle" size={13} />
                {LEGAL_HOLD.active}
              </div>
              <div style={{ marginTop: 11 }}>
                <Unavailable reason={whyNoWrite}>
                  <Button disabled>Manage Legal Holds</Button>
                </Unavailable>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 'var(--sp-sm)', marginTop: 'var(--sp-md)', paddingTop: 10, borderTop: '1px solid var(--border)' }}>
                {[
                  { l: 'Oldest Hold', v: LEGAL_HOLD.oldest },
                  { l: 'Locked Records', v: LEGAL_HOLD.locked },
                  { l: 'Expires On', v: LEGAL_HOLD.expires },
                ].map((x) => (
                  <span key={x.l} style={{ minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>{x.l}</span>
                    <span className="figure" style={{ display: 'block', fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)', marginTop: 2 }}>
                      {x.v}
                    </span>
                  </span>
                ))}
              </div>
            </Card>
          </div>

          <Card title="Audit Analytics (This Month)">
            <div
              style={{
                display: 'grid',
                gridTemplateColumns:
                  viewport === 'phone'
                    ? 'repeat(1, minmax(0,1fr))'
                    : viewport === 'tablet'
                      ? 'repeat(2, minmax(0,1fr))'
                      : 'repeat(6, minmax(0,1fr))',
                gap: 'var(--sp-md)',
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={sub}>Events by Module</div>
                <div className="figure" style={{ fontSize: 'var(--t-ui)', fontWeight: 700, color: 'var(--text)' }}>{TOTAL_EVENTS}</div>
                <div style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>Total Events</div>
                <div style={{ display: 'flex', gap: 7, alignItems: 'center', marginTop: 7 }}>
                  <Donut slices={BY_MODULE} size={58} />
                  <Legend slices={BY_MODULE} showPercent={false} />
                </div>
              </div>

              <div style={{ minWidth: 0 }}>
                <div style={sub}>Events by User</div>
                <div style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)', marginBottom: 7 }}>Top 5 Active Users</div>
                <RankBars rows={BY_USER} tone={0} />
              </div>

              <div style={{ minWidth: 0 }}>
                <div style={sub}>Events by Branch</div>
                <div style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)', marginBottom: 7 }}>&nbsp;</div>
                <RankBars rows={BY_BRANCH} tone={2} />
              </div>

              <div style={{ minWidth: 0 }}>
                <div style={sub}>High-Risk Actions</div>
                <div style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>{HIGH_RISK.note}</div>
                <div className="figure" style={{ fontSize: 'var(--t-ui)', fontWeight: 700, color: 'var(--text)', marginTop: 3 }}>{HIGH_RISK.value}</div>
                <MiniLine d={HIGH_RISK} tone={5} />
              </div>

              <div style={{ minWidth: 0 }}>
                <div style={sub}>Audit Growth</div>
                <div style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>{GROWTH.note}</div>
                <div className="figure" style={{ fontSize: 'var(--t-ui)', fontWeight: 700, color: 'var(--text)', marginTop: 3 }}>{GROWTH.value}</div>
                <MiniLine d={GROWTH} tone={3} />
              </div>

              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={sub}>AI Audit Insights</span>
                  <span style={{ ...link, marginLeft: 'auto', fontSize: 'var(--t-meta)' }} aria-disabled title="Not built yet">
                    View Insights →
                  </span>
                </div>
                <ul style={{ margin: '7px 0 0', padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 7 }}>
                  {INSIGHTS.map((t) => (
                    <li key={t} style={{ display: 'flex', gap: 6, fontSize: 'var(--t-meta)', alignItems: 'flex-start' }}>
                      <Icon name="dot" size={9} style={{ color: 'var(--success-text)', flexShrink: 0, marginTop: 3 }} />
                      <span style={{ color: 'var(--text2)' }}>{t}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </Card>
        </div>

        {/* Rulings §7 (binding) — "reflow, not hide": below 1280 these five
            cards land underneath as a plain column, never behind a handle. */}
        <ReflowRail>
          <Card title="Audit Summary">
            <SummaryRows rows={SUMMARY} />
            <div aria-hidden style={{ height: 6, borderRadius: 'var(--r-badge)', background: 'var(--card2)', marginTop: 10, overflow: 'hidden' }}>
              <div style={{ width: '98%', height: '100%', background: BRAND.success, borderRadius: 'var(--r-badge)' }} />
            </div>
          </Card>

          <Card
            title="Alerts"
            action={
              <span style={link} aria-disabled title="Not built yet">
                View all →
              </span>
            }
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
              {ALERTS.map((a) => (
                <div key={a.text} style={{ display: 'flex', gap: 7, alignItems: 'flex-start', fontSize: 'var(--t-meta)' }}>
                  <Icon name="alert_triangle" size={13} style={{ color: BRAND_TEXT[a.tone], flexShrink: 0, marginTop: 1 }} />
                  <span style={{ flex: 1, minWidth: 0, color: 'var(--text2)' }}>{a.text}</span>
                  <span className="figure" style={{ color: 'var(--muted)', flexShrink: 0 }}>{a.when}</span>
                </div>
              ))}
            </div>
          </Card>

          <Card title="Quick Actions">
            {/* Previously four live buttons with no handler — a press did
                nothing, silently. Each tile now states its reason: Create Rule
                is a write (gate, then wiring); the other three have no service
                behind them in any role's hands. */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--sp-sm)' }}>
              {QUICK_ACTIONS.map((q) => (
                <Unavailable
                  key={q.label}
                  reason={q.label === 'Create Rule' ? whyNoWrite : NOT_BUILT_UNAVAILABLE}
                  style={{ width: '100%' }}
                >
                  <span
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6,
                      width: '100%',
                      /* Law 15 — 44×44 at every width. */
                      minHeight: 44,
                      padding: '12px 6px',
                      borderRadius: 'var(--r-btn)',
                      border: '1px solid var(--border)',
                      background: 'var(--card2)',
                      color: 'var(--muted)',
                      fontSize: 'var(--t-meta)',
                      fontWeight: 600,
                      fontFamily: 'inherit',
                      textAlign: 'center',
                    }}
                  >
                    <Icon name={q.icon} size={17} style={{ color: BRAND[q.tone] }} />
                    {q.label}
                  </span>
                </Unavailable>
              ))}
            </div>
          </Card>

          <Card
            title="Recent Activity"
            action={
              <span style={link} aria-disabled title="Not built yet">
                View all →
              </span>
            }
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
              {ACTIVITY.map((a) => (
                <div key={a.what} style={{ display: 'flex', gap: 'var(--sp-sm)' }}>
                  <Icon name="dot" size={9} style={{ color: BRAND[a.tone], flexShrink: 0, marginTop: 'var(--sp-xs)' }} />
                  <span style={{ minWidth: 0, flex: 1 }}>
                    <span style={{ display: 'block', fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)' }}>{a.what}</span>
                    <span className="figure" style={{ display: 'block', fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>{a.at}</span>
                  </span>
                  <span style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)', flexShrink: 0 }}>{a.who}</span>
                </div>
              ))}
            </div>
          </Card>

          <Card title="AI Audit Assistant">
            {/* Previously a live text box wired to nothing — it accepted a
                question and sent it nowhere. Inert with a stated Law 16 reason
                until a validated computation backs it (the same law that
                removed Backup's and Numbering's AI cards outright). */}
            <Unavailable reason={ASSISTANT_UNAVAILABLE} style={{ width: '100%' }}>
              <span
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  width: '100%',
                  /* Law 15 — 44px, like every other gated field. */
                  minHeight: 44,
                  padding: '0 9px',
                  borderRadius: 'var(--r-input)',
                  border: '1px solid var(--input-border)',
                  background: 'var(--input-bg)',
                }}
              >
                <input
                  disabled
                  aria-label="Ask AI about audit settings"
                  placeholder="Ask AI about audit settings…"
                  style={{ flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'transparent', fontSize: 'var(--t-meta)', color: 'var(--muted)', fontFamily: 'inherit' }}
                />
                <Icon name="arrow_right" size={14} style={{ color: 'var(--muted)' }} />
              </span>
            </Unavailable>
          </Card>
        </ReflowRail>
      </div>

      <FooterNote extra={['All audit logs are immutable and tamper-proof']} />
    </div>
  )
}

const sub = { fontSize: 'var(--t-meta)', fontWeight: 700, color: 'var(--text)' } as const
