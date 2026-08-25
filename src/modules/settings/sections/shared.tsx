import { createContext, useContext, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { Link } from 'react-router-dom'
import Icon from '../../../components/ui/Icon'
import type { IconName } from '../../../components/ui/Icon'
import { Card, Button, cardStyle } from '../../../components/ui/Page'
import { STATUS, BRAND, BRAND_ON } from '../../../lib/status'
import type { StatusKey, BrandKey } from '../../../lib/status'
import { SETTING_SPECS, formatSetting } from '../../../lib/settingsStore'
import type { SettingKey, SettingValue, SettingsRecord } from '../../../lib/settingsStore'
import { useTheme } from '../../../lib/theme'
import { getAllowOverbooking, setAllowOverbooking } from '../../../lib/bookingRules'
import { TEXT_SIZES, applyTextSize, readTextSize } from '../../../lib/textSize'
import type { TextSize } from '../../../lib/textSize'
import type { UseEditModeResult } from '../../../lib/edit/useEditMode'
import type { Dest, TabKey, TabDef, ActivityEntry, QuickAction } from '../../../data/settings'
import { isDestVisible } from '../../../data/settings'

/**
 * **Settings — the atoms every section is built from.**
 *
 * `11_SETTINGS.md`'s closing note: *"Settings is currently one 2,502-line file;
 * these eight sections are the split."* This is the part of that file that is
 * genuinely shared — the row, the destination control, the KPI card, the edit
 * plumbing — extracted once so eight section files can be read on their own.
 *
 * Nothing here is new behaviour. The `Dest` three-case rule, the `Not built`
 * marker, the read-only reason on a product law and the money-blind removals
 * are all carried across unchanged from the single file.
 */

/* ── style atoms ───────────────────────────────────────────────────────── */

export const td: CSSProperties = {
  padding: '10px',
  fontSize: 'var(--t-meta)',
  color: 'var(--text)',
  verticalAlign: 'middle',
  borderBottom: '1px solid var(--border)',
}

export const controlStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 5,
  /* Law 15 — 44×44 on every device, desktop included. The visual control stays
     32px; the tap area is grown with padding rather than the border box, so the
     rows do not gain 12px of height each. */
  minHeight: 32,
  padding: '0 12px',
  borderRadius: 'var(--r-btn)',
  border: '1px solid var(--border)',
  background: 'var(--card)',
  color: 'var(--text)',
  fontSize: 'var(--t-meta)',
  fontWeight: 600,
  textDecoration: 'none',
  fontFamily: 'inherit',
  cursor: 'pointer',
  flexShrink: 0,
}

export const linkStyle: CSSProperties = {
  marginTop: 9,
  alignSelf: 'flex-start',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 'var(--sp-xs)',
  border: 'none',
  background: 'transparent',
  padding: 0,
  fontFamily: 'inherit',
  fontSize: 'var(--t-th)',
  fontWeight: 700,
  color: 'var(--link)',
  textDecoration: 'none',
  cursor: 'pointer',
}

/** The rail's shortcut tiles. Same shape as the Overview's Quick Access. */
export const quickTileStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 6,
  minHeight: 70,
  padding: '10px 6px',
  borderRadius: 'var(--r-card)',
  border: '1px solid var(--border)',
  background: 'var(--card2)',
  color: 'var(--text)',
  fontSize: 'var(--t-th)',
  fontWeight: 600,
  textAlign: 'center',
  textDecoration: 'none',
  fontFamily: 'inherit',
  cursor: 'pointer',
}

export function ToneChip({ tone, icon, children }: { tone: StatusKey; icon: IconName; children: ReactNode }) {
  const t = STATUS[tone]
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 'var(--sp-xs)',
        padding: '2px 8px',
        borderRadius: 'var(--r-badge)',
        background: t.bg,
        color: t.fg,
        border: t.border ? `1px solid ${t.border}` : '1px solid transparent',
        fontSize: 'var(--t-th)',
        fontWeight: 700,
        whiteSpace: 'nowrap',
      }}
    >
      {/* Law 11 — colour is never the sole carrier. Icon + label, always. */}
      <Icon name={icon} size={12} fill />
      {children}
    </span>
  )
}

