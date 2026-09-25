import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import type { CSSProperties, ReactNode } from 'react'
import Icon from '../../components/ui/Icon'
import type { IconName } from '../../components/ui/Icon'
import { InfoTooltip } from '../../components/ui/InfoTooltip'
import { Card, Button, Rail, KpiStrip, FooterNote, cardStyle } from '../../components/ui/Page'
import { ScreenHeader } from '../../components/ui/ScreenHeader'
import { DataTableShell } from '../../components/ui/DataTable'
import type { Kpi } from '../../components/ui/Page'
import { thStyle } from '../../components/ui/TableHeaderCell'
import { Donut, Legend } from '../../components/ui/Charts'
import type { Slice } from '../../components/ui/Charts'
import { EmptyState, ErrorBanner } from '../../components/ui/StateViews'
import { BRAND, BRAND_ON, BRAND_TEXT, STATUS } from '../../lib/status'
import type { BrandKey } from '../../lib/status'
import { price, rupees, parseMoney, formatMoney, discountGate } from '../../lib/money'
import type { Paisa } from '../../lib/money'
import { useCanViewMoney } from '../../lib/moneyVisibility'
import {
  TOOLS,
  TOOL_GROUPS,
  RENDER_DISPOSITION,
  SEED_ERRORS,
  SENSOR_FORMATS,
  FRAME_RATES,
  sensorFormat,
  frameRate,
  cropFactor,
  fieldOfView,
  coverageAtDistance,
  depthOfField,
  ndStopsFromFactor,
  ndFactorFromDensity,
  exposureValue,
  shutterSecondsFromAngle,
  angleFromShutterDenominator,
  timecodeToFrames,
  framesToTimecode,
  storageGb,
  batteryRuntimeHours,
  batteriesNeeded,
  USABLE_CAPACITY,
  readFavourites,
  writeFavourites,
  getToolsStatus,
} from '../../lib/queries/tools'
import type { Tool, GroupKey, CalcKey } from '../../lib/queries/tools'

/**
 * **Settings ▸ Tools** — built against `03 Core Modules/Tools.PNG` and its spec
 * `Tools.md` v3.1 (Build Locked).
 *
 * ## What this page is, and what it deliberately is not
 *
 * The render is a *Tools Center*: fifteen numbered categories and a stated 118
 * tools, with a Favorites star rail, an AI recommendation panel and a Backup
 * Database button sitting in Quick Actions. Spec v3.1 is the newer artefact and
 * §0 exists to take that apart — six of the fifteen categories are second front
 * doors to modules that already exist, and §1 replaces the lot with one rule:
 *
 * > **Tools owns only what has no home elsewhere.**
 *
 * So this page does not reproduce the render's grid. It reproduces the render's
 * *composition* — KPI strip, a category grid with a filter and view toggle, a
 * Favourites · Recent · Quick actions row, and a right rail with a reconciling
 * donut — and fills it with the set §1 leaves standing. `data/tools.ts` holds
 * the registry and every formula; `RENDER_DISPOSITION` accounts for all fifteen
 * of the render's tiles on the page itself, so a reader can see that thirteen
 * were ruled on rather than forgotten.
 *
 * **Deviations from the render, each one a locked rule — never copy these back:**
 *  · the render's sidebar is the old 13-item numbered one. Foundation §5.1 locks
 *    8 unnumbered sections + Settings, and Tools is on §5.1's exclusion list —
 *    it lives *inside* Settings and never takes a sidebar slot.
 *  · the render's category tiles are purple, violet, cyan and teal. §4.2 bans
 *    all four outright; allowed families only.
 *  · the render's Favorites column is a gold star. The icon registry carries no
 *    star on purpose, and gold is outline-only for external gear (§4.2), so the
 *    favourite flag is a flag glyph in the primary family.
 *  · the render's Quick Actions include **Backup Database**, which §0 calls out
 *    by name: a Rental Officer can press it, against Administration §25.2's
 *    Owner-only, 2FA-gated rule. It is gone from Quick Actions entirely, and
 *    Backup appears only as a deep link carrying Administration's permissions.
 *  · the render shows six KPI tiles, two of them Favourite Tools and Recent
 *    Uses. §6 cuts those two — "Favourites and Recent Uses are panels on the
 *    page, not headlines" — and locks four.
 *  · the render's donut reads Active 98 + Inactive 6 = 104 against a stated 118,
 *    and its category counts sum to 106. §6 requires `Active + Inactive =
 *    Total`. The donut here is computed from the registry, so it cannot drift.
 *  · the render's AI Tool Recommendations panel is live. §9 gates every AI
 *    utility on Administration §21.2's data policy, which is unanswered, and
 *    §5.4 keeps AI panels dark until the feature is real.
 */

/* ══ shared field furniture ══════════════════════════════════════════════ */

/* Law 15 — the law is the hit area, not the paint, and `--tap` is the one place
   44 is written. Every consumer is an <input> or <select>: the numeric and
   choice fields in the tool panels, the discount reason/approver pair, and the
   category filter. `minHeight` so the filter's local `height: 30` cannot dip
   back under the floor. */
const controlStyle: CSSProperties = {
  width: '100%',
  minHeight: 'var(--tap)',
  padding: '0 10px',
  borderRadius: 'var(--r-input)',
  border: '1px solid var(--input-border)',
  background: 'var(--input-bg)',
  color: 'var(--text)',
  fontSize: 'var(--t-meta)',
  fontFamily: 'inherit',
}

function FieldShell({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 5, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <span style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text2)' }}>{label}</span>
        {hint && <InfoTooltip content={hint} />}
      </div>
      {children}
    </label>
  )
}

function NumField({
  label,
  value,
  onChange,
  suffix,
  placeholder,
  hint,
  step,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  suffix?: string
  placeholder?: string
  hint?: string
  step?: string
}) {
  return (
    <FieldShell label={label} {...(hint ? { hint } : {})}>
      <span style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
        <input
          type="number"
          inputMode="decimal"
          value={value}
          step={step ?? 'any'}
          placeholder={placeholder ?? ''}
          onChange={(e) => onChange(e.target.value)}
          className="figure"
          style={{ ...controlStyle, paddingRight: suffix ? 44 : 10 }}
        />
        {suffix && (
          <span style={{ position: 'absolute', right: 10, fontSize: 'var(--t-meta)', color: 'var(--muted)', pointerEvents: 'none' }}>
            {suffix}
          </span>
        )}
      </span>
    </FieldShell>
  )
}

function SelectField({
  label,
  value,
  onChange,
  options,
  hint,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  options: ReadonlyArray<{ value: string; label: string }>
  hint?: string
}) {
  return (
    <FieldShell label={label} {...(hint ? { hint } : {})}>
      <select value={value} onChange={(e) => onChange(e.target.value)} style={controlStyle}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </FieldShell>
  )
}

interface ResultRow {
  label: string
  value: string
  /** The headline answer of the calculator. */
  strong?: boolean
  note?: string
  tone?: BrandKey
}

