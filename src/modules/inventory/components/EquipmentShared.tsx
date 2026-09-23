import type { CSSProperties, ReactNode } from 'react';
import Icon from '../../../components/ui/Icon';
import type { IconName } from '../../../components/ui/Icon';
import { cardStyle } from '../../../components/ui/Page';
import { Badge } from '../../../components/ui/Badge';
import { InfoTooltip } from '../../../components/ui/InfoTooltip';
import type { StatusKey } from '../../../lib/status';
import { CONDITION_TONE } from '../../../lib/queries/inventory';
import { toBs, formatBs, formatAd } from '../../../lib/bs';
import { NEXT_ASSET_CODE, type IntakeCondition } from '../../../lib/queries/addEquipment';

export const inputStyle = (hasError?: boolean): CSSProperties => ({
  width: '100%',
  minHeight: 44,
  padding: '0 10px',
  borderRadius: 'var(--r-input)',
  border: `1px solid ${hasError ? 'var(--danger-text)' : 'var(--input-border)'}`,
  background: 'var(--input-bg)',
  color: 'var(--text)',
  fontSize: 'var(--t-meta)',
  fontFamily: 'inherit',
})

export const fieldRow: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
  gap: 14,
}

export function Field({
  label,
  required,
  error,
  hint,
  children,
  span,
}: {
  label: string
  required?: boolean
  error?: string | null | undefined
  hint?: string | undefined
  children: ReactNode
  span?: number | undefined
}) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 5,
        minWidth: 0,
        ...(span ? { gridColumn: `span ${span}` } : {}),
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <label style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text2)' }}>
          {label} {required && <span style={{ color: 'var(--danger-text)' }}>*</span>}
        </label>
        {hint && <InfoTooltip content={hint} />}
      </div>
      {children}
      {error ? (
        <span style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--sp-xs)', fontSize: 'var(--t-th)', color: 'var(--danger-text)' }}>
          <Icon name="error" size={12} style={{ flexShrink: 0, marginTop: 1 }} />
          {error}
        </span>
      ) : null}
    </div>
  )
}

export function SectionCard({
  id,
  n,
  title,
  note,
  action,
  children,
}: {
  id: string
  n: number
  title: string
  note?: string
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <section id={id} style={{ ...cardStyle, display: 'flex', flexDirection: 'column', minWidth: 0, scrollMarginTop: 84 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
        <span
          style={{
            width: 22,
            height: 22,
            borderRadius: '50%',
            background: 'var(--btn-primary-bg)',
            color: 'var(--btn-primary-fg)',
            display: 'grid',
            placeItems: 'center',
            fontSize: 'var(--t-th)',
            fontWeight: 700,
            flexShrink: 0,
          }}
        >
          {n}
        </span>
        <div style={{ minWidth: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
          <h2 style={{ margin: 0, fontSize: 'var(--t-ui)', fontWeight: 700, color: 'var(--text)' }}>{title}</h2>
          {note && <InfoTooltip content={note} />}
        </div>
        {action && <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>{action}</div>}
      </div>
      <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 14 }}>{children}</div>
    </section>
  )
}

/**
 * §5.4 — the intake condition, badged with the tone Inventory already uses.
 *
 * Delegates to `<Badge>` — DESIGN_DIRECTION_SPEC_v4.1 §8 step 2: "one
 * component rendering the §4 map from lib/status; every screen inherits. No
 * screen colours a status itself."
 *
 * This was the third hand-rolled copy of the same chip (the other two are in
 * `Inventory.tsx`), and like them it reached for `--r-badge` — the 999 pill
 * §3.3 reserves for numeric COUNT badges — at weight 600 in sentence case.
 * It also carried `border: 1px solid ${c.border ?? 'transparent'}`, a branch
 * that exists so the ONE tone with a border (`ext`, the gold mark) can draw
 * it; no condition maps to `ext`, so the branch could only ever emit
 * `transparent`. `<Badge>` owns that decision now.
 *
 * The wrapper is kept because the two files disagree on their input type —
 * this one takes `IntakeCondition` (Add Equipment's intake vocabulary) where
 * Inventory's takes `Condition | null` — and that is exactly the kind of local
 * fact a shared component should not have to know.
 */
export function ConditionBadge({ condition }: { condition: IntakeCondition }) {
  return <Badge tone={CONDITION_TONE[condition] as StatusKey} label={condition} size="sm" />
}

/**
 * §5.3 — status renders as a badge, never a control, and while the record is a
 * Draft the units have no status at all. So the cell states that instead of
 * inventing `Available` the way the render does.
 *
 * Gray is the right hue for it under §4 and `lib/status` both: `neutral` means
 * "not started yet", which is precisely a Draft's units. Same delegation as
 * above; what stays here is the sentence — the label and the tooltip that
 * explains WHY there is no status, which is the only reason this component
 * exists rather than a `<Badge tone="neutral">` at each call site.
 *
 * The `title` needs an element of its own because `<Badge>` takes no `title`:
 * a status block renders its word and nothing else, and a tooltip is not part
 * of §4's block anatomy. Wrapping is the honest way to add one.
 */
export function DraftStatusBadge() {
  return (
    <span
      title="Status is engine-owned. Units take In Stock at creation; a Draft's units have no status."
      style={{ display: 'inline-flex' }}
    >
      <Badge tone="neutral" label="No status · Draft" icon={<Icon name="dot" size={9} />} size="sm" />
    </span>
  )
}

export function Chip({ children, onRemove, icon }: { children: ReactNode; onRemove?: () => void; icon?: IconName }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '4px 9px',
        borderRadius: 'var(--r-badge)',
        background: 'var(--card2)',
        border: '1px solid var(--border)',
        fontSize: 'var(--t-meta)',
        color: 'var(--text)',
      }}
    >
      {icon && <Icon name={icon} size={12} style={{ color: 'var(--link)' }} />}
      {children}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label="Remove"
          style={{ border: 'none', background: 'transparent', color: 'var(--muted)', cursor: 'pointer', padding: 0, display: 'grid', placeItems: 'center' }}
        >
          <Icon name="close" size={12} />
        </button>
      )}
    </span>
  )
}