/** Single-hue progress bar. Length encodes the figure; colour encodes nothing. */
export function Meter({ percent, tone = 'success' }: { percent: number; tone?: BrandKey }) {
  const width = Math.max(0, Math.min(100, percent))
  return (
    <span
      role="img"
      aria-label={`${width}% utilization`}
      style={{ display: 'block', height: 6, borderRadius: 'var(--r-badge)', background: 'var(--divider)', overflow: 'hidden' }}
    >
      <span style={{ display: 'block', width: `${width}%`, height: '100%', background: BRAND[tone] }} />
    </span>
  )
}

/* ── navigation between sections ───────────────────────────────────────── */

export const GoTab = createContext<(tab: TabKey) => void>(() => {})

/** The tab set this session can actually reach — Law 6 removes, never disables. */
export const VisibleTabs = createContext<readonly TabDef[]>([])

/**
 * PLAN.md §0 — *no dead controls*. One component renders all three cases a
 * `Dest` can be, so an unbuilt destination is physically unable to render as a
 * live-looking control: it comes out visibly inert with its reason attached.
 */
export function DestControl({
  dest,
  children,
  style,
  ariaLabel,
}: {
  dest: Dest
  children: ReactNode
  style: CSSProperties
  ariaLabel?: string
}) {
  const go = useContext(GoTab)

  if (dest.kind === 'route') {
    return (
      <Link to={dest.to} style={style} {...(ariaLabel ? { 'aria-label': ariaLabel } : {})}>
        {children}
      </Link>
    )
  }
  if (dest.kind === 'tab') {
    return (
      <button type="button" onClick={() => go(dest.tab)} style={style} {...(ariaLabel ? { 'aria-label': ariaLabel } : {})}>
        {children}
      </button>
    )
  }
  return (
    <span
      aria-disabled="true"
      title={dest.why}
      style={{ ...style, cursor: 'not-allowed', color: 'var(--muted)', background: 'transparent', borderStyle: 'dashed' }}
    >
      {children}
    </span>
  )
}

/**
 * Drops rows whose destination this session cannot reach.
 *
 * Law 6 removes the Financial tab for a money-blind session; every row still
 * pointing at it would then be a control that lands the operator back on
 * Overview. Removed for the same reason the tab is: a disabled money control is
 * still a money control.
 */
export function useVisible<T extends { dest: Dest }>(rows: readonly T[]): T[] {
  const tabs = useContext(VisibleTabs)
  return rows.filter((r) => isDestVisible(r.dest, tabs))
}

/** The trailing marker on an inert row — states *that* it is unbuilt; `title` states why. */
export function NotBuilt({ why }: { why: string }) {
  return (
    <span
      title={why}
      style={{
        fontSize: 'var(--t-th)',
        fontWeight: 600,
        color: 'var(--muted)',
        border: '1px dashed var(--border)',
        borderRadius: 'var(--r-badge)',
        padding: '1px 6px',
        whiteSpace: 'nowrap',
      }}
    >
      Not built
    </span>
  )
}

/**
 * A panel with no source behind it. **Never a zero, never a plausible
 * default** — Rulings §8: *"A report with no data source shows 'not tracked
 * yet', never zeros."* The reason is on the page, not in a tooltip.
 */
