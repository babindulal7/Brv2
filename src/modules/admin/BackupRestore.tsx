import { useState } from 'react'
import Icon from '../../components/ui/Icon'
import { Card, PageHeader, Button, KpiStrip, Rail, SummaryRows, FooterNote } from '../../components/ui/Page'
import { Donut, Legend, catColor } from '../../components/ui/Charts'
import { Unavailable } from '../../components/ui/Unavailable'
import { ErrorBanner } from '../../components/ui/StateViews'
import { SystemRestoreModal } from './SystemRestoreModal'
import { useAuth } from '../../lib/auth'
import { useViewport } from '../../lib/device'
import { BRAND, BRAND_TEXT, STATUS } from '../../lib/status'
import type { StatusKey } from '../../lib/status'
import {
  KPIS,
  OVERVIEW,
  SCHEDULE,
  HISTORY,
  RESTORE_SCOPES,
  RESTORE_OPTIONS,
  RESTORE_POINT,
  DESTINATIONS,
  INTEGRITY,
  INTEGRITY_TOTAL,
  CLOUD_USAGE,
  ANALYTICS,
  SUMMARY,
  ALERTS,
  QUICK_ACTIONS,
  ACTIVITY,
  /* `ADVISOR` is deliberately not imported — see the Law 16 note at the rail. */
} from '../../data/backup'

const STATUS_OF: Record<string, StatusKey> = {
  Completed: 'in',
  Failed: 'danger',
  Verifying: 'progress',
}
const TYPE_OF: Record<string, StatusKey> = {
  Full: 'primary',
  Incremental: 'neutral',
  Differential: 'progress',
}

const th = {
  textAlign: 'left' as const,
  padding: '8px 10px',
  fontSize: 'var(--t-th)',
  fontWeight: 600,
  color: 'var(--text2)',
  whiteSpace: 'nowrap' as const,
  borderBottom: '1px solid var(--border)',
}
const td = { padding: '9px 10px', fontSize: 'var(--t-meta)', color: 'var(--text)', whiteSpace: 'nowrap' as const }

function Pill({ text, status }: { text: string; status: StatusKey }) {
  const c = STATUS[status]
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        height: 19,
        padding: '0 7px',
        borderRadius: 5,
        background: c.bg,
        color: c.fg,
        fontSize: 'var(--t-meta)',
        fontWeight: 600,
      }}
    >
      {text}
    </span>
  )
}

/** Capacity bar. Colour tracks how full it is — that is the whole message. */
function Meter({ pct }: { pct: number }) {
  const tone = pct >= 80 ? 'danger' : pct >= 60 ? 'progress' : 'success'
  return (
    <div
      role="img"
      aria-label={`${pct}% used`}
      style={{ height: 6, borderRadius: 'var(--r-badge)', background: 'var(--card2)', overflow: 'hidden', marginTop: 7 }}
    >
      <div style={{ width: `${pct}%`, height: '100%', background: BRAND[tone], borderRadius: 'var(--r-badge)' }} />
    </div>
  )
}

