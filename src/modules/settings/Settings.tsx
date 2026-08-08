import { createContext, useContext, useMemo, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import Icon from '../../components/ui/Icon'
import type { IconName } from '../../components/ui/Icon'
import { Card, PageHeader, Button, Rail, FooterNote, cardStyle, SummaryRows } from '../../components/ui/Page'
import { Donut, Legend } from '../../components/ui/Charts'
import { STATUS, BRAND, BRAND_ON } from '../../lib/status'
import type { StatusKey, BrandKey } from '../../lib/status'
import { formatMoney, grouped } from '../../lib/money'
import type { Paisa } from '../../lib/money'
import { toBs, formatBs, formatAd, TODAY } from '../../lib/bs'
import { useCanViewMoney } from '../../lib/moneyVisibility'
import { useTabularLayout } from '../../lib/device'
import {
  canViewMoney,
  canRecordPayment,
  canVoidInvoice,
  canApproveDiscount,
  canOverrideCreditLimit,
  canPerformOperations,
  canManageSettings,
  isStaff,
} from '../../lib/rbac'
import type { SystemRole } from '../../types/database'
import { useTheme } from '../../lib/theme'
import { TEXT_SIZES, applyTextSize, readTextSize } from '../../lib/textSize'
import type { TextSize } from '../../lib/textSize'
import { BRANCH } from '../../data/nav'
import {
  TABS,
  isTabKey,
  ORG,
  ORG_FIELDS,
  BRANCHES,
  BRANCH_STATUS_TOKEN,
  GROUP_FINANCE,
  totalsOf,
  equipmentSlices,
  TRANSFER_STAGES,
  BRANCH_ALERTS,
  SYSTEM_ALERTS,
  PRIORITY_TONE,
  ADMIN_ACTIVITY,
  BRANCH_ACTIVITY,
  BRANCH_INSIGHTS,
  SYSTEM_SUMMARY,
  SYSTEM_STATS,
  QUICK_ACCESS,
  MODULE_GROUPS,
  SYSTEM_QUICK_ACTIONS,
  BRANCH_QUICK_ACTIONS,
  SEED_ERRORS,
} from '../../data/settings'
import type { Branch, BranchStatus, BranchActionKind, Dest, TabKey, ActivityEntry, QuickAction } from '../../data/settings'

/**
 * **Settings — Organization & System Settings + Branch Management.**
 *
 * Built against `03 Core Modules/Settings/Organization.PNG` and
 * `Branch Management.PNG` with their v3.0 specs. The two renders are two panes
 * of *one* screen here: Foundation §5.1 deleted the sidebar's Administration
 * section, which is the only door either render offers to Branch Management, so
 * Settings is now the way in. The tab is linkable — `?tab=branches` — so a
 * pane keeps a URL even though it is not a route.
 *
 * The page that was here (a category rail over General · Localization ·
 * Appearance · Notifications · Security · System) is **extended, not replaced**:
 * every field and every System link it carried is still here, redistributed
 * across the render's own tab set. The theme and text-size selectors are still
 * the live ones.
 *
 * **Deviations from the renders — each one a locked rule, never copy back:**
 *  · both renders carry the old 13–17 item **numbered** sidebar. §5.1 locks 8
 *    unnumbered sections + Settings and the shell owns it.
 *  · the renders tint Quick Access tiles and the branch cards' primary button
 *    violet/indigo; §4.2's five-colour law bans those hues outright. Allowed
 *    families only, and gold is nowhere here because nothing on this screen is
 *    external or sub-rented.
 *  · the render's activity feed reads "role: Warehouse Staff" — the business 8
 *    name it **Warehouse**, and there is one role vocabulary.
 *  · the render's System Summary states `v3.2.0` while the footer bar on the
 *    same page states v3.0.0. The version is read once, from `data/nav`.
 *  · Pokhara's utilisation is 88% on its card and 78% in the table below it.
 *    One derived source resolves it — see `data/settings`.
 *  · every branch card in the render carries a photograph. No image asset
 *    exists, so the tile is the branch mark rather than a fabricated storefront.
 */

/* ── shared style atoms ────────────────────────────────────────────────── */

const th: CSSProperties = {
  textAlign: 'left',
  padding: '9px 10px',
  fontSize: 'var(--t-th)',
  fontWeight: 600,
  color: 'var(--text2)',
  whiteSpace: 'nowrap',
  borderBottom: '1px solid var(--border)',
}

const td: CSSProperties = {
  padding: '10px',
  fontSize: 'var(--t-meta)',
  color: 'var(--text)',
  verticalAlign: 'middle',
  borderBottom: '1px solid var(--border)',
}

const controlStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 5,
  height: 32,
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

function ToneChip({ tone, icon, children }: { tone: StatusKey; icon: IconName; children: ReactNode }) {
  const t = STATUS[tone]
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
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
      {/* §4.2 — colour is never the sole carrier. Icon + label, always. */}
      <Icon name={icon} size={12} fill />
      {children}
    </span>
  )
}

const BRANCH_STATUS_ICON: Record<BranchStatus, IconName> = {
  Active: 'check',
  'Under Setup': 'timer',
  Inactive: 'dot',
  Archived: 'dot',
}

function BranchStatusChip({ status }: { status: BranchStatus }) {
  return (
    <ToneChip tone={BRANCH_STATUS_TOKEN[status]} icon={BRANCH_STATUS_ICON[status]}>
      {status}
    </ToneChip>
  )
}

/** Single-hue progress bar. Length encodes the figure; colour encodes nothing. */
function Meter({ percent, tone = 'success' }: { percent: number; tone?: BrandKey }) {
  const width = Math.max(0, Math.min(100, percent))
  return (
    <span
      role="img"
      aria-label={`${width}% utilization`}
      style={{ display: 'block', height: 6, borderRadius: 999, background: 'var(--divider)', overflow: 'hidden' }}
    >
      <span style={{ display: 'block', width: `${width}%`, height: '100%', background: BRAND[tone] }} />
    </span>
  )
}

/* ── navigation between panes ──────────────────────────────────────────── */

const GoTab = createContext<(tab: TabKey) => void>(() => {})

/**
 * PLAN.md §0 — *no dead controls*. One component renders all three cases a
 * `Dest` can be, so an unbuilt destination is physically unable to render as a
 * live-looking control: it comes out visibly inert with its reason attached.
 */