function Results({ rows }: { rows: ResultRow[] }) {
  return (
    <div
      style={{
        marginTop: 'var(--sp-md)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--r-card)',
        background: 'var(--card2)',
        padding: '10px 12px',
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
      }}
    >
      {rows.map((r, i) => (
        <div
          key={r.label}
          style={{
            display: 'flex',
            alignItems: 'baseline',
            gap: 'var(--sp-md)',
            padding: '7px 0',
            borderTop: i === 0 ? 'none' : '1px solid var(--border)',
            flexWrap: 'wrap',
          }}
        >
          <span style={{ flex: 1, minWidth: 140, fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
            {r.label}
            {r.note && <span style={{ display: 'block', color: 'var(--muted)', marginTop: 2 }}>{r.note}</span>}
          </span>
          <span
            className="figure"
            style={{
              fontSize: r.strong ? 'var(--t-h2)' : 'var(--t-ui)',
              fontWeight: 700,
              color: r.tone ? BRAND_TEXT[r.tone] : 'var(--text)',
              letterSpacing: r.strong ? '-0.02em' : undefined,
              whiteSpace: 'nowrap',
            }}
          >
            {r.value}
          </span>
        </div>
      ))}
    </div>
  )
}

/** The spec's own formula, shown so the page and §3 can be compared by eye. */
function Formula({ children }: { children: ReactNode }) {
  return (
    <pre
      style={{
        margin: '0 0 12px',
        padding: '9px 11px',
        borderRadius: 'var(--r-input)',
        background: 'var(--card2)',
        border: '1px solid var(--border)',
        color: 'var(--text2)',
        fontSize: 'var(--t-meta)',
        lineHeight: 1.65,
        overflowX: 'auto',
        whiteSpace: 'pre',
      }}
    >
      {children}
    </pre>
  )
}

function Gap({ children }: { children: ReactNode }) {
  return (
    <p
      style={{
        margin: '12px 0 0',
        padding: '9px 11px',
        borderRadius: 'var(--r-input)',
        border: '1px solid var(--border)',
        borderLeftWidth: 3,
        borderLeftColor: 'var(--progress)',
        fontSize: 'var(--t-meta)',
        color: 'var(--text2)',
        lineHeight: 1.55,
      }}
    >
      {children}
    </p>
  )
}

const fieldGrid: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
  gap: 'var(--sp-md)',
  alignItems: 'start',
}

/* ── number formatting ─────────────────────────────────────────────────── */

const isNum = (v: number) => Number.isFinite(v)
const dp = (v: number, places = 2) => (isNum(v) ? v.toFixed(places) : '—')
const deg = (radians: number) => (isNum(radians) ? `${((radians * 180) / Math.PI).toFixed(1)}°` : '—')
const metres = (v: number) => (v === Infinity ? '∞' : isNum(v) ? `${v.toFixed(2)} m` : '—')
const pad = (n: number, width = 2) => String(Math.max(0, Math.floor(n))).padStart(width, '0')

/** "an 8% discount", not "a 8% discount" — 8, 11 and 18 lead with a vowel sound. */
const article = (n: number) => (/^(8|11|18)/.test(String(Math.abs(n))) ? 'An' : 'A')

function num(raw: string): number {
  if (raw.trim() === '') return Number.NaN
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? parsed : Number.NaN
}

/* ══ the calculators — §3 and §5 ═════════════════════════════════════════ */

const FORMAT_OPTIONS = SENSOR_FORMATS.map((s) => ({ value: s.key, label: s.label }))
const RATE_OPTIONS = FRAME_RATES.map((r) => ({ value: r.key, label: r.label }))

/** §3.1 */
function CropCalculator() {
  const [format, setFormat] = useState('ff')
  const [width, setWidth] = useState('36')
  const [height, setHeight] = useState('24')
  const [focal, setFocal] = useState('50')
  const [aperture, setAperture] = useState('2.8')

  const pickFormat = (key: string) => {
    const f = sensorFormat(key)
    setFormat(key)
    setWidth(String(f.width))
    setHeight(String(f.height))
  }

  const w = num(width)
  const h = num(height)
  const crop = cropFactor(w, h)
  const custom = w !== sensorFormat(format).width || h !== sensorFormat(format).height

  return (
    <>
      <Formula>{`crop           = 43.27 ÷ √(sensorW² + sensorH²)
equivalent mm  = focal × crop
equivalent T/f = aperture × crop        (depth-of-field equivalence only)`}</Formula>
      <div style={fieldGrid}>
        <SelectField
          label="Sensor"
          value={format}
          onChange={pickFormat}
          options={FORMAT_OPTIONS}
          {...(custom ? { hint: 'Dimensions edited — the result uses the typed values, not the format.' } : {})}
        />
        <NumField label="Sensor width" value={width} onChange={setWidth} suffix="mm" />
        <NumField label="Sensor height" value={height} onChange={setHeight} suffix="mm" />
        <NumField label="Focal length" value={focal} onChange={setFocal} suffix="mm" />
        <NumField label="Aperture" value={aperture} onChange={setAperture} suffix="T/f" />
      </div>
      <Results
        rows={[
          { label: 'Crop factor', value: isNum(crop) ? `${dp(crop, 3)}×` : '—', strong: true },
          { label: 'Equivalent focal length', value: isNum(crop * num(focal)) ? `${dp(crop * num(focal), 1)} mm` : '—' },
          {
            label: 'Equivalent aperture',
            value: isNum(crop * num(aperture)) ? `T/${dp(crop * num(aperture), 2)}` : '—',
            note: 'Depth-of-field equivalence only — exposure is unchanged.',
          },
        ]}
      />
    </>
  )
}

/** §3.2 */
function FovCalculator() {
  const [format, setFormat] = useState('s35')
  const [focal, setFocal] = useState('35')
  const [distance, setDistance] = useState('3')

  const f = sensorFormat(format)
  const focalMm = num(focal)
  const view = fieldOfView(f.width, f.height, focalMm)
  const d = num(distance)

  return (
    <>
      <Formula>{`horizontal FOV    = 2 × atan( sensorW ÷ (2 × focal) )
vertical FOV      = 2 × atan( sensorH ÷ (2 × focal) )
width at distance = 2 × distance × tan(horizontal FOV ÷ 2)`}</Formula>
      <div style={fieldGrid}>
        <SelectField label="Sensor" value={format} onChange={setFormat} options={FORMAT_OPTIONS} />
        <NumField label="Focal length" value={focal} onChange={setFocal} suffix="mm" />
        <NumField label="Subject distance" value={distance} onChange={setDistance} suffix="m" />
      </div>
      <Results
        rows={[
          {
            label: `Width covered at ${isNum(d) ? dp(d, 1) : '—'} m`,
            value: metres(coverageAtDistance(view.horizontal, d)),
            strong: true,
            note: 'How much of the room fits — the figure an operator actually wants.',
          },
          { label: 'Height covered', value: metres(coverageAtDistance(view.vertical, d)) },
          { label: 'Horizontal field of view', value: deg(view.horizontal) },
          { label: 'Vertical field of view', value: deg(view.vertical) },
        ]}
      />
    </>
  )
}

/** §3.3 */
function DofCalculator() {
  const [format, setFormat] = useState('ff')
  const [focal, setFocal] = useState('50')
  const [aperture, setAperture] = useState('2.8')
  const [subject, setSubject] = useState('3')

  const f = sensorFormat(format)
  const result = depthOfField(num(focal), num(aperture), f.coc, num(subject))
  const beyondHyperfocal = num(subject) >= result.hyperfocal

  return (
    <>
      <Formula>{`circle of confusion  full frame 0.029 · S35 0.019 · MFT 0.015
hyperfocal H = (focal² ÷ (aperture × coc)) + focal
near         = (H × s) ÷ (H + (s − focal))
far          = (H × s) ÷ (H − (s − focal))     — infinite when s ≥ H`}</Formula>
      <div style={fieldGrid}>
        <SelectField
          label="Sensor"
          value={format}
          onChange={setFormat}
          options={FORMAT_OPTIONS}
          hint={`Circle of confusion ${f.coc} mm`}
        />
        <NumField label="Focal length" value={focal} onChange={setFocal} suffix="mm" />
        <NumField label="Aperture" value={aperture} onChange={setAperture} suffix="T/f" />
        <NumField label="Subject distance" value={subject} onChange={setSubject} suffix="m" />
      </div>
      <Results
        rows={[
          {
            label: 'Total depth of field',
            value: result.total === Infinity ? 'Infinite' : metres(result.total),
            strong: true,
            ...(beyondHyperfocal ? { note: 'Subject is at or beyond the hyperfocal distance, so the far limit is infinity.' } : {}),
          },
          { label: 'Near limit', value: metres(result.near) },
          { label: 'Far limit', value: metres(result.far) },
          { label: 'Hyperfocal distance', value: metres(result.hyperfocal) },
        ]}
      />
    </>
  )
}

/** §3.4 */
function NdCalculator() {
  const [notation, setNotation] = useState<'factor' | 'density'>('factor')
  const [ndValue, setNdValue] = useState('8')
  const [aperture, setAperture] = useState('2.8')
  const [shutter, setShutter] = useState('48')
  const [iso, setIso] = useState('800')

  const entered = num(ndValue)
  const factor = notation === 'factor' ? entered : ndFactorFromDensity(entered)
  const stops = ndStopsFromFactor(factor)
  const density = isNum(factor) ? Math.log10(factor) : Number.NaN
  const shutterSeconds = 1 / num(shutter)
  const ev = exposureValue(num(aperture), shutterSeconds, num(iso))

  return (
    <>
      <Formula>{`ND stops = log₂(ND number)        ND8 = 3 stops · ND1.2 = 4 stops
EV       = log₂(aperture² ÷ shutter) + log₂(100 ÷ ISO)`}</Formula>

      <div style={fieldGrid}>
        <SelectField
          label="ND notation"
          value={notation}
          onChange={(v) => setNotation(v === 'density' ? 'density' : 'factor')}
          options={[
            { value: 'factor', label: 'Filter factor — ND8' },
            { value: 'density', label: 'Optical density — ND1.2' },
          ]}
          hint="Nepali productions use whichever the filter is labelled with."
        />
        <NumField label={notation === 'factor' ? 'ND number' : 'Optical density'} value={ndValue} onChange={setNdValue} />
      </div>
      <Results
        rows={[
          { label: 'Light reduction', value: isNum(stops) ? `${dp(stops, 2)} stops` : '—', strong: true },
          { label: 'As a filter factor', value: isNum(factor) ? `ND${dp(factor, factor >= 10 ? 1 : 0)}` : '—' },
          { label: 'As an optical density', value: isNum(density) ? `ND${dp(density, 2)}` : '—' },
        ]}
      />

      <h3 style={{ margin: '18px 0 10px', fontSize: 'var(--t-ui)', fontWeight: 700, color: 'var(--text)' }}>Exposure value</h3>
      <div style={fieldGrid}>
        <NumField label="Aperture" value={aperture} onChange={setAperture} suffix="T/f" />
        <NumField label="Shutter — 1 /" value={shutter} onChange={setShutter} suffix="sec" />
        <NumField label="ISO" value={iso} onChange={setIso} />
      </div>
      <Results
        rows={[
          { label: 'Exposure value', value: isNum(ev) ? `EV ${dp(ev, 2)}` : '—', strong: true },
          {
            label: 'With the ND on',
            value: isNum(ev) && isNum(stops) ? `EV ${dp(ev + stops, 2)}` : '—',
            note: 'The scene brightness this exposure holds once the filter above is fitted.',
          },
        ]}
      />
    </>
  )
}

/** §3.5 */
function ShutterCalculator() {
  const [fps, setFps] = useState('24')
  const [angle, setAngle] = useState('180')
  const [denominator, setDenominator] = useState('48')

  const rate = num(fps)
  const seconds = shutterSecondsFromAngle(rate, num(angle))
  const backToAngle = angleFromShutterDenominator(rate, num(denominator))

  return (
    <>
      <Formula>{`shutter speed = 1 ÷ (fps × 360 ÷ angle)        24 fps at 180° = 1/48`}</Formula>
      <div style={fieldGrid}>
        <NumField label="Frame rate" value={fps} onChange={setFps} suffix="fps" />
        <NumField label="Shutter angle" value={angle} onChange={setAngle} suffix="°" />
      </div>
      <Results
        rows={[
          {
            label: 'Shutter speed',
            value: isNum(seconds) && seconds > 0 ? `1/${dp(1 / seconds, 1)} sec` : '—',
            strong: true,
          },
        ]}
      />

      <h3 style={{ margin: '18px 0 10px', fontSize: 'var(--t-ui)', fontWeight: 700, color: 'var(--text)' }}>The other direction</h3>
      <div style={fieldGrid}>
        <NumField label="Shutter — 1 /" value={denominator} onChange={setDenominator} suffix="sec" />
      </div>
      <Results
        rows={[{ label: `Shutter angle at ${isNum(rate) ? dp(rate, 3).replace(/\.?0+$/, '') : '—'} fps`, value: isNum(backToAngle) ? `${dp(backToAngle, 1)}°` : '—', strong: true }]}
      />
    </>
  )
}

/** §3.6 */
function TimecodeCalculator() {
  const [rateKey, setRateKey] = useState('29.97')
  const [drop, setDrop] = useState(true)
  const [hh, setHh] = useState('01')
  const [mm, setMm] = useState('00')
  const [ss, setSs] = useState('00')
  const [ff, setFf] = useState('00')

  const rate = frameRate(rateKey)
  const dropOn = drop && rate.dropCapable
  const frames = timecodeToFrames(num(hh) || 0, num(mm) || 0, num(ss) || 0, num(ff) || 0, rate, dropOn)
  const roundTrip = framesToTimecode(frames, rate, dropOn)
  const seconds = frames / rate.actual
  const separator = dropOn ? ';' : ':'

  return (
    <>
      <Formula>{`frames = ((hh × 3600) + (mm × 60) + ss) × fps + ff

drop-frame, at 29.97 and 59.94 only:
  two frame labels (four at 59.94) are skipped each minute,
  except every tenth minute. No frame is lost — only its label.`}</Formula>
      <div style={fieldGrid}>
        <SelectField
          label="Frame rate"
          value={rateKey}
          onChange={setRateKey}
          options={RATE_OPTIONS}
          {...(rate.dropCapable ? {} : { hint: 'Drop-frame exists at 29.97 and 59.94 only.' })}
        />
        <NumField label="Hours" value={hh} onChange={setHh} step="1" />
        <NumField label="Minutes" value={mm} onChange={setMm} step="1" />
        <NumField label="Seconds" value={ss} onChange={setSs} step="1" />
        <NumField label="Frames" value={ff} onChange={setFf} step="1" />
      </div>

      <label style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--sp-sm)', marginTop: 'var(--sp-md)', fontSize: 'var(--t-meta)', color: rate.dropCapable ? 'var(--text)' : 'var(--muted)' }}>
        <input type="checkbox" checked={dropOn} disabled={!rate.dropCapable} onChange={(e) => setDrop(e.target.checked)} />
        Drop-frame {rate.dropCapable ? '' : '— not available at this rate'}
      </label>

      <Results
        rows={[
          { label: 'Total frames', value: isNum(frames) ? String(frames) : '—', strong: true },
          {
            label: 'Running time',
            value: isNum(seconds)
              ? /* Truncated, never rounded: rounding the hundredths of
                   3599.9964 s gives 100, which renders as a three-digit
                   hundredths field — 00:59:59.100. Caught by driving the page
                   at 01:00:00:00 / 29.97 DF. */
                `${pad(seconds / 3600)}:${pad((seconds / 60) % 60)}:${pad(seconds % 60)}.${pad(Math.floor((seconds % 1) * 100))}`
              : '—',
            note: `Real seconds at ${dp(rate.actual, 3)} fps — not the timecode label.`,
          },
          {
            label: 'Timecode, read back from the frame count',
            value: `${pad(roundTrip.hh)}:${pad(roundTrip.mm)}:${pad(roundTrip.ss)}${separator}${pad(roundTrip.ff)}`,
            note: 'Must equal what was typed. A mismatch is the drop-frame bug §3.6 names.',
          },
        ]}
      />
    </>
  )
}

