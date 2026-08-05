import { useId, useState } from 'react'

/**
 * Chart kit — plain SVG, no charting dependency.
 *
 * Rules this kit enforces so call sites cannot break them:
 *  · Categorical colour comes from `--cat-1…8` **in fixed order, never cycled**.
 *    A 9th series folds into "Others" at the data layer; `CAT` has 8 slots and
 *    `catColor` clamps, so a 9th series repeats slot 8 visibly rather than
 *    inventing a hue.
 *  · One axis. There is no dual-axis component here, deliberately.
 *  · Series text wears text tokens, never the series colour — the swatch beside
 *    a label carries identity, so nothing depends on colour alone.
 *  · Fills are separated by a 2px surface-coloured gap, and every mark has a
 *    hover target with a tooltip.
 */

export const CAT = [
  'var(--cat-1)',
  'var(--cat-2)',
  'var(--cat-3)',
  'var(--cat-4)',
  'var(--cat-5)',
  'var(--cat-6)',
  'var(--cat-7)',
  'var(--cat-8)',
] as const

export function catColor(i: number): string {
  return CAT[Math.min(i, CAT.length - 1)] as string
}

export interface Slice {
  label: string
  value: number
  /** Pre-formatted for display — the kit never guesses a currency format. */
  display: string
  percent: string
}

/* ── tooltip ───────────────────────────────────────────────────────────── */

function Tip({ text, x, y }: { text: string; x: number; y: number }) {
  return (
    <div
      role="tooltip"
      style={{
        position: 'absolute',
        left: x,
        top: y,
        transform: 'translate(-50%,-115%)',
        pointerEvents: 'none',
        background: 'var(--dropdown)',
        border: '1px solid var(--border)',
        borderRadius: 8,
        boxShadow: 'var(--shadow-modal)',
        padding: '6px 9px',
        fontSize: 'var(--t-meta)',
        color: 'var(--text)',
        whiteSpace: 'nowrap',
        zIndex: 5,
      }}
    >
      {text}
    </div>
  )
}

/* ── donut ─────────────────────────────────────────────────────────────── */

function arc(cx: number, cy: number, r: number, rInner: number, a0: number, a1: number) {
  const p = (ang: number, rad: number) => [cx + rad * Math.cos(ang), cy + rad * Math.sin(ang)]
  const large = a1 - a0 > Math.PI ? 1 : 0
  const [x0, y0] = p(a0, r)
  const [x1, y1] = p(a1, r)
  const [x2, y2] = p(a1, rInner)
  const [x3, y3] = p(a0, rInner)
  return `M${x0},${y0}A${r},${r},0,${large},1,${x1},${y1}L${x2},${y2}A${rInner},${rInner},0,${large},0,${x3},${y3}Z`
}

export function Donut({
  slices,
  centreLabel,
  centreValue,
  size = 150,
}: {
  slices: Slice[]
  centreLabel?: string
  centreValue?: string
  size?: number
}) {
  const [hover, setHover] = useState<number | null>(null)
  const total = slices.reduce((s, d) => s + d.value, 0) || 1
  const cx = size / 2
  const cy = size / 2
  const r = size / 2 - 2
  const rInner = r * 0.62
  let angle = -Math.PI / 2

  return (
    <div style={{ position: 'relative', width: size, flexShrink: 0 }}>
      <svg width={size} height={size} role="img" aria-label={`Donut chart, ${slices.length} segments`}>
        {slices.map((s, i) => {
          const sweep = (s.value / total) * Math.PI * 2
          const d = arc(cx, cy, r, rInner, angle, angle + sweep)
          angle += sweep
          return (
            <path
              key={s.label}
              d={d}
              fill={catColor(i)}
              /* 2px surface gap between neighbouring fills */
              stroke="var(--card)"
              strokeWidth={2}
              opacity={hover === null || hover === i ? 1 : 0.42}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              style={{ transition: 'opacity var(--dur) ease' }}
            />
          )
        })}
      </svg>

      {(centreLabel || centreValue) && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'grid',
            placeItems: 'center',
            pointerEvents: 'none',
            textAlign: 'center',
          }}
        >
          <div>
            {centreLabel && <div style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>{centreLabel}</div>}
            {centreValue && (
              <div className="figure" style={{ fontSize: 'var(--t-ui)', fontWeight: 700, color: 'var(--text)' }}>
                {centreValue}
              </div>
            )}
          </div>
        </div>
      )}

      {hover !== null && slices[hover] && (
        <Tip text={`${slices[hover].label} · ${slices[hover].display} · ${slices[hover].percent}`} x={cx} y={cy} />
      )}
    </div>
  )
}