function DestControl({
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

/** The trailing marker on an inert row — states *that* it is unbuilt; `title` states why. */
function NotBuilt({ why }: { why: string }) {
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

/* ── KPI card with a destination ───────────────────────────────────────── */

interface KpiSpec {
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

const linkStyle: CSSProperties = {
  marginTop: 9,
  alignSelf: 'flex-start',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
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

function KpiCard({ k }: { k: KpiSpec }) {
  return (
    <article className="lift" style={{ ...cardStyle, padding: '13px 14px', minWidth: 0, display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
        <span
          style={{
            width: 30,
            height: 30,
            borderRadius: 8,
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

/* ── settings field rows (the pane that was already here) ──────────────── */

interface Field {
  label: string
  note: string
  /** A value renders as a select; a boolean renders as a switch; a dest renders as a control. */
  value?: string
  on?: boolean
  dest?: Dest
}

interface Section {
  key: string
  title: string
  icon: IconName
  fields: Field[]
}

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
        borderRadius: 999,
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
        style={{ width: 15, height: 15, borderRadius: 999, background: 'var(--card)', display: 'block' }}
      />
    </button>
  )
}

function FieldRow({ f }: { f: Field }) {
  const { theme, setMode } = useTheme()
  const [textSize, setTextSize] = useState<TextSize>(() => readTextSize())

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
      </span>

      {/* §4.3.11 — three options, each setting --ui-scale on the root. Every
          size in §4.3.6 is rem, so one variable moves the whole app. */}
      {f.label === 'Text size' ? (
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
            background: 'var(--input-bg)',
            fontSize: 'var(--t-meta)',
            color: 'var(--text)',
            flexShrink: 0,
          }}
        >
          <span style={{ flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {f.value}
          </span>
          <Icon name="chevron_down" size={13} style={{ color: 'var(--muted)' }} />
        </span>
      )}
    </div>
  )
}

/** One value per field, for the settings export. Never guesses. */
function fieldValue(f: Field): string {
  if (f.value !== undefined) return f.value
  if (f.on !== undefined) return f.on ? 'On' : 'Off'
  if (f.dest === undefined) return '—'
  if (f.dest.kind === 'route') return f.dest.to
  if (f.dest.kind === 'tab') return `Settings ▸ ${f.dest.tab}`
  return `Not built — ${f.dest.why}`
}

function SectionCards({ sections }: { sections: Section[] }) {
  return (
    <>
      {sections.map((s) => (
        <Card key={s.key} title={s.title}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {s.fields.map((f) => (
              <FieldRow key={f.label} f={f} />
            ))}
          </div>
        </Card>
      ))}
    </>
  )
}

/* ── the section content, per tab ──────────────────────────────────────── */

const R = (to: string): Dest => ({ kind: 'route', to })
const N = (why: string): Dest => ({ kind: 'none', why })

/**
 * §5.1 places Administration, Automation Center, Communication Center, AI
 * Assistant and System Monitor **inside Settings** — none keeps a sidebar slot.
 * Their screens were built and routed; what was missing was a door in. This
 * group is that door, and it is unchanged from the page this one extends.
 */
const SYSTEM_LINKS: Field[] = [
  { label: 'Numbering Sequences', note: 'Booking, invoice and asset ID formats.', dest: R('/admin/numbering') },
  { label: 'Audit Settings', note: 'What gets logged, and for how long.', dest: R('/admin/audit') },
  { label: 'Backup & Restore', note: 'Scheduled backups and restore points.', dest: R('/admin/backup') },
  { label: 'Automation Center', note: 'Rules, triggers and scheduled jobs.', dest: R('/automation') },
  { label: 'Notification Center', note: 'Broadcasts, templates and delivery.', dest: R('/notifications') },
  { label: 'SMS Center', note: 'SMS templates, credits and delivery log.', dest: R('/notifications/sms') },
  { label: 'AI Assistant', note: 'Ask about bookings, stock and money.', dest: R('/ai') },
  { label: 'System Monitor', note: 'Services, jobs and incidents.', dest: R('/system') },
  { label: 'Documents', note: 'Every generated invoice, quote and agreement.', dest: R('/documents') },
]

const SECTIONS: Record<Exclude<TabKey, 'overview' | 'branches' | 'users'>, Section[]> = {
  organization: [
    {
      key: 'general',
      title: 'General',
      icon: 'settings',
      fields: [
        { label: 'Organisation name', note: 'Shown on documents and the sidebar.', value: BRANCH.name },
        { label: 'Branch', note: 'The operating branch for this session.', value: BRANCH.address },
        { label: 'VAT number', note: 'Printed on tax invoices.', value: BRANCH.vat.replace(/^VAT:\s*/, '') },
        { label: 'Business description', note: 'One line, used on quotes and the portal.', value: ORG.trading },
      ],
    },
    {
      key: 'localization',
      title: 'Languages & Localization',
      icon: 'calendar',
      fields: [
        { label: 'Calendar mode', note: 'BS leads AD everywhere. Latin digits always.', value: 'BS + AD (Default)' },
        { label: 'Language', note: 'English and Nepali are the two supported interfaces.', value: 'English' },
        { label: 'Timezone', note: 'All dates are stored in UTC and rendered here.', value: 'Asia/Kathmandu (UTC+05:45)' },
        { label: 'Week starts', note: 'Saturday is the weekend in Nepal.', value: 'Sunday' },
        { label: 'Number format', note: 'South Asian grouping — Rs 1,85,000.', value: 'Lakh / crore grouping' },
        { label: 'Units', note: 'Weights on gate passes and transport dockets.', value: 'Metric (kg, cm)' },
        {
          label: 'Translations',
          note: 'The Nepali string catalogue.',
          dest: N('The translation catalogue has no screen in this build.'),
        },
      ],
    },
  ],
  system: [
    {
      key: 'appearance',
      title: 'Appearance',
      icon: 'sun',
      fields: [
        { label: 'Theme', note: 'Light uses a blue primary; dark uses gold.', value: '—' },
        {
          label: 'Text size',
          note: 'Scales the whole application. Additive to browser zoom, not a replacement for it.',
          value: '—',
        },
        { label: 'Density', note: 'Row height across tables.', value: 'Comfortable' },
      ],
    },
    {
      key: 'preferences',
      title: 'System preferences',
      icon: 'settings',
      fields: [
        { label: 'Date format', note: 'AD line under every BS line.', value: 'D MMM YYYY' },
        { label: 'Decimal places', note: 'Whole rupees unless an amount carries paise.', value: '0 (2 when paise exist)' },
        { label: 'Session timeout', note: 'Signed out after this long idle.', value: '30 minutes' },
        { label: 'System maintenance', note: 'Services, jobs and incidents.', dest: R('/system') },
      ],
    },
    { key: 'system', title: 'System', icon: 'activity', fields: SYSTEM_LINKS },
  ],
  financial: [
    {
      key: 'tax',
      title: 'Taxes & fiscal year',
      icon: 'receipt',
      fields: [
        { label: 'VAT rate', note: 'Applied after discount, per Foundation §2.1.', value: '13%' },
        { label: 'Fiscal year', note: 'Nepali fiscal year runs Shrawan – Ashadh.', value: 'FY 2083/84' },
        { label: 'Tax office', note: 'The IRD office this PAN is registered with.', dest: N('IRD registration details were never supplied for this build.') },
        { label: 'Invoice rules', note: 'Numbering, reversal and void behaviour.', dest: R('/admin/numbering') },
      ],
    },
    {
      key: 'currency',
      title: 'Currency & terms',
      icon: 'card',
      fields: [
        { label: 'Default currency', note: 'South Asian grouping — Rs 1,85,000.', value: 'NPR (Rs)' },
        { label: 'Additional currencies', note: 'Quoted only; ledgers stay in NPR.', value: 'USD · EUR · INR' },
        { label: 'Exchange rates', note: 'Rates are pulled from the day-open feed.', dest: N('No rate feed is connected in this build.') },
        { label: 'Payment terms', note: 'Default credit terms on a new invoice.', dest: N('Nobody has set default credit terms — TODO(decision).') },
        { label: 'Late payment penalties', note: 'Interest on an overdue invoice.', dest: N('Nobody has set a penalty rate — TODO(decision).') },
      ],
    },
  ],
  integrations: [
    {
      key: 'gateways',
      title: 'Payment gateways',
      icon: 'card',
      fields: [
        { label: 'Khalti', note: 'Wallet and QR collection.', dest: N('No gateway credentials exist in this build.') },
        { label: 'eSewa', note: 'Wallet and QR collection.', dest: N('No gateway credentials exist in this build.') },
        { label: 'Fonepay', note: 'Inter-bank QR.', dest: N('No gateway credentials exist in this build.') },
        { label: 'ConnectIPS', note: 'Direct bank debit.', dest: N('No gateway credentials exist in this build.') },
        { label: 'Bank transfer & cash', note: 'Recorded by hand against an invoice.', dest: R('/finance') },
      ],
    },
    {
      key: 'apps',
      title: 'Apps & API',
      icon: 'plug',
      fields: [
        { label: 'Accounting', note: 'Xero, Zoho Books, QuickBooks.', dest: N('No accounting connector is built.') },
        { label: 'Calendar', note: 'Google Calendar and Outlook sync.', dest: N('No calendar connector is built — the in-app calendar is not a sync target.') },
        { label: 'Automation & webhooks', note: 'Event triggers and outbound calls.', dest: R('/automation') },
        { label: 'REST API keys', note: 'Tokens for third-party access.', dest: N('Key issuance needs the auth backend, which is not connected.') },
      ],
    },
  ],
  communication: [
    {
      key: 'notifications',
      title: 'Notifications',
      icon: 'bell',
      fields: [
        { label: 'Return reminders', note: 'Sent 24 hours before a return is due.', on: true },
        { label: 'Payment reminders', note: 'Sent when an invoice passes its due date.', on: true },
        { label: 'Low stock alerts', note: 'When a SKU falls below its minimum.', on: true },
        { label: 'Daily digest', note: 'One summary each morning.', on: false },
      ],
    },
    {
      key: 'channels',
      title: 'Channels',
      icon: 'mail',
      fields: [
        { label: 'Email', note: 'Transactional mail and document delivery.', dest: R('/notifications') },
        { label: 'SMS', note: 'Templates, credits and the delivery log.', dest: R('/notifications/sms') },
        { label: 'WhatsApp Business', note: 'Session and template messaging.', dest: N('No WhatsApp Business number is provisioned in this build.') },
        { label: 'Push notifications', note: 'Device push for the operations queues.', dest: N('Push requires a registered service worker key, which is not provisioned.') },
        { label: 'Notification templates', note: 'Wording for every automatic message.', dest: R('/notifications') },
      ],
    },
  ],
  security: [
    {
      key: 'access',
      title: 'Access',
      icon: 'crew',
      fields: [
        { label: 'Two-factor authentication', note: 'Required for Owner and Admin roles.', on: true },
        { label: 'Session timeout', note: 'Signed out after this long idle.', value: '30 minutes' },
        { label: 'Password policy', note: 'Min 12 chars, mixed case, number, symbol. 90-day expiry.', value: 'Strict' },
        { label: 'Shared-device screen lock', note: 'Locks the tablet between operators.', on: true },
      ],
    },
    {
      key: 'controls',
      title: 'Controls & logs',
      icon: 'file',
      fields: [
        { label: 'Data access levels', note: 'Warehouse, Technician, Driver and Client see no money — enforced by RLS, not the UI.', dest: { kind: 'tab', tab: 'users' } },
        { label: 'IP access control', note: 'Allow-listed ranges for staff sign-in.', dest: N('IP allow-listing is enforced server side; no console exists yet.') },
        { label: 'Login history', note: 'Every sign-in, device and location.', dest: N('Login history needs the auth backend, which is not connected.') },
        { label: 'Audit trail', note: 'Immutable record of every write.', dest: R('/admin/audit') },
      ],
    },
  ],
  ai: [
    {
      key: 'ai',
      title: 'AI',
      icon: 'sparkles',
      fields: [
        { label: 'AI Assistant', note: 'Ask about bookings, stock and money.', dest: R('/ai') },
        { label: 'AI usage logs', note: 'Every prompt, its cost and who ran it.', dest: R('/ai') },
        { label: 'AI models', note: 'Which model answers which question.', dest: N('Model selection is a deployment concern, not a screen in this build.') },
        { label: 'AI permissions', note: 'Money-blind roles get money-blind answers.', dest: { kind: 'tab', tab: 'users' } },
      ],
    },
    {
      key: 'automation',
      title: 'Automation',
      icon: 'automation',
      fields: [
        { label: 'Automation Center', note: 'Rules, triggers and scheduled jobs.', dest: R('/automation') },
        { label: 'Escalation rules', note: 'What happens when an approval stalls.', dest: R('/automation') },
        { label: 'Approval workflows', note: 'Discount, expense, purchase and write-off chains.', dest: N('Approval workflows have no screen in this build.') },
      ],
    },
  ],
}

/* ── rail pieces ───────────────────────────────────────────────────────── */

function ActivityList({ entries, moreDest }: { entries: ActivityEntry[]; moreDest: Dest }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {entries.map((a) => (
        <div key={`${a.who}-${a.what}`} style={{ display: 'flex', alignItems: 'flex-start', gap: 9 }}>
          <span
            style={{
              width: 26,
              height: 26,
              borderRadius: 999,
              display: 'grid',
              placeItems: 'center',
              flexShrink: 0,
              background: a.system ? 'var(--nav-active-bg)' : 'var(--card2)',
              color: a.system ? 'var(--nav-active-accent)' : 'var(--text2)',
              border: '1px solid var(--border)',
              fontSize: 10,
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

function QuickActionList({ actions }: { actions: QuickAction[] }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {actions.map((a) => (
        <DestControl
          key={a.label}
          dest={a.dest}
          style={{
            ...controlStyle,
            height: 34,
            width: '100%',
            justifyContent: 'flex-start',
            gap: 8,
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

/* ── Overview pane ─────────────────────────────────────────────────────── */

function OverviewPane() {
  const t = useMemo(() => totalsOf(BRANCHES), [])

  const kpis: KpiSpec[] = [
    {
      label: 'Total Branches',
      value: String(t.branches),
      icon: 'home',
      accent: 'primary',
      note: `${t.activeBranches} active`,
      linkLabel: 'Manage branches',
      dest: { kind: 'tab', tab: 'branches' },
    },
    {
      label: 'Total Warehouses',
      value: String(t.warehouses),
      icon: 'box',
      accent: 'primary',
      note: 'Across all branches',
      linkLabel: 'Open warehouses',
      dest: R('/inventory/warehouses'),
    },
    {
      label: 'Active Users',
      value: String(SYSTEM_STATS.activeUsers),
      icon: 'users',
      accent: 'success',
      note: 'Staff accounts in use',
      linkLabel: 'Users & roles',
      dest: { kind: 'tab', tab: 'users' },
    },
    {
      label: 'System Uptime',
      value: SYSTEM_STATS.uptime,
      icon: 'activity',
      accent: 'success',
      note: 'Last 30 days',
      linkLabel: 'System monitor',
      dest: R('/system'),
    },
    {
      label: 'Active Sessions',
      value: String(SYSTEM_STATS.activeSessions),
      icon: 'crew',
      accent: 'progress',
      note: 'Signed in right now',
      linkLabel: 'System monitor',
      dest: R('/system'),
    },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)', minWidth: 0 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(300px, 360px) minmax(0,1fr)', gap: 'var(--sp-md)', alignItems: 'start' }}>
        {/* Organization profile */}
        <Card
          title="Organization Profile"
          action={
            <DestControl
              dest={{ kind: 'tab', tab: 'organization' }}
              style={{ ...controlStyle, height: 28, padding: '0 9px', fontSize: 'var(--t-th)' }}
            >
              <Icon name="settings" size={12} />
              Edit profile
            </DestControl>
          }
        >
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            <span
              style={{
                width: 52,
                height: 52,
                borderRadius: 12,
                display: 'grid',
                placeItems: 'center',
                background: 'var(--nav-active-bg)',
                color: 'var(--nav-active-accent)',
                fontWeight: 800,
                fontSize: 18,
                flexShrink: 0,
                letterSpacing: '-0.02em',
              }}
            >
              {ORG.mark}
            </span>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 'var(--t-h3)', fontWeight: 700, color: 'var(--text)' }}>{ORG.legalName}</span>
                {ORG.verified && (
                  <ToneChip tone="in" icon="check">
                    Verified
                  </ToneChip>
                )}
              </div>
              <div style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)', marginTop: 3 }}>{ORG.trading}</div>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 12 }}>
            {ORG_FIELDS.map((f) => (
              <div
                key={f.label}
                style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '8px 0', borderTop: '1px solid var(--border)' }}
              >
                <Icon name={f.icon} size={14} style={{ color: 'var(--muted)', flexShrink: 0 }} />
                <span style={{ fontSize: 'var(--t-th)', color: 'var(--muted)', width: 108, flexShrink: 0 }}>{f.label}</span>
                <span
                  style={{
                    fontSize: 'var(--t-meta)',
                    color: 'var(--text)',
                    fontWeight: 600,
                    minWidth: 0,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {f.value}
                </span>
              </div>
            ))}
          </div>
        </Card>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)', minWidth: 0 }}>
          <section
            aria-label="Key figures"
            style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(168px, 1fr))', gap: 'var(--sp-md)' }}
          >
            {kpis.map((k) => (
              <KpiCard key={k.label} k={k} />
            ))}
          </section>

          <Card title="Quick Access">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(126px, 1fr))', gap: 10 }}>
              {QUICK_ACCESS.map((q) => (
                <DestControl
                  key={q.label}
                  dest={q.dest}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 7,
                    minHeight: 84,
                    padding: '12px 8px',
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
                  }}
                >
                  <Icon name={q.icon} size={19} style={{ color: 'var(--nav-active-accent)' }} />
                  <span style={{ lineHeight: 1.25 }}>{q.label}</span>
                  {q.dest.kind === 'none' && <NotBuilt why={q.dest.why} />}
                </DestControl>
              ))}
            </div>
          </Card>
        </div>
      </div>

      <Card
        title="Administration Modules"
        action={
          <span style={{ fontSize: 'var(--t-th)', color: 'var(--muted)' }}>
            A row marked <strong style={{ color: 'var(--text2)' }}>Not built</strong> has no screen in this build — hover it for
            the reason. Nothing is hidden behind it.
          </span>
        }
      >
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(232px, 1fr))', gap: 'var(--sp-md)' }}>
          {MODULE_GROUPS.map((g) => (
            <section key={g.title} style={{ ...cardStyle, background: 'var(--card2)', minWidth: 0 }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 7,
                  padding: '9px 11px',
                  borderBottom: '1px solid var(--border)',
                }}
              >
                <Icon name={g.icon} size={14} style={{ color: 'var(--nav-active-accent)', flexShrink: 0 }} />
                <h3 style={{ margin: 0, fontSize: 'var(--t-meta)', fontWeight: 700, color: 'var(--text)' }}>{g.title}</h3>
              </div>
              <div style={{ padding: 5, display: 'flex', flexDirection: 'column' }}>
                {g.rows.map((r) => (
                  <DestControl
                    key={r.label}
                    dest={r.dest}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      width: '100%',
                      padding: '7px 8px',
                      borderRadius: 7,
                      border: '1px solid transparent',
                      background: 'transparent',
                      color: 'var(--text2)',
                      fontSize: 'var(--t-meta)',
                      fontWeight: 500,
                      fontFamily: 'inherit',
                      textAlign: 'left',
                      textDecoration: 'none',
                      cursor: 'pointer',
                    }}
                  >
                    <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {r.label}
                    </span>
                    {r.dest.kind === 'none' ? (
                      <NotBuilt why={r.dest.why} />
                    ) : (
                      <Icon name="chevron_right" size={13} style={{ color: 'var(--muted)', flexShrink: 0 }} />
                    )}
                  </DestControl>
                ))}
              </div>
            </section>
          ))}
        </div>
      </Card>
    </div>
  )
}

function OverviewRail() {
  return (
    <>
      <Card title="System Summary">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {SYSTEM_SUMMARY.map((r) => (
            <div key={r.label} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 'var(--t-meta)' }}>
              <span style={{ color: 'var(--text2)', minWidth: 0, flex: 1 }}>{r.label}</span>
              <span
                className="figure"
                style={{
                  fontWeight: 600,
                  whiteSpace: 'nowrap',
                  color: r.tone === 'good' ? 'var(--success-text)' : r.tone === 'warn' ? 'var(--progress-text)' : 'var(--text)',
                }}
              >
                {r.value}
              </span>
            </div>
          ))}
        </div>
      </Card>

      <Card title="Quick Actions">
        <QuickActionList actions={SYSTEM_QUICK_ACTIONS} />
      </Card>

      <Card title="Important Alerts">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {SYSTEM_ALERTS.map((a) => (
            <DestControl
              key={a.text}
              dest={a.dest}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                width: '100%',
                padding: '8px 9px',
                borderRadius: 8,
                border: '1px solid var(--border)',
                background: 'var(--card2)',
                color: 'var(--text)',
                fontSize: 'var(--t-meta)',
                fontWeight: 500,
                fontFamily: 'inherit',
                textAlign: 'left',
                textDecoration: 'none',
                cursor: 'pointer',
              }}
            >
              <Icon name={a.icon} size={14} style={{ color: STATUS[PRIORITY_TONE[a.priority]].fg, flexShrink: 0 }} />
              <span style={{ flex: 1, minWidth: 0 }}>{a.text}</span>
              <ToneChip tone={PRIORITY_TONE[a.priority]} icon="flag">
                {a.priority}
              </ToneChip>
            </DestControl>
          ))}
        </div>
      </Card>

      <Card title="Recent Activity">
        <ActivityList entries={ADMIN_ACTIVITY} moreDest={R('/admin/audit')} />
      </Card>
    </>
  )
}

/* ── Users & Roles pane ────────────────────────────────────────────────── */

const ROLES: SystemRole[] = ['Owner', 'Admin', 'Coordinator', 'Warehouse', 'Technician', 'Accounts', 'Driver', 'Client']

/**
 * The matrix is **computed by `lib/rbac`**, never transcribed. Every cell calls
 * the same function the screens call, which mirrors migration 0014 — so this
 * table cannot claim a capability that RLS denies, or the reverse.
 */
const CAPABILITIES: Array<{ label: string; note: string; test: (r: SystemRole) => boolean }> = [
  { label: 'Staff surface', note: 'Client is external — portal only.', test: isStaff },
  { label: 'See money', note: 'Warehouse, Technician, Driver and Client see none, anywhere.', test: canViewMoney },
  { label: 'Record payment', note: 'Advances and security deposits.', test: (r) => canRecordPayment(r) },
  { label: 'Void invoice', note: 'Corrections are reversal rows, never edits.', test: (r) => canVoidInvoice(r) },
  { label: 'Approve 15% discount', note: 'Above 10% needs a reason and an approver.', test: (r) => canApproveDiscount(r, 15) },
  { label: 'Override credit limit', note: 'Book past a client’s ceiling.', test: (r) => canOverrideCreditLimit(r) },
  { label: 'Run operations', note: 'Pack, handover, return, reset.', test: canPerformOperations },
  { label: 'Manage settings', note: 'This screen, and everything under it.', test: canManageSettings },
]

function UsersPane() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)', minWidth: 0 }}>
      <Card
        title="Permissions Matrix"
        action={<span style={{ fontSize: 'var(--t-th)', color: 'var(--muted)' }}>Computed live from lib/rbac — not a copy of it</span>}
      >
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
            <thead>
              <tr>
                <th style={{ ...th, position: 'sticky', left: 0, background: 'var(--card)' }}>Capability</th>
                {ROLES.map((r) => (
                  <th key={r} style={{ ...th, textAlign: 'center' }}>
                    {r}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {CAPABILITIES.map((c) => (
                <tr key={c.label}>
                  <td style={{ ...td, position: 'sticky', left: 0, background: 'var(--card)' }}>
                    <span style={{ display: 'block', fontWeight: 600 }}>{c.label}</span>
                    <span style={{ display: 'block', fontSize: 'var(--t-th)', color: 'var(--text2)', marginTop: 1 }}>{c.note}</span>
                  </td>
                  {ROLES.map((r) => {
                    const ok = c.test(r)
                    return (
                      <td key={r} style={{ ...td, textAlign: 'center' }}>
                        {/* Never colour alone — glyph and word together. */}
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                            fontSize: 'var(--t-th)',
                            fontWeight: 700,
                            color: ok ? 'var(--success-text)' : 'var(--muted)',
                          }}
                        >
                          <Icon name={ok ? 'check' : 'close'} size={13} fill />
                          {ok ? 'Yes' : 'No'}
                        </span>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px,1fr))', gap: 'var(--sp-md)' }}>
        <Card title="Roles">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {ROLES.map((r) => (
              <div
                key={r}
                style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '8px 0', borderBottom: '1px solid var(--border)' }}
              >
                <span style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)', flex: 1 }}>{r}</span>
                {canViewMoney(r) ? (
                  <ToneChip tone="primary" icon="dollar">
                    Sees money
                  </ToneChip>
                ) : (
                  <ToneChip tone="neutral" icon="eye">
                    Money-blind
                  </ToneChip>
                )}
                {!isStaff(r) && (
                  <ToneChip tone="progress" icon="external_link">
                    External
                  </ToneChip>
                )}
              </div>
            ))}
          </div>
        </Card>

        <Card title="Branch managers">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {BRANCHES.map((b) => (
              <div
                key={b.id}
                style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '8px 0', borderBottom: '1px solid var(--border)' }}
              >
                <span style={{ minWidth: 0, flex: 1 }}>
                  <span style={{ display: 'block', fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)' }}>
                    {b.manager}
                  </span>
                  <span style={{ display: 'block', fontSize: 'var(--t-th)', color: 'var(--text2)' }}>
                    {b.name} · {b.staff} staff
                  </span>
                </span>
                <span className="identifier" style={{ fontSize: 'var(--t-th)', color: 'var(--muted)' }}>
                  {b.code}
                </span>
              </div>
            ))}
            <p style={{ margin: '4px 0 0', fontSize: 'var(--t-th)', color: 'var(--muted)', lineHeight: 1.5 }}>
              {SYSTEM_STATS.activeUsers} staff accounts exist. The full directory, user creation and role assignment need the
              auth backend, which is not connected in this build — only the branch managers named in the branch records can be
              listed here.
            </p>
          </div>
        </Card>
      </div>
    </div>
  )
}

