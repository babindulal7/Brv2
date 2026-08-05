import { useState } from 'react'
import { Link } from 'react-router-dom'
import Icon from '../../components/ui/Icon'
import { Card, PageHeader, Button, Rail, FooterNote, cardStyle } from '../../components/ui/Page'
import type { IconName } from '../../components/ui/Icon'
import { useTheme } from '../../lib/theme'
import { TEXT_SIZES, applyTextSize, readTextSize } from '../../lib/textSize'
import type { TextSize } from '../../lib/textSize'
import { BRANCH } from '../../data/nav'

/**
 * **Settings** — spec-derived, with the page shape taken from render
 * `A048278E` (Client Portal Settings): a category rail beside collapsible
 * sections of labelled controls.
 *
 * Every control here is real where it can be — the theme selector actually
 * switches the theme. The rest are presentational, and the page says so rather
 * than implying a save that does not happen.
 */

interface Field {
  label: string
  note: string
  /** A value renders as a select; a boolean renders as a switch; a route renders as a link. */
  value?: string
  on?: boolean
  to?: string
}

interface Section {
  key: string
  title: string
  icon: IconName
  fields: Field[]
}

/**
 * §5.1 places Administration, Automation Center, Communication Center,
 * AI Assistant and System Monitor **inside Settings** — none of the five keep
 * a sidebar slot. Their screens were already built and routed; what was
 * missing was a door *in*. Until now they were reachable only by typing the
 * URL, which is the dead-end §5.1 exists to prevent — a destination with no
 * way to it is the same defect as a link with nowhere to go.
 */
const SYSTEM_LINKS: Field[] = [
  { label: 'Numbering Sequences', note: 'Booking, invoice and asset ID formats.', to: '/admin/numbering' },
  { label: 'Audit Settings', note: 'What gets logged, and for how long.', to: '/admin/audit' },
  { label: 'Backup & Restore', note: 'Scheduled backups and restore points.', to: '/admin/backup' },
  { label: 'Automation Center', note: 'Rules, triggers and scheduled jobs.', to: '/automation' },
  { label: 'Notification Center', note: 'Broadcasts, templates and delivery.', to: '/notifications' },
  { label: 'SMS Center', note: 'SMS templates, credits and delivery log.', to: '/notifications/sms' },
  { label: 'AI Assistant', note: 'Ask about bookings, stock and money.', to: '/ai' },
  { label: 'System Monitor', note: 'Services, jobs and incidents.', to: '/system' },
  { label: 'Documents', note: 'Every generated invoice, quote and agreement.', to: '/documents' },
]

const SECTIONS: Section[] = [
  {
    key: 'general',
    title: 'General',
    icon: 'settings',
    fields: [
      { label: 'Organisation name', note: 'Shown on documents and the sidebar.', value: BRANCH.name },
      { label: 'Branch', note: 'The operating branch for this session.', value: BRANCH.address },
      { label: 'VAT number', note: 'Printed on tax invoices.', value: '609876543' },
    ],
  },
  {
    key: 'localization',
    title: 'Localization',
    icon: 'calendar',
    fields: [
      { label: 'Calendar mode', note: 'BS leads AD everywhere. Latin digits always.', value: 'BS + AD (Default)' },
      { label: 'Fiscal year', note: 'Nepali fiscal year runs Shrawan – Ashadh.', value: 'FY 2083/84' },
      { label: 'Timezone', note: 'All dates are stored in UTC and rendered here.', value: 'Asia/Kathmandu (UTC+05:45)' },
      { label: 'Week starts', note: 'Saturday is the weekend in Nepal.', value: 'Sunday' },
      { label: 'Currency', note: 'South Asian grouping — Rs 1,85,000.', value: 'NPR (Rs)' },
    ],
  },
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
    key: 'security',
    title: 'Security',
    icon: 'crew',
    fields: [
      { label: 'Two-factor authentication', note: 'Required for Owner and Admin roles.', on: true },
      { label: 'Session timeout', note: 'Signed out after this long idle.', value: '30 minutes' },
      { label: 'Password policy', note: 'Min 12 chars, mixed case, number, symbol. 90-day expiry.', value: 'Strict' },
    ],
  },
  {
    key: 'system',
    title: 'System',
    icon: 'activity',
    fields: SYSTEM_LINKS,
  },
]

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
      <span aria-hidden style={{ width: 15, height: 15, borderRadius: 999, background: '#fff', display: 'block' }} />
    </button>
  )
}