/** Legend rows — swatch + name + value + share. Text stays in text tokens. */
export function Legend({ slices, showPercent = true }: { slices: Slice[]; showPercent?: boolean }) {
  return (
    <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 5, flex: 1, minWidth: 0 }}>
      {slices.map((s, i) => (
        <li key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 'var(--t-meta)' }}>
          <span
            aria-hidden
            style={{ width: 8, height: 8, borderRadius: 999, background: catColor(i), flexShrink: 0 }}
          />
          <span
            style={{
              color: 'var(--text2)',
              flex: 1,
              minWidth: 0,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {s.label}
          </span>
          {/* flexShrink 0 on both figures — the label is the only part that may
              be truncated. A compressed "(43.4%)" is worse than a shorter name. */}
          <span className="figure" style={{ color: 'var(--text)', fontWeight: 600, whiteSpace: 'nowrap', flexShrink: 0 }}>
            {s.display}
          </span>
          {showPercent && (
            <span
              className="figure"
              style={{ color: 'var(--muted)', whiteSpace: 'nowrap', minWidth: 38, textAlign: 'right', flexShrink: 0 }}
            >
              {s.percent}
            </span>
          )}
        </li>
      ))}
    </ul>
  )
}

/* ── line chart ────────────────────────────────────────────────────────── */

export function LineChart({
  points,
  labels,
  yTicks,
  seriesLabel,
  format,
  height = 170,
}: {
  points: number[]
  labels: string[]
  yTicks: string[]
  seriesLabel: string
  format: (v: number) => string
  height?: number
}) {
  const [hover, setHover] = useState<number | null>(null)
  const id = useId()
  const w = 100
  const h = 100
  const max = Math.max(...points)
  const min = 0
  const span = max - min || 1
  const x = (i: number) => (i / (points.length - 1)) * w
  const y = (v: number) => h - ((v - min) / span) * h

  return (
    <div style={{ position: 'relative' }}>
      <div style={{ display: 'flex', gap: 8 }}>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            height,
            fontSize: 'var(--t-meta)',
            color: 'var(--muted)',
            flexShrink: 0,
            textAlign: 'right',
          }}
          aria-hidden
        >
          {[...yTicks].reverse().map((t) => (
            <span key={t} className="figure">
              {t}
            </span>
          ))}
        </div>

        <svg
          viewBox={`0 0 ${w} ${h}`}
          preserveAspectRatio="none"
          role="img"
          aria-label={`${seriesLabel} over time`}
          style={{ width: '100%', height, overflow: 'visible' }}
          onMouseLeave={() => setHover(null)}
        >
          {yTicks.map((_, i) => (
            <line
              key={i}
              x1={0}
              x2={w}
              y1={(i / (yTicks.length - 1)) * h}
              y2={(i / (yTicks.length - 1)) * h}
              stroke="var(--chart-grid)"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
          ))}

          <defs>
            <linearGradient id={`fill-${id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--cat-3)" stopOpacity={0.22} />
              <stop offset="100%" stopColor="var(--cat-3)" stopOpacity={0} />
            </linearGradient>
          </defs>

          <path
            d={`M0,${h} ${points.map((p, i) => `L${x(i)},${y(p)}`).join(' ')} L${w},${h} Z`}
            fill={`url(#fill-${id})`}
          />
          <polyline
            points={points.map((p, i) => `${x(i)},${y(p)}`).join(' ')}
            fill="none"
            stroke="var(--cat-3)"
            strokeWidth={2}
            vectorEffect="non-scaling-stroke"
            strokeLinejoin="round"
          />

          {points.map((p, i) => (
            <g key={i}>
              {hover === i && (
                <line
                  x1={x(i)}
                  x2={x(i)}
                  y1={0}
                  y2={h}
                  stroke="var(--text2)"
                  strokeWidth={1}
                  strokeDasharray="3 3"
                  vectorEffect="non-scaling-stroke"
                />
              )}
              <circle
                cx={x(i)}
                cy={y(p)}
                r={hover === i ? 3.4 : 2.2}
                fill="var(--card)"
                stroke="var(--cat-3)"
                strokeWidth={2}
                vectorEffect="non-scaling-stroke"
              />
              {/* Hit target is wider than the mark. */}
              <rect
                x={x(i) - w / points.length / 2}
                y={0}
                width={w / points.length}
                height={h}
                fill="transparent"
                onMouseEnter={() => setHover(i)}
              />
            </g>
          ))}
        </svg>
      </div>

      <div
        aria-hidden
        style={{ display: 'flex', justifyContent: 'space-between', paddingLeft: 40, marginTop: 6, fontSize: 'var(--t-meta)', color: 'var(--muted)' }}
      >
        {labels.map((l) => (
          <span key={l} className="figure">
            {l}
          </span>
        ))}
      </div>

      {hover !== null && points[hover] !== undefined && (
        <Tip
          text={`${labels[Math.min(hover, labels.length - 1)] ?? ''} · ${format(points[hover] as number)}`}
          x={`${(hover / (points.length - 1)) * 88 + 8}%` as unknown as number}
          y={y(points[hover] as number) * (height / 100)}
        />
      )}
    </div>
  )
}