function Spark({ points, tone }: { points: number[]; tone: 'primary' | 'success' | 'primary' | 'progress' | 'danger' }) {
  const w = 100
  const h = 34
  const max = Math.max(...points)
  const min = Math.min(...points)
  const span = max - min || 1
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden style={{ width: '100%', height: h, display: 'block', marginTop: 'var(--sp-sm)' }}>
      <polyline
        points={points.map((p, i) => `${(i / (points.length - 1)) * w},${h - ((p - min) / span) * (h - 4) - 2}`).join(' ')}
        fill="none"
        stroke={BRAND[tone]}
        strokeWidth={1.8}
        vectorEffect="non-scaling-stroke"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/**
 * **Backup & Restore — `10_TOOLS.md` §10.7**, on the page built from render
 * `F134F2C8`.
 *
 * ## §10.7 is NOT built as drawn, and that is the ruling
 *
 * `WIREFRAME_RULINGS_2026-08-12.md` §7, verbatim: *"§10.7 Restore with only a
 * typed confirmation → **Do not build as drawn.** Keep Owner-only + 2FA,
 * sandbox as default target, mandatory pre-restore checkpoint. Gate Download
 * the same way — a full backup walks around Law 6's RLS."*
 *
 * The wireframe draws one control — type the backup name, press Restore — and
 * says nothing about who may press it or what it targets. Four protections it
 * never mentions are enforced here and in `SystemRestoreModal.tsx`:
 *
 *  1. **Owner-only.** `Tools.tsx:77-80` already records why the render's own
 *     Backup button was removed: *"a Rental Officer can press it, against
 *     Administration §25.2's Owner-only, 2FA-gated rule."* Every destructive or
 *     exfiltrating control on this page is behind that gate, and a non-Owner
 *     sees a stated reason rather than a button that fails.
 *  2. **Two-factor** before the restore is armed.
 *  3. **Sandbox is the default target**, production a deliberate second choice.
 *  4. **A pre-restore checkpoint is mandatory** — taken before anything is
 *     overwritten, not offered as an option.
 *
 * **Download is gated identically, and this is the non-obvious half.** Law 6
 * hides money columns from Warehouse *at the database*, through RLS and twenty
 * masking views. A full backup file is the same data with no RLS in front of
 * it, so an ungated Download hands a money-blind role every figure the whole
 * schema exists to withhold. The spec draws `[Download]` on every history row
 * with no gate at all; it gets the Owner gate here.
 *
 * The typed confirmation §10.7 *does* ask for is kept and sharpened: the modal
 * asks for **the backup's own name**, as the wireframe says, not a fixed word.
 * Typing `RESTORE` is muscle memory; typing `BKP-2026-0812-01` requires having
 * read which backup is about to overwrite the database.
 *
 * ## The error state
 *
 * §10.7: *"This page needs a real error state — a restore that fails silently
 * is the worst failure in the product."* There is no restore service in this
 * build, so the honest terminal state of the flow is a **failure that names
 * what is missing**, carried inline and persistently (Law 12). It is not a
 * success screen, and `SUCCESS_FABRICATION_REGISTER_2026-08-12.md` is the
 * reason: a screen that says a restore completed when nothing ran is the exact
 * defect that register exists to close. The same applies to Download.
 *
 * ## Removed under a law, not under a wireframe
 *
 * The render's **"AI Backup Advisor"** card is gone. Law 16 — *"No AI panel
 * renders until backed by a validated computation"* — and its four bullets were
 * hand-written strings with an "Ask AI" box behind them. Rulings §7 applies the
 * same law to Settings' "AI Branch Insights" card by name; this is the same
 * card on a different page. Nothing else was removed: Rulings §1 keeps every
 * other panel the wireframe simply does not draw.
 */
export default function BackupRestore() {
  const viewport = useViewport()
  const { user } = useAuth()
  const [scope, setScope] = useState('Entire System')
  const [opts, setOpts] = useState(() => RESTORE_OPTIONS.map((o) => o.on))

  /** Administration §25.2. Not a UI preference — the same gate the modal re-checks. */
  const isOwner = user?.role === 'Owner'
  const OWNER_ONLY =
    'Owner-only, and two-factor gated. Administration §25.2 — a restore overwrites live data and a full backup file carries every money column Law 6 hides from the floor, with no RLS in front of it.'

  /** The backup a restore has been requested for, or `null`. */
  const [restoreFor, setRestoreFor] = useState<{ id: string; kind: string } | null>(null)

  /**
   * Law 12 — inline and persistent. A download that produced no file must say
   * so on the page, not in a toast that has already gone.
   */
  const [downloadError, setDownloadError] = useState<string | null>(null)

  function requestDownload(id: string) {
    /* No backup service exists in this build, so this is the whole truth of
       what happens: nothing is fetched and the operator is told. Returning a
       fabricated "Download started" here would be a
       SUCCESS_FABRICATION_REGISTER entry on the most sensitive file in the
       product. */
    setDownloadError(
      `No file was downloaded for ${id}. This build has no backup storage service, so there is nothing to fetch — and an ungated download of a full backup would carry every money column Law 6 withholds from the floor. Nothing was written, sent or exposed.`,
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
      <PageHeader
        icon="box"
        title="Backup & Restore"
        description="Protect your data with automated backups and restore with confidence."
        actions={
          /* §10.7's header is `[ Back up now ]`. The three that follow are the
             render's and survive (Rulings §1); each states its own gate. */
          <>
            <Unavailable
              reason={
                isOwner
                  ? 'No backup service exists in this build, so pressing this would write nothing while saying it had.'
                  : OWNER_ONLY
              }
            >
              <Button icon="plus" variant="primary" disabled>
                Back up now
              </Button>
            </Unavailable>
            <Unavailable reason={isOwner ? 'Pick the backup to restore from a history row below.' : OWNER_ONLY}>
              <Button icon="refresh" disabled>
                Restore
              </Button>
            </Unavailable>
            <Unavailable reason={OWNER_ONLY}>
              <Button icon="download" disabled>
                Export
              </Button>
            </Unavailable>
            <Unavailable reason="Nothing to refresh — this build reads a static seed, not a live backup service.">
              <Button icon="refresh" disabled>
                Refresh
              </Button>
            </Unavailable>
          </>
        }
      />

      {/* Law 12 — the error sits at the top of the page and stays until the
          operator dismisses it. Never a toast: toasts carry successes only. */}
      {downloadError && (
        <ErrorBanner title="Download did not happen" message={downloadError} onRetry={() => setDownloadError(null)} />
      )}

      <div
        style={{
          display: 'grid',
          /* Rulings §7 — below 1180 the rail reflows underneath, still visible.
             It is not wrapped in CollapsibleAside and its defaults are untouched. */
          gridTemplateColumns: viewport === 'desktop' ? 'minmax(0,1fr) auto' : 'minmax(0,1fr)',
          gap: 'var(--sp-md)',
          alignItems: 'start',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)', minWidth: 0 }}>
          <KpiStrip items={KPIS} columns={6} />

          <div style={{ display: 'grid', gridTemplateColumns: viewport === 'phone' ? 'minmax(0,1fr)' : 'minmax(0,1fr) minmax(0,1fr)', gap: 'var(--sp-md)' }}>
            <Card
              title="Backup Overview"
              action={
                <span style={link} aria-disabled title="Not built yet — see SCREENS.md for what is done">
                  View all types →
                </span>
              }
            >
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0,1fr))', gap: 'var(--sp-sm)' }}>
                {OVERVIEW.map((o, i) => (
                  <div
                    key={o.label}
                    style={{
                      padding: '11px 8px',
                      borderRadius: 'var(--r-btn)',
                      border: '1px solid var(--border)',
                      background: 'var(--card2)',
                      textAlign: 'center',
                      minWidth: 0,
                    }}
                  >
                    <Icon name={o.icon} size={17} style={{ color: catColor(i) }} />
                    <div
                      style={{
                        fontSize: 'var(--t-meta)',
                        color: 'var(--text2)',
                        marginTop: 5,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {o.label}
                    </div>
                    <div className="figure" style={{ fontSize: 'var(--t-ui)', fontWeight: 700, color: 'var(--text)', marginTop: 2 }}>
                      {o.value}
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            <Card title="Backup Schedule" bodyStyle={{ padding: 0 }}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 460 }}>
                  <thead>
                    <tr style={{ background: 'var(--th-bg)' }}>
                      {['Name', 'Frequency', 'Time', 'Next Run', 'Status'].map((h) => (
                        <th key={h} style={th}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {SCHEDULE.map((s) => (
                      <tr key={s.name} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={td}>{s.name}</td>
                        <td style={{ ...td, color: 'var(--text2)' }}>{s.frequency}</td>
                        <td style={{ ...td, color: 'var(--text2)' }}>{s.time}</td>
                        <td style={{ ...td, color: 'var(--text2)' }}>{s.next}</td>
                        <td style={td}>
                          <Pill text="Enabled" status="in" />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.55fr) minmax(0,1fr)', gap: 'var(--sp-md)' }}>
            <Card
              title="Backup History"
              action={
                <span style={link} aria-disabled title="Not built yet — see SCREENS.md for what is done">
                  View all backups →
                </span>
              }
              bodyStyle={{ padding: 0 }}
            >
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 880 }}>
                  <thead>
                    <tr style={{ background: 'var(--th-bg)' }}>
                      {['Backup ID', 'Type', 'Started (BS / AD)', 'Completed (BS / AD)', 'Duration', 'Size', 'Destination', 'Status', 'Created By', ''].map(
                        (h, i) => (
                          <th key={h || i} style={th}>
                            {h}
                          </th>
                        ),
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {HISTORY.map((b) => (
                      <tr key={b.id} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td className="identifier" style={{ ...td, color: 'var(--link)', fontWeight: 600 }}>{b.id}</td>
                        <td style={td}>
                          <Pill text={b.type} status={TYPE_OF[b.type] ?? 'neutral'} />
                        </td>
                        {/* BS leads, AD beneath — Foundation renders BS, stores AD. */}
                        <td style={td}>
                          <span className="figure" style={{ display: 'block' }}>{b.startedBs}</span>
                          <span className="figure" style={{ display: 'block', fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>{b.startedAd}</span>
                        </td>
                        <td style={td}>
                          <span className="figure" style={{ display: 'block' }}>{b.completedBs}</span>
                          <span className="figure" style={{ display: 'block', fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>{b.completedAd}</span>
                        </td>
                        <td className="figure" style={{ ...td, color: 'var(--text2)' }}>{b.duration}</td>
                        <td className="figure" style={{ ...td, color: 'var(--text2)' }}>{b.size}</td>
                        <td style={{ ...td, color: 'var(--text2)' }}>{b.destination}</td>
                        <td style={td}>
                          <Pill text={b.status} status={STATUS_OF[b.status] ?? 'neutral'} />
                        </td>
                        <td style={{ ...td, color: 'var(--text2)' }}>{b.by}</td>
                        {/* §10.7's `[Download] [Restore] ⋮` — the three the
                            wireframe draws as bare glyphs, made real and gated. */}
                        <td style={td}>
                          <span style={{ display: 'flex', gap: 'var(--sp-xs)', alignItems: 'center' }}>
                            <RowAction
                              icon="download"
                              label={`Download backup ${b.id}`}
                              enabled={isOwner}
                              reason={OWNER_ONLY}
                              onClick={() => requestDownload(b.id)}
                            />
                            <RowAction
                              icon="refresh"
                              label={`Restore from backup ${b.id}`}
                              enabled={isOwner}
                              reason={OWNER_ONLY}
                              onClick={() => setRestoreFor({ id: b.id, kind: `${b.type} · ${b.size}` })}
                            />
                            <Unavailable reason="The row menu (verify · duplicate · retention) is specified but not built yet.">
                              <span style={rowActionStyle(false)}>
                                <Icon name="more_vert" size={14} />
                              </span>
                            </Unavailable>
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
                <span>Showing 1 to 8 of 1,248 backups</span>
                <span style={{ marginLeft: 'auto', display: 'flex', gap: 3 }}>
                  {['‹', '1', '2', '3', '…', '156', '›'].map((p, i) => {
                    const on = p === '1'
                    return (
                      <button
                        key={`${p}-${i}`}
                        type="button"
                        aria-current={on ? 'page' : undefined}
                        style={{
                          minWidth: 24,
                          height: 24,
                          borderRadius: 'var(--r-xs)',
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

            <Card
              title="Restore Center"
              action={
                <span style={link} aria-disabled title="Not built yet — see SCREENS.md for what is done">
                  Learn more →
                </span>
              }
            >
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--sp-md)' }}>
                <fieldset style={{ border: 'none', margin: 0, padding: 0, minWidth: 0 }}>
                  <legend style={legend}>Restore What?</legend>
                  {RESTORE_SCOPES.map((s) => (
                    <label
                      key={s}
                      style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '3px 0', fontSize: 'var(--t-meta)', cursor: 'pointer' }}
                    >
                      <input type="radio" name="scope" checked={scope === s} onChange={() => setScope(s)} />
                      <span style={{ color: scope === s ? 'var(--text)' : 'var(--text2)' }}>{s}</span>
                    </label>
                  ))}
                </fieldset>

                <div style={{ minWidth: 0 }}>
                  <div style={legend}>Restore From</div>
                  <button
                    type="button"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      width: '100%',
                      height: 32,
                      padding: '0 9px',
                      borderRadius: 'var(--r-input)',
                      border: '1px solid var(--input-border)',
                      background: 'var(--input-bg)',
                      color: 'var(--text2)',
                      fontSize: 'var(--t-meta)',
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                    }}
                  >
                    <span style={{ flex: 1, textAlign: 'left' }}>Select backup or restore point</span>
                    <Icon name="chevron_down" size={13} />
                  </button>

                  <div
                    style={{
                      marginTop: 9,
                      padding: 10,
                      borderRadius: 'var(--r-btn)',
                      border: '1px solid var(--border)',
                      background: 'var(--card2)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span className="identifier" style={{ fontSize: 'var(--t-meta)', fontWeight: 700, color: 'var(--text)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {RESTORE_POINT.id}
                      </span>
                      <Icon name="dot" size={11} style={{ color: 'var(--success-text)' }} />
                    </div>
                    <div style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)', marginTop: 3 }}>{RESTORE_POINT.kind}</div>
                    <div className="figure" style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>{RESTORE_POINT.at}</div>
                    <div className="figure" style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>{RESTORE_POINT.size}</div>
                  </div>

                  <div style={{ ...legend, marginTop: 'var(--sp-md)' }}>Restore Options</div>
                  {RESTORE_OPTIONS.map((o, i) => (
                    <label
                      key={o.label}
                      style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '3px 0', fontSize: 'var(--t-meta)', cursor: 'pointer' }}
                    >
                      <input
                        type="checkbox"
                        checked={opts[i] ?? false}
                        onChange={() => setOpts((p) => p.map((v, j) => (j === i ? !v : v)))}
                      />
                      <span style={{ color: 'var(--text2)' }}>{o.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/*
                Live for an Owner now that the confirmation flow exists —
                warning, environment choice, mandatory checkpoint, 2FA, then the
                typed backup name. For anybody else it is a stated reason, not a
                dead button: Rulings §7 keeps the Owner-only + 2FA gate §10.7
                never mentions.
              */}
              {isOwner ? (
                <button
                  type="button"
                  onClick={() => setRestoreFor({ id: RESTORE_POINT.id, kind: `${RESTORE_POINT.kind} · ${scope}` })}
                  style={{
                    marginTop: 'var(--sp-md)',
                    width: '100%',
                    /* Law 15 — 44×44 at every width, desktop included. */
                    minHeight: 44,
                    borderRadius: 'var(--r-btn)',
                    border: '1px solid transparent',
                    background: 'var(--btn-danger-bg)',
                    color: 'var(--btn-danger-fg)',
                    fontSize: 'var(--t-meta)',
                    fontWeight: 700,
                    fontFamily: 'inherit',
                    cursor: 'pointer',
                  }}
                >
                  Start Restore
                </button>
              ) : (
                <Unavailable reason={OWNER_ONLY} style={{ marginTop: 'var(--sp-md)', width: '100%' }}>
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6,
                      width: '100%',
                      minHeight: 44,
                      borderRadius: 'var(--r-btn)',
                      border: '1px solid var(--border)',
                      background: 'var(--card2)',
                      color: 'var(--muted)',
                      fontSize: 'var(--t-meta)',
                      fontWeight: 700,
                    }}
                  >
                    <Icon name="lock" size={14} />
                    Start Restore
                  </span>
                </Unavailable>
              )}
              <p style={{ margin: '6px 0 0', fontSize: 'var(--t-meta)', color: 'var(--muted)', textAlign: 'center', lineHeight: 1.45 }}>
                Sandbox is the default target. A pre-restore checkpoint is taken first, and it is not optional.
              </p>
            </Card>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.55fr) minmax(0,1fr)', gap: 'var(--sp-md)' }}>
            <Card
              title="Cloud Storage & Destinations"
              action={
                <span style={link} aria-disabled title="Not built yet — see SCREENS.md for what is done">
                  Manage →
                </span>
              }
            >
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 9 }}>
                {DESTINATIONS.map((d) => (
                  <div
                    key={d.name}
                    style={{ padding: 10, borderRadius: 'var(--r-btn)', border: '1px solid var(--border)', background: 'var(--card2)', minWidth: 0 }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)', flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {d.name}
                      </span>
                      {d.primary && <Pill text="Primary" status="primary" />}
                    </div>
                    <div style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)', marginTop: 'var(--sp-xs)' }}>{d.used}</div>
                    <Meter pct={d.pct} />
                    <div className="figure" style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)', marginTop: 3, textAlign: 'right' }}>{d.pct}%</div>
                  </div>
                ))}
              </div>
            </Card>

            <Card
              title="Integrity & Verification"
              action={
                <span style={link} aria-disabled title="Not built yet — see SCREENS.md for what is done">
                  View logs →
                </span>
              }
            >
              <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
                <Donut slices={INTEGRITY} centreLabel="Verified" centreValue={INTEGRITY_TOTAL} size={116} />
                <Legend slices={INTEGRITY} />
              </div>
            </Card>
          </div>

          <Card title="Backup Analytics (This Month)">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, minmax(0,1fr))', gap: 10 }}>
              {ANALYTICS.map((a, i) => (
                <div key={a.label} style={{ minWidth: 0 }}>
                  <div
                    style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                  >
                    {a.label}
                  </div>
                  <div
                    className="figure"
                    style={{ fontSize: 'var(--t-ui)', fontWeight: 700, color: 'var(--text)', marginTop: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                  >
                    {a.value}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 'var(--t-meta)', marginTop: 3, color: a.delta.good ? 'var(--success-text)' : 'var(--danger-text)' }}>
                    <Icon name={a.delta.direction === 'up' ? 'arrow_up' : 'arrow_down'} size={10} fill />
                    <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.delta.text}</span>
                  </div>
                  <Spark points={a.points} tone={(['primary', 'success', 'primary', 'progress', 'danger'] as const)[i % 5] ?? 'primary'} />
                </div>
              ))}

              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text2)' }}>Cloud Usage</div>
                <div style={{ display: 'flex', gap: 'var(--sp-sm)', alignItems: 'center', marginTop: 'var(--sp-xs)' }}>
                  <Donut slices={CLOUD_USAGE} size={62} />
                  <Legend slices={CLOUD_USAGE} showPercent={false} />
                </div>
              </div>
            </div>
          </Card>
        </div>

        <Rail>
          <Card title="Backup Summary">
            <SummaryRows rows={SUMMARY} />
            <Meter pct={83} />
          </Card>

          <Card
            title="Alerts"
            action={
              <span style={link} aria-disabled title="Not built yet — see SCREENS.md for what is done">
                View all →
              </span>
            }
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
              {ALERTS.map((a) => (
                <div key={a.text} style={{ display: 'flex', gap: 7, alignItems: 'flex-start', fontSize: 'var(--t-meta)' }}>
                  <Icon name="alert_triangle" size={13} style={{ color: BRAND_TEXT[a.tone], flexShrink: 0, marginTop: 1 }} />
                  <span style={{ color: 'var(--text2)', flex: 1, minWidth: 0 }}>{a.text}</span>
                  <span className="figure" style={{ color: 'var(--muted)', flexShrink: 0 }}>{a.when}</span>
                </div>
              ))}
            </div>
          </Card>

          <Card title="Quick Actions">
            {/*
              `modules/settings/Tools.tsx:77-80` records why the render's Backup
              quick action was removed from *that* page: "a Rental Officer can
              press it, against Administration §25.2's Owner-only, 2FA-gated
              rule." The identical defect was live here — a "Restore Backup"
              tile any role could press. Every tile now states its gate; none is
              a live no-op.
            */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--sp-sm)' }}>
              {QUICK_ACTIONS.map((q) => (
                <Unavailable
                  key={q.label}
                  reason={
                    /^(Create|Restore|Export)/.test(q.label)
                      ? OWNER_ONLY
                      : 'Specified but not built — this build has no backup service to run it against.'
                  }
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
              <span style={link} aria-disabled title="Not built yet — see SCREENS.md for what is done">
                View all →
              </span>
            }
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
              {ACTIVITY.map((a) => (
                <div key={a.what} style={{ display: 'flex', gap: 'var(--sp-sm)' }}>
                  <Icon name="dot" size={9} style={{ color: BRAND[a.tone], flexShrink: 0, marginTop: 'var(--sp-xs)' }} />
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)' }}>{a.what}</span>
                    <span className="figure" style={{ display: 'block', fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>{a.at}</span>
                    <span style={{ display: 'block', fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>{a.who}</span>
                  </span>
                </div>
              ))}
            </div>
          </Card>

          {/*
            The render's "AI Backup Advisor — Preview" card was here. Deleted
            under Law 16 — "No AI panel renders until backed by a validated
            computation" — not under a wireframe. Its four bullets
            (`data/backup.ts`'s ADVISOR) were hand-written strings behind an
            "Ask AI" box that went nowhere, and Rulings §7 applies exactly this
            law to Settings' "AI Branch Insights" card by name. `data/backup.ts`
            is not this pass's file to edit, so ADVISOR stays exported and
            unused rather than being half-removed across an ownership boundary.
          */}
        </Rail>
      </div>

      {/*
        The typed confirmation §10.7 asks for, plus the three protections it
        does not: Owner-only, 2FA, sandbox-by-default and a mandatory
        pre-restore checkpoint. The modal re-checks the role itself — this
        page's gate is the first of two, never the only one.
      */}
      {restoreFor && (
        <SystemRestoreModal
          isOpen
          onClose={() => setRestoreFor(null)}
          restorePointId={restoreFor.id}
          restorePointKind={restoreFor.kind}
        />
      )}

      <FooterNote extra={['Backups are encrypted at rest and in transit']} />
    </div>
  )
}

/* ── row actions ───────────────────────────────────────────────────────── */

function rowActionStyle(enabled: boolean) {
  return {
    display: 'grid',
    placeItems: 'center',
    /* Law 15 — 44×44 at every width. The render drew 14px glyphs. */
    minWidth: 44,
    minHeight: 44,
    borderRadius: 'var(--r-xs)',
    border: '1px solid var(--border)',
    background: 'transparent',
    color: enabled ? 'var(--text2)' : 'var(--muted)',
    cursor: enabled ? 'pointer' : 'not-allowed',
    opacity: enabled ? 1 : 0.6,
    fontFamily: 'inherit',
  } as const
}

/**
 * One history-row control. Enabled only for an Owner; otherwise it states the
 * gate rather than failing on press — `rbac.ts`'s rule is that a forbidden item
 * is absent or explained, never a button that quietly does nothing.
 */
function RowAction({
  icon,
  label,
  enabled,
  reason,
  onClick,
}: {
  icon: 'download' | 'refresh'
  label: string
  enabled: boolean
  reason: string
  onClick: () => void
}) {
  if (!enabled) {
    return (
      <Unavailable reason={reason}>
        <span aria-label={label} style={rowActionStyle(false)}>
          <Icon name={icon} size={14} />
        </span>
      </Unavailable>
    )
  }
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick} style={rowActionStyle(true)}>
      <Icon name={icon} size={14} />
    </button>
  )
}

const link = { fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--link)', textDecoration: 'none' } as const
const legend = { fontSize: 'var(--t-meta)', fontWeight: 700, color: 'var(--text)', marginBottom: 6, padding: 0 } as const