/** §3.7 */
function StorageCalculator() {
  const [bitrate, setBitrate] = useState('')
  const [hours, setHours] = useState('4')
  const [minutes, setMinutes] = useState('0')
  const [cameras, setCameras] = useState('1')

  const seconds = (num(hours) || 0) * 3600 + (num(minutes) || 0) * 60
  const perCamera = storageGb(num(bitrate), seconds)
  const total = perCamera * (num(cameras) || 1)

  return (
    <>
      <Formula>{`GB = (bitrate Mbps × seconds) ÷ 8 ÷ 1000`}</Formula>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 'var(--t-meta)', color: 'var(--text-dim)', alignSelf: 'center' }}>Presets:</span>
        <button type="button" onClick={() => setBitrate('240')} style={{ padding: '4px 8px', fontSize: 'var(--t-meta)', borderRadius: 'var(--r-btn)', border: '1px solid var(--border)', background: 'var(--card)', cursor: 'pointer', color: 'var(--text)' }}>Sony FX3/FX6 4K (240 Mbps)</button>
        <button type="button" onClick={() => setBitrate('280')} style={{ padding: '4px 8px', fontSize: 'var(--t-meta)', borderRadius: 'var(--r-btn)', border: '1px solid var(--border)', background: 'var(--card)', cursor: 'pointer', color: 'var(--text)' }}>RED Komodo 6K (280 Mbps)</button>
        <button type="button" onClick={() => setBitrate('220')} style={{ padding: '4px 8px', fontSize: 'var(--t-meta)', borderRadius: 'var(--r-btn)', border: '1px solid var(--border)', background: 'var(--card)', cursor: 'pointer', color: 'var(--text)' }}>ProRes 422 HQ (220 Mbps)</button>
      </div>
      <div style={fieldGrid}>
        <NumField
          label="Bitrate"
          value={bitrate}
          onChange={setBitrate}
          suffix="Mbps"
          placeholder="Read off the codec"
          hint="Typed or selected from presets above."
        />
        <NumField label="Running time — hours" value={hours} onChange={setHours} step="1" />
        <NumField label="…and minutes" value={minutes} onChange={setMinutes} step="1" />
        <NumField label="Cameras" value={cameras} onChange={setCameras} step="1" />
      </div>
      <Results
        rows={[
          {
            label: 'Total card and drive space',
            value: isNum(total) ? (total >= 1000 ? `${dp(total / 1000, 2)} TB` : `${dp(total, 1)} GB`) : '—',
            strong: true,
          },
          { label: 'Per camera', value: isNum(perCamera) ? `${dp(perCamera, 1)} GB` : '—' },
        ]}
      />
      <Gap>
        <strong style={{ color: 'var(--text)' }}>Not yet inventory-aware.</strong> §2.1 wants camera, codec, resolution and
        frame rate picked from the item master, the result to name the card size, and a stock check offering to add that
        card to the booking — "the step that turns a calculator into revenue". The item master in{' '}
        <code>data/inventory.ts</code> carries no codec or bitrate field, so the bitrate is typed and no card is named. A
        seeded bitrate table would be a figure nobody supplied. <strong style={{ color: 'var(--text)' }}>TODO(decision)</strong> —
        add codec and bitrate to the item master, or drop the inventory-aware claim.
      </Gap>
    </>
  )
}

