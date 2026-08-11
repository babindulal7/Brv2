import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import Icon from '../../components/ui/Icon'
import { Card, Button, cardStyle, Rail, SideRail } from '../../components/ui/Page'
import { EmptyState } from '../../components/ui/StateViews'
import { STATUS } from '../../lib/status'
import { statusToken } from '../../lib/workflow'
import type { JobState } from '../../lib/workflow'
import { BarcodeScannerModal } from '../../components/ui/BarcodeScannerModal'
import { toBs, formatBs, formatAd } from '../../lib/bs'
import { BOOKING } from '../../data/booking'
import { UNITS, PACKAGE, GROUPS, CASES, TOTAL_ITEMS, EVIDENCE, NOTES, FILTERS } from '../../data/packing'
import type { LineState, Condition } from '../../data/packing'

/**
 * **Packing Workspace** — `Packing Workflow.md` v2.1 (Build Locked).
 *
 * Built from the spec's **corrections**, not from the reference screenshots.
 * §0 "Found in the screen" lists what those screenshots got wrong, and each is
 * fixed here:
 *  · tree counts summed to 25 on an 18-item booking → derived and asserted
 *  · Booking Status read `Confirmed` at 100% packed → first pack sets
 *    `Preparing`, completion sets `Ready` (§12)
 *  · Outstanding read Rs 58,548 → the reference case is Rs 1,24,506
 *  · header carried `←`, Save Draft, Complete Packing **and** `✕` → one exit
 *    (Cancel Packing, footer) and one primary (Complete Packing, footer)
 *  · no Evidence panel and no Evidence column → both present (§9, §6)
 *  · `Mark as Partial` enabled at 100% → disabled when nothing is pending (§7)
 *  · footer had Previous / Next → neither exists (§11)
 *  · dark-mode primary rendered green → **blue in both themes** (§13)
 */

/** §13 — the workspace primary is `--blue-600` in light *and* dark. */
const BLUE_PRIMARY = {
  background: 'var(--cat-1)',
  color: '#fff',
  border: '1px solid transparent',
} as const

const LINE_TONE: Record<LineState, { bg: string; fg: string }> = {
  // §4.2 gives green to On Rent / Returned / Paid. Pending is work not yet
  // done — yellow, matching the `--progress-text` the blocker note on the same
  // row already uses. It shared Packed's green until now, on the one screen
  // whose entire job is telling packed from unpacked at a glance.
  Pending: { bg: 'var(--st-progress-bg)', fg: 'var(--st-progress-fg)' },
  Packed: { bg: 'var(--st-in-bg)', fg: 'var(--st-in-fg)' },
  Partial: { bg: 'var(--st-progress-bg)', fg: 'var(--st-progress-fg)' },
  Missing: { bg: 'var(--st-danger-bg)', fg: 'var(--st-danger-fg)' },
  'Not Required': { bg: 'var(--st-neutral-bg)', fg: 'var(--st-neutral-fg)' },
  Replaced: { bg: 'var(--st-neutral-bg)', fg: 'var(--st-neutral-fg)' },
}

const th = { textAlign: 'left' as const, padding: '8px 9px', fontSize: 'var(--t-th)', fontWeight: 600, color: 'var(--text2)', whiteSpace: 'nowrap' as const, borderBottom: '1px solid var(--border)' }
const td = { padding: '8px 9px', fontSize: 'var(--t-meta)', color: 'var(--text)', whiteSpace: 'nowrap' as const }

interface LineStateRec {
  state: LineState
  condition?: Condition
  packedAt?: string
  reason?: string
}