/* ── Branches pane ─────────────────────────────────────────────────────── */

const STATUS_FILTERS: Array<'All' | BranchStatus> = ['All', 'Active', 'Under Setup', 'Inactive', 'Archived']

function downloadCsv(filename: string, rows: string[][]) {
  const csv = rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(',')).join('\r\n')
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

/**
 * One writer for the branch export, so the header button and the Branch List
 * button cannot drift apart — and so §8.3 is obeyed once: for a money-blind
 * session the Revenue column is never pushed into the header, which means the
 * file has no column to leave blank.
 */
function branchCsvRows(rows: Branch[], money: boolean): string[][] {
  const header = ['Branch', 'Code', 'Manager', 'City', 'Phone', 'Staff', 'Warehouses', 'Equipment']
  if (money) header.push('Revenue (This Month)')
  header.push('Utilization', 'Status')
  const body = rows.map((b) => {
    const cells = [b.name, b.code, b.manager, b.city, b.phone, String(b.staff), String(b.warehouses), String(b.equipment)]
    if (money) cells.push(formatMoney(b.revenue))
    cells.push(`${b.utilization}%`, b.status)
    return cells
  })
  return [header, ...body]
}

/* ── branch table sorting ──────────────────────────────────────────────── */

/** `Branch Management.md` §Branch Table — *Supports Column Sorting*. */
type SortKey = 'name' | 'code' | 'manager' | 'city' | 'phone' | 'staff' | 'warehouses' | 'equipment' | 'revenue' | 'utilization' | 'status'

