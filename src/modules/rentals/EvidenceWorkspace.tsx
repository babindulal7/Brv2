import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import './rentals.css'
import Icon from '../../components/ui/Icon'
import type { IconName } from '../../components/ui/Icon'
import { Card, Button, cardStyle } from '../../components/ui/Page'
import { FloorAside, floorPlacements } from '../operations/FloorAside'
import { useViewport } from '../../lib/device'
import { useAuth } from '../../lib/auth'
import { captureError } from '../../lib/monitoring'
import { EmptyState, ErrorBanner } from '../../components/ui/StateViews'
import { PageBody } from '../../components/ui/PageBody'
import { Unavailable } from '../../components/ui/Unavailable'
import { Donut, Legend } from '../../components/ui/Charts'
import { STATUS, STATUS_ICON } from '../../lib/status'
import { BOOKING_STATUS, statusToken } from '../../lib/workflow'
import type { BookingStatus } from '../../lib/workflow'
import { formatBsOrAd, formatAd } from '../../lib/bs'
import { formatRentalDays, rentalDaysBetween } from '../../lib/rentalDays'
import { deliveryTypeLabel } from '../../lib/format'
import { fetchFloorBooking, type FloorBooking } from '../../lib/queries/bookings'
import {
  PHOTOS,
  matchState,
  THRESHOLDS,
  CATEGORY_NAMES,
  UPLOAD_SOURCES,
  UPLOAD_ROADMAP,
  STEPS,
  BULK_ACTIONS,
  LIMITS,
} from '../../lib/queries/evidence'
import type { MatchState } from '../../lib/queries/evidence'

/**
 * **Evidence Workspace** — `Evidence Workspace.md` v1.1 (Build Locked).
 *
 * Built from the spec's corrections, not the render. §0 "Found in the screen":
 *  · two identities on one screen (header Ramesh / sidebar Babin) → one identity
 *  · stage badge read "Packing Stage" — not a status at all
 *  · a card showed a product and serial while badged **Unmatched** → §7.3
 *    forbids it, so `Photo.product` is simply absent when unmatched
 *  · a five-card strip repeated the four-step header progress → deleted (§4)
 *  · two photos selected with no bulk bar → the bar appears on selection (§9)
 *  · breadcrumb skipped Bookings → restored in the route
 *  · purple on the stage badge → purple is unused (§16)
 *  · `Delete Photo` → **Remove**, a soft delete with a reason (§10)
 *
 * ---
 *
 * ## ⭐ HO-09 (7 Sep 2026) — the screen is now HALF live, and says which half
 *
 * Everything above the notice is read from the booking in the URL. Everything
 * below it is the seeded sample set, labelled as such. The two halves used to
 * be indistinguishable, and every fact in the top half was a literal:
 *
 *  · the header strip carried `{ l: 'Status', v: 'Booked' }` — a **string**,
 *    identical on every booking. Driven earlier this week: B-715 is at stage
 *    `Packed` and this screen said Booked.
 *  · the pickup and return dates were `toBs(new Date('2026-07-16'))` and
 *    `new Date('2026-07-19')` — one booking's schedule printed under every
 *    booking number.
 *  · the Selected Photo caption hardcoded `16 Jul 2026`. No `Photo` in
 *    `data/evidence` carries a date at all (`at` is a clock string such as
 *    `'10:21 AM'`), so that date was not a formatting of anything — Law 7: a
 *    timestamp is an instant, not the string a screen happened to print.
 *  · `Client` came from `data/booking`'s seeded `BOOKING`, and `Items` from
 *    `data/packing`'s `TOTAL_ITEMS`.
 *
 * The head is now `fetchFloorBooking` (`lib/queries/bookings.ts`, Law 2's one
 * floor read), consumed exactly as `PackingWorkspace` consumes it — including
 * its loading, error and not-found states through `PageBody`, so none of the
 * three renders as a settled fact (BD-02). Every cell in the strip is a column
 * off that read; where the read has no value the cell renders `—` rather than
 * falling back to a seed. `Days` is `lib/rentalDays.ts`, the engine that owns
 * the day count (Law 1) — this page does not carry a copy of that rule.
 *
 * **The photo grid could not be made real and is not dressed as real.** There
 * is no storage bucket, no `storage.from(...)` call in `src/`, and no writer
 * for `evidence_files` — the only evidence action in the app is
 * `REVIEW_EVIDENCE`, which is `implemented: false` (HO-06 owns that gap; it is
 * still open). Inventing a source was the one move forbidden here, so the
 * gallery keeps the seeded `PHOTOS` behind {@link SampleEvidenceNotice}: an
 * operator reading a real booking number above sample photographs would
 * otherwise, reasonably, take the photographs for theirs.
 *
 * ## ⭐ HO-10 (7 Sep 2026) — the controls now state what they do
 *
 *  · the seven `BULK_ACTIONS` rendered as live enabled buttons from an array
 *    with no handler — see {@link BULK_UNAVAILABLE} for each one's verified
 *    reason (PK-08's treatment, and its standard of proof).
 *  · `Remove` → **Hide on This Screen**, following PK-07: a control is named
 *    for what it does. It set local state and nothing else, under copy
 *    promising "Retained and audited… Archived filter". That copy describes
 *    Law 3 correctly and is kept — moved to where it belongs, as the thing
 *    that is **not built yet**, beside what actually happens now.
 *  · `Clear all filters` cleared the match filter and left the category set.
 *    The gallery shows exactly one category by construction, so there is no
 *    state in which no category filter applies; the control now says what it
 *    clears and the empty state names the category that stays.
 */

const SOURCE_ICON: Record<(typeof UPLOAD_SOURCES)[number], IconName> = {
  'Take Photo': 'camera',
  'Record Video': 'video',
  'Upload Files': 'upload',
  'Upload Folder': 'folder',
}

/**
 * Why nothing on this screen can accept a file yet.
 *
 * Deliberately the same fact `Expenses.tsx` states for its receipt slot: the
 * destination exists in the schema, the *upload* does not. Keeping one wording
 * for one cause means a reader who meets it twice learns it once.
 */
const UPLOAD_UNAVAILABLE =
  'Uploading is not built yet — no storage bucket is configured and nothing in the app uploads a file, so a picker here would take your photo and store nothing. ' +
  'Keep evidence on the device until it ships.'

const TONE: Record<MatchState, { bg: string; fg: string }> = {
  Matched: { bg: 'var(--st-in-bg)', fg: 'var(--st-in-fg)' },
  Review: { bg: 'var(--st-progress-bg)', fg: 'var(--st-progress-fg)' },
  Unmatched: { bg: 'var(--st-danger-bg)', fg: 'var(--st-danger-fg)' },
}

/**
 * §3.6's three layouts — desktop rails, tablet 3-up grid, phone 2-up. The
 * lightbox is the selected-photo rail, which reflows beneath the grid below
 * 1280 rather than collapsing to a handle (Rulings §7).
 */
const GRID_COLUMNS = { desktop: 'repeat(auto-fill, minmax(150px, 1fr))', tablet: 'repeat(3, minmax(0,1fr))', phone: 'repeat(2, minmax(0,1fr))' } as const

