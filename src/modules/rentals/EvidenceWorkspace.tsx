import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import Icon from '../../components/ui/Icon'
import type { IconName } from '../../components/ui/Icon'
import { Card, Button, cardStyle } from '../../components/ui/Page'
import { FloorAside, floorPlacements } from '../operations/FloorAside'
import { useViewport } from '../../lib/device'
import { useAuth } from '../../lib/auth'
import { EmptyState, ErrorBanner } from '../../components/ui/StateViews'
import { Unavailable } from '../../components/ui/Unavailable'
import { Donut, Legend } from '../../components/ui/Charts'
import { STATUS } from '../../lib/status'
import { toBs, formatBs, formatAd } from '../../lib/bs'
import { BOOKING } from '../../data/booking'
import { TOTAL_ITEMS } from '../../data/packing'
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
} from '../../data/evidence'
import type { MatchState, Photo } from '../../data/evidence'

/**
 * **Evidence Workspace** — `Evidence Workspace.md` v1.1 (Build Locked).
 *
 * Built from the spec's corrections, not the render. §0 "Found in the screen":
 *  · two identities on one screen (header Ramesh / sidebar Babin) → one identity
 *  · stage badge read "Packing Stage" — not a status at all. §1.5 runs
 *    Packing at status **Booked**, so that is what the badge shows.
 *  · a card showed a product and serial while badged **Unmatched** → §7.3
 *    forbids it, so `Photo.product` is simply absent when unmatched
 *  · a five-card strip repeated the four-step header progress → deleted (§4)
 *  · two photos selected with no bulk bar → the bar appears on selection (§9)
 *  · breadcrumb skipped Bookings → restored in the route
 *  · purple on the stage badge → purple is unused (§16)
 *  · `Delete Photo` → **Remove**, a soft delete with a reason (§10)
 */

const SOURCE_ICON: Record<(typeof UPLOAD_SOURCES)[number], IconName> = {
  'Take Photo': 'camera',
  'Record Video': 'video',
  'Upload Files': 'upload',
  'Upload Folder': 'folder',
}

const TONE: Record<MatchState, { bg: string; fg: string }> = {
  Matched: { bg: 'var(--st-in-bg)', fg: 'var(--st-in-fg)' },
  Review: { bg: 'var(--st-progress-bg)', fg: 'var(--st-progress-fg)' },
  Unmatched: { bg: 'var(--st-danger-bg)', fg: 'var(--st-danger-fg)' },
}

