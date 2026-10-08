import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import Icon from '../../components/ui/Icon'
import { Card, Button, cardStyle } from '../../components/ui/Page'
import { FloorAside, floorPlacements } from '../operations/FloorAside'
import { EmptyState, ErrorBanner } from '../../components/ui/StateViews'
import { PageBody } from '../../components/ui/PageBody'
import { isStaff } from '../../lib/rbac'
import { STATUS } from '../../lib/status'
import { statusToken } from '../../lib/workflow'
import type { JobState } from '../../lib/workflow'
import { BarcodeScannerModal } from '../../components/ui/BarcodeScannerModal'
import { useViewport } from '../../lib/device'
import { useAuth } from '../../lib/auth'

export interface PackingWorkspaceProps {
  loading?: boolean | undefined
  error?: string | null | undefined
  onRetry?: (() => void) | undefined
}
import { toBs, formatBs, formatAd } from '../../lib/bs'
import { BOOKING } from '../../data/booking'
import { UNITS, PACKAGE, GROUPS, CASES, TOTAL_ITEMS, EVIDENCE, NOTES, FILTERS } from '../../data/packing'
import type { LineState, Condition } from '../../data/packing'
import { BookingNotLoaded } from '../operations/BookingNotLoaded'

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


/*
 * ⭐ RULED 12 Aug 2026 (Rulings §3): operations are ROUTES, so the `embedded`
 * prop is gone. It existed only so the operations popup shell could suppress
 * this page's own header while drawing one above it; there is no shell above
 * this page any more. `/rentals/:bookingNo/packing` is the only mount, and
 * `bookingNo` comes off the route for ANY booking, not one seeded id.
 */