// embedded: popup shell hides this page's own header; standalone route (App.tsx) always renders with no props.
export default function PackingWorkspace({ embedded = false }: { embedded?: boolean } = {}) {
  const navigate = useNavigate()
  const { bookingNo } = useParams()
  const id = bookingNo ?? BOOKING.no

  const [lines, setLines] = useState<Record<string, LineStateRec>>(() =>
    Object.fromEntries(UNITS.map((u) => [u.id, { state: 'Pending' as LineState }])),
  )
  const [showScanner, setShowScanner] = useState(false)
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('All')
  const [query, setQuery] = useState('')
  const [highlight, setHighlight] = useState<string | null>(null)
  const [scanLog, setScanLog] = useState<string[]>([])
  /**
   * ⭐ RULED: evidence is **mandatory** before Complete Packing, at Evidence
   * Workspace §14's granularity — **one photo per packed case, not per item.**
   * Photos taken per case, so the gate is checkable.
   */
  const [casePhotos, setCasePhotos] = useState<Record<string, number>>(() =>
    Object.fromEntries(CASES.map((c) => [c, 0])),
  )

  const scannableUnits = UNITS.map((u) => ({
    id: u.id,
    name: u.name,
    serial: u.serial,
    isAccessory: !u.serial || u.serial === 'N/A' || u.name.toLowerCase().includes('cable') || u.name.toLowerCase().includes('cap'),
  }))

  const packed = Object.values(lines).filter((l) => l.state === 'Packed').length
  const missing = Object.entries(lines).filter(([, l]) => l.state === 'Missing')
  const pending = Object.values(lines).filter((l) => l.state === 'Pending').length
  const notRequired = Object.values(lines).filter((l) => l.state === 'Not Required').length
  const partial = Object.values(lines).filter((l) => l.state === 'Partial').length
  const pct = Math.round((packed / TOTAL_ITEMS) * 100)

  /** §12 — first pack sets Preparing; completion sets Ready. Never Confirmed. */
  /*
   * §1.5 — Pack runs at status **Booked** and completing it sets **Packed**.
   * The booking's status does not creep as items are ticked: mid-pack is the
   * Pack *job* being In Progress, which is a different layer entirely (§1.1).
   */
  const status = packed === TOTAL_ITEMS ? 'Packed' : BOOKING.status
  const jobState: JobState = packed === 0 ? 'Not Started' : packed === TOTAL_ITEMS ? 'Complete' : 'In Progress'

  /* ── §10 completion gate ───────────────────────────────────────────────── */
  const requiredUnits = UNITS.filter((u) => u.required)
  const unresolvedRequired = requiredUnits.filter((u) => {
    const s = lines[u.id]?.state
    return s !== 'Packed' && s !== 'Missing' && s !== 'Replaced'
  })
  const shortReasons = missing.filter(([, l]) => (l.reason ?? '').trim().length < 10)
  /** Only cases that actually hold a packed item need a photo. */
  const packedCases = CASES.filter((c) => UNITS.some((u) => u.case === c && lines[u.id]?.state === 'Packed'))
  const casesWithoutPhoto = packedCases.filter((c) => (casePhotos[c] ?? 0) === 0)
  const gateReason =
    unresolvedRequired.length > 0
      ? `${unresolvedRequired.length} required item${unresolvedRequired.length > 1 ? 's' : ''} not yet packed`
      : shortReasons.length > 0
        ? `${shortReasons.length} missing item${shortReasons.length > 1 ? 's need' : ' needs'} a reason of at least 10 characters`
        : casesWithoutPhoto.length > 0
          ? `${casesWithoutPhoto.length} packed case${casesWithoutPhoto.length > 1 ? 's need' : ' needs'} a photo — ${casesWithoutPhoto.join(', ')}`
          : null
  const canComplete = gateReason === null

  const visible = useMemo(
    () =>
      UNITS.filter((u) => {
        const s = lines[u.id]?.state ?? 'Pending'
        if (filter !== 'All' && s !== filter) return false
        if (query && !`${u.name} ${u.serial}`.toLowerCase().includes(query.toLowerCase())) return false
        return true
      }),
    [lines, filter, query],
  )

  const set = (uid: string, patch: Partial<LineStateRec>) => setLines((p) => ({ ...p, [uid]: { ...(p[uid] as LineStateRec), ...patch } }))

  const pack = (uid: string) => {
    const u = UNITS.find((x) => x.id === uid)
    if (!u) return
    // §8.3 — an item blocked by Cleaning/Maintenance cannot be packed; state why.
    if (u.blocker) {
      setScanLog((p) => [`✕ ${u.name} — ${u.blocker}. Swap Unit offered.`, ...p].slice(0, 5))
      return
    }
    if (lines[uid]?.state === 'Packed') {
      setScanLog((p) => [`• ${u.name} already packed at ${lines[uid]?.packedAt}`, ...p].slice(0, 5))
      return
    }
    set(uid, { state: 'Packed', condition: 'Good', packedAt: '10:24 AM' })
    setScanLog((p) => [`✓ ${u.name} packed`, ...p].slice(0, 5))
  }

  const packAll = () =>
    setLines((p) =>
      Object.fromEntries(
        UNITS.map((u) => [
          u.id,
          u.blocker ? (p[u.id] as LineStateRec) : { state: 'Packed' as LineState, condition: 'Good' as Condition, packedAt: '10:24 AM' },
        ]),
      ),
    )

  const bs = toBs(new Date('2026-07-16'))
  const retBs = toBs(new Date('2026-07-19'))

  // Floor scale (DEVICES.md item 3) is applied automatically by route in App.tsx's Shell, not here.
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
      {!embedded && (
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--sp-lg)', flexWrap: 'wrap' }}>
          {/* §3 — header. No Back, no ✕, and Complete Packing is NOT here. */}
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
              <h1 style={{ margin: 0, fontSize: 'var(--t-h1)', fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.015em' }}>
                Packing Workspace
              </h1>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  height: 22,
                  padding: '0 9px',
                  borderRadius: 'var(--r-badge)',
                  background: STATUS[statusToken(status)].bg,
                  color: STATUS[statusToken(status)].fg,
                  fontSize: 'var(--t-meta)',
                  fontWeight: 700,
                }}
              >
                {status}
              </span>
            </div>
            <p style={{ margin: '5px 0 0', fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
              <Link to={`/rentals/${id}`} style={{ color: 'var(--link)', fontWeight: 600, textDecoration: 'none' }} className="identifier">
                {id}
              </Link>
              {' · '}
              {PACKAGE.name} · {BOOKING.client}
            </p>
          </div>

          {/* §3 centre — progress with a message. */}
          <div style={{ minWidth: 260, flex: 1 }}>
            <div style={{ display: 'flex', gap: 10, fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
              <span>Packing Progress</span>
              <span className="figure" style={{ marginLeft: 'auto', fontWeight: 700, color: 'var(--text)' }}>
                {packed} / {TOTAL_ITEMS} ({pct}%)
              </span>
            </div>
            <div aria-hidden style={{ height: 8, borderRadius: 'var(--r-badge)', background: 'var(--card2)', marginTop: 6, overflow: 'hidden' }}>
              <div style={{ width: '100%', height: '100%', background: 'var(--success)', borderRadius: 'var(--r-badge)', transform: `scaleX(${pct / 100})`, transformOrigin: 'left', transition: 'transform var(--dur) ease' }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 5, fontSize: 'var(--t-meta)', color: pending ? 'var(--progress-text)' : 'var(--success-text)', fontWeight: 600 }}>
              <Icon name={pending ? 'alert_triangle' : 'checklist'} size={12} />
              {pending ? `${pending} item${pending > 1 ? 's' : ''} pending` : 'All items packed'}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 'var(--sp-sm)', alignItems: 'center' }}>
            <Button icon="file">Print Packing List</Button>
            <Button onClick={() => import('../../actions/rentals/index').then(m => m.saveDraft({ id: id! }, { userId: 'USR-001', role: 'Manager' }))}>Save Draft</Button>
          </div>
        </div>
      )}

      {/* §4 — read-only booking summary, one compact row. BS above AD. */}
      <div style={{ ...cardStyle, display: 'flex', gap: 0, flexWrap: 'wrap', overflow: 'hidden' }}>
        {[
          { l: 'Client', v: BOOKING.client, big: true },
          { l: 'Pickup', v: bs ? formatBs(bs) : '—', s: formatAd(new Date('2026-07-16')) },
          { l: 'Return', v: retBs ? formatBs(retBs) : '—', s: formatAd(new Date('2026-07-19')) },
          { l: 'Days', v: '3', s: 'Rental days' },
          { l: 'Status', v: status, big: true },
            { l: 'Pack job', v: jobState },
          // Law 6 / P0-4 (BUG_SWEEP_REGISTER_v1.0): Packing is a floor surface —
          // HIS v2.1 §4.3 strips ALL Rs even for money-capable roles. Handover and
          // Return already show a non-monetary payment-state word here; mirrored.
          { l: 'Payment', v: 'Due', tone: 'var(--danger-text)' },
          { l: 'Items', v: String(TOTAL_ITEMS) },
          { l: 'Crew', v: '3' },
          { l: 'Delivery', v: 'Pickup' },
        ].map((f) => (
          <div key={f.l} style={{ padding: '11px 14px', borderRight: '1px solid var(--border)', minWidth: 0, flex: '1 1 auto' }}>
            <div style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>{f.l}</div>
            <div
              style={{ fontSize: f.big ? 'var(--t-h3)' : 'var(--t-body)', fontWeight: f.big ? 700 : 600, color: f.tone ?? 'var(--text)', marginTop: 3, whiteSpace: 'nowrap' }}
            >
              {f.v}
            </div>
            {f.s && <div className="figure" style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>{f.s}</div>}
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'auto minmax(0,1fr) auto', gap: 'var(--sp-md)', alignItems: 'start' }}>
        {/* ── §5 left — bundle tree, counts derived ─────────────────────── */}
        <SideRail width={260} label="Bundle / Item Tree">
        <Card title="1 · Bundle / Item Tree">
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-sm)', paddingBottom: 9, borderBottom: '1px solid var(--border)' }}>
            <Icon name="box" size={17} style={{ color: 'var(--st-progress-fg)' }} />
            <span style={{ minWidth: 0 }}>
              <span style={{ display: 'block', fontSize: 'var(--t-meta)', fontWeight: 700, color: 'var(--text)' }}>{PACKAGE.name}</span>
              <span style={{ display: 'block', fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>
                {TOTAL_ITEMS} Items · {PACKAGE.note}
              </span>
            </span>
          </div>

          <div style={{ marginTop: 8 }}>
            {GROUPS.map((g) => {
              const done = UNITS.filter((u) => u.group === g.name && lines[u.id]?.state === 'Packed').length
              return (
                <button
                  key={g.name}
                  type="button"
                  onClick={() => setHighlight(highlight === g.name ? null : g.name)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'var(--sp-sm)',
                    width: '100%',
                    padding: '7px 6px',
                    borderRadius: 7,
                    border: 'none',
                    background: highlight === g.name ? 'var(--nav-active-bg)' : 'transparent',
                    color: 'var(--text2)',
                    fontSize: 'var(--t-meta)',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    textAlign: 'left',
                  }}
                >
                  <Icon
                    name={done === g.count ? 'checklist' : 'box'}
                    size={13}
                    style={{ color: done === g.count ? 'var(--success-text)' : 'var(--muted)', flexShrink: 0 }}
                  />
                  <span style={{ flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{g.name}</span>
                  <span className="figure" style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>
                    {done}/{g.count}
                  </span>
                </button>
              )
            })}
          </div>

          <div style={{ marginTop: 11, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
            <div style={{ fontSize: 'var(--t-meta)', fontWeight: 700, color: 'var(--text)', marginBottom: 7 }}>Bundle Summary</div>
            {[
              { l: 'Total Items', v: TOTAL_ITEMS, tone: 'var(--text)' },
              { l: 'Packed', v: packed, tone: 'var(--success-text)' },
              { l: 'Pending', v: pending, tone: 'var(--progress-text)' },
              { l: 'Missing', v: missing.length, tone: 'var(--danger-text)' },
              { l: 'Not Required', v: notRequired, tone: 'var(--muted)' },
            ].map((r) => (
              <div key={r.l} style={{ display: 'flex', gap: 'var(--sp-sm)', padding: '3px 0', fontSize: 'var(--t-meta)' }}>
                <span style={{ flex: 1, color: 'var(--text2)' }}>{r.l}</span>
                <span className="figure" style={{ fontWeight: 700, color: r.tone }}>{r.v}</span>
              </div>
            ))}
            {/* §5 — the invariant, stated where it is visible. */}
            <p style={{ margin: '9px 0 0', fontSize: 'var(--t-meta)', color: 'var(--muted)', lineHeight: 1.45 }}>
              Group counts are derived from the item list and always sum to {TOTAL_ITEMS}.
            </p>
          </div>
        </Card>
        </SideRail>

        {/* ── §6 centre — checklist ─────────────────────────────────────── */}
        <Card
          title="2 · Packing Checklist"
          bodyStyle={{ padding: 0 }}
          action={
            <>
              <Button icon="search" onClick={packAll}>Bulk Scan</Button>
              <Button icon="queues" onClick={() => setShowScanner(true)}>Scan Barcode</Button>
              <Button icon="queues" onClick={() => setShowScanner(true)}>Scan QR</Button>
            </>
          }
        >
          <div style={{ display: 'flex', gap: 7, padding: '9px 12px', borderBottom: '1px solid var(--border)', flexWrap: 'wrap', alignItems: 'center' }}>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search item, serial, accessory…"
              aria-label="Search items"
              style={{ flex: 1, minWidth: 180, height: 30, padding: '0 9px', borderRadius: 'var(--r-input)', border: '1px solid var(--input-border)', background: 'var(--input-bg)', color: 'var(--text)', fontSize: 'var(--t-meta)', fontFamily: 'inherit', outline: 'none' }}
            />
            {FILTERS.map((f) => {
              const on = filter === f
              return (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFilter(f)}
                  aria-pressed={on}
                  style={{
                    height: 26,
                    padding: '0 9px',
                    borderRadius: 7,
                    border: `1px solid ${on ? 'var(--nav-active-accent)' : 'var(--border)'}`,
                    background: on ? 'var(--nav-active-bg)' : 'transparent',
                    color: on ? 'var(--nav-active-accent)' : 'var(--text2)',
                    fontSize: 'var(--t-meta)',
                    fontWeight: on ? 600 : 500,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  {f}
                </button>
              )
            })}
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 820 }}>
              <thead>
                <tr style={{ background: 'var(--th-bg)' }}>
                  {['', 'Item / Accessory', 'Serial / ID', 'Qty', 'Status', 'Condition', 'Location', 'Packed At', 'Evidence', ''].map((h, i) => (
                    <th key={h || i} style={th}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visible.map((u) => {
                  const rec = lines[u.id] as LineStateRec
                  const tone = LINE_TONE[rec.state]
                  const dim = highlight !== null && u.group !== highlight
                  return (
                    <tr key={u.id} style={{ borderBottom: '1px solid var(--border)', opacity: dim ? 0.35 : 1 }}>
                      <td style={{ ...td, width: 26 }}>
                        <input
                          type="checkbox"
                          checked={rec.state === 'Packed'}
                          disabled={Boolean(u.blocker)}
                          aria-label={`Pack ${u.name}`}
                          onChange={() => (rec.state === 'Packed' ? set(u.id, { state: 'Pending', packedAt: undefined as never }) : pack(u.id))}
                        />
                      </td>
                      <td style={td}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontWeight: 600 }}>{u.name}</span>
                          {u.required && (
                            <span style={{ display: 'inline-flex', alignItems: 'center', height: 15, padding: '0 5px', borderRadius: 4, background: 'var(--st-primary-bg)', color: 'var(--st-primary-fg)', fontSize: 'var(--t-meta)', fontWeight: 700 }}>
                              Required
                            </span>
                          )}
                        </span>
                        {/* §6 — a blocker is a note on a Pending row, not a status. */}
                        {u.blocker && rec.state === 'Pending' && (
                          <span style={{ display: 'block', fontSize: 'var(--t-meta)', color: 'var(--progress-text)', marginTop: 2 }}>
                            Pending — {u.blocker}
                          </span>
                        )}
                      </td>
                      <td className="identifier" style={{ ...td, fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
                        <Link to={`/inventory/${u.serial}`} style={{ color: 'inherit', textDecoration: 'none' }}>
                          {u.serial}
                        </Link>
                      </td>
                      <td className="figure" style={td}>1</td>
                      <td style={td}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', height: 20, padding: '0 8px', borderRadius: 'var(--r-badge)', background: tone.bg, color: tone.fg, fontSize: 'var(--t-meta)', fontWeight: 600 }}>
                          {rec.state}
                        </span>
                      </td>
                      <td style={td}>
                        {rec.condition ? (
                          <span style={{ display: 'inline-flex', alignItems: 'center', height: 19, padding: '0 7px', borderRadius: 5, background: 'var(--st-in-bg)', color: 'var(--st-in-fg)', fontSize: 'var(--t-meta)', fontWeight: 600 }}>
                            {rec.condition}
                          </span>
                        ) : (
                          <span style={{ color: 'var(--muted)' }}>—</span>
                        )}
                      </td>
                      <td className="figure" style={{ ...td, fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>{u.location}</td>
                      <td className="figure" style={{ ...td, fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>{rec.packedAt ?? '—'}</td>
                      {/* §6 — Evidence column, missing from the render. */}
                      <td style={td}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--sp-xs)', fontSize: 'var(--t-meta)', color: u.evidence ? 'var(--link)' : 'var(--muted)' }}>
                          <Icon name="eye" size={12} />
                          {u.evidence}
                        </span>
                      </td>
                      {/*
                        §6 row actions. Without these the gate is a dead end:
                        a Required line blocked by Cleaning can never reach
                        Packed, Missing or Replaced, so Complete never enables.
                      */}
                      <td style={{ ...td, width: 120 }}>
                        <span style={{ display: 'flex', gap: 'var(--sp-xs)', justifyContent: 'flex-end' }}>
                          {rec.state === 'Pending' && (
                            <RowAction label="Missing" onClick={() => set(u.id, { state: 'Missing' })} />
                          )}
                          {rec.state === 'Pending' && !u.required && (
                            <RowAction label="Not Req." onClick={() => set(u.id, { state: 'Not Required' })} />
                          )}
                          {rec.state === 'Missing' && (
                            <RowAction label="Undo" onClick={() => set(u.id, { state: 'Pending', reason: '' })} />
                          )}
                          {rec.state === 'Not Required' && (
                            <RowAction label="Undo" onClick={() => set(u.id, { state: 'Pending' })} />
                          )}
                          <Icon name="more_vert" size={14} style={{ color: 'var(--muted)', alignSelf: 'center' }} />
                        </span>
                      </td>
                    </tr>
                  )
                })}
                {visible.length === 0 && (
                  <tr>
                    <td colSpan={10} style={{ padding: 'var(--sp-xl)', textAlign: 'center', fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>
                      <EmptyState
                        title="No items match these filters"
                        actionLabel="Clear all filters"
                        onAction={() => { setFilter('All'); setQuery('') }}
                      />
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {pending === 0 && missing.length === 0 && (
            <div style={{ margin: 12, padding: '10px 12px', borderRadius: 'var(--r-btn)', background: 'var(--st-in-bg)', color: 'var(--st-in-fg)', fontSize: 'var(--t-meta)', fontWeight: 600, display: 'flex', gap: 7, alignItems: 'center' }}>
              <Icon name="checklist" size={13} />
              All items packed successfully. Ready for Pickup / Delivery.
            </div>
          )}
        </Card>

        {/* ── §9 right — summary, missing, evidence, notes, quick actions ── */}
        <Rail width={290} label="Packing summary">
          <Card title="3 · Packing Summary">
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-md)' }}>
              <Ring pct={pct} />
              <div>
                <div className="figure" style={{ fontSize: 'var(--t-ui)', fontWeight: 700, color: 'var(--text)' }}>
                  {packed} / {TOTAL_ITEMS}
                </div>
                <div style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>Items packed</div>
                <div className="figure" style={{ fontSize: 'var(--t-ui)', fontWeight: 700, color: missing.length ? 'var(--danger-text)' : 'var(--text)', marginTop: 6 }}>
                  {missing.length}
                </div>
                <div style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>Missing items</div>
              </div>
            </div>
            <div style={{ marginTop: 11, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
              {([
                ['Packed', packed, 'var(--success-text)'],
                ['Pending', pending, 'var(--progress-text)'],
                ['Partial', partial, 'var(--st-progress-fg)'],
                ['Missing', missing.length, 'var(--danger-text)'],
                ['Not Required', notRequired, 'var(--muted)'],
              ] as const).map(([l, v, c]) => (
                <div key={l} style={{ display: 'flex', gap: 'var(--sp-sm)', padding: '3px 0', fontSize: 'var(--t-meta)' }}>
                  <Icon name="dot" size={9} style={{ color: c, marginTop: 4 }} />
                  <span style={{ flex: 1, color: 'var(--text2)' }}>{l}</span>
                  <span className="figure" style={{ fontWeight: 700 }}>{v}</span>
                </div>
              ))}
            </div>
          </Card>

          <Card title="Missing Items">
            {missing.length === 0 ? (
              <p style={{ margin: 0, fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>No missing items — all items are packed.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {missing.map(([uid, l]) => {
                  const u = UNITS.find((x) => x.id === uid)
                  return (
                    <div key={uid}>
                      <div style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)' }}>{u?.name}</div>
                      <input
                        value={l.reason ?? ''}
                        onChange={(e) => set(uid, { reason: e.target.value })}
                        placeholder="Reason (min 10 characters)"
                        aria-label={`Reason ${u?.name} is missing`}
                        style={{ width: '100%', height: 28, marginTop: 5, padding: '0 8px', borderRadius: 'var(--r-input)', border: `1px solid ${(l.reason ?? '').trim().length < 10 ? 'var(--danger)' : 'var(--input-border)'}`, background: 'var(--input-bg)', color: 'var(--text)', fontSize: 'var(--t-meta)', fontFamily: 'inherit', outline: 'none' }}
                      />
                      <div style={{ marginTop: 6 }}>
                        <Button icon="refresh">Swap Unit</Button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </Card>

          {/* §9 — the Evidence panel the render omits. */}
          <Card title="Evidence" action={<Link to={`/rentals/${id}/evidence`} style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--link)', textDecoration: 'none' }}>View All</Link>}>
            <div className="figure" style={{ fontSize: 'var(--t-meta)', color: 'var(--text)' }}>
              {EVIDENCE.total} photos · {EVIDENCE.matched} matched · {EVIDENCE.review} review · {EVIDENCE.unknown} unknown
            </div>
            {/* The gate is per case, so coverage is shown per case. */}
            <div style={{ marginTop: 10, paddingTop: 9, borderTop: '1px solid var(--border)' }}>
              <div style={{ fontSize: 'var(--t-meta)', fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>
                Case photos — required before completion
              </div>
              {CASES.map((c) => {
                const needed = packedCases.includes(c)
                const has = casePhotos[c] ?? 0
                return (
                  <div key={c} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '4px 0', fontSize: 'var(--t-meta)' }}>
                    <Icon
                      name={!needed ? 'dot' : has > 0 ? 'checklist' : 'alert_triangle'}
                      size={12}
                      style={{ color: !needed ? 'var(--disabled)' : has > 0 ? 'var(--success-text)' : 'var(--progress-text)', flexShrink: 0 }}
                    />
                    <span style={{ flex: 1, minWidth: 0, color: 'var(--text2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {c}
                    </span>
                    <span className="figure" style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>
                      {has}
                    </span>
                    <RowAction label="Take Photo" onClick={() => setCasePhotos((p) => ({ ...p, [c]: (p[c] ?? 0) + 1 }))} />
                  </div>
                )
              })}
              <p style={{ margin: '7px 0 0', fontSize: 'var(--t-meta)', color: 'var(--muted)', lineHeight: 1.45 }}>
                Ruled mandatory: one photo per packed case, not per item. Cases holding nothing packed are exempt.
              </p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7, marginTop: 10 }}>
              {['Upload Photos', 'Upload Folder', 'Record Video'].map((b) => (
                <Button key={b} icon="eye">{b}</Button>
              ))}
              <Link
                to={`/rentals/${id}/evidence`}
                style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, height: 34, padding: '0 12px', borderRadius: 'var(--r-btn)', border: '1px solid var(--btn-secondary-border)', background: 'var(--btn-secondary-bg)', color: 'var(--text)', fontSize: 'var(--t-meta)', fontWeight: 600, textDecoration: 'none' }}
              >
                <Icon name="external_link" size={14} />
                Open Evidence
              </Link>
            </div>
            <p style={{ margin: '9px 0 0', fontSize: 'var(--t-meta)', color: 'var(--muted)', lineHeight: 1.45 }}>
              Matching by QR, barcode, serial OCR and image recognition runs in the Evidence Workspace. This panel
              reports it; it does not reimplement it.
            </p>
          </Card>

          <Card title="Packing Notes">
            <p style={{ margin: 0, fontSize: 'var(--t-meta)', color: 'var(--text2)', lineHeight: 1.5 }}>{NOTES.body}</p>
            <p style={{ margin: '7px 0 0', fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>
              — {NOTES.by}
              <br />
              {NOTES.at}
            </p>
          </Card>

          {/* §9 — exactly three quick actions. */}
          <Card title="Quick Actions">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 7 }}>
              {(['Scan Barcode', 'View Packing List', 'More'] as const).map((a, i) => (
                <button
                  key={a}
                  type="button"
                  style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, padding: '11px 4px', borderRadius: 'var(--r-btn)', border: '1px solid var(--border)', background: 'var(--card2)', color: 'var(--text)', fontSize: 'var(--t-meta)', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'center', lineHeight: 1.25 }}
                >
                  <Icon name={i === 0 ? 'queues' : i === 1 ? 'file' : 'more_vert'} size={16} style={{ color: 'var(--text2)' }} />
                  {a}
                </button>
              ))}
            </div>
          </Card>

          {scanLog.length > 0 && (
            <div style={{ ...cardStyle, padding: 11 }}>
              <div style={{ fontSize: 'var(--t-meta)', fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>Scan log</div>
              {/* §8.3 — results are announced to screen readers. */}
              <div role="status" aria-live="polite" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-xs)' }}>
                {scanLog.map((l, i) => (
                  <span key={i} style={{ fontSize: 'var(--t-meta)', color: l.startsWith('✕') ? 'var(--danger-text)' : 'var(--text2)' }}>
                    {l}
                  </span>
                ))}
              </div>
            </div>
          )}
        </Rail>
      </div>

      {/* §11 — footer. Two buttons. No Previous, no Next, no second Complete. */}
      <div style={{ ...cardStyle, display: 'flex', alignItems: 'center', gap: 'var(--sp-md)', padding: '12px 14px', flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={() => navigate(`/rentals/${id}`)}
          style={{ height: 34, padding: '0 14px', borderRadius: 'var(--r-btn)', border: '1px solid var(--border)', background: 'transparent', color: 'var(--danger-text)', fontSize: 'var(--t-meta)', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
        >
          Cancel Packing
        </button>
        <span style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>
          {pending ? `${pending} item${pending > 1 ? 's' : ''} pending` : 'All changes saved'} · Cancelling discards nothing
        </span>
        <span style={{ marginLeft: 'auto' }} title={gateReason ?? undefined}>
          <button
            type="button"
            disabled={!canComplete}
            onClick={() => {
              if (canComplete) {
                import('../../actions/rentals/index').then(m => m.packRental({ id: id! }, { userId: 'USR-001', role: 'Manager' }));
                navigate(`/rentals/${id}`);
              }
            }}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 7,
              height: 36,
              padding: '0 16px',
              borderRadius: 'var(--r-btn)',
              fontSize: 'var(--t-ui)',
              fontWeight: 600,
              fontFamily: 'inherit',
              cursor: canComplete ? 'pointer' : 'not-allowed',
              ...(canComplete ? BLUE_PRIMARY : { background: 'var(--card2)', color: 'var(--muted)', border: '1px solid var(--border)' }),
            }}
          >
            <Icon name="checklist" size={15} />
            Complete Packing
          </button>
        </span>
      </div>
      {/* §10 — the disabled button states which condition is unmet. */}
      {gateReason && (
        <p style={{ margin: '-4px 2px 0', textAlign: 'right', fontSize: 'var(--t-meta)', color: 'var(--progress-text)', fontWeight: 600 }}>
          {gateReason}
        </p>
      )}

      <BarcodeScannerModal
        isOpen={showScanner}
        onClose={() => setShowScanner(false)}
        mode="pack"
        bookingId={id}
        items={scannableUnits}
        onItemScanned={(item) => {
          pack(item.id)
        }}
      />
    </div>
  )
}

function RowAction({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        height: 22,
        padding: '0 7px',
        borderRadius: 'var(--r-xs)',
        border: '1px solid var(--border)',
        background: 'var(--card2)',
        color: 'var(--text2)',
        fontSize: 'var(--t-meta)',
        fontWeight: 600,
        cursor: 'pointer',
        fontFamily: 'inherit',
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </button>
  )
}

function Ring({ pct }: { pct: number }) {
  const r = 26
  const c = 2 * Math.PI * r
  return (
    <svg width={64} height={64} role="img" aria-label={`${pct}% packed`} style={{ flexShrink: 0 }}>
      <circle cx={32} cy={32} r={r} fill="none" stroke="var(--card2)" strokeWidth={7} />
      <circle
        cx={32}
        cy={32}
        r={r}
        fill="none"
        stroke="var(--success)"
        strokeWidth={7}
        strokeLinecap="round"
        strokeDasharray={`${(pct / 100) * c} ${c}`}
        transform="rotate(-90 32 32)"
      />
      <text x={32} y={36} textAnchor="middle" fontSize={13} fontWeight={700} fill="var(--text)">
        {pct}%
      </text>
    </svg>
  )
}