interface SortState {
  key: SortKey
  dir: 'asc' | 'desc'
}

/**
 * A total map, so a sortable header cannot be added without giving it something
 * to sort on. Paisa sorts as the integer it is — never as its formatted string,
 * which would order Rs 8,74,200 above Rs 12,45,300.
 */
const SORT_VALUE: Record<SortKey, (b: Branch) => string | number> = {
  name: (b) => b.name,
  code: (b) => b.code,
  manager: (b) => b.manager,
  city: (b) => b.city,
  phone: (b) => b.phone,
  staff: (b) => b.staff,
  warehouses: (b) => b.warehouses,
  equipment: (b) => b.equipment,
  revenue: (b) => b.revenue,
  utilization: (b) => b.utilization,
  status: (b) => b.status,
}

function sortBranches(rows: Branch[], sort: SortState | null): Branch[] {
  if (!sort) return rows
  const read = SORT_VALUE[sort.key]
  const dir = sort.dir === 'asc' ? 1 : -1
  return [...rows].sort((a, b) => {
    const av = read(a)
    const bv = read(b)
    const n =
      typeof av === 'number' && typeof bv === 'number'
        ? av - bv
        : String(av).localeCompare(String(bv), undefined, { numeric: true })
    return n * dir
  })
}

/**
 * Three states, not two: ascending → descending → **off**, so the seed order the
 * render shows is always one more click away rather than lost for the session.
 */
function nextSort(current: SortState | null, key: SortKey): SortState | null {
  if (current === null || current.key !== key) return { key, dir: 'asc' }
  if (current.dir === 'asc') return { key, dir: 'desc' }
  return null
}