export default function PackingWorkspace({
  loading: propLoading,
  error: propError,
  onRetry: propOnRetry,
}: PackingWorkspaceProps = {}) {
  const navigate = useNavigate()
  const { bookingNo } = useParams()
  const id = bookingNo ?? BOOKING.no
  /** The one identity every dispatch on this screen may act as. No fallback. */
  const { user } = useAuth()
  const isStaffMember = user ? isStaff(user.role) : true
  /* Law 13/14 — width decides, at Foundation's locked 768 / 1180. §3.2 draws
     three layouts and the tablet one is the real device here: list | progress
     side by side, which means the progress column must NOT be a collapsing
     aside below 1180 (Rulings §7 — reflow, not hide). */
  const viewport = useViewport()
  const desktop = viewport === 'desktop'
  const phone = viewport === 'phone'
  const place = floorPlacements(desktop, phone)

  const [lines, setLines] = useState<Record<string, LineStateRec>>(() =>
    Object.fromEntries(UNITS.map((u) => [u.id, { state: 'Pending' as LineState }])),
  )
  const [showScanner, setShowScanner] = useState(false)
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('All')
  const [query, setQuery] = useState('')
  const [highlight, setHighlight] = useState<string | null>(null)
  const [scanLog, setScanLog] = useState<string[]>([])
  /**
   * Why a dispatch failure needs somewhere to be rendered.
   *
   * `packRental` is a real write now, and the only report of its failure used to
   * be `console.error('pack failed:', err)` on a floating promise — while
   * `navigate()` ran unconditionally on the line below it, synchronously, before
   * the promise had settled. So Complete Packing closed the workspace and landed
   * the operator on the booking detail whether or not anything reached Postgres,
   * and today it NEVER does (the empty `lines` list is refused by `validate`).
   * Navigating away is a stronger success signal than a toast and it was firing
   * on a path that always fails.
   *
   * Law 12 — the failure is inline and persistent, and the navigation now
   * happens only on a resolved promise.
   */
  const [dispatchError, setDispatchError] = useState<string | null>(null)
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

  /* ── 5-State handling ─────────────────────────────────────────────── */
  if (!isStaffMember) {
    return (
      <PageBody
        restricted={true}
        restrictedReason="Floor packing workspace is for Babin Rentals staff only."
        restrictedRequiredRole="Staff"
        noun="packing"
      >
        <div />
      </PageBody>
    )
  }

  if (propError) {
    return (
      <PageBody
        error={propError}
        {...(propOnRetry ? { onRetry: propOnRetry } : {})}
        noun="packing checklist"
      >
        <div />
      </PageBody>
    )
  }

  if (propLoading) {
    return (
      <PageBody
        loading={true}
        skeleton="card"
        noun="packing checklist"
      >
        <div />
      </PageBody>
    )
  }

  /*
   * Spec 03 Notes — "Routes are parameterised — these must work for any BR#,
   * not one seeded booking." This workspace's items come from a single seeded
   * booking, so any OTHER booking number gets the honest not-loaded state
   * rather than that booking's gear wearing this number (Rulings §8). Placed
   * after every hook, so the hook order is identical on both branches.
   */
  if (bookingNo !== undefined && bookingNo !== BOOKING.no) {
    return <BookingNotLoaded bookingNo={bookingNo} job="Packing" seededBookingNo={BOOKING.no} />
  }

  // Floor scale (DEVICES.md item 3) is applied automatically by route in App.tsx's Shell, not here.
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--sp-lg)', flexWrap: 'wrap' }}>
        {/*
          §3 — header. No Back, no ✕, and Complete Packing is NOT here.
          Rulings §4: the `←` spec 03 §3.2 draws is shorthand for "this is a
          sub-page" — the shell's breadcrumb trail is the upward affordance and
          `Cancel Packing` in the footer is the single exit. Adding `←` here
          recreates the two-exits defect a previous correction removed.
        */}
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
            <h1 style={{ margin: 0, fontSize: 'var(--t-h1)', fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.015em' }}>
              Packing Workspace
            </h1>
            {/*
              ⭐ RULED (Rulings §7, last-but-eight row): spec 03 §3.2's stage
              badge reads "Preparing", which is NOT one of the canonical six
              (Quote · Booked · Packed · On Rent · Returned · Closed) and which
              §12's own correction list already rejected. The badge shows the
              canonical status; the mid-pack signal the drawing was reaching for
              is the *job* state, and it is a SEPARATE chip beside it. Two
              axes, two chips — never a seventh status name.
              Law 11 on both: icon + label + colour.
            */}
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 'var(--sp-xs)',
                height: 22,
                padding: '0 9px',
                borderRadius: 'var(--r-badge)',
                background: STATUS[statusToken(status)].bg,
                color: STATUS[statusToken(status)].fg,
                fontSize: 'var(--t-meta)',
                fontWeight: 700,
              }}
            >
              <Icon name="dot" size={9} />
              {status}
            </span>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 'var(--sp-xs)',
                height: 22,
                padding: '0 9px',
                borderRadius: 'var(--r-badge)',
                border: '1px solid var(--border)',
                background: 'var(--card2)',
                color: jobState === 'Complete' ? 'var(--success-text)' : jobState === 'In Progress' ? 'var(--progress-text)' : 'var(--text2)',
                fontSize: 'var(--t-meta)',
                fontWeight: 700,
              }}
            >
              <Icon name={jobState === 'Complete' ? 'checklist' : jobState === 'In Progress' ? 'refresh' : 'dot'} size={11} />
              Pack job: {jobState}
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

        {/* §3 centre — progress with a message. §3.2's phone layout puts this
            strip directly under the title, which is where it already sits. */}
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
          {/*
            * Same treatment as Complete Packing below, which was fixed first and
            * left this one behind: the identity is the signed-in operator or
            * there is no dispatch. `{ userId: 'USR-001', role: 'Manager' }` was
            * stamped here too — a made-up id, and a role the business-9
            * migration retired.
            *
            * The rejection also has to be visible. This was a floating promise
            * with no `.catch()`, so `saveDraft` — an unimplemented stub the
            * dispatcher refuses before `execute` — failed silently on every
            * press. A draft button that does nothing and says nothing is
            * indistinguishable from one that saved, which is the failure this
            * whole pass removes. It reuses `dispatchError`, the inline
            * persistent line this screen already renders (Law 12).
            */}
          <Button
            onClick={() => {
              if (!user) {
                setDispatchError('You are not signed in, so this draft cannot be saved against anyone. Nothing was written.')
                return
              }
              setDispatchError(null)
              import('../../actions/rentals/index')
                .then((m) => m.saveDraft({ id: id! }, { userId: user.id, role: user.role }))
                .catch((err) => {
                  console.error('saveDraft failed:', err)
                  setDispatchError(err instanceof Error ? err.message : String(err))
                })
            }}
          >
            Save Draft
          </Button>
        </div>
      </div>

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

      {/*
        §3.2's three layouts, all of them REFLOW rather than hide (Rulings §7):

         · desktop ≥1180 — tree │ list │ progress, three columns;
         · tablet 768–1179 — "split, scan-first": list and progress side by
           side, the tree beneath the list. This is the real device here, and
           it is the layout `Rail`'s collapse-by-default would have destroyed,
           which is why `FloorAside` stops being collapsible below 1180;
         · phone <768 — one column: list → progress + blockers + Complete →
           tree.
      */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: desktop ? 'auto minmax(0,1fr) auto' : phone ? '1fr' : 'minmax(0,1fr) 320px',
          gap: 'var(--sp-md)',
          alignItems: 'start',
        }}
      >
        {/* ── §5 left — bundle tree, counts derived ─────────────────────── */}
        <FloorAside collapsible={desktop} side="left" width={260} label="Bundle / Item Tree" style={place.tree}>
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
        </FloorAside>

        {/* ── §6 centre — checklist ─────────────────────────────────────── */}
        <div style={{ minWidth: 0, ...place.list }}>
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
              style={{ flex: 1, minWidth: 180, minHeight: 44, padding: '0 9px', borderRadius: 'var(--r-input)', border: '1px solid var(--input-border)', background: 'var(--input-bg)', color: 'var(--text)', fontSize: 'var(--t-meta)', fontFamily: 'inherit', outline: 'none' }}
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

          {phone ? (
            /*
              Shell rule, repeated at the top of all eleven specs: "Tables
              become card rows below 768." Spec 03 calls the phone "the real
              device here", and a ten-column 820px table behind `overflowX`
              hides the serial, the status and the row actions the gate
              depends on — a Required line blocked by Cleaning could never be
              reached, so Complete Packing could never enable.
              One card per unit: serial + status + one primary action.
            */
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-sm)', padding: 'var(--sp-sm)' }}>
              {visible.map((u) => {
                const rec = lines[u.id] as LineStateRec
                const tone = LINE_TONE[rec.state]
                const dim = highlight !== null && u.group !== highlight
                return (
                  <article
                    key={u.id}
                    style={{ border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', padding: '11px 12px', display: 'flex', flexDirection: 'column', gap: 7, opacity: dim ? 0.35 : 1 }}
                  >
                    <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, minHeight: 44 }}>
                      <input
                        type="checkbox"
                        checked={rec.state === 'Packed'}
                        disabled={Boolean(u.blocker)}
                        aria-label={`Pack ${u.name}`}
                        style={{ width: 22, height: 22, marginTop: 2, flexShrink: 0 }}
                        onChange={() => (rec.state === 'Packed' ? set(u.id, { state: 'Pending', packedAt: undefined as never }) : pack(u.id))}
                      />
                      <span style={{ minWidth: 0, flex: 1 }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          <span style={{ fontWeight: 600 }}>{u.name}</span>
                          {u.required && (
                            <span style={{ display: 'inline-flex', alignItems: 'center', height: 15, padding: '0 5px', borderRadius: 4, background: 'var(--st-primary-bg)', color: 'var(--st-primary-fg)', fontSize: 'var(--t-meta)', fontWeight: 700 }}>
                              Required
                            </span>
                          )}
                          <span style={{ display: 'inline-flex', alignItems: 'center', height: 20, padding: '0 8px', borderRadius: 'var(--r-badge)', background: tone.bg, color: tone.fg, fontSize: 'var(--t-meta)', fontWeight: 600 }}>
                            {rec.state}
                          </span>
                        </span>
                        <Link to={`/inventory/${u.serial}`} className="identifier" style={{ display: 'block', fontSize: 'var(--t-meta)', color: 'var(--text2)', textDecoration: 'none', marginTop: 2 }}>
                          {u.serial}
                        </Link>
                      </span>
                    </label>

                    {u.blocker && rec.state === 'Pending' && (
                      <span style={{ fontSize: 'var(--t-meta)', color: 'var(--progress-text)' }}>Pending — {u.blocker}</span>
                    )}

                    <span style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>
                      {u.location}
                      {rec.condition ? ` · ${rec.condition}` : ''}
                      {rec.packedAt ? ` · packed ${rec.packedAt}` : ''}
                    </span>

                    <span style={{ display: 'flex', gap: 'var(--sp-xs)', flexWrap: 'wrap' }}>
                      {rec.state === 'Pending' && <RowAction label="Missing" onClick={() => set(u.id, { state: 'Missing' })} />}
                      {rec.state === 'Pending' && !u.required && (
                        <RowAction label="Not Req." onClick={() => set(u.id, { state: 'Not Required' })} />
                      )}
                      {rec.state === 'Missing' && <RowAction label="Undo" onClick={() => set(u.id, { state: 'Pending', reason: '' })} />}
                      {rec.state === 'Not Required' && <RowAction label="Undo" onClick={() => set(u.id, { state: 'Pending' })} />}
                    </span>
                  </article>
                )
              })}
              {visible.length === 0 && (
                <EmptyState
                  title="No items match these filters"
                  actionLabel="Clear all filters"
                  onAction={() => { setFilter('All'); setQuery('') }}
                />
              )}
            </div>
          ) : (
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
          )}

          {pending === 0 && missing.length === 0 && (
            <div style={{ margin: 12, padding: '10px 12px', borderRadius: 'var(--r-btn)', background: 'var(--st-in-bg)', color: 'var(--st-in-fg)', fontSize: 'var(--t-meta)', fontWeight: 600, display: 'flex', gap: 7, alignItems: 'center' }}>
              <Icon name="checklist" size={13} />
              All items packed successfully. Ready for Pickup / Delivery.
            </div>
          )}
        </Card>
        </div>

        {/* ── §9 right — progress, blockers, the completion gate, then §9's
             summary / missing / evidence / notes / quick actions ─────────── */}
        <FloorAside collapsible={desktop} side="right" width={300} label="Packing progress" style={place.rail}>
          {/*
            §3.2 PROGRESS + BLOCKERS + [ Complete Packing ], in that order and
            in this column at every width.

            Spec 03 Notes, bullets 1 and 2, both live here:
             · "Exactly one primary button per workspace, and it is the
               completion gate" — `Complete Packing` is the only filled button
               on this page; the footer keeps the exit and nothing else;
             · "Blockers render inline in the rail; a blocked gate never shows
               a toast" (Law 12) — the gate reason is a persistent card below,
               never a toast, and it stays on screen while the block lasts.
          */}
          <Card title="Progress">
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-md)' }}>
              <Ring pct={pct} />
              <div style={{ minWidth: 0 }}>
                <div className="figure" style={{ fontSize: 'var(--t-h3)', fontWeight: 700, color: 'var(--text)' }}>
                  {TOTAL_ITEMS} items · {packed} packed
                </div>
                <div style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)', marginTop: 2 }}>
                  Pack job: {jobState}
                </div>
              </div>
            </div>
          </Card>

          <Card title="Blockers">
            {gateReason ? (
              <div role="status" style={{ display: 'flex', gap: 7, alignItems: 'flex-start', fontSize: 'var(--t-meta)', color: 'var(--progress-text)', fontWeight: 600, lineHeight: 1.45 }}>
                <Icon name="alert_triangle" size={13} style={{ flexShrink: 0, marginTop: 1 }} />
                {gateReason}
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 7, alignItems: 'flex-start', fontSize: 'var(--t-meta)', color: 'var(--success-text)', fontWeight: 600 }}>
                <Icon name="checklist" size={13} style={{ flexShrink: 0, marginTop: 1 }} />
                Nothing is blocking completion.
              </div>
            )}
          </Card>

          <button
            type="button"
            disabled={!canComplete}
            onClick={() => {
              if (!canComplete) return
              // The identity is the signed-in one or there is no dispatch.
              // `{ userId: 'USR-001', role: 'Manager' }` used to be stamped on
              // every packing session here — a made-up operator on a floor
              // record, and 'Manager' happened to be a role the business-9
              // migration had retired.
              if (!user) {
                setDispatchError('You are not signed in, so this packing session cannot be recorded against anyone. Nothing was written.')
                return
              }
              setDispatchError(null)
              // `lines` is deliberately empty: this workspace's item ids come
              // from `data/packing`'s hardcoded UNITS, not from `booking_lines`,
              // so there is nothing true to send and `packRental`'s own
              // `validate` refuses it. Same shape, and same reason, as
              // `MovementList`'s empty unit list. Supplying the real ids needs
              // this screen converted onto `useList`, which is its own task.
              //
              // ⚠ `navigate` is INSIDE `.then`. It used to sit after this block,
              // firing synchronously on every press — so the workspace closed and
              // the operator was returned to the booking as though the session had
              // been recorded, while the write was still in flight and, today,
              // always failing. Leaving on success only is the whole point.
              import('../../actions/rentals/index')
                .then((m) => m.packRental({ id: id!, lines: [] }, { userId: user.id, role: user.role }))
                .then(() => navigate(`/rentals/${id}`))
                .catch((err) => {
                  console.error('pack failed:', err)
                  setDispatchError(err instanceof Error ? err.message : String(err))
                })
            }}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 7,
              width: '100%',
              minHeight: 44,
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

          {/* Law 12 — inline and persistent, never a toast. This is what the
              operator sees instead of being navigated away from a session that
              was never recorded. */}
          {dispatchError && <ErrorBanner title="Packing was not recorded" message={dispatchError} />}

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
                        /* Law 15 — a typed field on a touch device, inside a blocking gate: the
                           Law 10 reason (≥10 characters) is entered here. It was 28px. */
                        style={{ width: '100%', minHeight: 44, marginTop: 5, padding: '0 8px', borderRadius: 'var(--r-input)', border: `1px solid ${(l.reason ?? '').trim().length < 10 ? 'var(--danger)' : 'var(--input-border)'}`, background: 'var(--input-bg)', color: 'var(--text)', fontSize: 'var(--t-meta)', fontFamily: 'inherit', outline: 'none' }}
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
                style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 44, padding: '0 12px', borderRadius: 'var(--r-btn)', border: '1px solid var(--btn-secondary-border)', background: 'var(--btn-secondary-bg)', color: 'var(--text)', fontSize: 'var(--t-meta)', fontWeight: 600, textDecoration: 'none' }}
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
        </FloorAside>
      </div>

      {/*
        §11 — footer. The single EXIT, and nothing else.

        `Complete Packing` used to sit here as well as being the gate; spec 03
        Notes bullet 1 allows exactly one primary per workspace and §3.2 draws
        it in the progress column, so it now lives there only. The gate reason
        went with it, into the Blockers card — inline, persistent, never a
        toast (Law 12).
      */}
      <div style={{ ...cardStyle, display: 'flex', alignItems: 'center', gap: 'var(--sp-md)', padding: '12px 14px', flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={() => navigate(`/rentals/${id}`)}
          style={{ minHeight: 44, padding: '0 14px', borderRadius: 'var(--r-btn)', border: '1px solid var(--border)', background: 'transparent', color: 'var(--danger-text)', fontSize: 'var(--t-meta)', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
        >
          Cancel Packing
        </button>
        <span style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>
          {pending ? `${pending} item${pending > 1 ? 's' : ''} pending` : 'All changes saved'} · Cancelling discards nothing
        </span>
      </div>

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