/** §3.8 */
function BatteryCalculator() {
  const [wh, setWh] = useState('')
  const [draw, setDraw] = useState('')
  const [shoot, setShoot] = useState('10')

  const runtime = batteryRuntimeHours(num(wh), num(draw))
  const needed = batteriesNeeded(num(shoot), runtime)

  return (
    <>
      <Formula>{`runtime hours    = (battery Wh ÷ draw W) × ${USABLE_CAPACITY}        ${USABLE_CAPACITY} = usable capacity
batteries needed = ceil(shoot hours ÷ runtime) + 1  spare`}</Formula>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 'var(--t-meta)', color: 'var(--text-dim)', alignSelf: 'center' }}>Presets:</span>
        <button type="button" onClick={() => { setWh('98'); setDraw('18'); }} style={{ padding: '4px 8px', fontSize: 'var(--t-meta)', borderRadius: 'var(--r-btn)', border: '1px solid var(--border)', background: 'var(--card)', cursor: 'pointer', color: 'var(--text)' }}>V-Mount 98Wh + FX6 (18W)</button>
        <button type="button" onClick={() => { setWh('150'); setDraw('37'); }} style={{ padding: '4px 8px', fontSize: 'var(--t-meta)', borderRadius: 'var(--r-btn)', border: '1px solid var(--border)', background: 'var(--card)', cursor: 'pointer', color: 'var(--text)' }}>V-Mount 150Wh + Komodo (37W)</button>
        <button type="button" onClick={() => { setWh('290'); setDraw('85'); }} style={{ padding: '4px 8px', fontSize: 'var(--t-meta)', borderRadius: 'var(--r-btn)', border: '1px solid var(--border)', background: 'var(--card)', cursor: 'pointer', color: 'var(--text)' }}>V-Mount 290Wh + Cine Rig (85W)</button>
      </div>
      <div style={fieldGrid}>
        <NumField label="Battery capacity" value={wh} onChange={setWh} suffix="Wh" placeholder="Off the cell" />
        <NumField label="Body draw" value={draw} onChange={setDraw} suffix="W" placeholder="Measured" />
        <NumField label="Shoot length" value={shoot} onChange={setShoot} suffix="hrs" />
      </div>
      <Results
        rows={[
          {
            label: 'Batteries the shoot needs',
            value: isNum(needed) && needed > 0 ? String(needed) : '—',
            strong: true,
            note: 'Includes one spare.',
          },
          { label: 'Runtime per battery', value: isNum(runtime) ? `${dp(runtime, 2)} hrs` : '—' },
        ]}
      />
      <Gap>
        <strong style={{ color: 'var(--text)' }}>Draw is typed, not looked up.</strong> §3.8 says draw comes from the item
        master, "measured per body — not a manufacturer figure", and §12 asks Babin directly whether those figures are
        measured or specified. Neither the watt-hours nor the draw exists in the build, and seeding either would be
        inventing the number the whole answer rests on.{' '}
        <strong style={{ color: 'var(--text)' }}>TODO(decision)</strong> — measured per body, or manufacturer spec?
      </Gap>
    </>
  )
}

/** §5 — the Financial Engine, called. No money maths is written on this page. */
function PriceCalculator() {
  const [equipment, setEquipment] = useState('')
  const [subRental, setSubRental] = useState('')
  const [services, setServices] = useState('')
  const [crew, setCrew] = useState('')
  const [transport, setTransport] = useState('')
  const [discountPercent, setDiscountPercent] = useState('0')
  const [vatPercent, setVatPercent] = useState('13')
  const [payments, setPayments] = useState('')

  const toPaisa = (raw: string): Paisa => (raw.trim() === '' ? rupees(0) : (parseMoney(raw) ?? rupees(0)))

  const breakdown = price({
    equipment: toPaisa(equipment),
    subRental: toPaisa(subRental),
    services: toPaisa(services),
    crew: toPaisa(crew),
    transport: toPaisa(transport),
    discountPercent: num(discountPercent) || 0,
    vatPercent: num(vatPercent) || 0,
    payments: toPaisa(payments),
  })

  return (
    <>
      <Formula>{`Foundation §2.1, in order — lib/money.ts price()

  subtotal → discount → taxable → VAT → rental total → outstanding

Each step rounds half-up to the whole rupee. Nothing is recomputed here.`}</Formula>
      <div style={fieldGrid}>
        <NumField label="Equipment" value={equipment} onChange={setEquipment} suffix="Rs" />
        <NumField label="Sub-rental" value={subRental} onChange={setSubRental} suffix="Rs" />
        <NumField label="Services" value={services} onChange={setServices} suffix="Rs" />
        <NumField label="Crew" value={crew} onChange={setCrew} suffix="Rs" />
        <NumField label="Transport" value={transport} onChange={setTransport} suffix="Rs" hint="Rs 0 on client pickup." />
        <NumField label="Discount" value={discountPercent} onChange={setDiscountPercent} suffix="%" />
        <NumField
          label="VAT"
          value={vatPercent}
          onChange={setVatPercent}
          suffix="%"
          hint="§2.1 reads this from Settings ▸ Finance. No settings store exists, so it is an input."
        />
        <NumField label="Paid so far" value={payments} onChange={setPayments} suffix="Rs" />
      </div>
      <Results
        rows={[
          { label: 'Rental total', value: formatMoney(breakdown.rentalTotal), strong: true },
          { label: 'Subtotal', value: formatMoney(breakdown.subtotal) },
          { label: 'Discount', value: formatMoney(breakdown.discount) },
          { label: 'Taxable', value: formatMoney(breakdown.taxable) },
          { label: `VAT at ${num(vatPercent) || 0}%`, value: formatMoney(breakdown.vat) },
          {
            label: 'Outstanding',
            value: formatMoney(breakdown.outstanding),
            tone: breakdown.outstanding > 0 ? 'danger' : 'success',
            note: 'Deposits are liabilities and never enter this figure (§2.2).',
          },
        ]}
      />
      <Gap>
        §5 — “a rental calculator that produces a different price to the booking page is worse than no calculator, because
        someone will quote from it.” Every figure above comes from <code>lib/money.ts</code>’s <code>price()</code>, the
        same call the booking page makes. The spec’s last line, “a Manager may open the same figures in a real quotation
        with one action”, needs a booking draft to hand off to; <code>/rentals/new</code> takes no prefill, so that action
        is not drawn rather than drawn dead.{' '}
        <strong style={{ color: 'var(--text)' }}>TODO(decision)</strong> — what should a quotation handoff carry?
      </Gap>
    </>
  )
}