function SortHeader({
  label,
  sortKey,
  sort,
  onSort,
  align = 'left',
}: {
  label: string
  sortKey: SortKey
  sort: SortState | null
  onSort: (key: SortKey) => void
  align?: 'left' | 'right'
}) {
  const on = sort !== null && sort.key === sortKey
  const dir = on && sort !== null ? sort.dir : null

  return (
    <th
      scope="col"
      aria-sort={dir === 'asc' ? 'ascending' : dir === 'desc' ? 'descending' : 'none'}
      style={{ ...th, padding: 0, textAlign: align }}
    >
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        title={dir === 'asc' ? `Sorted by ${label}, ascending — click for descending` : dir === 'desc' ? `Sorted by ${label}, descending — click to clear` : `Sort by ${label}`}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: align === 'right' ? 'flex-end' : 'flex-start',
          gap: 4,
          width: '100%',
          padding: '9px 10px',
          border: 'none',
          background: 'transparent',
          font: 'inherit',
          fontSize: 'var(--t-th)',
          fontWeight: on ? 700 : 600,
          color: on ? 'var(--nav-active-accent)' : 'var(--text2)',
          cursor: 'pointer',
          whiteSpace: 'nowrap',
        }}
      >
        {label}
        <Icon
          name={dir === 'desc' ? 'arrow_down' : dir === 'asc' ? 'arrow_up' : 'chevron_down'}
          size={11}
          style={{ color: on ? 'var(--nav-active-accent)' : 'var(--muted)', opacity: on ? 1 : 0.5, flexShrink: 0 }}
        />
      </button>
    </th>
  )
}

