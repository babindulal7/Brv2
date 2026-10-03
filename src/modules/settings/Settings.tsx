import { useCallback, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import './settings.css'
import Icon from '../../components/ui/Icon'
import type { IconName } from '../../components/ui/Icon'
import { Card, PageHeader, Button, FooterNote, SummaryRows } from '../../components/ui/Page'
import { PageShell } from '../../components/ui/PageShell'
import { ErrorBanner, LoadingSkeleton } from '../../components/ui/StateViews'
import { toBs, formatBs, formatAd, getBusinessToday } from '../../lib/bs'
import { useCanViewMoney } from '../../lib/moneyVisibility'
import { useViewport } from '../../lib/device'
import { useEditMode } from '../../lib/edit/useEditMode'
import type { FieldSpec } from '../../lib/edit/useEditMode'
import {
  SETTING_SPECS,
  SETTINGS_DEFAULTS,
  writeSettings,
  validateSetting,
  resetSettings,
  languageCodeOf,
} from '../../lib/settingsStore'
import type { SettingKey, SettingValue, SettingsRecord } from '../../lib/settingsStore'
import { applyLanguage } from '../../lib/i18n'
import { canManageSettings } from '../../lib/rbac'
import { useAuth } from '../../lib/auth'
import { useTheme } from '../../lib/theme'
import {
  TABS,
  LEGACY_TAB,
  DEFAULT_TAB,
  TAB_SHORT_LABEL,
  TAB_SUMMARY,
  isTabKey,
  BRANCHES,
  BRANCH,
  SYSTEM_SUMMARY,
  SEED_ERRORS,
} from '../../lib/queries/settings'
import type { Branch, TabKey } from '../../lib/queries/settings'
import { useSettingsLoad } from './useSettingsLoad'
import {
  DestControl,
  EditCtx,
  GoTab,
  SectionCards,
  VisibleTabs,
  controlStyle,
  downloadCsv,
  fieldValue,
} from './sections/shared'
import {
  FIELD_SECTIONS,
  FINANCIAL_SECTIONS,
  ORGANISATION_SECTIONS,
  BranchesPane,
  BranchesRail,
  FinancialPane,
  UsersPane,
  branchCsvRows,
} from './sections'

/*
 * Operating day in Kathmandu (BS + AD).
 */
const TODAY = getBusinessToday()

const TAB_CONFIG: Record<TabKey, { icon: IconName; subtitle: string }> = {
  business: {
    icon: 'briefcase',
    subtitle: 'Identity, VAT & financial policies',
  },
  people: {
    icon: 'users',
    subtitle: 'Staff directory & 9-role matrix',
  },
  branches: {
    icon: 'box',
    subtitle: 'Branches, warehouses & fleet',
  },
  system: {
    icon: 'settings',
    subtitle: 'Preferences, security & audit',
  },
}

export default function Settings() {
  const money = useCanViewMoney()
  const viewport = useViewport()
  const phone = viewport === 'phone'
  const desktop = viewport === 'desktop'

  const [params, setParams] = useSearchParams()
  const [addOpen, setAddOpen] = useState(false)
  const [branches, setBranches] = useState<Branch[]>(BRANCHES)

  const { user } = useAuth()
  const { theme, setMode } = useTheme()
  const mayEdit = canManageSettings(user?.role ?? 'Client')
  const [leaveError, setLeaveError] = useState<string | null>(null)

  const { load, reload, patch } = useSettingsLoad()
  const settings: SettingsRecord = load.status === 'ready' ? load.settings : SETTINGS_DEFAULTS

  const onSaveSetting = useCallback(
    async (p: Record<string, unknown>) => {
      writeSettings(p as Partial<SettingsRecord>)
      patch(p as Partial<SettingsRecord>)
      if ('language' in p) {
        await applyLanguage(languageCodeOf(p.language as SettingValue))
      }
    },
    [patch],
  )

  const settingFields: FieldSpec[] = useMemo(
    () =>
      (Object.keys(SETTING_SPECS) as SettingKey[]).map((k) => ({
        key: k,
        validate: (v) => validateSetting(k, v as SettingValue),
      })),
    [],
  )

  const edit = useEditMode({ record: settings, fields: settingFields, onSave: onSaveSetting })

  /* Law 6 — money-only tab is removed from the strip, not disabled. */
  const tabs = useMemo(() => TABS.filter((t) => money || !t.money), [money])

  const raw = params.get('tab')
  const requested: TabKey = isTabKey(raw) ? raw : (raw !== null && LEGACY_TAB[raw]) || DEFAULT_TAB
  const active: TabKey = tabs.some((t) => t.key === requested) ? requested : DEFAULT_TAB
  const onPhoneList = phone && (raw === null || !tabs.some((t) => t.key === raw))

  const go = (tab: TabKey) => {
    const next = new URLSearchParams(params)
    if (tab === DEFAULT_TAB && !phone) next.delete('tab')
    else next.set('tab', tab)
    setParams(next)
    window.scrollTo({ top: 0 })
  }

  const toList = () => {
    const next = new URLSearchParams(params)
    next.delete('tab')
    setParams(next)
    window.scrollTo({ top: 0 })
  }

  const bs = toBs(TODAY)
  const asOf = `${bs ? formatBs(bs) : 'BS date unavailable'} · ${formatAd(TODAY)}`

  const initials = useMemo(() => {
    const name = user?.name?.trim() || 'Babin Shrestha'
    const parts = name.split(/\s+/).filter(Boolean)
    if (parts.length >= 2) {
      const p0 = parts[0] || 'B'
      const p1 = parts[parts.length - 1] || 'S'
      return `${p0[0] || 'B'}${p1[0] || 'S'}`.toUpperCase()
    }
    return (name.slice(0, 2) || 'BR').toUpperCase()
  }, [user?.name])

  const exportConfig = () => {
    const rows: string[][] = [['Section', 'Setting', 'Value']]
    const walk = (tabLabel: string, sections: readonly (typeof FINANCIAL_SECTIONS)[number][]) => {
      for (const s of sections) {
        for (const f of s.fields) {
          rows.push([`${tabLabel} · ${s.title}`, f.label, fieldValue(f, settings)])
        }
      }
    }
    for (const t of tabs) {
      const sections = FIELD_SECTIONS[t.key]
      if (sections) walk(t.label, sections)
    }
    if (money) walk('Business', FINANCIAL_SECTIONS)
    downloadCsv('babin-settings.csv', rows)
  }

  const exportBranches = () => downloadCsv('babin-branches.csv', branchCsvRows(branches, money))

  const headerActions =
    load.status !== 'ready' ? null : active === 'branches' && !onPhoneList ? (
      <>
        <Button icon="download" onClick={exportBranches}>
          Export
        </Button>
        <Button icon="plus" variant="primary" onClick={() => setAddOpen(true)}>
          Add Branch
        </Button>
      </>
    ) : (
      <>
        {mayEdit &&
          !onPhoneList &&
          (edit.editing ? (
            <>
              <Button
                icon="check"
                variant="primary"
                onClick={() => {
                  const outcome = edit.stopEditing()
                  setLeaveError(
                    outcome.ok
                      ? null
                      : `Unsaved: ${outcome.unsaved.join(', ')}. Save or cancel each before leaving edit mode.`,
                  )
                }}
              >
                Done
              </Button>
              <Button
                icon="close"
                variant="ghost"
                onClick={() => {
                  edit.cancelAll()
                  setLeaveError(null)
                }}
              >
                Discard
              </Button>
              <Button
                icon="refresh"
                variant="ghost"
                onClick={() => {
                  resetSettings()
                  reload()
                  edit.cancelAll()
                  setLeaveError(null)
                }}
              >
                Reset to defaults
              </Button>
            </>
          ) : (
            <Button icon="tool" onClick={() => { setLeaveError(null); edit.startEditing() }}>
              Edit settings
            </Button>
          ))}
        <Button icon="download" onClick={exportConfig}>
          Export config
        </Button>
        <Link to="/admin/audit" className="tap" style={{ ...controlStyle, minHeight: 34 }}>
          <Icon name="checklist" size={14} />
          View audit log
        </Link>
      </>
    )

  const activeTab = tabs.find((t) => t.key === active)

  /* ── the panel ───────────────────────────────────────────────────────── */

  const panel = (() => {
    if (active === 'branches') {
      return (
        <BranchesPane money={money} rows={branches} setRows={setBranches} addOpen={addOpen} setAddOpen={setAddOpen} />
      )
    }
    if (active === 'people') {
      return (
        <>
          <UsersPane />
          {FIELD_SECTIONS.people ? <SectionCards sections={FIELD_SECTIONS.people} /> : null}
        </>
      )
    }
    if (active === 'business') {
      return (
        <>
          <SectionCards sections={ORGANISATION_SECTIONS} />
          {money ? <FinancialPane /> : null}
        </>
      )
    }
    const sections = FIELD_SECTIONS[active]
    return sections ? <SectionCards sections={sections} /> : null
  })()

  const rail =
    active === 'branches' ? (
      <BranchesRail money={money} branches={branches} onAdd={() => setAddOpen(true)} onExport={exportBranches} />
    ) : null

  /* ── body, by state then by width ────────────────────────────────────── */

  const body = (() => {
    if (load.status === 'loading') {
      return (
        <LoadingSkeleton
          type="card"
          label="Loading settings — the stored values, not the defaults. Nothing on this page is shown until they arrive."
        />
      )
    }

    if (load.status === 'error') {
      return (
        <ErrorBanner
          title="Settings could not be read."
          message={
            <>
              {load.message} Until they load, this page would show the built-in defaults rather than your saved values — and a
              stale VAT rate is a wrong invoice, so nothing is rendered instead.
            </>
          }
          onRetry={reload}
        />
      )
    }

    /* PHONE — §11.1: a list of sections, each tapping through to its own screen. */
    if (onPhoneList) {
      return (
        <div className="app-settings-mobile-list">
          <div className="app-settings-mobile-section-header">APP SETTINGS</div>
          <div className="app-settings-mobile-group">
            {tabs.map((t) => {
              const conf = TAB_CONFIG[t.key]
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => go(t.key)}
                  className="app-settings-mobile-row"
                >
                  <div
                    className="app-settings-mobile-icon"
                    style={{ backgroundColor: 'var(--surface-2)', color: 'var(--primary)' }}
                  >
                    <Icon name={conf.icon} size={20} />
                  </div>
                  <div className="app-settings-mobile-text">
                    <span className="app-settings-mobile-title">{t.label}</span>
                    <span className="app-settings-mobile-desc">{TAB_SUMMARY[t.key]}</span>
                  </div>
                  <Icon name="chevron_right" size={16} className="app-settings-chevron-muted" />
                </button>
              )
            })}
          </div>
        </div>
      )
    }

    /* PHONE — one section, full screen. */
    if (phone) {
      return (
        <div className="app-settings-mobile-subpage">
          <div className="app-settings-mobile-back-bar">
            <button
              type="button"
              className="app-settings-back-btn tap"
              onClick={toList}
              aria-label="Back to settings"
            >
              <Icon name="chevron_left" size={18} />
              <span>Settings</span>
            </button>
            <div className="app-settings-mobile-current-title">{activeTab?.label ?? 'Overview'}</div>
            <div style={{ width: 44 }} aria-hidden="true" />
          </div>

          <div className="app-settings-pane">
            {panel}
            {active === 'branches' && rail && (
              <div className="app-settings-branches-rail-wrap">{rail}</div>
            )}
            {active === 'system' && (
              <Card title="System Summary">
                <SummaryRows rows={SYSTEM_SUMMARY.map((r) => ({ label: r.label, value: r.value }))} />
              </Card>
            )}
          </div>
        </div>
      )
    }

    /* DESKTOP & TABLET */
    return (
      <div className={desktop ? 'app-settings-layout' : 'app-settings-tablet-wrapper'}>
        {desktop ? (
          <nav aria-label="Settings sections" className="app-settings-sidebar settings-nav-col">
            <div className="app-settings-sidebar-header">PREFERENCES & POLICIES</div>
            {tabs.map((t) => {
              const on = t.key === active
              const conf = TAB_CONFIG[t.key]
              return (
                <button
                  key={t.key}
                  type="button"
                  aria-current={on ? 'page' : undefined}
                  onClick={() => go(t.key)}
                  className={`app-settings-nav-item settings-tab-btn ${on ? 'is-active' : ''}`}
                >
                  <div
                    className="app-settings-nav-icon-box"
                    style={{
                      backgroundColor: on ? 'var(--primary)' : 'var(--surface-2)',
                      color: on ? 'var(--btn-primary-fg, #ffffff)' : 'var(--text2)',
                    }}
                  >
                    <Icon name={conf.icon} size={16} />
                  </div>
                  <div className="app-settings-nav-text">
                    <div className="app-settings-nav-label">{t.label}</div>
                    <div className="app-settings-nav-subtitle">{conf.subtitle}</div>
                  </div>
                  <Icon name="chevron_right" size={14} className="app-settings-nav-chevron" />
                </button>
              )
            })}
          </nav>
        ) : (
          <div
            role="tablist"
            aria-label="Settings sections"
            className="app-settings-tablet-tabs settings-tab-scroll"
          >
            {tabs.map((t) => {
              const on = t.key === active
              const conf = TAB_CONFIG[t.key]
              return (
                <button
                  key={t.key}
                  role="tab"
                  type="button"
                  aria-selected={on}
                  onClick={() => go(t.key)}
                  className={`app-settings-tablet-tab settings-tab-pill ${on ? 'is-active' : ''}`}
                >
                  <div
                    className="app-settings-tablet-icon"
                    style={{
                      backgroundColor: on ? 'var(--primary)' : 'var(--surface-2)',
                      color: on ? 'var(--btn-primary-fg, #ffffff)' : 'var(--text2)',
                    }}
                  >
                    <Icon name={conf.icon} size={14} />
                  </div>
                  <span>{TAB_SHORT_LABEL[t.key]}</span>
                </button>
              )
            })}
          </div>
        )}

        <div className="app-settings-pane">
          <div className="app-settings-pane-header">
            <h2 className="app-settings-pane-title">{activeTab?.label ?? 'Overview'}</h2>
            <p className="app-settings-pane-desc">{TAB_SUMMARY[active]}</p>
          </div>

          {panel}

          {active === 'branches' && rail && (
            <div className="app-settings-branches-rail-wrap">
              {rail}
            </div>
          )}

          {active === 'system' && (
            <Card title="System Summary">
              <SummaryRows rows={SYSTEM_SUMMARY.map((r) => ({ label: r.label, value: r.value }))} />
            </Card>
          )}
        </div>
      </div>
    )
  })()

  return (
    <GoTab.Provider value={go}>
      <VisibleTabs.Provider value={tabs}>
        <EditCtx.Provider value={edit}>
          <PageShell width="settings">
            <div className="settings-v2">
              <PageHeader
                icon="settings"
                title="Settings"
                description="System preferences, organization profile, security, and workspace policies."
                actions={headerActions}
              />

              {/* Inset User Profile Header (App Settings style) */}
              <div className="app-settings-profile-card">
                <div className="app-settings-profile-left">
                  <div className="app-settings-avatar-wrap">
                    <div className="app-settings-avatar" aria-hidden="true">
                      {initials}
                    </div>
                    <span className="app-settings-avatar-status" title="Active session" />
                  </div>
                  <div className="app-settings-profile-info">
                    <div className="app-settings-profile-name-row">
                      <span className="app-settings-profile-name">{user?.name || 'Babin Shrestha'}</span>
                      <span className="app-settings-role-badge">{user?.role || 'Owner'}</span>
                      <span className="app-settings-status-chip">
                        <span className="app-settings-status-dot" />
                        Active Session
                      </span>
                    </div>
                    <div className="app-settings-profile-meta">
                      <span className="app-settings-meta-item">
                        <Icon name="box" size={13} />
                        {BRANCH.name || 'Kathmandu Main Branch'}
                      </span>
                      <span className="app-settings-meta-dot">·</span>
                      <span className="app-settings-meta-item">
                        <Icon name="calendar" size={13} />
                        {asOf}
                      </span>
                      <span className="app-settings-meta-dot">·</span>
                      <span className="app-settings-meta-item">
                        <Icon name="lock" size={13} />
                        RBAC Protected
                      </span>
                    </div>
                  </div>
                </div>

                <div className="app-settings-profile-right">
                  <div className="app-settings-quick-theme" role="group" aria-label="Theme preference">
                    <button
                      type="button"
                      className={`app-settings-theme-btn tap ${theme === 'light' ? 'is-active' : ''}`}
                      onClick={() => setMode('light')}
                      title="Switch to light theme"
                    >
                      <Icon name="sun" size={14} />
                      <span>Light</span>
                    </button>
                    <button
                      type="button"
                      className={`app-settings-theme-btn tap ${theme === 'dark' ? 'is-active' : ''}`}
                      onClick={() => setMode('dark')}
                      title="Switch to dark theme"
                    >
                      <Icon name="moon" size={14} />
                      <span>Dark</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Errors inline */}
              {leaveError && <ErrorBanner title="Unsaved changes." message={leaveError} />}

              {edit.editing && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 'var(--sp-sm)',
                    padding: '10px 14px',
                    borderRadius: 'var(--r-sm)',
                    border: '1px solid var(--border)',
                    background: 'var(--card2)',
                    fontSize: 'var(--t-meta)',
                    color: 'var(--text2)',
                  }}
                >
                  <Icon name="info" size={14} style={{ flexShrink: 0, marginTop: 2, color: 'var(--muted)' }} />
                  <span>
                    Changes save to this browser and survive a reload. No <code>settings</code> table is connected yet, so they
                    do not reach other users or other devices.
                  </span>
                </div>
              )}

              {SEED_ERRORS.length > 0 && (
                <ErrorBanner
                  title="Seed data does not reconcile"
                  message={
                    <ul style={{ margin: 0, paddingLeft: 'var(--sp-lg)' }}>
                      {SEED_ERRORS.map((e) => (
                        <li key={e}>{e}</li>
                      ))}
                    </ul>
                  }
                />
              )}

              {body}

              <FooterNote extra={[`Data as of ${asOf}`]} />
            </div>
          </PageShell>
        </EditCtx.Provider>
      </VisibleTabs.Provider>
    </GoTab.Provider>
  )
}

export { DestControl }