/**
 * Law 10 as amended — THE GATE IS GONE (D3 ruled 30 Aug 2026, Babin's final
 * word 31 Aug: "don't put any gate on discount"). The reason and approver
 * inputs left with it: an input that influences nothing is a control that
 * lies. What remains is `discountGate`'s arithmetic validity — negative is a
 * price rise (R3-1 stays closed), >100% is a negative price.
 */
function DiscountCalculator() {
  const [percent, setPercent] = useState('12')

  const value = num(percent) || 0
  const gate = discountGate(value, '', null)

  return (
    <>
      <Formula>{`Law 10 (amended 31 Aug 2026) — lib/money.ts discountGate()

  0–100%   allowed outright. No reason, no approver, no cap — ruled by the owner.
  < 0%     refused. A negative discount is a price increase.
  > 100%   refused. That is a negative price, not a discount.`}</Formula>
      <div style={fieldGrid}>
        <NumField label="Discount" value={percent} onChange={setPercent} suffix="%" />
      </div>
      <div
        role="status"
        style={{
          marginTop: 'var(--sp-md)',
          display: 'flex',
          alignItems: 'flex-start',
          gap: 9,
          padding: '11px 12px',
          borderRadius: 'var(--r-card)',
          background: gate.ok ? STATUS.in.bg : STATUS.danger.bg,
          color: gate.ok ? STATUS.in.fg : STATUS.danger.fg,
          fontSize: 'var(--t-meta)',
          fontWeight: 600,
          lineHeight: 1.5,
        }}
      >
        <Icon name={gate.ok ? 'check' : 'alert_triangle'} size={15} style={{ flexShrink: 0, marginTop: 1 }} />
        <span>{gate.ok ? `${article(value)} ${value}% discount may be applied.` : gate.why}</span>
      </div>
    </>
  )
}

const CALCULATORS: Record<CalcKey, () => JSX.Element> = {
  crop: CropCalculator,
  fov: FovCalculator,
  dof: DofCalculator,
  nd: NdCalculator,
  shutter: ShutterCalculator,
  timecode: TimecodeCalculator,
  storage: StorageCalculator,
  battery: BatteryCalculator,
  price: PriceCalculator,
  discount: DiscountCalculator,
}

/* ══ tiles ═══════════════════════════════════════════════════════════════ */

function StateChip({ tone, icon, children }: { tone: 'ok' | 'link' | 'off'; icon: IconName; children: ReactNode }) {
  const skin =
    tone === 'ok'
      ? { background: STATUS.in.bg, color: STATUS.in.fg }
      : tone === 'link'
        ? { background: STATUS.primary.bg, color: STATUS.primary.fg }
        : { background: STATUS.neutral.bg, color: STATUS.neutral.fg }
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 'var(--sp-xs)',
        height: 19,
        padding: '0 7px',
        borderRadius: 'var(--r-badge)',
        fontSize: 'var(--t-meta)',
        fontWeight: 600,
        whiteSpace: 'nowrap',
        ...skin,
      }}
    >
      <Icon name={icon} size={11} />
      {children}
    </span>
  )
}

function FavouriteButton({ on, name, onToggle }: { on: boolean; name: string; onToggle: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={on ? `Remove ${name} from favourites` : `Add ${name} to favourites`}
      title={on ? 'Remove from favourites' : 'Add to favourites'}
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
        onToggle()
      }}
      style={{
        /* Law 15 — the chip stays 26px for the tile's proportions; the hit
           area is 44×44 via content-box padding, which is what the law
           actually measures. Negative margin keeps the chip optically where
           the render puts it while the target grows outward — the same
           pattern as Sidebar's CollapseButton. */
        width: 26,
        height: 26,
        boxSizing: 'content-box',
        padding: 9,
        margin: -9,
        display: 'grid',
        placeItems: 'center',
        border: 'none',
        background: 'transparent',
        color: on ? 'var(--nav-active-accent)' : 'var(--muted)',
        cursor: 'pointer',
        flexShrink: 0,
        /* Lifted above the tile's full-card overlay below. Two nested buttons
           are invalid HTML and WCAG 2.2 nested-interactive both — the browser
           flagged it the first time this page was driven. */
        position: 'relative',
        zIndex: 2,
      }}
    >
      <span
        aria-hidden
        style={{
          width: 26,
          height: 26,
          borderRadius: 7,
          border: `1px solid ${on ? 'var(--nav-active-accent)' : 'var(--border)'}`,
          background: on ? 'var(--nav-active-bg)' : 'var(--card)',
          display: 'grid',
          placeItems: 'center',
        }}
      >
        <Icon name="flag" size={13} fill={on} />
      </span>
    </button>
  )
}