function BranchesPane({
  money,
  rows,
  setRows,
  addOpen,
  setAddOpen,
}: {
  money: boolean
  /** Held by the page, not the pane — the rail and the header export read the
      same list, so a branch added this session shows up in all three. */
  rows: Branch[]
  setRows: (next: Branch[]) => void
  addOpen: boolean
  setAddOpen: (v: boolean) => void
}) {
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<'All' | BranchStatus>('All')
  const [sort, setSort] = useState<SortState | null>(null)
  const [perPage, setPerPage] = useState(10)
  const [page, setPage] = useState(1)
  const [focused, setFocused] = useState<string | null>(null)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return rows.filter((b) => {
      if (status !== 'All' && b.status !== status) return false
      if (!q) return true
      return (
        b.name.toLowerCase().includes(q) ||
        b.code.toLowerCase().includes(q) ||
        b.manager.toLowerCase().includes(q) ||
        b.city.toLowerCase().includes(q) ||
        b.phone.toLowerCase().includes(q)
      )
    })
  }, [rows, query, status])

  const ordered = useMemo(() => sortBranches(filtered, sort), [filtered, sort])

  const t = useMemo(() => totalsOf(filtered), [filtered])
  const slices = useMemo(() => equipmentSlices(), [])
  const pageCount = Math.max(1, Math.ceil(ordered.length / perPage))
  const current = Math.min(page, pageCount)
  const shown = ordered.slice((current - 1) * perPage, current * perPage)

  const onSort = (key: SortKey) => {
    setSort((s) => nextSort(s, key))
    setPage(1)
  }
  const focusedBranch = focused ? rows.find((b) => b.id === focused) : undefined
  const scoped = status !== 'All' || query.trim() !== ''

  const kpis: KpiSpec[] = [
    {
      label: 'Total Branches',
      value: String(t.branches),
      icon: 'home',
      accent: 'primary',
      note: scoped ? 'Matching this filter' : 'All branches',
      linkLabel: 'View all',
      onAction: () => {
        setStatus('All')
        setQuery('')
        setPage(1)
      },
    },
    {
      label: 'Active Branches',
      value: String(t.activeBranches),
      icon: 'check',
      accent: 'success',
      note: `${t.branches === 0 ? 0 : Math.round((t.activeBranches / t.branches) * 100)}% active`,
      linkLabel: 'View active',
      onAction: () => {
        setStatus('Active')
        setPage(1)
      },
    },
    {
      label: 'Warehouses',
      value: String(t.warehouses),
      icon: 'box',
      accent: 'primary',
      note: 'Across the selection',
      linkLabel: 'Open warehouses',
      dest: R('/inventory/warehouses'),
    },
    {
      label: 'Active Staff',
      value: String(t.staff),
      icon: 'users',
      accent: 'progress',
      note: 'Across the selection',
      linkLabel: 'View staff',
      dest: R('/crew'),
    },
  ]

  /*
   * §8.3 — money is STRUCTURALLY ABSENT for Warehouse, Technician, Driver and
   * Client. The two money tiles are never pushed into the array, the Revenue
   * column never enters the header, and the Branch Performance card is not
   * rendered at all. Nothing is masked, blurred or dashed.
   */
  if (money) {
    kpis.push(
      {
        label: 'Equipment Value',
        value: formatMoney(GROUP_FINANCE.equipmentValue),
        icon: 'package',
        accent: 'primary',
        note: 'Total book value, all branches',
        linkLabel: 'View details',
        dest: R('/inventory'),
      },
      {
        label: 'Monthly Revenue',
        value: formatMoney(t.revenue),
        icon: 'dollar',
        accent: 'success',
        note: 'vs last month',
        linkLabel: 'View report',
        dest: R('/reports/pulse'),
        delta: { direction: t.growthPercent >= 0 ? 'up' : 'down', text: `${Math.abs(t.growthPercent).toFixed(1)}%` },
      },
    )
  }

  /** Exports what the table is actually showing — this filter, this sort order. */
  const exportCsv = () => downloadCsv('babin-branches.csv', branchCsvRows(ordered, money))

  const addBranch = (b: Branch) => {
    setRows([...rows, b])
    setAddOpen(false)
    setFocused(null)
    setStatus('All')
    setQuery('')
    setSort(null)
    setPage(Math.ceil((rows.length + 1) / perPage))
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)', minWidth: 0 }}>
      <section
        aria-label="Key figures"
        style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(168px, 1fr))', gap: 'var(--sp-md)' }}
      >
        {kpis.map((k) => (
          <KpiCard key={k.label} k={k} />
        ))}
      </section>

      {/* Branch cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 'var(--sp-md)' }}>
        {rows.map((b) => (
          <article key={b.id} style={{ ...cardStyle, padding: 14, display: 'flex', flexDirection: 'column', gap: 11, minWidth: 0 }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              {/* The render puts a storefront photograph here; no image asset exists. */}
              <span
                style={{
                  width: 62,
                  height: 62,
                  borderRadius: 10,
                  display: 'grid',
                  placeItems: 'center',
                  background: 'var(--card2)',
                  border: '1px solid var(--border)',
                  color: 'var(--nav-active-accent)',
                  flexShrink: 0,
                }}
              >
                <Icon name="home" size={24} fill />
              </span>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 'var(--t-ui)', fontWeight: 700, color: 'var(--text)' }}>{b.name}</span>
                  <BranchStatusChip status={b.status} />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 4, flexWrap: 'wrap' }}>
                  <span
                    className="identifier"
                    style={{
                      fontSize: 'var(--t-th)',
                      fontWeight: 700,
                      color: 'var(--nav-active-accent)',
                      background: 'var(--nav-active-bg)',
                      borderRadius: 'var(--r-badge)',
                      padding: '1px 7px',
                    }}
                  >
                    {b.code}
                  </span>
                  <span style={{ fontSize: 'var(--t-th)', color: 'var(--muted)' }}>Manager · {b.manager}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, fontSize: 'var(--t-th)', color: 'var(--text2)' }}>
                  <Icon name="home" size={12} style={{ color: 'var(--muted)' }} />
                  {b.address}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3, fontSize: 'var(--t-th)', color: 'var(--text2)' }}>
                  <Icon name="phone" size={12} style={{ color: 'var(--muted)' }} />
                  {b.phone}
                </div>
              </div>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: money ? 'repeat(4, minmax(0,1fr))' : 'repeat(3, minmax(0,1fr))',
                gap: 8,
                paddingTop: 10,
                borderTop: '1px solid var(--border)',
              }}
            >
              <Stat icon="box" label="Warehouses" value={String(b.warehouses)} />
              <Stat icon="users" label="Staff" value={String(b.staff)} />
              <Stat icon="package" label="Equipment" value={grouped(b.equipment)} />
              {money && <Stat icon="dollar" label="Revenue (This Month)" value={formatMoney(b.revenue)} />}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
              <span style={{ fontSize: 'var(--t-th)', color: 'var(--text2)', flexShrink: 0 }}>Utilization</span>
              <span style={{ flex: 1, minWidth: 40 }}>
                <Meter percent={b.utilization} />
              </span>
              <span className="figure" style={{ fontSize: 'var(--t-th)', fontWeight: 700, color: 'var(--text)' }}>
                {b.utilization}%
              </span>
            </div>

            <button
              type="button"
              onClick={() => {
                setFocused(b.id)
                setPage(1)
              }}
              style={{ ...controlStyle, width: '100%', justifyContent: 'center', height: 34, background: 'var(--card2)' }}
            >
              View Branch Profile
              <Icon name="arrow_right" size={13} />
            </button>
          </article>
        ))}
      </div>

      {/* Branch profile — partial, and says so */}
      {focusedBranch && (
        <Card
          title={`Branch Profile — ${focusedBranch.name}`}
          action={
            <button type="button" onClick={() => setFocused(null)} style={{ ...controlStyle, height: 28, fontSize: 'var(--t-th)' }}>
              <Icon name="chevron_left" size={12} />
              Back to all branches
            </button>
          }
        >
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px,1fr))', gap: 'var(--sp-md)' }}>
            <SummaryRows
              rows={[
                { label: 'Branch code', value: focusedBranch.code },
                { label: 'Status', value: focusedBranch.status },
                { label: 'Manager', value: focusedBranch.manager },
                { label: 'City', value: focusedBranch.city },
                { label: 'Address', value: focusedBranch.address },
                { label: 'Phone', value: focusedBranch.phone },
              ]}
            />
            <SummaryRows
              rows={[
                { label: 'Warehouses', value: String(focusedBranch.warehouses) },
                { label: 'Staff', value: String(focusedBranch.staff) },
                { label: 'Equipment', value: grouped(focusedBranch.equipment) },
                { label: 'Utilization', value: `${focusedBranch.utilization}%` },
                ...(money
                  ? [
                      { label: 'Revenue (This Month)', value: formatMoney(focusedBranch.revenue), tone: 'success' as BrandKey },
                      {
                        label: 'Growth vs last month',
                        value: `${focusedBranch.growthPercent >= 0 ? '+' : ''}${focusedBranch.growthPercent}%`,
                        tone: (focusedBranch.growthPercent >= 0 ? 'success' : 'danger') as BrandKey,
                      },
                    ]
                  : []),
              ]}
            />
            <p style={{ margin: 0, fontSize: 'var(--t-meta)', color: 'var(--text2)', lineHeight: 1.55 }}>
              This is every field the branch record holds. The rest of the profile in the spec — province and ward, GPS,
              company registration and branch licence, the warehouse and staff rosters, financial summary, documents and audit
              history — has no data behind it in this build, so it is not shown rather than shown empty.
              <br />
              <Link to="/inventory/warehouses" style={{ color: 'var(--link)', fontWeight: 600 }}>
                Warehouses for this branch live in Inventory ▸ Warehouses →
              </Link>
            </p>
          </div>
        </Card>
      )}

      {/* Branch list */}
      <Card
        title="Branch List"
        action={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <Icon name="search" size={13} style={{ color: 'var(--muted)' }} />
              <span className="sr-only" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
                Search branch
              </span>
              <input
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value)
                  setPage(1)
                }}
                placeholder="Search branch, code, manager, city…"
                style={{
                  height: 30,
                  width: 216,
                  padding: '0 9px',
                  borderRadius: 'var(--r-input)',
                  border: '1px solid var(--input-border)',
                  background: 'var(--input-bg)',
                  color: 'var(--text)',
                  fontSize: 'var(--t-meta)',
                  fontFamily: 'inherit',
                }}
              />
            </label>
            <select
              value={status}
              onChange={(e) => {
                setStatus(e.target.value as 'All' | BranchStatus)
                setPage(1)
              }}
              aria-label="Filter by status"
              style={{
                height: 30,
                padding: '0 8px',
                borderRadius: 'var(--r-input)',
                border: '1px solid var(--input-border)',
                background: 'var(--input-bg)',
                color: 'var(--text)',
                fontSize: 'var(--t-meta)',
                fontFamily: 'inherit',
              }}
            >
              {STATUS_FILTERS.map((s) => (
                <option key={s} value={s}>
                  {s === 'All' ? 'All status' : s}
                </option>
              ))}
            </select>
            <button type="button" onClick={exportCsv} style={{ ...controlStyle, height: 30, fontSize: 'var(--t-th)' }}>
              <Icon name="download" size={12} />
              Export CSV
            </button>
          </div>
        }
      >
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 860 }}>
            <thead>
              <tr>
                <SortHeader label="Branch" sortKey="name" sort={sort} onSort={onSort} />
                <SortHeader label="Code" sortKey="code" sort={sort} onSort={onSort} />
                <SortHeader label="Manager" sortKey="manager" sort={sort} onSort={onSort} />
                <SortHeader label="City" sortKey="city" sort={sort} onSort={onSort} />
                <SortHeader label="Phone" sortKey="phone" sort={sort} onSort={onSort} />
                <SortHeader label="Staff" sortKey="staff" sort={sort} onSort={onSort} align="right" />
                <SortHeader label="Warehouses" sortKey="warehouses" sort={sort} onSort={onSort} align="right" />
                <SortHeader label="Equipment" sortKey="equipment" sort={sort} onSort={onSort} align="right" />
                {/* §8.3 — the column is absent for a money-blind session, so its
                    sort key is unreachable rather than disabled. */}
                {money && <SortHeader label="Revenue (This Month)" sortKey="revenue" sort={sort} onSort={onSort} align="right" />}
                <SortHeader label="Utilization" sortKey="utilization" sort={sort} onSort={onSort} />
                <SortHeader label="Status" sortKey="status" sort={sort} onSort={onSort} />
                <th scope="col" style={{ ...th, textAlign: 'right' }}>
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {shown.map((b) => (
                <tr key={b.id}>
                  <td style={{ ...td, fontWeight: 600 }}>{b.name}</td>
                  <td style={td}>
                    <span className="identifier" style={{ color: 'var(--text2)' }}>
                      {b.code}
                    </span>
                  </td>
                  <td style={td}>{b.manager}</td>
                  <td style={td}>{b.city}</td>
                  <td style={{ ...td, whiteSpace: 'nowrap' }}>{b.phone}</td>
                  <td style={{ ...td, textAlign: 'right' }} className="figure">
                    {b.staff}
                  </td>
                  <td style={{ ...td, textAlign: 'right' }} className="figure">
                    {b.warehouses}
                  </td>
                  <td style={{ ...td, textAlign: 'right' }} className="figure">
                    {grouped(b.equipment)}
                  </td>
                  {money && (
                    <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }} className="figure">
                      {formatMoney(b.revenue)}
                    </td>
                  )}
                  <td style={{ ...td, minWidth: 110 }}>
                    <span className="figure" style={{ fontSize: 'var(--t-th)', fontWeight: 700 }}>
                      {b.utilization}%
                    </span>
                    <Meter percent={b.utilization} />
                  </td>
                  <td style={td}>
                    <BranchStatusChip status={b.status} />
                  </td>
                  <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <button
                      type="button"
                      onClick={() => {
                        setFocused(b.id)
                        setPage(1)
                      }}
                      title={`Open the ${b.name} profile`}
                      style={{ ...controlStyle, height: 28, padding: '0 9px', fontSize: 'var(--t-th)' }}
                    >
                      <Icon name="eye" size={12} />
                      Profile
                    </button>
                  </td>
                </tr>
              ))}
              {shown.length === 0 && (
                <tr>
                  <td colSpan={money ? 12 : 11} style={{ ...td, textAlign: 'center', color: 'var(--muted)', padding: '28px 10px' }}>
                    No branch matches this search.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginTop: 12 }}>
          <span style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
            Showing {filtered.length === 0 ? 0 : (current - 1) * perPage + 1} to {Math.min(current * perPage, filtered.length)} of{' '}
            {filtered.length} branches
          </span>
          <label style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
            Rows per page
            <select
              value={perPage}
              onChange={(e) => {
                setPerPage(Number(e.target.value))
                setPage(1)
              }}
              style={{
                height: 28,
                padding: '0 6px',
                borderRadius: 'var(--r-input)',
                border: '1px solid var(--input-border)',
                background: 'var(--input-bg)',
                color: 'var(--text)',
                fontSize: 'var(--t-meta)',
                fontFamily: 'inherit',
              }}
            >
              {[10, 25, 50].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <button
              type="button"
              onClick={() => setPage(current - 1)}
              disabled={current === 1}
              aria-label="Previous page"
              style={{ ...controlStyle, height: 28, width: 28, padding: 0, justifyContent: 'center', opacity: current === 1 ? 0.45 : 1 }}
            >
              <Icon name="chevron_left" size={13} />
            </button>
            <span className="figure" style={{ fontSize: 'var(--t-meta)', color: 'var(--text)', fontWeight: 600, minWidth: 46, textAlign: 'center' }}>
              {current} / {pageCount}
            </span>
            <button
              type="button"
              onClick={() => setPage(current + 1)}
              disabled={current === pageCount}
              aria-label="Next page"
              style={{ ...controlStyle, height: 28, width: 28, padding: 0, justifyContent: 'center', opacity: current === pageCount ? 0.45 : 1 }}
            >
              <Icon name="chevron_right" size={13} />
            </button>
          </span>
        </div>
      </Card>

      {/* Analytics */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(272px, 1fr))', gap: 'var(--sp-md)' }}>
        <Card title="Equipment Summary" action={<span style={{ fontSize: 'var(--t-th)', color: 'var(--muted)' }}>All branches</span>}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
            <Donut
              slices={slices}
              centreLabel="Total"
              centreValue={`${grouped(slices.reduce((s, x) => s + x.value, 0))} items`}
              size={142}
            />
            <div style={{ flex: 1, minWidth: 150 }}>
              <Legend slices={slices} />
            </div>
          </div>
        </Card>

        <Card title="Inventory Transfers">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {TRANSFER_STAGES.map((s) => (
              <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                <ToneChip tone={s.tone} icon={s.icon}>
                  {s.label}
                </ToneChip>
                <span className="figure" style={{ marginLeft: 'auto', fontSize: 'var(--t-meta)', fontWeight: 700, color: 'var(--text)' }}>
                  {s.count}
                </span>
              </div>
            ))}
            <Link to="/inventory/warehouses" style={{ ...controlStyle, justifyContent: 'center', marginTop: 4 }}>
              View all transfers
              <Icon name="arrow_right" size={13} />
            </Link>
          </div>
        </Card>

        {/* §8.3 — Revenue and revenue growth are the whole card, so a money-blind
            session does not get an emptied version of it. */}
        {money && (
          <Card title="Branch Performance" action={<span style={{ fontSize: 'var(--t-th)', color: 'var(--muted)' }}>This month</span>}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={th}>Branch</th>
                  <th style={{ ...th, textAlign: 'right' }}>Revenue</th>
                  <th style={{ ...th, textAlign: 'right' }}>Utilization</th>
                  <th style={{ ...th, textAlign: 'right' }}>Growth</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((b) => (
                  <tr key={b.id}>
                    <td style={{ ...td, fontWeight: 600 }}>{b.name}</td>
                    <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }} className="figure">
                      {formatMoney(b.revenue)}
                    </td>
                    <td style={{ ...td, textAlign: 'right' }} className="figure">
                      {b.utilization}%
                    </td>
                    <td style={{ ...td, textAlign: 'right' }}>
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 3,
                          fontWeight: 700,
                          fontSize: 'var(--t-th)',
                          color: b.growthPercent >= 0 ? 'var(--success-text)' : 'var(--danger-text)',
                        }}
                      >
                        <Icon name={b.growthPercent >= 0 ? 'arrow_up' : 'arrow_down'} size={11} fill />
                        {Math.abs(b.growthPercent)}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}

        <Card title="AI Branch Insights">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {BRANCH_INSIGHTS.filter((i) => money || !i.money).map((i) => (
              <div key={i.text} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                <Icon name={i.icon} size={14} style={{ color: 'var(--nav-active-accent)', flexShrink: 0, marginTop: 2 }} />
                <span style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)', lineHeight: 1.5 }}>{i.text}</span>
              </div>
            ))}
            <Link to="/ai" style={{ ...controlStyle, justifyContent: 'center', marginTop: 2 }}>
              Ask the assistant
              <Icon name="arrow_right" size={13} />
            </Link>
          </div>
        </Card>
      </div>

      {addOpen && <AddBranchModal existing={rows} onClose={() => setAddOpen(false)} onAdd={addBranch} />}
    </div>
  )
}