/**
 * §3.6's header filter — `[Packing][Return][Damage]`.
 *
 * These three are a SUBSET of `CATEGORY_NAMES`' eleven, not a replacement for
 * them: the rail still lists all eleven (Rulings §1 — a panel survives unless
 * prose removes it), and both controls drive the same `category` state, so
 * they cannot disagree about what the gallery is showing.
 */
const STAGE_FILTERS = ['Packing', 'Return', 'Damage'] as const

/**
 * ⭐ 12 Aug 2026 — **Unmatch no longer dispatches**, and this says why.
 *
 * What stood on the button:
 *
 *   onClick={() => import('../../actions/rentals').then(m =>
 *     m.reviewEvidence({ evidenceId: current.id, action: 'remove', reason: 'Unmatched by user' }))}
 *
 * Three separate untruths in one line:
 *
 *  · **No session.** `actions/core.ts` refuses any dispatch without a real
 *    `ActionContext`, so this rejected on every press — into a floating promise
 *    with no `.catch()`. The operator pressed Unmatch, saw the card keep its
 *    product and serial, and had nothing to read.
 *  · **A fabricated reason.** §10 requires a reason for a soft delete and the
 *    adjacent Remove button collects one; `'Unmatched by user'` is a sentence
 *    nobody typed, recorded as though somebody had.
 *  · **The wrong verb.** `ReviewEvidenceInput.action` is `'review' | 'remove'`
 *    (`src/actions/rentals/reviewEvidence.ts`). `'remove'` is the SOFT DELETE
 *    §10 gives the Remove button — hiding the photo. Detaching a wrong *match*
 *    is a different operation and the action vocabulary has no verb for it.
 *    Sending `'remove'` is harmless only while REVIEW_EVIDENCE is a stub; the
 *    day it writes, Unmatch would archive the photo instead of clearing its
 *    product.
 *
 * Widening that input belongs to whoever owns `src/actions/` — inventing a verb
 * here would be inventing the decision. So the control states the gap and acts
 * on nothing, which is what `Unavailable` is for. `Mark as Review` beside it
 * sends the verb that *does* exist and is wired properly.
 */
const UNMATCH_UNAVAILABLE_REASON =
  /* Unmatch cannot act yet. REVIEW_EVIDENCE accepts only "review" or "remove", and "remove" is the soft-delete §10 gives the Remove button — it would hide the photo, not detach its match. Detaching a wrong match needs its own verb. Nothing is written and this photo keeps its match. */ "Removing a product match is not available yet. No change is saved."

/**
 * **HO-10, part 1** — the seven bulk actions, each with the reason it cannot
 * act. Every claim below was checked before it was written, PK-08's standard:
 *
 *  · `src/actions/` holds exactly one evidence action, `reviewEvidence.ts`,
 *    and its `ReviewEvidenceInput.action` is `'review' | 'remove'`. It also
 *    carries `implemented: false`, so `createAction` refuses it before
 *    `execute` — nothing writes an evidence row of any kind today.
 *  · a `Photo` (`data/evidence.ts`) carries `file`, `at` and `size` as
 *    STRINGS. There is no URL, no blob and no bytes; the thumbnails on this
 *    screen are an `<Icon name="camera">`, not an `<img>`. So Download, Export
 *    ZIP and Rotate have no subject, not merely no handler.
 *  · no zip library and no PDF library appear in `package.json` (dependencies
 *    or devDependencies), and no print stylesheet exists — searching `src/` for
 *    a print media query finds only prose like this sentence, never a rule.
 *    (The first draft offered that grep returning NOTHING as its proof, which
 *    the draft itself then falsified: the comment is a hit. A proof a comment
 *    can break by existing is not a proof.) The same absence PK-08 verified for
 *    Print Packing List.
 *
 * They stay visible and disabled rather than being deleted: §9 puts them on
 * the bulk bar, and a reader who cannot see the control cannot learn why it is
 * missing.
 */
const BULK_UNAVAILABLE: Record<(typeof BULK_ACTIONS)[number], string> = {
  'Assign Product':
    'Assigning a product is not built — REVIEW_EVIDENCE, the only evidence action in the app, takes "review" or "remove" and has no verb that attaches a product. There is also no stored evidence row to attach one to.',
  'Assign Category':
    'Recategorising is not built — nothing in src/actions writes an evidence category, and these files have no stored row to change. Each card\'s category is a fixed property of the sample data.',
  Download:
    'There is nothing to download. These entries carry a file name and a size as text — no bytes, no URL — and no storage bucket is configured, so the app cannot read a file back.',
  'Export ZIP':
    'Two things are missing, not one: there are no stored bytes to archive, and no zip library in the project to archive them with.',
  'Generate PDF':
    'No PDF is produced anywhere in this app — there is no PDF library in package.json and no print stylesheet — so this would generate nothing, silently.',
  Rotate:
    'Rotating needs an image and somewhere to keep the result. These entries hold no image data and no evidence file is stored, so a rotation could be neither applied nor saved.',
  Remove:
    /* Removing evidence is a soft delete (§10, Law 3): the file is kept, the removal is audited, and Owner and Manager see it again in an Archived filter. None of that is built — REVIEW_EVIDENCE's "remove" verb is a stub and the app has no Archived filter. To take a card out of your own view, use Hide on This Screen on the selected photo. */ "Removing evidence is not available yet. Hide on This Screen only hides it until this page reloads.",
}

/**
 * The stage badge's tone and glyph, tolerant of a stage this build cannot name.
 *
 * `statusToken` indexes `BOOKING_STATUS` and throws on anything outside §1.2's
 * canonical six; `FloorBooking.stage` is a plain `string` off the query, so the
 * membership test is what stands between an unexpected enum value and a blank
 * screen. The other floor workspaces cast instead — Evidence is a read-only
 * viewer and should survive a stage it cannot colour rather than refuse to
 * render the booking at all.
 */
function stageChip(stage: string): { bg: string; fg: string; icon: IconName } {
  const key = stage in BOOKING_STATUS ? statusToken(stage as BookingStatus) : 'neutral'
  const tone = STATUS[key]
  return { bg: tone.bg, fg: tone.fg, icon: STATUS_ICON[key] }
}

/**
 * **The line between what is read and what is drawn.**
 *
 * This is the whole of HO-09 that could not be fixed by wiring: the booking
 * head above it is this booking's, the gallery below it is not anybody's. A
 * warehouse operator who scrolls past a correct booking number, client and
 * pickup date has every reason to read the ten photographs underneath as the
 * ten photographs somebody took for that job, and they are not — they are the
 * same ten fixtures under every booking number in the app.
 *
 * Law 11 applies to a notice as much as to a status: icon, heading and colour,
 * never colour alone.
 */