function ToolTile({
  tool,
  favourite,
  onToggleFavourite,
  onOpen,
  list,
}: {
  tool: Tool
  favourite: boolean
  onToggleFavourite: () => void
  onOpen: () => void
  list: boolean
}) {
  const blocked = tool.action.kind === 'blocked'
  const accent = groupAccent(tool.group)
  /*
   * `BRAND.neutral` is `--muted` and `BRAND_ON.neutral` is `--on-brand`, i.e.
   * white on #94a3b8 in dark theme — measured at 2.56:1, under WCAG 1.4.11's
   * 3:1 for a graphical object. The deep-link group is the quiet one anyway, so
   * it takes a surface chip rather than a brand fill; no other group is
   * affected, and no token outside this file changes.
   */
  const quiet = blocked || accent === 'neutral'
  const body = (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
        <span
          style={{
            width: 30,
            height: 30,
            borderRadius: 'var(--r-sm)',
            display: 'grid',
            placeItems: 'center',
            flexShrink: 0,
            background: quiet ? 'var(--card2)' : BRAND[accent],
            color: blocked ? 'var(--muted)' : quiet ? 'var(--text2)' : BRAND_ON[accent],
            ...(quiet && !blocked ? { border: '1px solid var(--border)' } : {}),
          }}
        >
          <Icon name={tool.icon} size={16} fill={!blocked} />
        </span>
        <span style={{ minWidth: 0, flex: 1, fontSize: 'var(--t-ui)', fontWeight: 700, color: 'var(--text)' }}>{tool.name}</span>
        {!blocked && <FavouriteButton on={favourite} name={tool.name} onToggle={onToggleFavourite} />}
      </div>

      <p style={{ margin: '8px 0 0', fontSize: 'var(--t-meta)', color: 'var(--text2)', lineHeight: 1.5 }}>{tool.blurb}</p>

      {tool.action.kind === 'blocked' && (
        <p style={{ margin: '8px 0 0', fontSize: 'var(--t-meta)', color: 'var(--muted)', lineHeight: 1.5 }}>{tool.action.reason}</p>
      )}

      <div style={{ marginTop: 'auto', paddingTop: 10, display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
        {tool.action.kind === 'calculator' && (
          <StateChip tone="ok" icon="check">
            Runs here
          </StateChip>
        )}
        {tool.action.kind === 'link' && (
          <StateChip tone="link" icon="external_link">
            Opens {tool.action.owner}
          </StateChip>
        )}
        {tool.action.kind === 'blocked' && (
          <StateChip tone="off" icon="info">
            Unavailable
          </StateChip>
        )}
        {tool.decision && (
          <StateChip tone="off" icon="flag">
            Needs a decision
          </StateChip>
        )}
      </div>
    </>
  )

  const shell: CSSProperties = {
    ...cardStyle,
    position: 'relative',
    background: blocked ? 'transparent' : 'var(--card)',
    borderStyle: blocked ? 'dashed' : 'solid',
    boxShadow: blocked ? 'none' : cardStyle.boxShadow,
    padding: 13,
    display: 'flex',
    flexDirection: 'column',
    minWidth: 0,
    textAlign: 'left',
    fontFamily: 'inherit',
    minHeight: list ? undefined : 158,
  }

  /*
   * The whole tile is the target, and it also carries a favourite control. The
   * obvious shape — a <button> wrapping the card, favourite button inside — is
   * invalid HTML and a WCAG 2.2 nested-interactive failure, and React said so
   * the first time this page was driven in a browser. So the tile is a plain
   * container and the primary action is a transparent overlay stretched across
   * it, with the favourite button lifted above the overlay. One card, two
   * controls, no nesting.
   */
  const overlay: CSSProperties = {
    position: 'absolute',
    inset: 0,
    borderRadius: 'var(--r-card)',
    background: 'transparent',
    border: 'none',
    padding: 0,
    cursor: 'pointer',
    zIndex: 1,
  }

  if (tool.action.kind === 'calculator') {
    return (
      <div className="lift" style={shell}>
        {body}
        <button type="button" onClick={onOpen} aria-label={`Open ${tool.name}`} style={overlay} />
      </div>
    )
  }
  if (tool.action.kind === 'link') {
    const { to, owner } = tool.action
    return (
      <div className="lift" style={shell}>
        {body}
        <Link to={to} aria-label={`${tool.name} — opens ${owner}`} style={overlay} />
      </div>
    )
  }
  return <div style={shell}>{body}</div>
}

function groupAccent(key: GroupKey): BrandKey {
  return TOOL_GROUPS.find((g) => g.key === key)?.accent ?? 'neutral'
}

/* ══ the page ════════════════════════════════════════════════════════════ */

/**
 * §6 locks four KPI cards: `Tools Used Today · Documents Generated · Labels
 * Printed · Failed Jobs`. Not one of the four is knowable — §11's "every tool
 * execution audited" describes a log that does not exist, no screen prints a
 * label, and Failed Jobs belongs to System Monitor. So each tile states its
 * source instead of carrying a number somebody made up.
 *
 * The accent is `primary`, not `neutral`: `KpiStrip` fills the icon chip with
 * `BRAND[accent]` and draws the glyph in `BRAND_ON[accent]`, and that pair for
 * `neutral` is white on `--muted` — measured at 2.56:1 in dark theme, under
 * WCAG 1.4.11's 3:1. `primary` measures 5.17:1 light / 3.68:1 dark. The token
 * pair itself is still wrong and `lib/status.ts` is not this file's to fix.
 */
const KPIS: Kpi[] = [
  { label: 'Tools Used Today', value: '—', icon: 'tool', accent: 'primary', note: 'No tool-execution log exists (§11)' },
  { label: 'Documents Generated', value: '—', icon: 'file', accent: 'primary', note: 'Counted by Finance ▸ Documents' },
  { label: 'Labels Printed', value: '—', icon: 'package', accent: 'primary', note: 'Nothing prints a label yet' },
  { label: 'Failed Jobs', value: '—', icon: 'alert_triangle', accent: 'primary', note: 'Owned by System Monitor' },
]

/** §6 — three quick actions plus More. `Backup Database` is gone, per §0. */
const QUICK_ACTIONS: readonly string[] = ['dof', 'timecode', 'shutter']

/** §12, verbatim in substance. Never guessed at, never seeded around. */
const OPEN_DECISIONS: ReadonlyArray<{ q: string; why: string }> = [
  {
    q: 'Do clients ask you for call sheets and shot lists, or is that their AD’s job?',
    why: 'It decides whether §4 is a free tool, a paid service line, or nothing at all.',
  },
  {
    q: 'Which calculators do you and your crew actually use today — on paper, on a phone app, or not at all?',
    why: 'Eight are built from §3. Which of them earn their place is unknown.',
  },
  {
    q: 'Battery draw figures — measured per body, or manufacturer specification?',
    why: '§3.8 insists on measured. Nothing in the build stores either.',
  },
  {
    q: 'Should the storage and battery calculators add items to a booking, or just inform?',
    why: '§2.1 calls the add-to-booking step "the one that turns a calculator into revenue".',
  },
  {
    q: 'Palette or page — is ⌘K the primary way into a tool, with this page as the browse view?',
    why: '§7. The palette exists in the shell but indexes navigation only; it does not know a tool by name.',
  },
]

export interface ToolsProps {
  embedded?: boolean
}

export default function Tools({ embedded = false }: ToolsProps = {}) {
  const money = useCanViewMoney()

  useEffect(() => {
    void getToolsStatus()
  }, [])

  /* Locked rule (e) — money tools are removed from the array before anything
     renders. Nothing is masked, dashed or greyed; a money-blind session simply
     has a shorter registry. The page survives it because the camera and lens
     half of Tools carries no money at all. */
  const tools = useMemo(() => TOOLS.filter((t) => money || !t.money), [money])

  const [favourites, setFavourites] = useState<string[]>(() => readFavourites())
  const [recent, setRecent] = useState<string[]>([])
  const [openId, setOpenId] = useState<string | null>(null)
  const [group, setGroup] = useState<'All' | GroupKey>('All')
  const [onlyFavourites, setOnlyFavourites] = useState(false)
  const [view, setView] = useState<'grid' | 'list'>('grid')
  /* "More" has to do something even when nothing is filtered, or it is a dead
     control in the default state — clearing filters alone is invisible then. */
  const categoriesRef = useRef<HTMLDivElement>(null)

  const showEveryTool = () => {
    setOnlyFavourites(false)
    setGroup('All')
    categoriesRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const toggleFavourite = (id: string) => {
    setFavourites((current) => {
      const next = current.includes(id) ? current.filter((x) => x !== id) : [...current, id]
      writeFavourites(next)
      return next
    })
  }

  const openTool = (id: string) => {
    setOpenId(id)
    setRecent((current) => [id, ...current.filter((x) => x !== id)].slice(0, 5))
  }

  const byId = useMemo(() => new Map(tools.map((t) => [t.id, t])), [tools])
  const open = openId === null ? undefined : byId.get(openId)

  const visible = useMemo(
    () => tools.filter((t) => (group === 'All' || t.group === group) && (!onlyFavourites || favourites.includes(t.id))),
    [tools, group, onlyFavourites, favourites],
  )

  const available = tools.filter((t) => t.action.kind !== 'blocked').length
  const unavailable = tools.length - available
  const share = (n: number) => `${((n / (tools.length || 1)) * 100).toFixed(0)}%`
  const slices: Slice[] = [
    { label: 'Available', value: available, display: String(available), percent: share(available) },
    { label: 'Unavailable', value: unavailable, display: String(unavailable), percent: share(unavailable) },
  ]

  const quick = QUICK_ACTIONS.map((id) => byId.get(id)).filter((t): t is Tool => t !== undefined)
  const favouriteTools = favourites.map((id) => byId.get(id)).filter((t): t is Tool => t !== undefined)
  const recentTools = recent.map((id) => byId.get(id)).filter((t): t is Tool => t !== undefined)

  const OpenCalculator = open && open.action.kind === 'calculator' ? CALCULATORS[open.action.calc] : null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
      <ScreenHeader
        embedded={embedded}
        icon="tool"
        title="Tools"
        description="Calculators and utilities that have no home elsewhere. Anything with a module is opened there, never rebuilt here."
        actions={
          !embedded ? (
            <Link
              to="/settings"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                height: 34,
                padding: '0 12px',
                borderRadius: 'var(--r-btn)',
                border: '1px solid var(--btn-secondary-border)',
                background: 'var(--btn-secondary-bg)',
                color: 'var(--text)',
                fontSize: 'var(--t-meta)',
                fontWeight: 600,
                textDecoration: 'none',
              }}
            >
              <Icon name="settings" size={14} />
              Back to Settings
            </Link>
          ) : undefined
        }
      />

      {SEED_ERRORS.length > 0 && (
        <ErrorBanner
          title="The tool registry does not reconcile"
          message={
            <ul style={{ margin: 0, paddingLeft: 'var(--sp-lg)' }}>
              {SEED_ERRORS.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          }
        />
      )}

      <KpiStrip items={KPIS} />

      <div style={{ ...cardStyle, padding: '9px 12px', display: 'flex', alignItems: 'center', gap: 'var(--sp-sm)', fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
        <Icon name="info" size={14} style={{ color: 'var(--muted)', flexShrink: 0 }} />
        <span>
          §6 locks these four headline figures and the build cannot supply one of them — there is no tool-execution log,
          nothing prints a label, and Failed Jobs belongs to System Monitor. Each tile names its source rather than
          showing a number nobody measured.
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: 'var(--sp-md)', alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)', minWidth: 0 }}>
          {/* The open calculator sits above the grid so the answer is where the
              eye already is, rather than behind a modal the theme does not own. */}
          {open && OpenCalculator && (
            <Card
              title={open.name}
              action={
                <>
                  <FavouriteButton on={favourites.includes(open.id)} name={open.name} onToggle={() => toggleFavourite(open.id)} />
                  <Button icon="close" onClick={() => setOpenId(null)}>
                    Close
                  </Button>
                </>
              }
            >
              <OpenCalculator />
            </Card>
          )}

          <div ref={categoriesRef} style={{ minWidth: 0 }}>
          <Card
            title="Tool Categories"
            action={
              <>
                <button
                  type="button"
                  aria-pressed={onlyFavourites}
                  onClick={() => setOnlyFavourites((v) => !v)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 5,
                    height: 30,
                    padding: '0 10px',
                    borderRadius: 'var(--r-btn)',
                    border: `1px solid ${onlyFavourites ? 'var(--nav-active-accent)' : 'var(--border)'}`,
                    background: onlyFavourites ? 'var(--nav-active-bg)' : 'var(--card)',
                    color: onlyFavourites ? 'var(--nav-active-accent)' : 'var(--text2)',
                    fontSize: 'var(--t-meta)',
                    fontWeight: 600,
                    fontFamily: 'inherit',
                    cursor: 'pointer',
                  }}
                >
                  <Icon name="flag" size={13} fill={onlyFavourites} />
                  Favourites
                </button>

                <select
                  value={group}
                  aria-label="Filter by category"
                  onChange={(e) => setGroup(e.target.value === 'All' ? 'All' : (e.target.value as GroupKey))}
                  style={{ ...controlStyle, width: 'auto', height: 30 }}
                >
                  <option value="All">All Categories</option>
                  {TOOL_GROUPS.filter((g) => tools.some((t) => t.group === g.key)).map((g) => (
                    <option key={g.key} value={g.key}>
                      {g.title}
                    </option>
                  ))}
                </select>

                {(['grid', 'list'] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    aria-pressed={view === v}
                    aria-label={`${v} view`}
                    onClick={() => setView(v)}
                    style={{
                      width: 30,
                      height: 30,
                      display: 'grid',
                      placeItems: 'center',
                      borderRadius: 'var(--r-btn)',
                      border: `1px solid ${view === v ? 'var(--nav-active-accent)' : 'var(--border)'}`,
                      background: view === v ? 'var(--nav-active-bg)' : 'var(--card)',
                      color: view === v ? 'var(--nav-active-accent)' : 'var(--muted)',
                      cursor: 'pointer',
                    }}
                  >
                    <Icon name={v === 'grid' ? 'queues' : 'checklist'} size={14} />
                  </button>
                ))}
              </>
            }
          >
            {visible.length === 0 ? (
              <EmptyState
                icon={<Icon name="flag" size={26} />}
                title="No tools match"
                description="Nothing is flagged as a favourite in this category yet. Clear the filter to see the full set."
                actionLabel="Clear filters"
                onAction={() => {
                  setOnlyFavourites(false)
                  setGroup('All')
                }}
              />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                {TOOL_GROUPS.filter((g) => visible.some((t) => t.group === g.key)).map((g) => (
                  <section key={g.key}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 9, flexWrap: 'wrap', marginBottom: 'var(--sp-xs)' }}>
                      <h3 style={{ margin: 0, fontSize: 'var(--t-ui)', fontWeight: 700, color: 'var(--text)' }}>{g.title}</h3>
                      <span className="figure" style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)', fontWeight: 700 }}>
                        {visible.filter((t) => t.group === g.key).length} tools
                      </span>
                    </div>
                    <p style={{ margin: '0 0 10px', fontSize: 'var(--t-meta)', color: 'var(--text2)', lineHeight: 1.5 }}>{g.note}</p>
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: view === 'grid' ? 'repeat(auto-fill, minmax(232px, 1fr))' : '1fr',
                        gap: 10,
                      }}
                    >
                      {visible
                        .filter((t) => t.group === g.key)
                        .map((t) => (
                          <ToolTile
                            key={t.id}
                            tool={t}
                            favourite={favourites.includes(t.id)}
                            onToggleFavourite={() => toggleFavourite(t.id)}
                            onOpen={() => openTool(t.id)}
                            list={view === 'list'}
                          />
                        ))}
                    </div>
                  </section>
                ))}
              </div>
            )}
          </Card>
          </div>

          {/* §6 — Favourites and Recent are panels here, never headline KPIs. */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 'var(--sp-md)' }}>
            <Card title="Favourite Tools">
              {favouriteTools.length === 0 ? (
                <p style={{ margin: 0, fontSize: 'var(--t-meta)', color: 'var(--muted)', lineHeight: 1.55 }}>
                  Nothing flagged yet. The flag on a tool adds it here, and the list is kept in this browser — §6 makes
                  favourite a flag on a tool, never a slice of the total.
                </p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {favouriteTools.map((t) => (
                    <PanelRow key={t.id} tool={t} onOpen={() => openTool(t.id)} trailing={<FavouriteButton on name={t.name} onToggle={() => toggleFavourite(t.id)} />} />
                  ))}
                </div>
              )}
            </Card>

            <Card title="Recent Tools">
              {recentTools.length === 0 ? (
                <p style={{ margin: 0, fontSize: 'var(--t-meta)', color: 'var(--muted)', lineHeight: 1.55 }}>
                  Nothing opened yet. Recent is this session only — §11 wants every tool execution audited, and no
                  execution log exists to read a longer history from.
                </p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {recentTools.map((t) => (
                    <PanelRow key={t.id} tool={t} onOpen={() => openTool(t.id)} />
                  ))}
                </div>
              )}
            </Card>

            <Card title="Quick Actions">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {quick.map((t) => (
                  <PanelRow key={t.id} tool={t} onOpen={() => openTool(t.id)} />
                ))}
              </div>
              <button
                type="button"
                onClick={showEveryTool}
                style={{
                  marginTop: 'var(--sp-sm)',
                  border: 'none',
                  background: 'none',
                  padding: 0,
                  fontSize: 'var(--t-meta)',
                  fontWeight: 600,
                  color: 'var(--link)',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                More — show every tool →
              </button>
              <p style={{ margin: '10px 0 0', fontSize: 'var(--t-meta)', color: 'var(--muted)', lineHeight: 1.5 }}>
                §0 — <strong style={{ color: 'var(--text)' }}>Backup Database</strong> is deliberately not here. The render
                puts it one press from a Rental Officer, against Administration §25.2’s Owner-only, 2FA-gated rule.
              </p>
            </Card>
          </div>

          <Card title="Where the render’s fifteen categories went">
            <p style={{ margin: '0 0 10px', fontSize: 'var(--t-meta)', color: 'var(--text2)', lineHeight: 1.5 }}>
              The reference render is a Tools Center of fifteen numbered categories and 118 tools. §0 and §1 rule on every
              one of them. Two stay, one is cut, one is gated, and the rest deep-link — so this page is not a partial copy
              of the render, it is the render after the scoping rule was applied.
            </p>
            <DataTableShell ariaLabel="Render category disposition">
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 440 }}>
                <thead>
                  <tr style={{ background: 'var(--th-bg)' }}>
                    <th style={thStyle}>Render category</th>
                    <th style={thStyle}>Ruling</th>
                  </tr>
                </thead>
                <tbody>
                  {RENDER_DISPOSITION.map((d) => (
                    <tr key={d.category} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>{d.category}</td>
                      <td style={tdStyle}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          <Icon
                            name={d.tone === 'cut' ? 'close' : d.tone === 'moved' ? 'external_link' : 'check'}
                            size={12}
                            style={{ color: d.tone === 'cut' ? 'var(--danger-text)' : d.tone === 'moved' ? 'var(--primary-text)' : 'var(--success-text)', flexShrink: 0 }}
                          />
                          {d.outcome}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </DataTableShell>
          </Card>

          <Card title="Open — needs Babin">
            <p style={{ margin: '0 0 10px', fontSize: 'var(--t-meta)', color: 'var(--text2)', lineHeight: 1.5 }}>
              §12. None of these is guessed at anywhere on this page; where one blocks a figure, the field is an input and
              the calculator says so.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {OPEN_DECISIONS.map((d) => (
                <div key={d.q} style={{ display: 'flex', gap: 9, alignItems: 'flex-start' }}>
                  <Icon name="flag" size={14} style={{ color: 'var(--progress-text)', flexShrink: 0, marginTop: 2 }} />
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)', lineHeight: 1.45 }}>{d.q}</span>
                    <span style={{ display: 'block', fontSize: 'var(--t-meta)', color: 'var(--muted)', marginTop: 2, lineHeight: 1.45 }}>{d.why}</span>
                  </span>
                </div>
              ))}
            </div>
          </Card>
        </div>

        <Rail>
          <Card title="Tool Summary">
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
              <Donut slices={slices} centreLabel="Registered" centreValue={String(tools.length)} />
              <Legend slices={slices} />
            </div>
            <div style={{ marginTop: 'var(--sp-md)', display: 'flex', flexDirection: 'column', gap: 'var(--sp-sm)', borderTop: '1px solid var(--border)', paddingTop: 11 }}>
              <RailRow label="Favourite" value={String(favourites.length)} flag />
              <RailRow label="Opened this session" value={String(recent.length)} flag />
            </div>
            <p style={{ margin: '10px 0 0', fontSize: 'var(--t-meta)', color: 'var(--muted)', lineHeight: 1.5 }}>
              §6 — <span className="figure">Available + Unavailable = Registered</span>, and favourite and recently used
              are flags that overlap available, never segments beside it. Both figures are counted from the registry, so
              they cannot drift the way the render’s 98 + 6 = 104 against 118 does.
            </p>
          </Card>

          <Card title="What Tools owns">
            <p style={{ margin: 0, fontSize: 'var(--t-meta)', color: 'var(--text2)', lineHeight: 1.55 }}>
              <strong style={{ color: 'var(--text)' }}>Tools owns only what has no home elsewhere</strong> (§1). A
              deep-linked tool opens the owning module with the right filter and carries{' '}
              <em>that module’s</em> permissions — backup, integrations and diagnostics answer to Administration, not to
              this page.
            </p>
          </Card>

          {/*
            The render's rail carries an Alerts card between the donut and the
            AI panel. It is kept in place rather than dropped, because §10 rules
            on it directly — "Alerts must agree with their source… Alerts read
            the owning module" — and the render is the standing example of the
            failure: it shows "Database backup not done today" beside a Backup
            module reporting one completed at 02:15. Every one of its four
            alerts belongs to another module, and Tools holds no alert source of
            its own, so the card says that instead of restating them.
          */}
          <Card title="Alerts">
            <p style={{ margin: 0, fontSize: 'var(--t-meta)', color: 'var(--muted)', lineHeight: 1.55 }}>
              Empty on purpose. §10 — <strong style={{ color: 'var(--text)' }}>alerts read the owning module</strong>, and
              none of the render’s four belongs to Tools: labels are Inventory’s, warranties are Inventory ▸ Maintenance’s,
              the backup state is Administration’s and pending approvals are Documents’. Restating them here is how the
              render ends up claiming a backup was missed while the Backup module records one at 02:15 the same morning.
            </p>
          </Card>

          <Card title="AI Tool Recommendations">
            <p style={{ margin: 0, fontSize: 'var(--t-meta)', color: 'var(--muted)', lineHeight: 1.55 }}>
              Dark on purpose. §9 gates every AI utility on the data policy in Administration §21.2, which is unanswered,
              and Foundation §5.4 keeps AI panels dark until the feature is real. The render’s three suggestions each end
              in a button that would send client data to an external provider with no logged provider, token count or
              cost.
            </p>
          </Card>

          <Card title="Keyboard">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-sm)' }}>
              <ShortcutRow keys="Ctrl / ⌘ + K" what="Command palette" />
              <ShortcutRow keys="Ctrl / ⌘ + B" what="Scanner" />
            </div>
            <p style={{ margin: '10px 0 0', fontSize: 'var(--t-meta)', color: 'var(--muted)', lineHeight: 1.5 }}>
              Only the two the shell actually binds are listed. §7 proposes ⌘K as the primary way into a tool — type{' '}
              <span className="figure">dof</span> or <span className="figure">timecode</span> and it opens — but the
              palette indexes navigation only and cannot reach this registry. The shell owns it; see the note in the
              handover.
            </p>
          </Card>
        </Rail>
      </div>

      <FooterNote extra={['Tools lives inside Settings — Foundation §5.1 keeps it out of the sidebar']} />
    </div>
  )
}

