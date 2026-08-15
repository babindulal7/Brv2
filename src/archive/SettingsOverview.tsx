import { useMemo } from 'react'
import Icon from '../../../components/ui/Icon'
import type { IconName } from '../../../components/ui/Icon'
import { Card, cardStyle } from '../../../components/ui/Page'
import { STATUS } from '../../../lib/status'
import {
  ORG,
  ORG_FIELDS,
  BRANCHES,
  totalsOf,
  SYSTEM_STATS_UNAVAILABLE,
  SYSTEM_SUMMARY,
  SYSTEM_ALERTS,
  PRIORITY_TONE,
  ADMIN_ACTIVITY,
  QUICK_ACCESS,
  MODULE_GROUPS,
  SYSTEM_QUICK_ACTIONS,
} from '../../../data/settings'
import type { Dest } from '../../../data/settings'
import {
  ActivityList,
  DestControl,
  KeyFigures,
  NotBuilt,
  QuickActionList,
  ToneChip,
  controlStyle,
  useVisible,
} from './shared'
import type { KpiSpec } from './shared'

/**
 * **Settings ▸ Overview** — §11.2: *"who you are, branch, build, install
 * prompt"*.
 *
 * §11.1 draws a bare `label / value / [Edit]` card and no KPI strip. Rulings §1
 * is the governing reading: *"a panel survives unless a spec removes it in
 * prose"*, and §11.2's prose removes nothing here. So the strip, Quick Access
 * and the Administration Modules grid all stay, arranged into the wireframe's
 * left-tabs / right-panel shape rather than deleted to match an abbreviated
 * ASCII box. The conflict is noted, not silently resolved either way —
 * `CONFLICTS.md` §11.7 recommends dropping the strip; Rulings §1 outranks it.
 */

const R = (to: string): Dest => ({ kind: 'route', to })

export function OverviewPane() {
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
      linkLabel: 'Branches & warehouses',
      /* §11.3 moved Warehouses into this tab. The `/inventory/warehouses`
         route still resolves; the tab is where it is administered now. */
      dest: { kind: 'tab', tab: 'branches' },
    },
    /* Rulings §8 — these three were `28`, `99.98%` and `12`, hand-typed in
       `data/settings.ts` and captioned "Last 30 days" and "Signed in right
       now": captions that claim a measurement window and a live reading behind
       figures that had neither. Each now names what is missing, and the accent
       drops to neutral so a green tile never sits over an absent figure. */
    {
      label: 'Active Users',
      value: 'Not tracked yet',
      icon: 'users',
      accent: 'neutral',
      note: SYSTEM_STATS_UNAVAILABLE.activeUsers,
      linkLabel: 'Users & roles',
      dest: { kind: 'tab', tab: 'users' },
    },
    {
      label: 'System Uptime',
      value: 'Not tracked yet',
      icon: 'activity',
      accent: 'neutral',
      note: SYSTEM_STATS_UNAVAILABLE.uptime,
      linkLabel: 'System monitor',
      dest: R('/system'),
    },
    {
      label: 'Active Sessions',
      value: 'Not tracked yet',
      icon: 'crew',
      accent: 'neutral',
      note: SYSTEM_STATS_UNAVAILABLE.activeSessions,
      linkLabel: 'System monitor',
      dest: R('/system'),
    },
  ]

  const quickAccess = useVisible(QUICK_ACCESS)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)', minWidth: 0 }}>
      <div
        style={{
          display: 'grid',
          /* Reflows to one column the moment the panel is narrower than the two
             tracks need — the same rule at tablet and phone, no width branch. */
          gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
          gap: 'var(--sp-md)',
          alignItems: 'start',
        }}
      >
        <Card
          title="Organization Profile"
          action={
            <DestControl
              dest={{ kind: 'tab', tab: 'organization' }}
              style={{ ...controlStyle, minHeight: 28, padding: '0 9px', fontSize: 'var(--t-th)' }}
            >
              <Icon name="settings" size={12} />
              Edit profile
            </DestControl>
          }
        >
          <div style={{ display: 'flex', gap: 'var(--sp-md)', alignItems: 'flex-start' }}>
            <span
              style={{
                width: 52,
                height: 52,
                borderRadius: 'var(--r-btn)',
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

          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 'var(--sp-md)' }}>
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
          <KeyFigures kpis={kpis} />

          <Card title="Quick Access">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(126px, 1fr))', gap: 10 }}>
              {quickAccess.map((q) => (
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

      <ModulesGrid />
    </div>
  )
}

function ModulesGrid() {
  return (
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
          <ModuleGroupCard key={g.title} title={g.title} icon={g.icon} rows={g.rows} />
        ))}
      </div>
    </Card>
  )
}

function ModuleGroupCard({
  title,
  icon,
  rows,
}: {
  title: string
  icon: IconName
  rows: Array<{ label: string; dest: Dest }>
}) {
  /* A row pointing at a tab Law 6 removed is dropped, not disabled — the same
     treatment the tab itself gets. A group emptied by that filter disappears
     with its rows rather than rendering an empty card. */
  const shown = useVisible(rows)
  if (shown.length === 0) return null

  return (
    <section style={{ ...cardStyle, background: 'var(--card2)', minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 11px', borderBottom: '1px solid var(--border)' }}>
        <Icon name={icon} size={14} style={{ color: 'var(--nav-active-accent)', flexShrink: 0 }} />
        <h3 style={{ margin: 0, fontSize: 'var(--t-meta)', fontWeight: 700, color: 'var(--text)' }}>{title}</h3>
      </div>
      <div style={{ padding: 5, display: 'flex', flexDirection: 'column' }}>
        {shown.map((r) => (
          <DestControl
            key={r.label}
            dest={r.dest}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--sp-sm)',
              width: '100%',
              minHeight: 30,
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
  )
}

/**
 * Rulings §1 keeps this rail: §11.1 draws two columns and removes nothing in
 * prose, so it survives. Below 1180 the shell reflows it beneath the panel
 * rather than collapsing it behind a handle — Rulings §7, *"collapse means
 * reflow, not hide"*.
 */
export function OverviewRail() {
  const alerts = useVisible(SYSTEM_ALERTS)

  return (
    <>
      <Card title="System Summary">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-sm)' }}>
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
          {alerts.map((a) => (
            <DestControl
              key={a.text}
              dest={a.dest}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--sp-sm)',
                width: '100%',
                minHeight: 34,
                padding: '8px 9px',
                borderRadius: 'var(--r-sm)',
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
