import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import Icon from '../../components/ui/Icon'
import type { IconName } from '../../components/ui/Icon'
import { Card, Button, cardStyle, Rail, SideRail } from '../../components/ui/Page'
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

export default function EvidenceWorkspace() {
  const { bookingNo } = useParams()
  const id = bookingNo ?? BOOKING.no

  const [selected, setSelected] = useState<string[]>([])
  const [active, setActive] = useState<string>('p1')
  const [filter, setFilter] = useState<'All' | MatchState>('All')
  const [category, setCategory] = useState('Packing')
  const [removed, setRemoved] = useState<Record<string, string>>({})
  const [removing, setRemoving] = useState<string | null>(null)
  const [reason, setReason] = useState('')

  const live = PHOTOS.filter((p) => !removed[p.id])

  const counts = useMemo(() => {
    const c = { Matched: 0, Review: 0, Unmatched: 0 }
    live.forEach((p) => (c[matchState(p)] += 1))
    return c
  }, [live])
  const total = live.length
  /** §6 invariant — Matched + Review + Unmatched = Total. */
  const reconciles = counts.Matched + counts.Review + counts.Unmatched === total

  const visible = live.filter((p) => filter === 'All' || matchState(p) === filter)
  const current = live.find((p) => p.id === active) ?? live[0]
  const pct = (n: number) => (total ? `${((n / total) * 100).toFixed(1)}%` : '0%')

  const bs = toBs(new Date('2026-07-16'))
  const retBs = toBs(new Date('2026-07-19'))

  const slices = [
    { label: 'Matched', value: counts.Matched, display: String(counts.Matched), percent: pct(counts.Matched) },
    { label: 'Review', value: counts.Review, display: String(counts.Review), percent: pct(counts.Review) },
    { label: 'Unmatched', value: counts.Unmatched, display: String(counts.Unmatched), percent: pct(counts.Unmatched) },
  ]

  return (
    <div data-floor="true" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
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
        <div style={{ display: 'flex', gap: 8 }}>
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
                style={{ width: 22, height: 22, borderRadius: 999, display: 'grid', placeItems: 'center', border: `1.5px solid ${tone}`, color: tone, fontSize: 'var(--t-meta)', fontWeight: 700, flexShrink: 0 }}
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

      <div style={{ display: 'grid', gridTemplateColumns: 'auto minmax(0,1fr) auto', gap: 'var(--sp-md)', alignItems: 'start' }}>
        {/* ── §5 left ─────────────────────────────────────────────────── */}
        <SideRail width={210} label="Categories">
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
                    gap: 8,
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
        </SideRail>

        {/* ── §6 / §8 centre ──────────────────────────────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)', minWidth: 0 }}>
          <Card title="Processing">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0,1fr))', gap: 9 }}>
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

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10, padding: 12 }}>
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
                        style={{ display: 'block', width: '100%', height: 92, border: 'none', background: 'linear-gradient(135deg,#334155,#0f172a)', cursor: 'pointer' }}
                      />
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
                          <span style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
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
                  No photos match these filters.{' '}
                  <button type="button" onClick={() => setFilter('All')} style={{ border: 'none', background: 'transparent', color: 'var(--link)', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', fontSize: 'var(--t-meta)' }}>
                    Clear all filters
                  </button>
                </div>
              )}
            </div>
          </Card>
        </div>

        {/* ── §8 right — selected photo ───────────────────────────────── */}
        <Rail width={290} label="Selected photo">
          <Card title="Selected Photo">
            {current ? (
              <>
                <div aria-hidden style={{ height: 120, borderRadius: 'var(--r-btn)', background: 'linear-gradient(135deg,#334155,#0f172a)' }} />
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
                      <div key={l} style={{ display: 'flex', gap: 8, padding: '3px 0', fontSize: 'var(--t-meta)' }}>
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
                      <div style={{ display: 'flex', gap: 8, fontSize: 'var(--t-meta)' }}>
                        <span style={{ flex: 1, color: 'var(--text2)' }}>Confidence</span>
                        <span className="figure" style={{ fontWeight: 700, color: 'var(--progress-text)' }}>{current.confidence}%</span>
                      </div>
                      <div aria-hidden style={{ height: 5, borderRadius: 999, background: 'var(--card2)', marginTop: 5, overflow: 'hidden' }}>
                        <div style={{ width: `${current.confidence}%`, height: '100%', background: 'var(--progress)', borderRadius: 999 }} />
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
                  <Button icon="eye">Mark as Review</Button>
                  <Button icon="close">Unmatch</Button>
                  <Button icon="alert_triangle" onClick={() => { setRemoving(current.id); setReason('') }}>
                    Remove
                  </Button>
                </div>

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
        </Rail>
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