/* ══ small parts ═════════════════════════════════════════════════════════ */

/*
 * §7.3's row floor ("rows >= 56px"), expressed with the token rather than with
 * padding arithmetic — `height` on a `<td>` reads as a MINIMUM, so short rows
 * rise to the floor and the horizontal padding is untouched.
 *
 * The disposition table this dresses is read-only, so nothing here can currently
 * mis-record a tap. It is still the floor's job to guarantee that a 44px hit
 * area fits inside its own row rather than overhanging the neighbour, where the
 * later row in the DOM wins the press; at 8px padding around one line of text
 * these rows pitch near 36, which is the shape that fails the moment a row ever
 * carries a control. Applying the token now makes the guarantee a property of
 * the table rather than something the next person has to remember to add.
 */
const tdStyle: CSSProperties = {
  height: 'var(--row-min-h)',
  padding: '8px 10px',
  fontSize: 'var(--t-meta)',
  color: 'var(--text)',
  verticalAlign: 'top',
}

function RailRow({ label, value, flag }: { label: string; value: string; flag?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-sm)', fontSize: 'var(--t-meta)' }}>
      {flag && <Icon name="flag" size={12} style={{ color: 'var(--muted)', flexShrink: 0 }} />}
      <span style={{ flex: 1, minWidth: 0, color: 'var(--text2)' }}>{label}</span>
      <span className="figure" style={{ fontWeight: 700, color: 'var(--text)' }}>
        {value}
      </span>
    </div>
  )
}