function SampleEvidenceNotice({ bookingNo }: { bookingNo: string }) {
  return (
    <div
      role="note"
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 'var(--sp-sm)',
        padding: '12px 14px',
        borderRadius: 'var(--r-card)',
        border: '1px solid var(--border)',
        background: 'var(--st-progress-bg)',
        color: 'var(--st-progress-fg)',
      }}
    >
      <Icon name="alert_triangle" size={18} style={{ flexShrink: 0, marginTop: 1 }} />
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 'var(--t-meta)', fontWeight: 700 }}>
          The photographs below are not <span className="identifier">{bookingNo}</span>&apos;s.
        </div>
        <p style={{ margin: '4px 0 0', fontSize: 'var(--t-meta)', lineHeight: 1.5 }}>
          Everything above this line — client, dates, stage, delivery — is read from{' '}
          <span className="identifier">{bookingNo}</span> itself. Everything below it is a fixed set of ten sample
          files built into the app: the same ten appear under every booking number, and the match results, category
          counts, thresholds and pipeline steps all describe those samples. No evidence has been uploaded for this
          booking or any other, because uploading is not built — there is no storage bucket and nothing in the app
          writes an evidence file. Read the gallery as a layout preview, never as this booking&apos;s record.
        </p>
      </div>
    </div>
  )
}

/*
 * ⭐ RULED 12 Aug 2026 (Rulings §3): operations are ROUTES.
 * `/rentals/:bookingNo/evidence` is the only mount, and `bookingNo` comes off
 * the route for ANY booking — resolved by `fetchFloorBooking`, not compared
 * against a seed. The old `BookingNotLoaded` guard ("floor data exists only for
 * B-715") went with the seeded head it was describing: the head is a live read
 * now, so an unknown number gets the query's own answer.
 */
