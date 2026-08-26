import { useCallback, useEffect, useState } from 'react'
import Icon from '../../components/ui/Icon'
import { Card, PageHeader, Button, KpiStrip, ReflowRail, SummaryRows, FooterNote, useRailGridColumns } from '../../components/ui/Page'
import { PageBody } from '../../components/ui/PageBody'
import { Donut, Legend, catColor } from '../../components/ui/Charts'
import { Unavailable } from '../../components/ui/Unavailable'
import { ErrorBanner } from '../../components/ui/StateViews'
import { useAuth } from '../../lib/auth'
import { canManageSettings } from '../../lib/rbac'
import { useViewport } from '../../lib/device'
import { toBs, formatBs, formatAdDateTime } from '../../lib/bs'
import { useList } from '../../lib/queries/useList'
import type { ListFilters } from '../../lib/queries/listQuery'
import { listBackupLogs, backupRestriction, type BackupLogListRow } from '../../lib/queries/backup'
import { BRAND, BRAND_TEXT, STATUS } from '../../lib/status'
import type { StatusKey } from '../../lib/status'
import {
  KPIS,
  OVERVIEW,
  SCHEDULE,
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
/*
 * §7.3's row floor ("rows >= 56px") expressed with the token instead of padding
 * arithmetic: `height` on a `<td>` is a MINIMUM, so this raises the short rows
 * and leaves the horizontal padding alone.
 *
 * The floor is a hit-testing guarantee, not a density choice — a 44px target
 * only stays inside its own row when the row is at least 56, and below that it
 * overhangs the neighbour, where the later row in the DOM wins the tap. Backup
 * History ends each row with `RowAction`, a real 44x44 box, so those rows reach
 * about 62 already; the Schedule table above shares this same object, carries
 * only an "Enabled" pill, and pitches near 38. Restore-from-backup is not an
 * action anyone should be able to aim at the wrong row, so the floor is stated
 * once and structurally rather than left resting on how tall today's tallest
 * cell happens to paint.
 */
const td = { height: 'var(--row-min-h)', padding: '9px 10px', fontSize: 'var(--t-meta)', color: 'var(--text)', whiteSpace: 'nowrap' as const }

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
 * never mentions are the ruling's, and they gate this page:
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
 * **The restore flow itself is parked, honestly (Phase 2.7).** This build has
 * no restore service, and the previous confirmation dialog
 * (`SystemRestoreModal.tsx`, still in the tree, no longer mounted) staged a
 * checkpoint that was a 2-second timer and a 2FA step that verified nothing —
 * theatre in front of a stated failure. Until a real service exists, every
 * restore trigger renders `Unavailable` with `RESTORE_UNAVAILABLE` as its
 * named reason instead of opening that flow. Protections 2–4 are the CONTRACT
 * the wired flow must honour when Phase 2.7 builds it, not claims about
 * something that runs today.
 *
 * **Download is gated identically, and this is the non-obvious half.** Law 6
 * hides money columns from Warehouse *at the database*, through RLS and twenty
 * masking views. A full backup file is the same data with no RLS in front of
 * it, so an ungated Download hands a money-blind role every figure the whole
 * schema exists to withhold. The spec draws `[Download]` on every history row
 * with no gate at all; it gets the Owner gate here.
 *
 * ## The history list is real
 *
 * Backup History reads `backup_logs` via `lib/queries/backup.ts` — the
 * immutable record 0007 creates and 0046 backstops. The eight seeded rows
 * (`data/backup.ts` `HISTORY`, with their hand-typed BS strings and invented
 * operators) are gone from this card; dates render BS above AD through
 * `lib/bs.ts`, paging is server-side with `id` as the tiebreak, and RLS admits
 * **Owner and Admin only** (0031) — so the list spreads `backupRestriction()`
 * into `PageBody` and a Manager/Coordinator/Accounts session reads
 * "restricted", never a false "no backups yet". Every other card on this page
 * is still the seed; converting them is later wiring, and none of them gains
 * truth by being beside a real table.
 *
 * ## The error state
 *
 * §10.7: *"This page needs a real error state — a restore that fails silently
 * is the worst failure in the product."* There is no backup service in this
 * build, so the honest response to Download is a **failure that names what is
 * missing**, carried inline and persistently (Law 12). It is not a success
 * screen, and `SUCCESS_FABRICATION_REGISTER_2026-08-12.md` is the reason: a
 * screen that says a download completed when nothing ran is the exact defect
 * that register exists to close.
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
const HISTORY_PAGE_SIZE = 8

export default function BackupRestore() {
  const viewport = useViewport()
  const railGridColumns = useRailGridColumns()
  const { user } = useAuth()
  const [scope, setScope] = useState('Entire System')
  const [opts, setOpts] = useState(() => RESTORE_OPTIONS.map((o) => o.on))

  /**
   * Administration §25.2. Not a UI preference — the gate every restore trigger
   * states. Routed through rbac's `canManageSettings` (the predicate IS
   * `role === 'Owner'` today) so the role set lives in `rbac.ts` beside every
   * other gate instead of as a literal here — the page doc's gap 12, closed.
   * If that predicate ever moves, this page moves with it by construction.
   */
  const mayManage = canManageSettings(user?.role ?? 'Client')
  const OWNER_ONLY =
    'Owner-only, and two-factor gated. Administration §25.2 — a restore overwrites live data and a full backup file carries every money column Law 6 hides from the floor, with no RLS in front of it.'

  /**
   * Phase 2.7's named reason. The previous trigger opened `SystemRestoreModal`,
   * whose checkpoint was a timer and whose 2FA verified nothing — theatre. A
   * stated absence is the honest control until a real restore service exists.
   */
  const RESTORE_UNAVAILABLE =
    'No restore service exists in this build — pressing this would stage a checkpoint and a 2FA step that verify nothing. ' +
    'The real flow arrives with the service (Phase 2.7): Owner-only, two-factor, sandbox-first, mandatory pre-restore checkpoint.'

  /**
   * Backup History — the real record. RLS on `backup_logs` admits Owner/Admin
   * only (0031); everyone else who can reach this route gets zero rows —
   * restricted, never empty (`lib/queries/backup.ts`).
   */
  const restriction = backupRestriction(user?.role)
  const [histPage, setHistPage] = useState(0)
  const fetchBackups = useCallback((f: ListFilters) => listBackupLogs({ ...f, withCount: true }), [])
  const history = useList<BackupLogListRow>(fetchBackups, {
    page: { index: histPage, size: HISTORY_PAGE_SIZE },
  })

  /* The net under the pager: a page past the end would ask for rows that do
     not exist. */
  const pageCount = history.total === null ? null : Math.max(1, Math.ceil(history.total / HISTORY_PAGE_SIZE))
  useEffect(() => {
    if (pageCount !== null && histPage > pageCount - 1) setHistPage(Math.max(0, pageCount - 1))
  }, [pageCount, histPage])

  /**
   * Law 12 — inline and persistent. A download that produced no file must say
   * so on the page, not in a toast that has already gone.
   */
  const [downloadError, setDownloadError] = useState<string | null>(null)

  function requestDownload(backupNo: string) {
    /* No backup service exists in this build, so this is the whole truth of
       what happens: nothing is fetched and the operator is told. Returning a
       fabricated "Download started" here would be a
       SUCCESS_FABRICATION_REGISTER entry on the most sensitive file in the
       product. */
    setDownloadError(
      `No file was downloaded for ${backupNo}. This build has no backup storage service, so there is nothing to fetch — and an ungated download of a full backup would carry every money column Law 6 withholds from the floor. Nothing was written, sent or exposed.`,
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
                mayManage
                  ? 'No backup service exists in this build, so pressing this would write nothing while saying it had.'
                  : OWNER_ONLY
              }
            >
              <Button icon="plus" variant="primary" disabled>
                Back up now
              </Button>
            </Unavailable>
            <Unavailable reason={mayManage ? RESTORE_UNAVAILABLE : OWNER_ONLY}>
              <Button icon="refresh" disabled>
                Restore
              </Button>
            </Unavailable>
            <Unavailable reason={OWNER_ONLY}>
              <Button icon="download" disabled>
                Export
              </Button>
            </Unavailable>
            {/* Live: Backup History reads the real `backup_logs` table now, so
                there is something to refresh. The other cards are still seed. */}
            <Button icon="refresh" onClick={history.refetch}>
              Refresh
            </Button>
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
          /* Rulings §7 — below 1280 the rail reflows underneath, still visible.
             `useRailGridColumns()` drops the rail track and `ReflowRail` below
             renders the same children as a plain column — the previous build
             paired this grid with plain `Rail` (which IS CollapsibleAside), so
             the cards sat behind a 44px handle on the warehouse tablet while
             this very comment claimed otherwise. Phase 3.1 made it true. */
          gridTemplateColumns: railGridColumns,
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
            <Card title="Backup History" bodyStyle={{ padding: 0 }}>
              {/* The real record — `backup_logs` via `lib/queries/backup.ts`.
                  Restricted outranks everything: RLS admits Owner/Admin only,
                  and a Manager reading "No backups yet" would be a lie. */}
              <PageBody
                {...restriction}
                loading={history.loading}
                error={history.error}
                onRetry={history.refetch}
                hasRows={history.rows.length > 0}
                empty={history.isEmpty}
                noun="backups"
                skeleton="table"
                skeletonRows={6}
                emptyTitle="No backups recorded yet"
                emptyMessage={
                  'Every completed backup writes a row to backup_logs, and this list is that record. ' +
                  'It is empty because no backup service has run yet — not because anything was removed.'
                }
              >
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 880 }}>
                    <thead>
                      <tr style={{ background: 'var(--th-bg)' }}>
                        {['Backup ID', 'Type', 'Started (BS / AD)', 'Completed (BS / AD)', 'Duration', 'Size', 'Destination', 'Status', 'Initiated By', ''].map(
                          (h, i) => (
                            <th key={h || i} style={th}>
                              {h}
                            </th>
                          ),
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {history.rows.map((b) => (
                        <tr key={b.id} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td className="identifier" style={{ ...td, color: 'var(--link)', fontWeight: 600 }}>{b.backupNo}</td>
                          <td style={td}>
                            <Pill text={b.backupType} status={TYPE_OF[b.backupType] ?? 'neutral'} />
                          </td>
                          {/* BS leads, AD beneath — rendered through `lib/bs.ts`,
                              never stored (Law 7). */}
                          <td style={td}>
                            <WhenCell iso={b.startedAtAd} />
                          </td>
                          <td style={td}>
                            <WhenCell iso={b.completedAtAd} />
                          </td>
                          <td className="figure" style={{ ...td, color: 'var(--text2)' }}>{durationBetween(b.startedAtAd, b.completedAtAd)}</td>
                          <td className="figure" style={{ ...td, color: 'var(--text2)' }}>{formatBytes(b.fileSizeBytes)}</td>
                          <td style={{ ...td, color: 'var(--text2)' }}>{b.storageLocation}</td>
                          {/* `error_message` rides the status cell — the row's own
                              stated failure, straight from the record. */}
                          <td style={td} title={b.errorMessage ?? undefined}>
                            <Pill text={b.status} status={STATUS_OF[b.status] ?? 'neutral'} />
                          </td>
                          {/* `users` is self-scoped, so the uuid cannot honestly be
                              resolved to a name — shown truncated, full id on hover.
                              `null` means no session actor was recorded. */}
                          <td
                            className="identifier"
                            style={{ ...td, color: 'var(--text2)' }}
                            title={b.initiatedBy ?? undefined}
                          >
                            {shortId(b.initiatedBy)}
                          </td>
                          {/* §10.7's `[Download] [Restore] ⋮` — Download is real and
                              Owner-gated; Restore states Phase 2.7 rather than
                              opening the retired theatre flow. */}
                          <td style={td}>
                            <span style={{ display: 'flex', gap: 'var(--sp-xs)', alignItems: 'center' }}>
                              <RowAction
                                icon="download"
                                label={`Download backup ${b.backupNo}`}
                                enabled={mayManage}
                                reason={OWNER_ONLY}
                                onClick={() => requestDownload(b.backupNo)}
                              />
                              <RowAction
                                icon="refresh"
                                label={`Restore from backup ${b.backupNo}`}
                                enabled={false}
                                reason={mayManage ? RESTORE_UNAVAILABLE : OWNER_ONLY}
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
                {/* Server-side paging over the real count — the seed's seven dead
                    pager buttons and its "1,248 backups" caption are gone. */}
                {pageCount !== null && pageCount > 1 && (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 'var(--sp-md)',
                      padding: '10px 14px',
                    }}
                  >
                    <PagerButton
                      label="Previous page"
                      icon="chevron_left"
                      disabled={histPage === 0}
                      onClick={() => setHistPage((p) => Math.max(0, p - 1))}
                    />
                    <span className="figure" style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
                      Page {histPage + 1} of {pageCount}
                      {history.total !== null ? ` · ${history.total} backups` : ''}
                    </span>
                    <PagerButton
                      label="Next page"
                      icon="chevron_right"
                      disabled={histPage >= pageCount - 1}
                      onClick={() => setHistPage((p) => p + 1)}
                    />
                  </div>
                )}
              </PageBody>
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
                Phase 2.7 — a stated absence for EVERY role, Owner included.
                The previous Owner-only branch opened `SystemRestoreModal`,
                whose checkpoint was a 2-second timer and whose 2FA compared a
                code to nothing but its own length. An Owner reads why the
                control is parked; everyone else reads the Owner gate that will
                still apply when it arrives.
              */}
              <Unavailable reason={mayManage ? RESTORE_UNAVAILABLE : OWNER_ONLY} style={{ marginTop: 'var(--sp-md)', width: '100%' }}>
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                    width: '100%',
                    /* Law 15 — 44×44 at every width, desktop included. */
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
              <p style={{ margin: '6px 0 0', fontSize: 'var(--t-meta)', color: 'var(--muted)', textAlign: 'center', lineHeight: 1.45 }}>
                Restores arrive with the restore service (Phase 2.7): Owner-only, two-factor, sandbox as the default
                target, and a mandatory pre-restore checkpoint before anything is overwritten.
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

        {/* Rulings §7 (binding) — "reflow, not hide": below 1280 these four
            cards land underneath as a plain column, never behind a handle. */}
        <ReflowRail>
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
        </ReflowRail>
      </div>

      {/*
        `SystemRestoreModal` is deliberately NOT mounted here any more. Its
        checkpoint step was a `setTimeout` and its 2FA step verified nothing —
        every restore trigger on this page now states Phase 2.7 through
        `Unavailable` instead of opening that theatre. The file stays in the
        tree (Law 3) for the real flow to be rebuilt on.
      */}

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
 * One history-row control. Live only when enabled AND given a handler;
 * otherwise it states the gate rather than failing on press — `rbac.ts`'s rule
 * is that a forbidden item is absent or explained, never a button that quietly
 * does nothing. `onClick` is optional so a control that is parked for every
 * role (row Restore, Phase 2.7) does not have to carry a no-op handler.
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
  onClick?: () => void
}) {
  if (!enabled || !onClick) {
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

/* ── history-row rendering helpers ─────────────────────────────────────── */

/**
 * BS above AD — the pair the footer promises ("All dates are shown in BS above
 * AD"). `toBs` vouches for one month only and returns `null` outside it; a
 * null becomes an omitted line rather than a wrong date (Law 7 — BS is
 * rendered, never stored). The AD line, rendered in Kathmandu, is always
 * present. Same cell as `AuditLog.tsx`'s.
 */
function WhenCell({ iso }: { iso: string }) {
  const d = new Date(iso)
  const bs = Number.isNaN(d.getTime()) ? null : toBs(d)
  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 2 }}>
      {bs && <span className="figure">{formatBs(bs)}</span>}
      <span className="figure" style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>
        {formatAdDateTime(iso)}
      </span>
    </span>
  )
}