function Stat({ icon, label, value }: { icon: IconName; label: string; value: string }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 'var(--t-th)', color: 'var(--muted)' }}>
        <Icon name={icon} size={11} />
        <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
      </div>
      <div
        className="figure"
        style={{ fontSize: 'var(--t-meta)', fontWeight: 700, color: 'var(--text)', marginTop: 2, whiteSpace: 'nowrap' }}
      >
        {value}
      </div>
    </div>
  )
}

/* ── Add Branch ────────────────────────────────────────────────────────── */

/**
 * A real control, not a decorative one. It writes to session state exactly as
 * `Warehouses.tsx` does for a stock transfer — every KPI, the table, the
 * pagination footer and the CSV recompute from it. A new branch opens with
 * nothing in it: zero warehouses, zero staff, zero equipment, Rs 0 and 0%
 * utilisation, in `Under Setup`. Seeding it with figures nobody supplied would
 * be inventing a product decision.
 */
function AddBranchModal({
  existing,
  onClose,
  onAdd,
}: {
  existing: Branch[]
  onClose: () => void
  onAdd: (b: Branch) => void
}) {
  const nextCode = useMemo(() => {
    const max = existing.reduce((m, b) => Math.max(m, Number(b.code.replace(/\D/g, '')) || 0), 0)
    return `BR${String(max + 1).padStart(3, '0')}`
  }, [existing])

  const [name, setName] = useState('')
  const [code, setCode] = useState(nextCode)
  const [city, setCity] = useState('')
  const [address, setAddress] = useState('')
  const [manager, setManager] = useState('')
  const [phone, setPhone] = useState('')
  const [touched, setTouched] = useState(false)

  const errors: string[] = []
  if (!name.trim()) errors.push('Branch name is required.')
  if (!/^BR\d{3}$/.test(code)) errors.push('Branch code must be BR followed by three digits, e.g. BR004.')
  else if (existing.some((b) => b.code === code)) errors.push(`${code} is already in use.`)
  if (!city.trim()) errors.push('City is required.')
  if (!manager.trim()) errors.push('A branch manager is required.')

  const field = (label: string, value: string, set: (v: string) => void, placeholder: string) => (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: 'var(--t-th)', fontWeight: 600, color: 'var(--text2)' }}>{label}</span>
      <input
        value={value}
        onChange={(e) => set(e.target.value)}
        placeholder={placeholder}
        style={{
          height: 32,
          padding: '0 9px',
          borderRadius: 'var(--r-input)',
          border: '1px solid var(--input-border)',
          background: 'var(--input-bg)',
          color: 'var(--text)',
          fontSize: 'var(--t-meta)',
          fontFamily: 'inherit',
        }}
      />
    </label>
  )

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Add branch"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'var(--modal)',
        display: 'grid',
        placeItems: 'center',
        zIndex: 9000,
        padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ ...cardStyle, width: 520, maxWidth: '100%', maxHeight: '86vh', overflowY: 'auto', boxShadow: 'var(--shadow-modal)' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 14px', borderBottom: '1px solid var(--border)' }}>
          <h2 style={{ margin: 0, fontSize: 'var(--t-ui)', fontWeight: 700, color: 'var(--text)' }}>Add Branch</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer' }}
          >
            <Icon name="close" size={16} />
          </button>
        </div>

        <div style={{ padding: 14, display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 10 }}>
          {field('Branch name', name, setName, 'Biratnagar Branch')}
          {field('Branch code', code, setCode, nextCode)}
          {field('City', city, setCity, 'Biratnagar')}
          {field('Address', address, setAddress, 'Main Road, Biratnagar')}
          {field('Branch manager', manager, setManager, 'Full name')}
          {field('Phone', phone, setPhone, '+977 …')}
        </div>

        {touched && errors.length > 0 && (
          <div role="alert" style={{ padding: '0 14px 10px', display: 'flex', flexDirection: 'column', gap: 3 }}>
            {errors.map((e) => (
              <span key={e} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 'var(--t-meta)', color: 'var(--danger-text)' }}>
                <Icon name="error" size={13} />
                {e}
              </span>
            ))}
          </div>
        )}

        <p style={{ margin: 0, padding: '0 14px 12px', fontSize: 'var(--t-th)', color: 'var(--muted)', lineHeight: 1.5 }}>
          The branch opens in <strong style={{ color: 'var(--text2)' }}>Under Setup</strong> with no warehouses, staff, equipment
          or revenue — those arrive as it is stocked. It is held for this session only; no backend is connected.
        </p>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '0 14px 14px' }}>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            icon="plus"
            onClick={() => {
              setTouched(true)
              if (errors.length > 0) return
              onAdd({
                id: `br-${code.toLowerCase()}`,
                code,
                name: name.trim(),
                city: city.trim(),
                address: address.trim() || city.trim(),
                manager: manager.trim(),
                phone: phone.trim() || '—',
                warehouses: 0,
                staff: 0,
                equipment: 0,
                revenue: 0 as Paisa,
                utilization: 0,
                growthPercent: 0,
                status: 'Under Setup',
              })
            }}
          >
            Add branch
          </Button>
        </div>
      </div>
    </div>
  )
}