/**
 * §3.6's three layouts — desktop rails, tablet 3-up grid, phone 2-up. The
 * lightbox is the selected-photo rail, which reflows beneath the grid below
 * 1180 rather than collapsing to a handle (Rulings §7).
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
  'Unmatch cannot act yet. REVIEW_EVIDENCE accepts only "review" or "remove", and "remove" is the soft-delete §10 gives the Remove button — it would hide the photo, not detach its match. Detaching a wrong match needs its own verb. Nothing is written and this photo keeps its match.'

export default function EvidenceWorkspace() {
  const { bookingNo } = useParams()
  const id = bookingNo ?? BOOKING.no
  /* Law 13/14 — width decides, at Foundation's locked 768 / 1180. */
  const viewport = useViewport()
  const desktop = viewport === 'desktop'
  const phone = viewport === 'phone'
  const place = floorPlacements(desktop, phone)
  /** The one identity a dispatch on this screen may act as. No fallback. */
  const { user } = useAuth()

  const [selected, setSelected] = useState<string[]>([])
  const [active, setActive] = useState<string>('p1')
  const [filter, setFilter] = useState<'All' | MatchState>('All')
  const [category, setCategory] = useState('Packing')
  const [removed, setRemoved] = useState<Record<string, string>>({})
  const [removing, setRemoving] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  /**
   * The last dispatch failure, rendered inline in the Selected Photo card and
   * left there until the next attempt. Law 12 — errors are inline and
   * persistent; `useToast()` carries successes only and no error toast is
   * invented here. This screen had no dispatch-failure line at all, so it
   * reuses `ErrorBanner` (`components/ui/StateViews`), the same component
   * `PackingWorkspace` renders its `dispatchError` through.
   */
  const [dispatchError, setDispatchError] = useState<string | null>(null)

  const live = PHOTOS.filter((p) => !removed[p.id])

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

  const bs = toBs(new Date('2026-07-16'))
  const retBs = toBs(new Date('2026-07-19'))

  const slices = [
    { label: 'Matched', value: counts.Matched, display: String(counts.Matched), percent: pct(counts.Matched) },
    { label: 'Review', value: counts.Review, display: String(counts.Review), percent: pct(counts.Review) },
    { label: 'Unmatched', value: counts.Unmatched, display: String(counts.Unmatched), percent: pct(counts.Unmatched) },
  ]

  // Floor scale (DEVICES.md item 3) is applied automatically by route in App.tsx's Shell, not here.
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--sp-lg)', flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <h1 style={{ margin: 0, fontSize: 'var(--t-h1)', fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.015em' }}>
              Evidence Workspace
            </h1>
            {/* §0 — "Packing Stage" is not a status. §1.5: Packing runs at Booked. */}
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                height: 22,
                padding: '0 9px',
                borderRadius: 'var(--r-badge)',
                background: STATUS.primary.bg,
                color: STATUS.primary.fg,
                fontSize: 'var(--t-meta)',
                fontWeight: 700,
              }}
            >
              Booked
            </span>
          </div>
          <p style={{ margin: '5px 0 0', fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
            Upload once, reference everywhere. Files are matched to products automatically.
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

      {/* §3.6 header — `[Packing][Return][Damage]`, the stage the grid is
          filtered by. Same state as the Categories rail's eleven. */}
      <div role="group" aria-label="Filter evidence by stage" style={{ display: 'flex', gap: 'var(--sp-sm)', flexWrap: 'wrap' }}>
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

      {/* §3 — read-only booking strip. BS leads AD. */}
      <div style={{ ...cardStyle, display: 'flex', flexWrap: 'wrap' }}>
        {[
          { l: 'Client', v: BOOKING.client, big: true },
          { l: 'Booking', v: id },
          { l: 'Pickup', v: bs ? formatBs(bs) : '—', s: formatAd(new Date('2026-07-16')) },
          { l: 'Return', v: retBs ? formatBs(retBs) : '—', s: formatAd(new Date('2026-07-19')) },
          { l: 'Status', v: 'Booked', big: true },
          { l: 'Items', v: String(TOTAL_ITEMS) },
          { l: 'Evidence', v: `${total} files` },
        ].map((f) => (
          <div key={f.l} style={{ padding: '11px 14px', borderRight: '1px solid var(--border)', minWidth: 0, flex: '1 1 auto' }}>
            <div style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>{f.l}</div>
            <div style={{ fontSize: f.big ? 13 : 12, fontWeight: f.big ? 700 : 600, color: 'var(--text)', marginTop: 3, whiteSpace: 'nowrap' }}>
              {f.v}
            </div>
            {f.s && <div className="figure" style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>{f.s}</div>}
          </div>
        ))}
      </div>

      {/* §4 — ONE progress indicator, four steps. */}
      <div style={{ ...cardStyle, display: 'flex', alignItems: 'center', gap: 0, padding: '12px 14px', flexWrap: 'wrap' }}>
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
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {UPLOAD_SOURCES.map((u) => (
                <Button key={u} icon={SOURCE_ICON[u]}>
                  {u}
                </Button>
              ))}
            </div>
            <div
              style={{ marginTop: 9, padding: '18px 10px', borderRadius: 'var(--r-btn)', border: '1.5px dashed var(--border)', textAlign: 'center', color: 'var(--muted)', fontSize: 'var(--t-meta)' }}
            >
              <Icon name="upload" size={18} />
              <div style={{ marginTop: 5 }}>Drag &amp; drop photos or folders</div>
            </div>
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
          <Card title="Processing">
            <div style={{ display: 'grid', gridTemplateColumns: phone ? 'repeat(2, minmax(0,1fr))' : 'repeat(4, minmax(0,1fr))', gap: 9 }}>
              {[
                { l: 'Total Photos', v: total, tone: 'var(--text)' },
                { l: 'Matched', v: counts.Matched, tone: 'var(--success-text)', p: pct(counts.Matched) },
                { l: 'Need Review', v: counts.Review, tone: 'var(--progress-text)', p: pct(counts.Review) },
                { l: 'Unmatched', v: counts.Unmatched, tone: 'var(--danger-text)', p: pct(counts.Unmatched) },
              ].map((k) => (
                <div key={k.l} style={{ padding: '10px 11px', borderRadius: 'var(--r-btn)', border: '1px solid var(--border)', background: 'var(--card2)' }}>
                  <div style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>{k.l}</div>
                  <div className="figure" style={{ fontSize: 'var(--t-h3)', fontWeight: 700, color: k.tone, marginTop: 2 }}>{k.v}</div>
                  {k.p && <div className="figure" style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>{k.p}</div>}
                </div>
              ))}
            </div>
            {/* §6 — percentages are derived, and the invariant is checked. */}
            <p style={{ margin: '9px 0 0', fontSize: 'var(--t-meta)', color: reconciles ? 'var(--muted)' : 'var(--danger-text)', fontWeight: reconciles ? 400 : 700 }}>
              {reconciles
                ? 'Matched + Review + Unmatched = Total. Percentages are derived, never stored.'
                : 'Counts do not reconcile to the total.'}
            </p>
          </Card>

          <Card
            title="Gallery"
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
                      style={{ height: 26, padding: '0 9px', borderRadius: 7, border: `1px solid ${on ? 'var(--nav-active-accent)' : 'var(--border)'}`, background: on ? 'var(--nav-active-bg)' : 'transparent', color: on ? 'var(--nav-active-accent)' : 'var(--text2)', fontSize: 'var(--t-meta)', fontWeight: on ? 600 : 500, cursor: 'pointer', fontFamily: 'inherit' }}
                    >
                      {f}
                    </button>
                  )
                })}
              </>
            }
          >
            {/* §9 — the bulk bar appears on selection and states the count. */}
            {selected.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 12px', borderBottom: '1px solid var(--border)', background: 'var(--nav-active-bg)', flexWrap: 'wrap' }}>
                <span style={{ fontSize: 'var(--t-meta)', fontWeight: 700, color: 'var(--nav-active-accent)' }}>{selected.length} selected</span>
                {BULK_ACTIONS.map((b) => (
                  <Button key={b}>{b}</Button>
                ))}
                <button
                  type="button"
                  onClick={() => setSelected([])}
                  style={{ marginLeft: 'auto', border: 'none', background: 'transparent', color: 'var(--text2)', fontSize: 'var(--t-meta)', cursor: 'pointer', fontFamily: 'inherit' }}
                >
                  Clear
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
                        <div style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)', marginTop: 4, fontStyle: 'italic' }}>No product resolved</div>
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
                            <MiniBtn label="Accept" />
                            <MiniBtn label="Change" />
                          </span>
                        )}
                        {st === 'Unmatched' && (
                          <span style={{ marginLeft: 'auto' }}>
                            <MiniBtn label="Assign Product" />
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
                <div style={{ gridColumn: '1 / -1', padding: 26, textAlign: 'center', fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>
                  <EmptyState
                    title="No photos match these filters"
                    actionLabel="Clear all filters"
                    onAction={() => setFilter('All')}
                  />
                </div>
              )}
            </div>
          </Card>
        </div>

        {/* ── §8 right — selected photo. §3.6's "click → lightbox with serial
             and timestamp"; below 1180 it reflows beneath the grid so the
             lightbox is still on screen (Rulings §7). ─────────────────── */}
        <FloorAside collapsible={desktop} side="right" width={290} label="Selected photo" style={place.rail}>
          <Card title="Selected Photo">
            {current ? (
              <>
                <div aria-hidden style={{ height: 120, borderRadius: 'var(--r-btn)', background: 'var(--card2)', display: 'grid', placeItems: 'center', color: 'var(--muted)' }}>
                  <Icon name="camera" size={28} />
                </div>
                <div className="figure" style={{ fontSize: 'var(--t-meta)', fontWeight: 700, color: 'var(--text)', marginTop: 8 }}>{current.file}</div>
                <div className="figure" style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>
                  {current.size} · 16 Jul 2026, {current.at}
                </div>

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

                {/* §10 — Remove is a soft delete with a reason. There is no hard delete. */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7, marginTop: 11 }}>
                  <Button icon="refresh">Change Product</Button>
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
                    is still a stub (`implemented` is not set), so today every
                    press lands on the `.catch()` and says so.
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
                          console.error('reviewEvidence failed:', err)
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
                  <Button icon="alert_triangle" onClick={() => { setRemoving(current.id); setReason('') }}>
                    Remove
                  </Button>
                </div>

                {/* Law 12 — inline, persistent, never a toast. */}
                {dispatchError && (
                  <div style={{ marginTop: 9 }}>
                    <ErrorBanner title="Nothing was recorded" message={dispatchError} />
                  </div>
                )}

                {removing === current.id && (
                  <div style={{ marginTop: 9, padding: 10, borderRadius: 'var(--r-btn)', background: 'var(--st-danger-bg)' }}>
                    <div style={{ fontSize: 'var(--t-meta)', fontWeight: 700, color: 'var(--st-danger-fg)' }}>
                      Removal needs a reason. Evidence is never hard-deleted — it is hidden and retained.
                    </div>
                    <input
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder="Reason for removal"
                      aria-label="Reason for removal"
                      style={{ width: '100%', height: 28, marginTop: 7, padding: '0 8px', borderRadius: 'var(--r-input)', border: '1px solid var(--input-border)', background: 'var(--input-bg)', color: 'var(--text)', fontSize: 'var(--t-meta)', fontFamily: 'inherit', outline: 'none' }}
                    />
                    <div style={{ display: 'flex', gap: 6, marginTop: 7 }}>
                      <Button onClick={() => setRemoving(null)}>Cancel</Button>
                      <span style={{ opacity: reason.trim().length < 5 ? 0.5 : 1 }}>
                        <Button
                          onClick={() => {
                            if (reason.trim().length < 5) return
                            setRemoved((r) => ({ ...r, [current.id]: reason.trim() }))
                            setRemoving(null)
                            setSelected((s) => s.filter((x) => x !== current.id))
                          }}
                        >
                          Confirm removal
                        </Button>
                      </span>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <p style={{ margin: 0, fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>No photo selected.</p>
            )}
          </Card>

          <Card title="Match Breakdown">
            <div style={{ display: 'flex', gap: 11, alignItems: 'center' }}>
              <Donut slices={slices} centreLabel="Total" centreValue={String(total)} size={96} />
              <Legend slices={slices} />
            </div>
          </Card>

          {Object.keys(removed).length > 0 && (
            <Card title={`Archived (${Object.keys(removed).length})`}>
              {Object.entries(removed).map(([pid, why]) => {
                const p = PHOTOS.find((x) => x.id === pid) as Photo
                return (
                  <div key={pid} style={{ fontSize: 'var(--t-meta)', padding: '4px 0' }}>
                    <span className="figure" style={{ color: 'var(--text)' }}>{p.file}</span>
                    <span style={{ display: 'block', fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>{why}</span>
                  </div>
                )
              })}
              <p style={{ margin: '7px 0 0', fontSize: 'var(--t-meta)', color: 'var(--muted)', lineHeight: 1.45 }}>
                Retained and audited. Visible to Owner and Manager in the Archived filter.
              </p>
            </Card>
          )}

          <div style={{ ...cardStyle, padding: 11, fontSize: 'var(--t-meta)', color: 'var(--muted)', lineHeight: 1.5 }}>
            One file, many references — a photo is stored once and referenced by booking, item, serial, bundle and
            stage. Evidence locks at status Closed.
          </div>
        </FloorAside>
      </div>
    </div>
  )
}

function MiniBtn({ label }: { label: string }) {
  return (
    <button
      type="button"
      style={{ height: 20, padding: '0 6px', borderRadius: 5, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text2)', fontSize: 'var(--t-meta)', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}
    >
      {label}
    </button>
  )
}