export function NotTrackedYet({ title, why }: { title: string; why: string }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 'var(--sp-sm)',
        padding: 'var(--sp-md)',
        borderRadius: 'var(--r-card)',
        border: '1px dashed var(--border)',
        background: 'var(--card2)',
      }}
    >
      <Icon name="info" size={15} style={{ color: 'var(--muted)', flexShrink: 0, marginTop: 2 }} />
      <span style={{ minWidth: 0 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-sm)', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 'var(--t-meta)', fontWeight: 700, color: 'var(--text)' }}>{title}</span>
          <ToneChip tone="neutral" icon="timer">
            Not tracked yet
          </ToneChip>
        </span>
        <span style={{ display: 'block', marginTop: 4, fontSize: 'var(--t-meta)', color: 'var(--text2)', lineHeight: 1.55 }}>
          {why}
        </span>
      </span>
    </div>
  )
}

/** An open product decision, stated on the screen it blocks rather than only in a comment. */
export function OpenDecision({ text }: { text: string }) {
  return (
    <p
      style={{
        margin: 0,
        display: 'flex',
        alignItems: 'flex-start',
        gap: 6,
        fontSize: 'var(--t-th)',
        color: 'var(--muted)',
        lineHeight: 1.55,
      }}
    >
      <Icon name="flag" size={12} style={{ flexShrink: 0, marginTop: 3 }} />
      {text}
    </p>
  )
}

/* ── KPI card with a destination ───────────────────────────────────────── */

export interface KpiSpec {
  label: string
  value: string
  icon: IconName
  accent: BrandKey
  note: string
  linkLabel: string
  /** Either a destination or an in-page action — never neither, never both. */
  dest?: Dest
  onAction?: () => void
  delta?: { direction: 'up' | 'down'; text: string }
}