export default function Settings() {
  const [active, setActive] = useState(SECTIONS[0]?.key ?? 'general')
  const { theme, setMode } = useTheme()
  // §4.3.11 — read once; the pre-paint script in index.html already applied it.
  const [textSize, setTextSize] = useState<TextSize>(() => readTextSize())

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
      <PageHeader
        icon="settings"
        title="Settings"
        description="Configure the workspace. System holds Administration, Automation and Communication."
        actions={
          <>
            <Button icon="download">Export config</Button>
            <Button icon="checklist">View audit log</Button>
          </>
        }
      />

      <div style={{ display: 'grid', gridTemplateColumns: '210px minmax(0,1fr) 288px', gap: 'var(--sp-md)', alignItems: 'start' }}>
        <Card bodyStyle={{ padding: 8 }}>
          {SECTIONS.map((s) => {
            const on = active === s.key
            return (
              <button
                key={s.key}
                type="button"
                onClick={() => setActive(s.key)}
                aria-current={on ? 'true' : undefined}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 9,
                  width: '100%',
                  height: 36,
                  padding: '0 9px',
                  borderRadius: 8,
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
                <Icon name={s.icon} size={15} style={{ color: on ? 'var(--nav-active-accent)' : 'var(--muted)', flexShrink: 0 }} />
                {s.title}
              </button>
            )
          })}
        </Card>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)', minWidth: 0 }}>
          {SECTIONS.filter((s) => s.key === active).map((s) => (
            <Card key={s.key} title={s.title}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {s.fields.map((f) => (
                  <div
                    key={f.label}
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

                    {/* §4.3.11 — three options, each setting --ui-scale on the
                        root. Every size in §4.3.6 is rem, so one variable moves
                        the whole app: no component opts in, none can opt out. */}
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
                                height: 32,
                                padding: '0 12px',
                                borderRadius: 'var(--r-btn)',
                                border: `1px solid ${on ? 'var(--nav-active-accent)' : 'var(--border)'}`,
                                background: on ? 'var(--nav-active-bg)' : 'var(--card)',
                                color: on ? 'var(--nav-active-accent)' : 'var(--text2)',
                                fontSize: 'var(--t-meta)',
                                fontWeight: on ? 600 : 500,
                                cursor: 'pointer',
                                fontFamily: 'inherit',
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
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 6,
                                height: 32,
                                padding: '0 12px',
                                borderRadius: 'var(--r-btn)',
                                border: `1px solid ${on ? 'var(--nav-active-accent)' : 'var(--border)'}`,
                                background: on ? 'var(--nav-active-bg)' : 'var(--card)',
                                color: on ? 'var(--nav-active-accent)' : 'var(--text2)',
                                fontSize: 'var(--t-meta)',
                                fontWeight: on ? 600 : 500,
                                cursor: 'pointer',
                                fontFamily: 'inherit',
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
                    ) : f.to ? (
                      <Link
                        to={f.to}
                        style={{
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
                          flexShrink: 0,
                        }}
                      >
                        Open
                        <Icon name="arrow_right" size={13} />
                      </Link>
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
                ))}
              </div>
            </Card>
          ))}
        </div>

        <Rail>
          <div style={{ ...cardStyle, padding: 12, fontSize: 'var(--t-meta)', color: 'var(--muted)', lineHeight: 1.5 }}>
            The theme selector is live. The other controls are presentational — they do not save yet, and this page
            says so rather than implying a write that never happens.
          </div>
          <Card title="Org-wide policy">
            <p style={{ margin: 0, fontSize: 'var(--t-meta)', color: 'var(--text2)', lineHeight: 1.5 }}>
              Roles, permissions, numbering, taxes, fiscal year, backup and audit live under{' '}
              <strong style={{ color: 'var(--text)' }}>Administration</strong> — they affect everyone, not just this
              workspace.
            </p>
          </Card>
        </Rail>
      </div>

      <FooterNote />
    </div>
  )
}