/** Foundation v1.3 date form — BS above AD, both rendered from one AD instant. */
export function BsAbove({ iso }: { iso: string }) {
  if (!iso) return <span style={{ fontSize: 'var(--t-th)', color: 'var(--muted)' }}>No date set</span>
  const d = new Date(`${iso}T00:00:00Z`)
  if (Number.isNaN(d.getTime())) return <span style={{ fontSize: 'var(--t-th)', color: 'var(--danger-text)' }}>Not a date</span>
  const bs = toBs(d)
  return (
    <span style={{ fontSize: 'var(--t-th)', color: bs ? 'var(--text2)' : 'var(--muted)' }}>
      {bs ? `${formatBs(bs)} · ${formatAd(d)}` : `${formatAd(d)} — BS unavailable outside Shrawan 2083`}
    </span>
  )
}

export const th: CSSProperties = {
  textAlign: 'left',
  padding: '7px 8px',
  fontSize: 'var(--t-th)',
  fontWeight: 600,
  color: 'var(--text2)',
  whiteSpace: 'nowrap',
  borderBottom: '1px solid var(--border)',
}

/*
 * `height` on a `<td>` behaves as a MINIMUM, so this hands every table built
 * on these cells §7.3's row floor ("rows >= 56px") from the token instead of
 * from padding arithmetic. Horizontal padding is unchanged.
 *
 * Its one consumer today is the Stock Units grid in `SectionStockUnits`, which
 * is exactly where the floor earns itself: each row holds a 44px serial input,
 * a 44px condition select and a "Remove unit" button, and at 7 + content + 7
 * those targets overhang the row. They then overlap the neighbouring row, where
 * the later row in the DOM wins the tap — so a tap near a boundary can remove
 * the unit BELOW the one aimed at, or send a scanned serial into another unit's
 * field. Both are data errors that leave no trace on screen. Rows already
 * taller than the floor are unaffected.
 */
export const td: CSSProperties = { height: 'var(--row-min-h)', padding: '7px 8px', fontSize: 'var(--t-meta)', color: 'var(--text)', verticalAlign: 'top' }

export interface UnitDraft {
  id: string
  serial: string
  assetTag: string
  condition: IntakeCondition
  purchaseIso: string
}

export interface ContainedDraft {
  id: string
  modelId: string
  quantity: number
}

export interface FileDraft {
  id: string
  file: File
  url: string
}

/**
 * What the unit's printed label carries. The render's Barcode column reads
 * `EQ000234-SN102`, so the payload is the Asset Code joined to the serial — and
 * where no serial exists yet (§4's whole reason for asset tags: cables, cases,
 * worn plates) it falls back to the asset tag. The QR carries the same string.
 */
export function barcodePayload(u: { serial: string; assetTag: string }): string {
  const s = u.serial.trim()
  return s ? `${NEXT_ASSET_CODE}-${s}` : u.assetTag
}

/** `3 pieces`, `1 unit` — the count and its noun, agreeing. */
export function countOf(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? '' : 's'}`
}

export function formatBytes(n: number): string {
  return n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`
}