/** First 8 hex characters of a uuid, full id on `title` at the call site. `null` → an em-dash, never an invented name. */
function shortId(id: string | null): string {
  return id ? `${id.slice(0, 8)}…` : '—'
}

/**
 * `file_size_bytes` → words. Decimal units (1 GB = 10⁹ B), the convention
 * storage vendors label capacity in. A byte count, never money — no
 * `formatMoney` here.
 */
function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '—'
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)} GB`
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)} MB`
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)} KB`
  return `${n} B`
}

/**
 * `completed_at − started_at`, derived from the record's own timestamps — the
 * seed carried a hand-typed duration string beside two hand-typed times, three
 * copies of one fact. Malformed or negative input renders an em-dash rather
 * than a fabricated figure.
 */
function durationBetween(fromIso: string, toIso: string): string {
  const ms = new Date(toIso).getTime() - new Date(fromIso).getTime()
  if (!Number.isFinite(ms) || ms < 0) return '—'
  const totalSec = Math.round(ms / 1000)
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`
  if (m > 0) return `${m}m ${String(s).padStart(2, '0')}s`
  return `${s}s`
}

/** Prev/Next — 44×44 (Law 15), disabled honestly rather than hidden. Same control as `AuditLog.tsx`'s. */
function PagerButton({
  label,
  icon,
  disabled,
  onClick,
}: {
  label: string
  icon: 'chevron_left' | 'chevron_right'
  disabled: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        minWidth: 44,
        minHeight: 44,
        borderRadius: 'var(--r-btn)',
        border: '1px solid var(--border)',
        background: 'var(--card)',
        color: disabled ? 'var(--muted)' : 'var(--text)',
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <Icon name={icon} size={16} />
    </button>
  )
}

const link = { fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--link)', textDecoration: 'none' } as const
const legend = { fontSize: 'var(--t-meta)', fontWeight: 700, color: 'var(--text)', marginBottom: 6, padding: 0 } as const