/* ── grouped bars ──────────────────────────────────────────────────────── */

export function GroupedBars({
  groups,
  series,
  yTicks,
  format,
  height = 170,
}: {
  groups: Array<{ label: string; values: number[] }>
  series: string[]
  yTicks: string[]
  format: (v: number) => string
  height?: number
}) {
  const [hover, setHover] = useState<[number, number] | null>(null)
  const max = Math.max(...groups.flatMap((g) => g.values)) || 1

  return (
    <div>
      <div style={{ display: 'flex', gap: 8 }}>
        <div
          aria-hidden
          style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            height,
            fontSize: 'var(--t-meta)',
            color: 'var(--muted)',
            flexShrink: 0,
            textAlign: 'right',
          }}
        >
          {[...yTicks].reverse().map((t) => (
            <span key={t} className="figure">
              {t}
            </span>
          ))}
        </div>

        <div
          style={{
            flex: 1,
            minWidth: 0,
            height,
            display: 'flex',
            alignItems: 'flex-end',
            gap: 4,
            borderBottom: '1px solid var(--chart-grid)',
            position: 'relative',
          }}
        >
          {groups.map((g, gi) => (
            <div key={g.label} style={{ flex: 1, display: 'flex', alignItems: 'flex-end', gap: 2, height: '100%' }}>
              {g.values.map((v, si) => (
                <div
                  key={si}
                  title={`${g.label} · ${series[si]} · ${format(v)}`}
                  onMouseEnter={() => setHover([gi, si])}
                  onMouseLeave={() => setHover(null)}
                  style={{
                    flex: 1,
                    height: `${(v / max) * 100}%`,
                    background: catColor(si),
                    // 4px rounded data-end, square at the baseline
                    borderRadius: '4px 4px 0 0',
                    opacity: !hover || (hover[0] === gi && hover[1] === si) ? 1 : 0.42,
                    transition: 'opacity var(--dur) ease',
                    minHeight: 2,
                  }}
                />
              ))}
            </div>
          ))}
        </div>
      </div>

      <div aria-hidden style={{ display: 'flex', gap: 4, paddingLeft: 40, marginTop: 5 }}>
        {groups.map((g) => (
          <span key={g.label} className="figure" style={{ flex: 1, textAlign: 'center', fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>
            {g.label}
          </span>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 14, justifyContent: 'center', marginTop: 9 }}>
        {series.map((s, i) => (
          <span key={s} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
            <span aria-hidden style={{ width: 8, height: 8, borderRadius: 2, background: catColor(i) }} />
            {s}
          </span>
        ))}
      </div>
    </div>
  )
}

/* ── horizontal bars ───────────────────────────────────────────────────── */

export function HBars({
  rows,
  axisTicks,
  colorIndex = 3,
}: {
  rows: Array<{ label: string; value: number; display: string }>
  axisTicks: string[]
  /** Single-series bars use one hue — a per-bar rainbow encodes nothing. */
  colorIndex?: number
}) {
  const max = Math.max(...rows.map((r) => r.value)) || 1
  return (
    <div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
        {rows.map((r) => (
          <div key={r.label} style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <span
              style={{
                width: 118,
                flexShrink: 0,
                fontSize: 'var(--t-meta)',
                color: 'var(--text2)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                textAlign: 'right',
              }}
            >
              {r.label}
            </span>
            <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 7 }}>
              <div
                title={`${r.label} · ${r.display}`}
                style={{
                  height: 13,
                  width: `${(r.value / max) * 100}%`,
                  background: catColor(colorIndex),
                  borderRadius: '0 4px 4px 0',
                  minWidth: 2,
                }}
              />
              <span className="figure" style={{ fontSize: 'var(--t-meta)', color: 'var(--text)', fontWeight: 600, whiteSpace: 'nowrap' }}>
                {r.display}
              </span>
            </div>
          </div>
        ))}
      </div>
      <div
        aria-hidden
        style={{ display: 'flex', justifyContent: 'space-between', paddingLeft: 127, marginTop: 7, fontSize: 'var(--t-meta)', color: 'var(--muted)' }}
      >
        {axisTicks.map((t) => (
          <span key={t} className="figure">
            {t}
          </span>
        ))}
      </div>
    </div>
  )
}