export default function EvidenceWorkspace() {
  const { bookingNo } = useParams()
  const id = bookingNo ?? ''
  /* Law 13/14 — width decides, at v4.1 §7.7's 768 / 1280. */
  const viewport = useViewport()
  const desktop = viewport === 'desktop'
  const phone = viewport === 'phone'
  const place = floorPlacements(desktop, phone)
  /** The one identity a dispatch on this screen may act as. No fallback. */
  const { user } = useAuth()

  /* ── the read — fetchFloorBooking, same cancellation rule as PackingWorkspace ── */
  const [floor, setFloor] = useState<FloorBooking | null>(null)
  const [floorLoading, setFloorLoading] = useState(true)
  const [floorError, setFloorError] = useState<string | null>(null)
  const [reload, setReload] = useState(0)
  useEffect(() => {
    let cancelled = false
    setFloorLoading(true)
    setFloorError(null)
    fetchFloorBooking(id)
      .then((b) => {
        if (cancelled) return
        setFloor(b)
        setFloorLoading(false)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setFloorError(err instanceof Error ? err.message : String(err))
        setFloorLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [id, reload])

  const [selected, setSelected] = useState<string[]>([])
  const [active, setActive] = useState<string>('p1')
  const [filter, setFilter] = useState<'All' | MatchState>('All')
  const [category, setCategory] = useState('Packing')
  /**
   * Cards the viewer has taken out of their own gallery, with the note they
   * left. Named `hidden`, not `removed`: it is browser state that dies on
   * reload, nobody else sees it, and no row anywhere changes. It was called
   * `removed` while the panel promised retention and audit — HO-10.
   */
  const [hidden, setHidden] = useState<Record<string, string>>({})
  const [hiding, setHiding] = useState<string | null>(null)
  const [note, setNote] = useState('')
  /**
   * The last dispatch failure, rendered inline in the Selected Photo card and
   * left there until the next attempt. Law 12 — errors are inline and
   * persistent; `useToast()` carries successes only and no error toast is
   * invented here. This screen had no dispatch-failure line at all, so it
   * reuses `ErrorBanner` (`components/ui/StateViews`), the same component
   * `PackingWorkspace` renders its `dispatchError` through.
   */
  const [dispatchError, setDispatchError] = useState<string | null>(null)

  /*
   * BD-19 — a value from the previous record surviving onto the next record's
   * screen is a fabricated fact, not a refresh bug. The gallery below is the
   * same samples on every booking, but a rail reading "Hidden on this screen
   * (3)" carried across a navigation reads as a statement about the booking
   * now on screen. Everything the viewer did to the previous one is dropped.
   */
  const floorId = floor?.id ?? null
  useEffect(() => {
    setSelected([])
    setActive('p1')
    setFilter('All')
    setCategory('Packing')
    setHidden({})
    setHiding(null)
    setNote('')
    setDispatchError(null)
  }, [floorId])

  /*
   * ⛔ This was `!hidden[p.id]` — a TRUTHINESS test on the stored note, at a
   * moment when the note had just been made optional. A blank note stores `''`,
   * `!'' === true`, and the photo stayed in the gallery while the rail card
   * announced it hidden and the counts still included it. The old code could not
   * hit it (the note was mandatory, `length < 5` returned early), so making the
   * note optional is what reopened it — the predicate has to test PRESENCE.
   */
  const live = PHOTOS.filter((p) => !(p.id in hidden))

  const counts = useMemo(() => {
    const c = { Matched: 0, Review: 0, Unmatched: 0 }
    live.forEach((p) => (c[matchState(p)] += 1))
    return c
  }, [live])
  const total = live.length
  /** §6 invariant — Matched + Review + Unmatched = Total. */
  const reconciles = counts.Matched + counts.Review + counts.Unmatched === total

  /*
   * ⭐ FIXED 12 Aug 2026 — `category` was set by the Categories rail and by
   * nothing else read it, so picking a category changed the highlight and not
   * the gallery. §3.6 is explicit that the grid is filtered by stage, so the
   * category now actually narrows `visible`, alongside the match filter.
   */
  const visible = live.filter((p) => (filter === 'All' || matchState(p) === filter) && p.category === category)
  const current = live.find((p) => p.id === active) ?? live[0]
  const pct = (n: number) => (total ? `${((n / total) * 100).toFixed(1)}%` : '0%')

  const slices = [
    { label: 'Matched', value: counts.Matched, display: String(counts.Matched), percent: pct(counts.Matched) },
    { label: 'Review', value: counts.Review, display: String(counts.Review), percent: pct(counts.Review) },
    { label: 'Unmatched', value: counts.Unmatched, display: String(counts.Unmatched), percent: pct(counts.Unmatched) },
  ]

  const hiddenIds = Object.keys(hidden)

  /*
   * The query found nothing with this number. A DIFFERENT fact from a booking
   * that exists and has no evidence, which is why it is the empty state and
   * not a banner (`fetchFloorBooking` documents the same distinction).
   */
  const notFound = !floorLoading && floorError === null && floor === null

  // Floor scale (DEVICES.md item 3) is applied automatically by route in App.tsx's Shell, not here.
  return (
    <div className="floor-workspace-container" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
      <PageBody
        loading={floorLoading}
        error={floorError}
        onRetry={() => setReload((n) => n + 1)}
        empty={notFound}
        noun={`booking ${id}`}
        skeleton="card"
        emptyTitle={`No booking matches ${id}`}
        emptyMessage="Check the booking number — nothing with this number exists, so there is no booking to file evidence against."
      >
        {floor !== null && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--sp-lg)', flexWrap: 'wrap' }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
                  <h1 style={{ margin: 0, fontSize: 'var(--t-h1)', fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.015em' }}>
                    Evidence Workspace
                  </h1>
                  {/*
                    HO-09 — this was the string 'Booked', on every booking. It
                    is the canonical stage off the read now, with Law 11's
                    icon + label + colour.
                  */}
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 'var(--sp-xs)',
                      height: 22,
                      padding: '0 9px',
                      // §3.3 — a status is --r-chip; 999 is for numeric counts.
                      borderRadius: 'var(--r-chip)',
                      background: stageChip(floor.stage).bg,
                      color: stageChip(floor.stage).fg,
                      fontSize: 'var(--t-meta)',
                      fontWeight: 700,
                    }}
                  >
                    <Icon name={stageChip(floor.stage).icon} size={11} />
                    {floor.stage}
                  </span>
                </div>
                {/*
                  The subtitle used to read "Upload once, reference everywhere.
                  Files are matched to products automatically." Nothing in this
                  build uploads a file or matches one, so that sentence
                  described a product that does not exist. It is replaced by
                  the one thing this screen can state truthfully about itself:
                  whose booking it is.
                */}
                <p style={{ margin: '5px 0 0', fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
                  <Link to={`/rentals/${id}`} style={{ color: 'var(--link)', fontWeight: 600, textDecoration: 'none' }} className="identifier">
                    {floor.bookingNo}
                  </Link>
                  {floor.project ? ` · ${floor.project}` : ''}
                  {floor.clientName ? ` · ${floor.clientName}` : ''}
                </p>
              </div>
              <div style={{ display: 'flex', gap: 'var(--sp-sm)' }}>
                <Link
                  to={`/rentals/${id}/packing`}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 34, padding: '0 12px', borderRadius: 'var(--r-btn)', border: '1px solid var(--btn-secondary-border)', background: 'var(--btn-secondary-bg)', color: 'var(--text)', fontSize: 'var(--t-meta)', fontWeight: 600, textDecoration: 'none' }}
                >
                  <Icon name="refresh" size={14} />
                  Switch to Packing Workspace
                </Link>
                <Link
                  to={`/rentals/${id}`}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 34, padding: '0 12px', borderRadius: 'var(--r-btn)', border: '1px solid var(--btn-secondary-border)', background: 'var(--btn-secondary-bg)', color: 'var(--text)', fontSize: 'var(--t-meta)', fontWeight: 600, textDecoration: 'none' }}
                >
                  <Icon name="external_link" size={14} />
                  View Booking
                </Link>
              </div>
            </div>

            {/* §3 — read-only booking strip, BS above AD */}
            <div className="floor-summary-bar">
              {[
                { l: 'Client', v: floor.clientName ?? '—', big: true },
                { l: 'Booking', v: floor.bookingNo },
                {
                  l: 'Pickup',
                  v: floor.pickupAtAd ? formatBsOrAd(new Date(floor.pickupAtAd)) : '—',
                  s: floor.pickupAtAd ? formatAd(new Date(floor.pickupAtAd)) : undefined,
                },
                {
                  l: 'Return',
                  v: floor.returnAtAd ? formatBsOrAd(new Date(floor.returnAtAd)) : '—',
                  s: floor.returnAtAd ? formatAd(new Date(floor.returnAtAd)) : undefined,
                },
                /* Law 1 — `lib/rentalDays.ts` owns the day count. This page
                   asks it; it does not keep a copy of the rule. */
                { l: 'Days', v: formatRentalDays(rentalDaysBetween(floor.pickupAtAd, floor.returnAtAd)), s: 'Rental days' },
                { l: 'Stage', v: floor.stage, big: true },
                { l: 'Delivery', v: deliveryTypeLabel(floor.deliveryType) },
              ].map((f) => (
                <div key={f.l} className="floor-summary-cell">
                  <div className="floor-summary-label">{f.l}</div>
                  <div className="floor-summary-value" style={{ color: ['Pickup', 'Return'].includes(f.l) && f.s ? 'var(--booking-date-text)' : undefined }}>
                    {f.v}
                  </div>
                  {f.s && <div className="floor-summary-sub figure" style={{ color: ['Pickup', 'Return'].includes(f.l) ? 'var(--booking-date-text)' : undefined }}>{f.s}</div>}
                </div>
              ))}
            </div>

            {/* ── everything from here down is the sample set ─────────────── */}
            <SampleEvidenceNotice bookingNo={floor.bookingNo} />

            {/* §3.6 header — `[Packing][Return][Damage]`, the stage the grid is
                filtered by. Same state as the Categories rail's eleven. */}
            <div role="group" aria-label="Filter the sample gallery by stage" style={{ display: 'flex', gap: 'var(--sp-sm)', flexWrap: 'wrap' }}>
              {STAGE_FILTERS.map((s) => {
                const on = category === s
                const n = live.filter((p) => p.category === s).length
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setCategory(s)}
                    aria-pressed={on}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 'var(--sp-sm)',
                      minHeight: 44,
                      padding: '0 14px',
                      borderRadius: 'var(--r-btn)',
                      border: `1px solid ${on ? 'var(--nav-active-accent)' : 'var(--border)'}`,
                      background: on ? 'var(--nav-active-bg)' : 'var(--card)',
                      color: on ? 'var(--nav-active-accent)' : 'var(--text2)',
                      fontSize: 'var(--t-meta)',
                      fontWeight: 600,
                      fontFamily: 'inherit',
                      cursor: 'pointer',
                    }}
                  >
                    {s}
                    <span className="figure" style={{ color: 'var(--muted)' }}>{n}</span>
                  </button>
                )
              })}
              {/* Every other category the rail carries stays reachable; this says so
                  rather than leaving the three chips looking like the whole set. */}
              {!STAGE_FILTERS.includes(category as (typeof STAGE_FILTERS)[number]) && (
                <span style={{ display: 'inline-flex', alignItems: 'center', minHeight: 44, fontSize: 'var(--t-meta)', color: 'var(--text2)', fontWeight: 600 }}>
                  Showing {category} — chosen from the Categories rail
                </span>
              )}
            </div>

            {/* §4 — ONE progress indicator, four steps. The four states are
                DRAWN, not measured: no file has been uploaded, processed,
                matched or synced in this build, so there is nothing to read
                them from. The line beneath says so rather than letting four
                confident pills imply a pipeline that ran. */}
            <div style={{ ...cardStyle, padding: '12px 14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 0, flexWrap: 'wrap' }}>
                {STEPS.map((s, i) => {
                  const state = i < 2 ? 'Complete' : i === 2 ? 'In Progress' : 'Pending'
                  const tone = state === 'Complete' ? 'var(--success-text)' : state === 'In Progress' ? 'var(--progress-text)' : 'var(--muted)'
                  return (
                    <span key={s} style={{ display: 'flex', alignItems: 'center', gap: 9, flex: 1, minWidth: 150 }}>
                      <span
                        className="figure"
                        style={{ width: 22, height: 22, borderRadius: 'var(--r-badge)', display: 'grid', placeItems: 'center', border: `1.5px solid ${tone}`, color: tone, fontSize: 'var(--t-meta)', fontWeight: 700, flexShrink: 0 }}
                      >
                        {i + 1}
                      </span>
                      <span style={{ minWidth: 0 }}>
                        <span style={{ display: 'block', fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)' }}>{s}</span>
                        <span style={{ display: 'block', fontSize: 'var(--t-meta)', color: tone, fontWeight: 600 }}>{state}</span>
                      </span>
                      {i < STEPS.length - 1 && <span aria-hidden style={{ flex: 1, height: 1, background: 'var(--border)', minWidth: 16 }} />}
                    </span>
                  )
                })}
              </div>
              <p style={{ margin: '9px 0 0', fontSize: 'var(--t-meta)', color: 'var(--muted)', lineHeight: 1.5 }}>
                A fixed illustration of the four steps. Nothing has been uploaded, processed, matched or synced for{' '}
                <span className="identifier">{floor.bookingNo}</span> — these four states are drawn, not measured.
              </p>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: desktop ? 'auto minmax(0,1fr) auto' : phone ? '1fr' : 'minmax(0,1fr) 300px',
                gap: 'var(--sp-md)',
                alignItems: 'start',
              }}
            >
              {/* ── §5 left ─────────────────────────────────────────────────── */}
              <FloorAside collapsible={desktop} side="left" width={210} label="Categories" style={place.tree}>
                <Card title="Upload Sources">
                  {/*
                    Found by probing this rendered screen while fixing the MiniBtn
                    trio below — all four upload buttons were enabled with no handler,
                    on a screen whose entire subject is getting photos in. They are
                    the four most important controls here and they were the four most
                    dead.

                    Same cause as `Expenses.tsx`'s `ATTACHMENT_UNAVAILABLE`, quoted
                    here so the two stay one story: no Supabase Storage bucket is
                    configured and there is **no `storage.from(...)` call anywhere in
                    `src/`**. A picker that opened would take a warehouse operator's
                    photo and store nothing — worse than a greyed button, because the
                    operator would believe the evidence was filed.
                  */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {UPLOAD_SOURCES.map((u) => (
                      <Unavailable key={u} reason={UPLOAD_UNAVAILABLE} style={{ display: 'block' }}>
                        <Button icon={SOURCE_ICON[u]} disabled>
                          {u}
                        </Button>
                      </Unavailable>
                    ))}
                  </div>
                  {/* The drop zone invited the same gesture and swallowed it the same
                      way — with no `onDrop` it silently did nothing, and a dashed
                      border is the one shape that means "drop here". It states the
                      same reason rather than inviting the drop. */}
                  <Unavailable reason={UPLOAD_UNAVAILABLE} style={{ display: 'block' }}>
                    <div
                      aria-disabled="true"
                      style={{ marginTop: 9, padding: '18px 10px', borderRadius: 'var(--r-btn)', border: '1.5px dashed var(--border)', textAlign: 'center', color: 'var(--muted)', fontSize: 'var(--t-meta)', opacity: 0.6 }}
                    >
                      <Icon name="upload" size={18} />
                      <div style={{ marginTop: 5 }}>Drag &amp; drop is not available yet</div>
                    </div>
                  </Unavailable>
                  {/* §11.2 — limits stated before upload begins, not after. */}
                  <p style={{ margin: '9px 0 0', fontSize: 'var(--t-meta)', color: 'var(--muted)', lineHeight: 1.5 }}>
                    {LIMITS.image} · {LIMITS.video} · {LIMITS.booking}
                    <br />
                    {LIMITS.formats}
                  </p>
                  {/* §5.1 — roadmap kept visibly separate from what ships. */}
                  <p style={{ margin: '7px 0 0', fontSize: 'var(--t-meta)', color: 'var(--muted)', lineHeight: 1.5 }}>
                    Not in v1: {UPLOAD_ROADMAP.join(' · ')}
                  </p>
                </Card>

                <Card title="Categories">
                  {CATEGORY_NAMES.map((c) => {
                    const n = live.filter((p) => p.category === c).length
                    const on = category === c
                    return (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setCategory(c)}
                        aria-pressed={on}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 'var(--sp-sm)',
                          width: '100%',
                          height: 30,
                          padding: '0 8px',
                          borderRadius: 7,
                          border: 'none',
                          background: on ? 'var(--nav-active-bg)' : 'transparent',
                          color: on ? 'var(--nav-active-accent)' : 'var(--text2)',
                          fontSize: 'var(--t-meta)',
                          fontWeight: on ? 600 : 500,
                          cursor: 'pointer',
                          fontFamily: 'inherit',
                          textAlign: 'left',
                        }}
                      >
                        <span style={{ flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c}</span>
                        {/* `--muted` on the selected row's tint measures 4.38:1 — under AA. */}
                        <span className="figure" style={{ fontSize: 'var(--t-meta)', color: on ? 'var(--text2)' : 'var(--muted)' }}>{n}</span>
                      </button>
                    )
                  })}
                </Card>
              </FloorAside>

              {/* ── §6 / §8 centre ──────────────────────────────────────────── */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)', minWidth: 0, ...place.list }}>
                <Card title="Processing — sample files">
                  <div style={{ display: 'grid', gridTemplateColumns: phone ? 'repeat(2, minmax(0,1fr))' : 'repeat(4, minmax(0,1fr))', gap: 'var(--sp-md)' }}>
                    {[
                      { l: 'Total Photos', v: total, tone: 'var(--text)', bg: 'var(--card2)' },
                      { l: 'Matched', v: counts.Matched, tone: 'var(--success-text)', p: pct(counts.Matched), bg: 'var(--st-in-bg)' },
                      { l: 'Need Review', v: counts.Review, tone: 'var(--progress-text)', p: pct(counts.Review), bg: 'var(--st-progress-bg)' },
                      { l: 'Unmatched', v: counts.Unmatched, tone: 'var(--danger-text)', p: pct(counts.Unmatched), bg: 'var(--st-danger-bg)' },
                    ].map((k) => (
                      <div
                        key={k.l}
                        style={{
                          padding: '11px 13px',
                          borderRadius: 'var(--r-sm)',
                          border: '1px solid var(--border)',
                          background: k.bg,
                          transition: 'border-color var(--dur) ease',
                        }}
                      >
                        <div style={{ fontSize: 'var(--t-meta)', fontWeight: 500, color: 'var(--text2)' }}>{k.l}</div>
                        <div className="figure" style={{ fontSize: 'var(--t-h2)', fontWeight: 700, color: k.tone, marginTop: 4 }}>{k.v}</div>
                        {k.p && <div className="figure" style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)', marginTop: 2 }}>{k.p}</div>}
                      </div>
                    ))}
                  </div>
                  {/* §6 — percentages are derived, and the invariant is checked. */}
                  <p style={{ margin: '9px 0 0', fontSize: 'var(--t-meta)', color: reconciles ? 'var(--muted)' : 'var(--danger-text)', fontWeight: reconciles ? 400 : 700 }}>
                    {reconciles
                      ? 'Matched + Review + Unmatched = Total. Percentages are derived, never stored. Counted over the sample files above, not over this booking.'
                      : 'Counts do not reconcile to the total.'}
                  </p>
                </Card>

                <Card
                  title="Gallery — sample files"
                  bodyStyle={{ padding: 0 }}
                  action={
                    <>
                      {(['All', 'Matched', 'Review', 'Unmatched'] as const).map((f) => {
                        const on = filter === f
                        return (
                          <button
                            key={f}
                            type="button"
                            onClick={() => setFilter(f)}
                            aria-pressed={on}
                            style={{ minHeight: 44, padding: '0 12px', borderRadius: 'var(--r-btn, 7px)', border: `1px solid ${on ? 'var(--nav-active-accent)' : 'var(--border)'}`, background: on ? 'var(--nav-active-bg)' : 'transparent', color: on ? 'var(--nav-active-accent)' : 'var(--text2)', fontSize: 'var(--t-meta)', fontWeight: on ? 600 : 500, cursor: 'pointer', fontFamily: 'inherit' }}
                          >
                            {f}
                          </button>
                        )
                      })}
                    </>
                  }
                >
                  {/* §9 — the bulk bar appears on selection and states the count.
                      HO-10: all seven were enabled and none had a handler. See
                      BULK_UNAVAILABLE for the reason each one carries. */}
                  {selected.length > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 12px', borderBottom: '1px solid var(--border)', background: 'var(--nav-active-bg)', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 'var(--t-meta)', fontWeight: 700, color: 'var(--nav-active-accent)' }}>{selected.length} selected</span>
                      {BULK_ACTIONS.map((b) => (
                        <Unavailable key={b} reason={BULK_UNAVAILABLE[b]}>
                          <Button disabled>{b}</Button>
                        </Unavailable>
                      ))}
                      <button
                        type="button"
                        onClick={() => setSelected([])}
                        style={{ marginLeft: 'auto', border: 'none', background: 'transparent', color: 'var(--text2)', fontSize: 'var(--t-meta)', cursor: 'pointer', fontFamily: 'inherit' }}
                      >
                        Clear selection
                      </button>
                    </div>
                  )}

                  {/* §3.6 — desktop fills, tablet is 3-up, phone is 2-up. */}
                  <div style={{ display: 'grid', gridTemplateColumns: GRID_COLUMNS[viewport], gap: 10, padding: 'var(--sp-md)' }}>
                    {visible.map((p) => {
                      const st = matchState(p)
                      const on = selected.includes(p.id)
                      return (
                        <div
                          key={p.id}
                          style={{
                            borderRadius: 'var(--r-btn)',
                            border: `1.5px solid ${active === p.id ? 'var(--nav-active-accent)' : 'var(--border)'}`,
                            overflow: 'hidden',
                            background: 'var(--card2)',
                          }}
                        >
                          <div style={{ position: 'relative' }}>
                            <button
                              type="button"
                              onClick={() => setActive(p.id)}
                              aria-label={`Preview ${p.file}, ${st}`}
                              style={{ display: 'grid', placeItems: 'center', width: '100%', height: 92, border: 'none', background: 'var(--card2)', color: 'var(--muted)', cursor: 'pointer' }}
                            >
                              <Icon name="camera" size={22} />
                            </button>
                            <input
                              type="checkbox"
                              checked={on}
                              aria-label={`Select ${p.file}`}
                              onChange={() => setSelected((s) => (on ? s.filter((x) => x !== p.id) : [...s, p.id]))}
                              style={{ position: 'absolute', top: 7, left: 7 }}
                            />
                          </div>
                          <div style={{ padding: '8px 9px' }}>
                            <div className="figure" style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)', display: 'flex', gap: 6 }}>
                              <span style={{ flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.file}</span>
                              <span style={{ color: 'var(--muted)' }}>{p.at}</span>
                            </div>
                            {/* §7.3 — an Unmatched card shows no product and no serial. */}
                            {p.product ? (
                              <>
                                <div style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)', marginTop: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                  {p.product.name}
                                </div>
                                <div className="identifier" style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>{p.product.serial}</div>
                              </>
                            ) : (
                              <div style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)', marginTop: 4, fontStyle: 'italic', lineHeight: '1.5' }}>No product resolved</div>
                            )}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
                              <span style={{ display: 'inline-flex', alignItems: 'center', height: 19, padding: '0 7px', borderRadius: 5, background: TONE[st].bg, color: TONE[st].fg, fontSize: 'var(--t-meta)', fontWeight: 700 }}>
                                {st}
                              </span>
                              {/* §8 — confidence is shown for Review only. */}
                              {st === 'Review' && p.confidence && (
                                <span className="figure" style={{ fontSize: 'var(--t-meta)', color: 'var(--progress-text)', fontWeight: 600 }}>{p.confidence}%</span>
                              )}
                              {st === 'Review' && (
                                <span style={{ marginLeft: 'auto', display: 'flex', gap: 'var(--sp-xs)' }}>
                                  <MiniBtn label="Accept" reason={MATCH_EDIT_UNAVAILABLE.accept} />
                                  <MiniBtn label="Change" reason={MATCH_EDIT_UNAVAILABLE.change} />
                                </span>
                              )}
                              {st === 'Unmatched' && (
                                <span style={{ marginLeft: 'auto' }}>
                                  <MiniBtn label="Assign Product" reason={MATCH_EDIT_UNAVAILABLE.assign} />
                                </span>
                              )}
                            </div>
                            {p.reason && (
                              <div style={{ fontSize: 'var(--t-meta)', color: 'var(--danger-text)', marginTop: 5, lineHeight: 1.4 }}>{p.reason}</div>
                            )}
                          </div>
                        </div>
                      )
                    })}
                    {visible.length === 0 && (
                      /*
                       * HO-10, part 3. The action said "Clear all filters" and
                       * cleared one: `setFilter('All')` ran and `category` was
                       * left exactly where it was, so an operator could press
                       * it and still see nothing.
                       *
                       * Category cannot be cleared — the gallery renders
                       * `p.category === category`, so exactly one category is
                       * always in force and there is no "no category" state to
                       * return to. So the control now names the one filter it
                       * clears and the copy names the one that stays.
                       *
                       * TODO(decision) — should the Categories rail carry an
                       * "All Photos" row? `data/evidence.ts`'s §5.2 comment
                       * says the eleven counts "sum to the All Photos total",
                       * which implies the render had such a row, but §5.2's
                       * `CATEGORY_NAMES` does not list one and no spec text in
                       * this workspace adds it. Adding it would make "clear all
                       * filters" honest again in one press; adding it here
                       * would be inventing the product decision, so it is not
                       * added. Whoever rules it: the change is one entry in
                       * `CATEGORY_NAMES`' consumers plus dropping the
                       * `p.category === category` clause when it is selected.
                       */
                      <div style={{ gridColumn: '1 / -1' }}>
                        <EmptyState
                          title={
                            filter === 'All'
                              ? `No sample files are filed under ${category}`
                              : `No ${filter} sample files under ${category}`
                          }
                          description={
                            filter === 'All'
                              ? 'The gallery always shows exactly one category, so this is everything under it. Pick another from the Categories rail or the stage chips above.'
                              : `Category is a separate filter and stays on ${category} — the gallery always shows exactly one category, so it cannot be cleared from here.`
                          }
                          {...(filter === 'All'
                            ? {}
                            : { actionLabel: 'Show all match states', onAction: () => setFilter('All') })}
                        />
                      </div>
                    )}
                  </div>
                </Card>
              </div>

              {/* ── §8 right — selected photo. §3.6's "click → lightbox with serial
                   and timestamp"; below 1280 it reflows beneath the grid so the
                   lightbox is still on screen (Rulings §7). ─────────────────── */}
              <FloorAside collapsible={desktop} side="right" width={290} label="Selected photo" style={place.rail}>
                <Card title="Selected Photo — sample file">
                  {current ? (
                    <>
                      <div aria-hidden style={{ height: 120, borderRadius: 'var(--r-btn)', background: 'var(--card2)', display: 'grid', placeItems: 'center', color: 'var(--muted)' }}>
                        <Icon name="camera" size={28} />
                      </div>
                      <div className="figure" style={{ fontSize: 'var(--t-meta)', fontWeight: 700, color: 'var(--text)', marginTop: 8 }}>{current.file}</div>
                      {/*
                        HO-09 — this read `{current.size} · 16 Jul 2026, {current.at}`.
                        The date was a literal: `Photo` carries no date field at
                        all, so there was nothing for it to be a formatting OF.
                        Law 7 — a timestamp is an instant, and `at` is a clock
                        string with no day and no zone behind it. The line now
                        prints only what the record holds, and says what it
                        does not.
                      */}
                      <div className="figure" style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>
                        {current.size} · {current.at}
                      </div>
                      <div style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>No date is recorded for this file.</div>

                      <div style={{ marginTop: 11, paddingTop: 9, borderTop: '1px solid var(--border)' }}>
                        <div style={{ fontSize: 'var(--t-meta)', fontWeight: 700, color: 'var(--text)', marginBottom: 7 }}>Matched Product</div>
                        {current.product ? (
                          [
                            ['Product', current.product.name],
                            ['Serial Number', current.product.serial],
                            ['Category', current.product.category],
                            ['Bundle', current.product.bundle],
                            ['Source', current.source ?? '—'],
                          ].map(([l, v]) => (
                            <div key={l} style={{ display: 'flex', gap: 'var(--sp-sm)', padding: '3px 0', fontSize: 'var(--t-meta)' }}>
                              <span style={{ flex: 1, color: 'var(--text2)' }}>{l}</span>
                              <span style={{ fontWeight: 600, color: 'var(--text)', textAlign: 'right', minWidth: 0 }}>{v}</span>
                            </div>
                          ))
                        ) : (
                          <p style={{ margin: 0, fontSize: 'var(--t-meta)', color: 'var(--muted)', lineHeight: 1.5 }}>
                            No product resolved. {current.reason}
                          </p>
                        )}
                        {matchState(current) === 'Review' && current.confidence && (
                          <div style={{ marginTop: 8 }}>
                            <div style={{ display: 'flex', gap: 'var(--sp-sm)', fontSize: 'var(--t-meta)' }}>
                              <span style={{ flex: 1, color: 'var(--text2)' }}>Confidence</span>
                              <span className="figure" style={{ fontWeight: 700, color: 'var(--progress-text)' }}>{current.confidence}%</span>
                            </div>
                            <div aria-hidden style={{ height: 5, borderRadius: 'var(--r-badge)', background: 'var(--card2)', marginTop: 5, overflow: 'hidden' }}>
                              <div style={{ width: `${current.confidence}%`, height: '100%', background: 'var(--progress)', borderRadius: 'var(--r-badge)' }} />
                            </div>
                            <p style={{ margin: '6px 0 0', fontSize: 'var(--t-meta)', color: 'var(--muted)', lineHeight: 1.45 }}>
                              ≥{THRESHOLDS.matched}% auto-matches · {THRESHOLDS.review}–{THRESHOLDS.matched - 1}% needs a human accept.
                              Thresholds live in Settings ▸ Evidence.
                            </p>
                          </div>
                        )}
                      </div>

                      {/* §10 — there is no hard delete here and never was; the
                          soft delete it describes is not built either, which is
                          what the fourth control below now says. */}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7, marginTop: 11 }}>
                        {/* The full-size twin of the card-level `Change` MiniBtn, and
                            dead for the identical reason — see MATCH_EDIT_UNAVAILABLE. */}
                        <Unavailable reason={MATCH_EDIT_UNAVAILABLE.change} style={{ display: 'block' }}>
                          <Button icon="refresh" disabled>Change Product</Button>
                        </Unavailable>
                        {/*
                          The identity is the signed-in operator or there is no
                          dispatch — this file had no `useAuth` at all, so the call
                          went out with no `ActionContext` and `actions/core.ts`
                          rejected it before `execute`. With no `.catch()` the
                          rejection was an unhandled promise nobody saw: the operator
                          pressed Mark as Review and the flag was never recorded.

                          Nothing is committed locally on the resolved path either,
                          because there is nothing true to commit — the gallery reads
                          `data/evidence`'s seeded `PHOTOS`, not local state, so a
                          badge flipped here would be this screen agreeing with
                          itself about a write that has not happened. REVIEW_EVIDENCE
                          is still a stub — `reviewEvidence.ts` now sets
                          `implemented: false` explicitly, where this comment used
                          to say the flag was merely absent — so `createAction`
                          fails it closed and every press lands on the `.catch()`
                          and says so.
                        */}
                        <Button
                          icon="eye"
                          onClick={() => {
                            if (!user) {
                              setDispatchError(
                                'You are not signed in, so this photo cannot be flagged for review against anyone. Nothing was written.',
                              )
                              return
                            }
                            setDispatchError(null)
                            void import('../../actions/rentals')
                              .then((m) =>
                                m.reviewEvidence({ evidenceId: current.id, action: 'review' }, { userId: user.id, role: user.role }),
                              )
                              .catch((err: unknown) => {
                                captureError(err, { where: 'EvidenceWorkspace.review' })
                                setDispatchError(err instanceof Error ? err.message : String(err))
                              })
                          }}
                        >
                          Mark as Review
                        </Button>
                        {/* See UNMATCH_UNAVAILABLE_REASON — the verb this needs does not exist. */}
                        <Unavailable reason={UNMATCH_UNAVAILABLE_REASON} style={{ width: '100%' }}>
                          <Button icon="close" disabled>
                            Unmatch
                          </Button>
                        </Unavailable>
                        {/*
                          HO-10, part 2. This said **Remove**, and PK-07's
                          precedent is that a control is named for what it does:
                          it wrote `setRemoved(...)` and nothing else. There is
                          no dispatch on this path, `REVIEW_EVIDENCE`'s "remove"
                          verb is `implemented: false`, and the Archived filter
                          its copy promised does not exist anywhere in the app.
                          The promise itself is right and is kept, one card
                          down, as the thing still to be built.
                        */}
                        <Button icon="eye_off" onClick={() => { setHiding(current.id); setNote('') }}>
                          Hide on This Screen
                        </Button>
                      </div>

                      {/* Law 12 — inline, persistent, never a toast. */}
                      {dispatchError && (
                        <div style={{ marginTop: 9 }}>
                          <ErrorBanner title="Nothing was recorded" message={dispatchError} />
                        </div>
                      )}

                      {hiding === current.id && (
                        /* Not `--st-danger-bg`: red said "destructive" over an
                           action that destroys nothing. Icon + heading + colour,
                           never colour alone (Law 11). */
                        <div style={{ marginTop: 9, padding: 10, borderRadius: 'var(--r-btn)', border: '1px solid var(--border)', background: 'var(--card2)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--t-meta)', fontWeight: 700, color: 'var(--text)' }}>
                            <Icon name="eye_off" size={13} />
                            This hides the card in your browser. Nothing is recorded.
                          </div>
                          <p style={{ margin: '5px 0 0', fontSize: 'var(--t-meta)', color: 'var(--text2)', lineHeight: 1.45 }}>
                            {/* §10&apos;s Remove is a soft delete — the file is kept, the removal is audited, and Owner and
                            Manager see it again in an Archived filter. None of that is built yet: REVIEW_EVIDENCE&apos;s
                            &quot;remove&quot; verb is a stub and the app has no Archived filter. So this card comes back
                            when the page reloads, and nobody else sees it go. */}Removing evidence is not available yet. </p>
                          <input
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                            placeholder="Note to yourself (optional)"
                            aria-label="Note about hiding this file, kept on this screen only"
                            style={{ width: '100%', height: 28, marginTop: 7, padding: '0 8px', borderRadius: 'var(--r-input)', border: '1px solid var(--input-border)', background: 'var(--input-bg)', color: 'var(--text)', fontSize: 'var(--t-meta)', fontFamily: 'inherit' }}
                          />
                          <div style={{ display: 'flex', gap: 6, marginTop: 7 }}>
                            <Button onClick={() => setHiding(null)}>Cancel</Button>
                            <Button
                              icon="eye_off"
                              onClick={() => {
                                setHidden((h) => ({ ...h, [current.id]: note.trim() }))
                                setHiding(null)
                                setSelected((s) => s.filter((x) => x !== current.id))
                              }}
                            >
                              Hide it
                            </Button>
                          </div>
                        </div>
                      )}
                    </>
                  ) : (
                    <p style={{ margin: 0, fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>No photo selected.</p>
                  )}
                </Card>

                <Card title="Match Breakdown — sample files">
                  <div style={{ display: 'flex', gap: 11, alignItems: 'center' }}>
                    <Donut slices={slices} centreLabel="Total" centreValue={String(total)} size={96} />
                    <Legend slices={slices} />
                  </div>
                </Card>

                {hiddenIds.length > 0 && (
                  <Card title={`Hidden on this screen (${hiddenIds.length})`}>
                    {hiddenIds.map((pid) => {
                      const p = PHOTOS.find((x) => x.id === pid)
                      return (
                        <div key={pid} style={{ fontSize: 'var(--t-meta)', padding: '4px 0' }}>
                          <span className="figure" style={{ color: 'var(--text)' }}>{p?.file ?? pid}</span>
                          {hidden[pid] ? (
                            <span style={{ display: 'block', fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>{hidden[pid]}</span>
                          ) : null}
                        </div>
                      )
                    })}
                    {/*
                      The card used to be titled `Archived (n)` and to close with
                      "Retained and audited. Visible to Owner and Manager in the
                      Archived filter." — a description of a soft delete that
                      never happened. Law 3 makes that the right behaviour, so
                      the sentence stays; what changed is that it now says
                      whether it has been built.
                    */}
                    <p style={{ margin: '7px 0 0', fontSize: 'var(--t-meta)', color: 'var(--muted)', lineHeight: 1.45 }}>
                      {/* Nothing here was recorded and nobody else sees it — these come back on the next page load. When
                      §10&apos;s Remove is built the file will be retained, the removal audited, and Owner and Manager
                      will see it again in an Archived filter. That write does not exist yet. */}These changes are local to this session and will reset when the page reloads. </p>
                    <div style={{ marginTop: 7 }}>
                      <Button icon="eye" onClick={() => setHidden({})}>
                        Show them again
                      </Button>
                    </div>
                  </Card>
                )}

                {/*
                  Present tense here ("a photo is stored once… evidence locks at
                  Closed") described a system that does not run yet, on the one
                  screen whose whole defect was exactly that. The schema half is
                  real — `evidence_files` and `evidence_references` are live
                  tables — so the design is stated as the design.
                */}
                <div style={{ ...cardStyle, padding: 11, fontSize: 'var(--t-meta)', color: 'var(--muted)', lineHeight: 1.5 }}>
                  The design: one file, many references — a photo stored once and referenced by booking, item, serial,
                  bundle and stage, with evidence locking at status Closed. The tables exist; nothing writes to them
                  yet.
                </div>
              </FloorAside>
            </div>
          </div>
        )}
      </PageBody>
    </div>
  )
}