/** The rail's four shortcut tiles. Same shape as the Overview's Quick Access. */
const quickTileStyle: CSSProperties = {
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

function BranchesRail({
  money,
  branches,
  onAdd,
  onExport,
}: {
  money: boolean
  branches: Branch[]
  onAdd: () => void
  onExport: () => void
}) {
  const t = totalsOf(branches)
  const rows: Array<{ label: string; value: string; tone?: BrandKey }> = []
  if (money) {
    rows.push(
      { label: 'Monthly Revenue', value: formatMoney(t.revenue), tone: 'success' },
      { label: 'Monthly Profit', value: formatMoney(GROUP_FINANCE.monthlyProfit), tone: 'success' },
      { label: 'Equipment Value', value: formatMoney(GROUP_FINANCE.equipmentValue) },
    )
  }
  rows.push(
    { label: 'Active Staff', value: String(t.staff) },
    { label: 'Warehouses', value: String(t.warehouses) },
    { label: 'Average Utilization', value: `${t.utilization}%` },
  )

  /*
   * Total by construction: every kind either has a handler here or a `dest` in
   * the data file, and the branch below covers both — so a tile cannot be added
   * that renders as a live control and does nothing.
   */
  const handlers: Record<BranchActionKind, (() => void) | null> = {
    'add-branch': onAdd,
    'transfer-equipment': null,
    'export-report': onExport,
    'print-labels': null,
  }

  return (
    <>
      <Card title="Branch Summary" action={<span style={{ fontSize: 'var(--t-th)', color: 'var(--muted)' }}>All branches</span>}>
        <SummaryRows rows={rows} />
      </Card>

      <Card title="Alerts">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {BRANCH_ALERTS.map((a) => (
            <DestControl
              key={a.label}
              dest={a.dest}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                width: '100%',
                padding: '7px 9px',
                borderRadius: 8,
                border: '1px solid var(--border)',
                background: 'var(--card2)',
                color: 'var(--text)',
                fontSize: 'var(--t-meta)',
                fontWeight: 500,
                fontFamily: 'inherit',
                textAlign: 'left',
                textDecoration: 'none',
                cursor: 'pointer',
              }}
            >
              <Icon name={a.icon} size={14} style={{ color: STATUS[a.tone].fg, flexShrink: 0 }} />
              <span style={{ flex: 1, minWidth: 0 }}>{a.label}</span>
              <span className="figure" style={{ fontWeight: 700, color: STATUS[a.tone].fg }}>
                {a.count}
              </span>
            </DestControl>
          ))}
          <Link to="/operations" style={{ ...controlStyle, justifyContent: 'center', width: '100%', marginTop: 2 }}>
            View all alerts
            <Icon name="arrow_right" size={13} />
          </Link>
        </div>
      </Card>

      {/* §Quick Actions — "exactly four", between Alerts and Recent Activity. */}
      <Card title="Quick Actions">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 8 }}>
          {BRANCH_QUICK_ACTIONS.map((a) => {
            const run = handlers[a.kind]
            const glyph = <Icon name={a.icon} size={18} style={{ color: 'var(--nav-active-accent)' }} />
            const label = <span style={{ lineHeight: 1.25 }}>{a.label}</span>

            if (run) {
              return (
                <button key={a.kind} type="button" onClick={run} style={quickTileStyle}>
                  {glyph}
                  {label}
                </button>
              )
            }
            const dest: Dest = a.dest ?? N(`${a.label} has no destination in this build.`)
            return (
              <DestControl key={a.kind} dest={dest} style={quickTileStyle}>
                {glyph}
                {label}
                {dest.kind === 'none' && <NotBuilt why={dest.why} />}
              </DestControl>
            )
          })}
        </div>
      </Card>

      <Card title="Recent Activity">
        <ActivityList entries={BRANCH_ACTIVITY} moreDest={R('/admin/audit')} />
      </Card>
    </>
  )
}

/* ── page ──────────────────────────────────────────────────────────────── */

export default function Settings() {
  const money = useCanViewMoney()
  /* Law 13 — branch on capability, not on a hard-coded width. */
  const tabular = useTabularLayout()
  const [params, setParams] = useSearchParams()
  const [addOpen, setAddOpen] = useState(false)
  /* Held here, not in the pane: the Branches rail summary, the rail's Export
     Report tile and the header Export button all read this same list, so a
     branch added this session cannot appear in one of them and not the others. */
  const [branches, setBranches] = useState<Branch[]>(BRANCHES)

  /* §8.3 — a money-only tab is removed from the strip, not disabled in it. */
  const tabs = useMemo(() => TABS.filter((t) => money || !t.money), [money])

  const raw = params.get('tab')
  const requested = isTabKey(raw) ? raw : 'overview'
  const active: TabKey = tabs.some((t) => t.key === requested) ? requested : 'overview'

  const go = (tab: TabKey) => {
    const next = new URLSearchParams(params)
    if (tab === 'overview') next.delete('tab')
    else next.set('tab', tab)
    setParams(next)
    window.scrollTo({ top: 0 })
  }

  const bs = toBs(TODAY)
  const asOf = `${bs ? formatBs(bs) : 'BS date unavailable'} · ${formatAd(TODAY)}`

  const exportConfig = () => {
    const rows: string[][] = [['Section', 'Setting', 'Value']]
    for (const [tab, sections] of Object.entries(SECTIONS)) {
      for (const s of sections) {
        for (const f of s.fields) {
          rows.push([`${tab} · ${s.title}`, f.label, fieldValue(f)])
        }
      }
    }
    downloadCsv('babin-settings.csv', rows)
  }

  const exportBranches = () => downloadCsv('babin-branches.csv', branchCsvRows(branches, money))

  const IMPORT_WHY = 'Importing branches writes to the org tree; no backend is connected in this build.'

  const headerActions =
    active === 'branches' ? (
      <>
        <span
          aria-disabled="true"
          title={IMPORT_WHY}
          style={{ ...controlStyle, cursor: 'not-allowed', color: 'var(--muted)', borderStyle: 'dashed', height: 34 }}
        >
          <Icon name="upload" size={13} />
          Import
          <NotBuilt why={IMPORT_WHY} />
        </span>
        <Button icon="download" onClick={exportBranches}>
          Export
        </Button>
        <Button icon="plus" variant="primary" onClick={() => setAddOpen(true)}>
          Add Branch
        </Button>
      </>
    ) : (
      <>
        <Button icon="download" onClick={exportConfig}>
          Export config
        </Button>
        <Link to="/admin/audit" style={{ ...controlStyle, height: 34 }}>
          <Icon name="checklist" size={14} />
          View audit log
        </Link>
      </>
    )

  return (
    <GoTab.Provider value={go}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
        <PageHeader
          icon="settings"
          title="Organization & System Settings"
          description="Manage the organization, branches, warehouses, users, roles, permissions and system-wide preferences."
          actions={headerActions}
        />

        {/* A seed that stops reconciling is shown, not thrown — a module-scope
            throw runs before React mounts and blanks the app with no message. */}
        {SEED_ERRORS.length > 0 && (
          <div
            role="alert"
            style={{ ...cardStyle, padding: 12, borderColor: 'var(--danger)', display: 'flex', flexDirection: 'column', gap: 4 }}
          >
            <strong style={{ fontSize: 'var(--t-ui)', color: 'var(--danger-text)' }}>Seed data does not reconcile</strong>
            {SEED_ERRORS.map((e) => (
              <span key={e} style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
                {e}
              </span>
            ))}
          </div>
        )}

        {/* Tab strip — every tab is a real URL, so a pane can be linked and reloaded. */}
        <div
          role="tablist"
          aria-label="Settings sections"
          style={{ display: 'flex', gap: 2, borderBottom: '1px solid var(--border)', overflowX: 'auto' }}
        >
          {tabs.map((t) => {
            const on = t.key === active
            return (
              <button
                key={t.key}
                role="tab"
                type="button"
                aria-selected={on}
                onClick={() => go(t.key)}
                style={{
                  height: 36,
                  padding: '0 13px',
                  border: 'none',
                  borderBottom: `2px solid ${on ? 'var(--nav-active-accent)' : 'transparent'}`,
                  background: 'transparent',
                  color: on ? 'var(--nav-active-accent)' : 'var(--text2)',
                  fontSize: 'var(--t-meta)',
                  fontWeight: on ? 700 : 500,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  whiteSpace: 'nowrap',
                }}
              >
                {t.label}
              </button>
            )
          })}
        </div>

        <div
          style={{
            display: 'grid',
            /* Below 768 the rail has nowhere to go, so it stacks under
               the content instead of squeezing it. The rail track is `auto`
               so it shrinks to match Rail's own collapsed/expanded width. */
            gridTemplateColumns: tabular ? 'minmax(0,1fr) auto' : '1fr',
            gap: 'var(--sp-md)',
            alignItems: 'start',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)', minWidth: 0 }}>
            {active === 'overview' && <OverviewPane />}
            {active === 'branches' && (
              <BranchesPane money={money} rows={branches} setRows={setBranches} addOpen={addOpen} setAddOpen={setAddOpen} />
            )}
            {active === 'users' && <UsersPane />}
            {active !== 'overview' && active !== 'branches' && active !== 'users' && (
              <SectionCards sections={SECTIONS[active]} />
            )}
          </div>

          <Rail>
            {active === 'overview' ? (
              <OverviewRail />
            ) : active === 'branches' ? (
              <BranchesRail money={money} branches={branches} onAdd={() => setAddOpen(true)} onExport={exportBranches} />
            ) : (
              <>
                <div style={{ ...cardStyle, padding: 12, fontSize: 'var(--t-meta)', color: 'var(--muted)', lineHeight: 1.5 }}>
                  The theme and text-size selectors are live and persist. The other controls are presentational — they do not
                  save yet, and this page says so rather than implying a write that never happens.
                </div>
                <Card title="Org-wide policy">
                  <p style={{ margin: 0, fontSize: 'var(--t-meta)', color: 'var(--text2)', lineHeight: 1.5 }}>
                    Roles, permissions, numbering, taxes, fiscal year, backup and audit affect everyone, not just this
                    workspace. Changing one is audited and, for the critical ones, restricted to an Owner.
                  </p>
                </Card>
                <Card title="System Summary">
                  <SummaryRows rows={SYSTEM_SUMMARY.map((r) => ({ label: r.label, value: r.value }))} />
                </Card>
              </>
            )}
          </Rail>
        </div>

        <FooterNote extra={[`Data as of ${asOf}`]} />
      </div>
    </GoTab.Provider>
  )
}