export function KpiCard({ k }: { k: KpiSpec }) {
  return (
    <article className="lift" style={{ ...cardStyle, padding: '13px 14px', minWidth: 0, display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
        <span
          style={{
            width: 30,
            height: 30,
            borderRadius: 'var(--r-sm)',
            background: BRAND[k.accent],
            color: BRAND_ON[k.accent],
            display: 'grid',
            placeItems: 'center',
            flexShrink: 0,
          }}
        >
          <Icon name={k.icon} size={16} fill />
        </span>
        <div
          style={{
            fontSize: 'var(--t-meta)',
            fontWeight: 600,
            color: 'var(--text2)',
            minWidth: 0,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {k.label}
        </div>
      </div>

      <div
        className="kpi-value"
        style={{
          marginTop: 9,
          fontSize: k.value.length > 8 ? 'clamp(15px, 1.0vw, 19px)' : 'clamp(16px, 1.4vw, 22px)',
          fontWeight: 700,
          color: 'var(--text)',
          lineHeight: 1.15,
          letterSpacing: '-0.02em',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {k.value}
      </div>

      <div style={{ marginTop: 6, fontSize: 'var(--t-th)', display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
        {k.delta && (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 3,
              fontWeight: 700,
              color: k.delta.direction === 'up' ? 'var(--success-text)' : 'var(--danger-text)',
            }}
          >
            <Icon name={k.delta.direction === 'up' ? 'arrow_up' : 'arrow_down'} size={11} fill />
            {k.delta.text}
          </span>
        )}
        <span style={{ color: 'var(--muted)' }}>{k.note}</span>
      </div>

      {k.dest ? (
        <DestControl dest={k.dest} style={linkStyle}>
          {k.linkLabel}
          {k.dest.kind === 'none' ? <NotBuilt why={k.dest.why} /> : <Icon name="arrow_right" size={12} />}
        </DestControl>
      ) : (
        <button type="button" onClick={k.onAction} style={linkStyle}>
          {k.linkLabel}
          <Icon name="arrow_right" size={12} />
        </button>
      )}
    </article>
  )
}

/** The KPI strip, sized for whichever column it lands in. */
export function KeyFigures({ kpis }: { kpis: KpiSpec[] }) {
  return (
    <section
      aria-label="Key figures"
      style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(168px, 1fr))', gap: 'var(--sp-md)' }}
    >
      {kpis.map((k) => (
        <KpiCard key={k.label} k={k} />
      ))}
    </section>
  )
}

/* ── settings field rows ───────────────────────────────────────────────── */

export interface Field {
  label: string
  note: string
  /** A value renders as a select; a boolean renders as a switch; a dest renders as a control. */
  value?: string
  on?: boolean
  dest?: Dest
  /**
   * Registry key. A field with one is **genuinely editable** — its value comes
   * from `lib/settingsStore.ts` rather than from the literal below, and it
   * becomes a real control when the page is unlocked.
   */
  settingKey?: SettingKey
  /**
   * Why a value-bearing field is *not* editable. Every value used to render as
   * a span with a chevron — a select that opened nothing. A value with no key
   * now says what it is instead: a product law, or a decision nobody has made.
   */
  readOnlyWhy?: string
  /**
   * §11.4 — *"Every value here is read by a screen. None is hardcoded."* Names
   * the screens that read this key live, so the claim can be checked rather
   * than believed.
   */
  readBy?: string
  /**
   * A caller-supplied control for this row, rendered in place of the value /
   * switch / dest chain below.
   *
   * Added 24 Aug 2026 for `Settings ▸ System ▸ Security ▸ Device PIN`, which is
   * the first row on this page whose control is genuinely interactive — it opens
   * a modal, calls two RPCs and reflects database state. The existing `value` /
   * `on` / `dest` vocabulary describes rows that display or navigate, and
   * stretching it to cover a stateful widget would have meant a fourth
   * half-expressive variant.
   *
   * Kept deliberately narrow: one field uses it. It is an escape hatch, not an
   * invitation to move row rendering into the section files — the reason this
   * page is consistent at all is that `FieldRow` owns the layout.
   */
  custom?: ReactNode | undefined
}

export interface Section {
  key: string
  title: string
  icon: IconName
  fields: Field[]
}

/**
 * The page's edit controller, shared down to `FieldRow` the same way `GoTab`
 * shares navigation. Threading it through `SectionCards` would mean every
 * section knowing about edit mode to pass it along.
 */
export const EditCtx = createContext<UseEditModeResult | null>(null)

function Switch({ on, label }: { on: boolean; label: string }) {
  const [state, setState] = useState(on)
  return (
    <button
      type="button"
      role="switch"
      aria-checked={state}
      aria-label={label}
      onClick={() => setState((s) => !s)}
      style={{
        width: 34,
        height: 19,
        borderRadius: 'var(--r-badge)',
        border: 'none',
        padding: 2,
        background: state ? 'var(--success)' : 'var(--disabled)',
        cursor: 'pointer',
        flexShrink: 0,
        display: 'flex',
        justifyContent: state ? 'flex-end' : 'flex-start',
      }}
    >
      <span
        aria-hidden
        style={{ width: 15, height: 15, borderRadius: 'var(--r-badge)', background: 'var(--card)', display: 'block' }}
      />
    </button>
  )
}

/**
 * §11.1 — *"one card per section, **rows not a form**"*: label / value / [Edit].
 * The row is the unit; the card is a group of rows; nothing on this page is a
 * `<form>` with a Save at the bottom, because a settings page that saves eleven
 * unrelated values in one press cannot report which one failed.
 */
export function FieldRow({ f }: { f: Field }) {
  /* Null only outside the provider, which nothing in this module is. Optional
     rather than asserted so a future caller gets read-only, not a crash. */
  const edit = useContext(EditCtx)
  const { theme, setMode } = useTheme()
  const [textSize, setTextSize] = useState<TextSize>(() => readTextSize())
  // redesign v1 §3 — the one Settings toggle that is actually wired (every
  // other Switch on this page is local-state-only, same as Theme/Text size
  // above are the only other two real ones), via lib/bookingRules.ts.
  const [allowOverbooking, setAllowOverbookingState] = useState<boolean>(() => getAllowOverbooking())

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        padding: '11px 0',
        borderBottom: '1px solid var(--border)',
        flexWrap: 'wrap',
      }}
    >
      <span style={{ flex: 1, minWidth: 200 }}>
        <span style={{ display: 'block', fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)' }}>{f.label}</span>
        <span style={{ display: 'block', fontSize: 'var(--t-meta)', color: 'var(--text2)', marginTop: 2 }}>{f.note}</span>
        {/* A product law is not "Not built" — that badge means unimplemented,
            and these are decided. The reason is shown outright rather than
            hidden behind a hover: it is the answer to the question the reader
            is about to ask, which is why there is no control. */}
        {f.readOnlyWhy && (
          <span style={{ display: 'flex', alignItems: 'flex-start', gap: 5, marginTop: 4, fontSize: 'var(--t-th)', color: 'var(--muted)' }}>
            <Icon name="lock" size={11} style={{ flexShrink: 0, marginTop: 2 }} />
            {f.readOnlyWhy}
          </span>
        )}
        {f.readBy && (
          <span style={{ display: 'flex', alignItems: 'flex-start', gap: 5, marginTop: 4, fontSize: 'var(--t-th)', color: 'var(--muted)' }}>
            <Icon name="arrow_right" size={11} style={{ flexShrink: 0, marginTop: 2 }} />
            Read live by {f.readBy}
          </span>
        )}
      </span>

      {/* A caller-supplied control wins outright — see `Field.custom`. Placed
          first so the row never renders two controls. */}
      {f.custom !== undefined ? (
        <span style={{ flexShrink: 0 }}>{f.custom}</span>
      ) : /* §4.3.11 — three options, each setting --ui-scale on the root. Every
          size in §4.3.6 is rem, so one variable moves the whole app. */
      f.label === 'Text size' ? (
        <span style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          {TEXT_SIZES.map((t) => {
            const on = textSize === t.key
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => {
                  setTextSize(t.key)
                  applyTextSize(t.key)
                }}
                aria-pressed={on}
                title={t.who || undefined}
                style={{
                  ...controlStyle,
                  borderColor: on ? 'var(--nav-active-accent)' : 'var(--border)',
                  background: on ? 'var(--nav-active-bg)' : 'var(--card)',
                  color: on ? 'var(--nav-active-accent)' : 'var(--text2)',
                  fontWeight: on ? 600 : 500,
                }}
              >
                {t.label}
              </button>
            )
          })}
        </span>
      ) : f.label === 'Theme' ? (
        <span style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          {(['light', 'dark'] as const).map((m) => {
            const on = theme === m
            return (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                aria-pressed={on}
                style={{
                  ...controlStyle,
                  borderColor: on ? 'var(--nav-active-accent)' : 'var(--border)',
                  background: on ? 'var(--nav-active-bg)' : 'var(--card)',
                  color: on ? 'var(--nav-active-accent)' : 'var(--text2)',
                  fontWeight: on ? 600 : 500,
                  textTransform: 'capitalize',
                }}
              >
                <Icon name={m === 'dark' ? 'moon' : 'sun'} size={13} />
                {m}
              </button>
            )
          })}
        </span>
      ) : f.label === 'Allow overbooking' ? (
        <button
          type="button"
          role="switch"
          aria-checked={allowOverbooking}
          aria-label={f.label}
          onClick={() => {
            const next = !allowOverbooking
            setAllowOverbookingState(next)
            setAllowOverbooking(next)
          }}
          style={{
            width: 34,
            height: 19,
            borderRadius: 'var(--r-badge)',
            border: 'none',
            padding: 2,
            background: allowOverbooking ? 'var(--success)' : 'var(--disabled)',
            cursor: 'pointer',
            flexShrink: 0,
            display: 'flex',
            justifyContent: allowOverbooking ? 'flex-end' : 'flex-start',
          }}
        >
          <span aria-hidden style={{ width: 15, height: 15, borderRadius: 'var(--r-badge)', background: 'var(--card)', display: 'block' }} />
        </button>
      ) : f.on !== undefined ? (
        <Switch on={f.on} label={f.label} />
      ) : f.dest ? (
        <DestControl dest={f.dest} style={controlStyle}>
          {f.dest.kind === 'none' ? (
            <>
              Unavailable
              <NotBuilt why={f.dest.why} />
            </>
          ) : (
            <>
              Open
              <Icon name="arrow_right" size={13} />
            </>
          )}
        </DestControl>
      ) : f.settingKey && edit?.editing ? (
        <SettingControl k={f.settingKey} edit={edit} />
      ) : (
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 7,
            minWidth: 190,
            height: 32,
            padding: '0 10px',
            borderRadius: 'var(--r-input)',
            border: '1px solid var(--input-border)',
            /* No chevron any more. It used to sit on every one of these and
               open nothing — the affordance promised a menu that did not
               exist. A value that cannot be changed now reads as a value. */
            background: f.settingKey ? 'var(--input-bg)' : 'transparent',
            fontSize: 'var(--t-meta)',
            color: 'var(--text)',
            flexShrink: 0,
          }}
        >
          <span style={{ flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {f.settingKey && edit ? formatSetting(f.settingKey, edit.valueOf(f.settingKey) as SettingValue) : f.value}
          </span>
        </span>
      )}
    </div>
  )
}

/**
 * The control for one registry-backed setting: a select where the spec
 * enumerates its options, a number or text input otherwise, with the
 * Save/Cancel pair appearing only once the value differs from the stored one.
 */
function SettingControl({ k, edit }: { k: SettingKey; edit: UseEditModeResult }) {
  const spec = SETTING_SPECS[k]
  const raw = edit.valueOf(k)
  const shown = raw === null || raw === undefined ? '' : String(raw)
  const error = edit.errorOf(k)
  const dirty = edit.isDirty(k)
  const saving = edit.savingKeys.includes(k)

  const box = {
    minWidth: 190,
    height: 32,
    padding: '0 10px',
    borderRadius: 'var(--r-input)',
    border: `1px solid ${error ? 'var(--danger)' : 'var(--input-border)'}`,
    background: 'var(--input-bg)',
    color: 'var(--text)',
    fontSize: 'var(--t-meta)',
    fontFamily: 'inherit',
  } as const

  return (
    <span style={{ display: 'flex', flexDirection: 'column', gap: 5, flexShrink: 0, alignItems: 'flex-end' }}>
      {spec.kind === 'select' ? (
        <select id={`edit-${k}`} value={shown} onChange={(e) => edit.setValue(k, e.target.value)} style={box}>
          {spec.options?.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      ) : (
        <input
          id={`edit-${k}`}
          type={spec.kind === 'number' ? 'number' : 'text'}
          value={shown}
          onChange={(e) =>
            /* A number field must hand the record a number — the saved value is
               what `isDirty` compares against, and '13' !== 13 would leave an
               untouched field reading as dirty for ever. */
            edit.setValue(k, spec.kind === 'number' ? (e.target.value === '' ? '' : Number(e.target.value)) : e.target.value)
          }
          style={box}
        />
      )}

      {/* Law 12 — errors inline, never colour alone. */}
      {error && (
        <span role="alert" style={{ display: 'flex', alignItems: 'flex-start', gap: 4, maxWidth: 260, fontSize: 'var(--t-th)', color: 'var(--danger-text)', textAlign: 'left' }}>
          <Icon name="alert_triangle" size={11} style={{ flexShrink: 0, marginTop: 2 }} />
          {error}
        </span>
      )}

      {dirty && (
        <span style={{ display: 'flex', gap: 'var(--sp-xs)' }}>
          <Button variant="primary" onClick={() => void edit.saveField(k)}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
          <Button variant="ghost" onClick={() => edit.cancelField(k)}>
            Cancel
          </Button>
        </span>
      )}
    </span>
  )
}

/** One value per field, for the settings export. Never guesses. */
export function fieldValue(f: Field, settings: SettingsRecord): string {
  /* Registry-backed fields export what is actually stored, not the literal the
     section list was written with — otherwise the CSV would report the default
     for a setting the operator changed. */
  if (f.settingKey) return formatSetting(f.settingKey, settings[f.settingKey])
  if (f.value !== undefined) return f.value
  if (f.on !== undefined) return f.on ? 'On' : 'Off'
  if (f.dest === undefined) return '—'
  if (f.dest.kind === 'route') return f.dest.to
  if (f.dest.kind === 'tab') return `Settings ▸ ${f.dest.tab}`
  return `Not built — ${f.dest.why}`
}

export function SectionCards({ sections }: { sections: Section[] }) {
  const tabs = useContext(VisibleTabs)
  return (
    <>
      {sections.map((s) => (
        <Card key={s.key} title={s.title}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {s.fields
              .filter((f) => f.dest === undefined || isDestVisible(f.dest, tabs))
              .map((f) => (
                <FieldRow key={f.label} f={f} />
              ))}
          </div>
        </Card>
      ))}
    </>
  )
}

/* ── rail pieces shared by two sections ────────────────────────────────── */

export function ActivityList({ entries, moreDest }: { entries: ActivityEntry[]; moreDest: Dest }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {entries.map((a) => (
        <div key={`${a.who}-${a.what}`} style={{ display: 'flex', alignItems: 'flex-start', gap: 9 }}>
          <span
            style={{
              width: 26,
              height: 26,
              borderRadius: 'var(--r-badge)',
              display: 'grid',
              placeItems: 'center',
              flexShrink: 0,
              background: a.system ? 'var(--nav-active-bg)' : 'var(--card2)',
              color: a.system ? 'var(--nav-active-accent)' : 'var(--text2)',
              border: '1px solid var(--border)',
              fontSize: 'var(--t-th)',
              fontWeight: 700,
            }}
          >
            {a.initials}
          </span>
          <span style={{ minWidth: 0, flex: 1 }}>
            <span style={{ display: 'block', fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)' }}>{a.who}</span>
            <span style={{ display: 'block', fontSize: 'var(--t-th)', color: 'var(--text2)', marginTop: 1 }}>{a.what}</span>
          </span>
          <span style={{ fontSize: 'var(--t-th)', color: 'var(--muted)', whiteSpace: 'nowrap', flexShrink: 0 }}>{a.when}</span>
        </div>
      ))}
      <DestControl dest={moreDest} style={{ ...controlStyle, justifyContent: 'center', width: '100%', marginTop: 2 }}>
        View all activity logs
        {moreDest.kind === 'none' ? <NotBuilt why={moreDest.why} /> : <Icon name="arrow_right" size={13} />}
      </DestControl>
    </div>
  )
}

export function QuickActionList({ actions }: { actions: QuickAction[] }) {
  const shown = useVisible(actions)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {shown.map((a) => (
        <DestControl
          key={a.label}
          dest={a.dest}
          style={{
            ...controlStyle,
            minHeight: 34,
            width: '100%',
            justifyContent: 'flex-start',
            gap: 'var(--sp-sm)',
            fontWeight: 600,
            background: 'var(--card2)',
          }}
        >
          <Icon name={a.icon} size={14} style={{ color: 'var(--muted)', flexShrink: 0 }} />
          <span style={{ flex: 1, textAlign: 'left', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.label}</span>
          {a.dest.kind === 'none' ? <NotBuilt why={a.dest.why} /> : <Icon name="chevron_right" size={13} style={{ color: 'var(--muted)' }} />}
        </DestControl>
      ))}
    </div>
  )
}

/* ── CSV, shared by the config export and the branch export ────────────── */

export function downloadCsv(filename: string, rows: string[][]) {
  const csv = rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(',')).join('\r\n')
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