/**
 * BUG-007 — the three card-level match actions (`Accept`, `Change`,
 * `Assign Product`) were dead, and the shape of the deadness was unusual
 * enough to be worth naming: `MiniBtn`'s prop type was `{ label: string }`,
 * so it could not accept a handler **even if one existed**. There was no
 * missing wire to add; the component had no socket.
 *
 * They are dead for exactly the reason `Unmatch` is, one card over — see
 * `UNMATCH_UNAVAILABLE_REASON`. All three are *match-editing* verbs:
 *
 *  · `Accept` — confirm the product this photo was matched to at N% confidence
 *  · `Change` — swap it for a different product
 *  · `Assign Product` — attach one to a photo that resolved to nothing
 *
 * `ReviewEvidenceInput.action` (`src/actions/rentals/reviewEvidence.ts`) is
 * `'review' | 'remove'`. Neither verb edits a match: `'review'` flags a photo
 * for a human look and `'remove'` is §10's soft delete. So all three would have
 * to send a verb the action vocabulary does not have, and widening that input
 * belongs to whoever owns `src/actions/` — inventing it here would be inventing
 * the decision.
 *
 * Adding `onClick` to the prop type without a verb to call would move the lie
 * rather than remove it, so the socket stays closed and `reason` is required
 * instead: a `MiniBtn` **cannot** be built without stating why it cannot act.
 * That is the same guarantee the `STATUS_ICON` retype bought for BUG-001 — the
 * compiler enforces the honesty rather than a reviewer catching it.
 */