function ShortcutRow({ keys, what }: { keys: string; what: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 'var(--t-meta)' }}>
      <kbd
        className="figure"
        style={{
          padding: '2px 7px',
          borderRadius: 'var(--r-xs)',
          border: '1px solid var(--border)',
          background: 'var(--card2)',
          color: 'var(--text2)',
          whiteSpace: 'nowrap',
        }}
      >
        {keys}
      </kbd>
      <span style={{ color: 'var(--text2)' }}>{what}</span>
    </div>
  )
}

/**
 * A row in the Favourites / Recent / Quick Actions panels.
 *
 * The trailing favourite control is a **sibling** of the row's own control, not
 * a child of it — same nested-interactive rule as `ToolTile`.
 */
function PanelRow({ tool, onOpen, trailing }: { tool: Tool; onOpen: () => void; trailing?: ReactNode }) {
  const inner = (
    <>
      <Icon name={tool.icon} size={15} style={{ color: 'var(--muted)', flexShrink: 0 }} />
      <span style={{ flex: 1, minWidth: 0, fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)', textAlign: 'left' }}>
        {tool.name}
      </span>
    </>
  )

  const shell: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 9,
    flex: 1,
    minWidth: 0,
    padding: '8px 6px',
    borderRadius: 'var(--r-sm)',
    border: 'none',
    background: 'transparent',
    cursor: 'pointer',
    fontFamily: 'inherit',
    textDecoration: 'none',
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-xs)' }}>
      {tool.action.kind === 'calculator' ? (
        <button type="button" onClick={onOpen} style={shell}>
          {inner}
        </button>
      ) : tool.action.kind === 'link' ? (
        <Link to={tool.action.to} style={shell}>
          {inner}
        </Link>
      ) : (
        <div style={{ ...shell, cursor: 'default' }}>{inner}</div>
      )}
      {trailing}
    </div>
  )
}