function MiniBtn({ label, reason }: { label: string; reason: string }) {
  return (
    <Unavailable reason={reason}>
      <button
        type="button"
        disabled
        style={{ height: 20, padding: '0 6px', borderRadius: 5, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text2)', fontSize: 'var(--t-meta)', fontWeight: 600, cursor: 'not-allowed', opacity: 0.6, fontFamily: 'inherit', whiteSpace: 'nowrap' }}
      >
        {label}
      </button>
    </Unavailable>
  )
}

/**
 * The three reasons, kept beside each other so they stay one story. Each says
 * what the control would do, why it cannot yet, and — the part a warehouse user
 * actually needs — what happens to their photo in the meantime.
 */
const MATCH_EDIT_UNAVAILABLE = {
  accept:
    'Accepting a match is not built yet — REVIEW_EVIDENCE accepts only "review" or "remove", and neither confirms a match. Nothing is written and this photo keeps the match it was given.',
  change:
    'Changing a match is not built yet — REVIEW_EVIDENCE accepts only "review" or "remove", and neither swaps the matched product. Use Unmatch on the selected photo once its verb exists.',
  /*
   * The old wording ended "…and is still stored against this booking", which
   * HO-09 made false out loud: no evidence file is stored against any booking,
   * and these ten are sample fixtures. Corrected rather than left standing.
   */
  assign:
    'Assigning a product is not built yet — REVIEW_EVIDENCE has no verb that attaches one, so there is nothing to write. The file stays Unmatched, and nothing about it is stored either way.',
} as const
