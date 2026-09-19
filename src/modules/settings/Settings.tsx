import { useCallback, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import Icon from '../../components/ui/Icon'
import { Card, PageHeader, Button, Rail, FooterNote, cardStyle, SummaryRows } from '../../components/ui/Page'
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
import {
  TABS,
  LEGACY_TAB,
  DEFAULT_TAB,
  TAB_ICON,
  TAB_SHORT_LABEL,
  TAB_SUMMARY,
  isTabKey,
  BRANCHES,
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
  NotBuilt,
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
 * The operating day, resolved once when this module loads, from the real
 * clock in Kathmandu (`lib/bs.ts`'s `getBusinessToday`). It replaced an
 * imported `TODAY` constant frozen at 31 Jul 2026.
 */
const TODAY = getBusinessToday()


/**
 * # Settings — the shell
 *
 * `11_SETTINGS.md` §11.1. This file used to be 2,502 lines carrying all eight
 * sections; the spec's own closing note is that *"these eight sections are the
 * split"*, and they now live under `sections/`. What is left here is the shell:
 * which section is showing, how it is laid out at each width, the loading and
 * error states, edit mode and the config export.
 *
 * ## The three layouts
 *
 * | Width | §11.1 draws | Built |
 * |---|---|---|
 * | **≥1280** | left tab column, right panel | left tab column · panel · rail |
 * | **768–1279** | tabs scroll in one row, panel full width | the same, rail reflowed under the panel |
 * | **<768** | a LIST of sections, each tapping through to its own screen | the same, breadcrumb back |
 *
 * The rail is the one addition, and it is a ruling rather than a liberty:
 * Rulings §1 keeps `OverviewRail`/`BranchesRail` because §11.1 draws two
 * columns but removes nothing in prose. Below 1280 it **reflows beneath the
 * panel** — Rulings §7, *"collapse means reflow, not hide"* — so it is not
 * wrapped in `CollapsibleAside` at those widths and that component's defaults
 * are untouched.
 *
 * `CONFLICTS.md` §11.6 reads §11.1's two columns as an instruction to delete
 * the rail, and §11.7 reads the missing KPI strips the same way. The register
 * outranks both: the conflict is recorded, nothing is deleted.
 *
 * ## What left this screen
 *
 * §11.2 parks **Automation · Channels/Communication · AI**, so those two tabs
 * are gone along with the AI Branch Insights card (Law 16, Rulings §7). The
 * ~20 destinations that pointed into them were **deleted, not re-pointed** —
 * see `data/settings.ts`. Every *screen* they linked to is still routed and
 * still reachable from System ▸ System, so no destination died.
 *
 * ## Law 6
 *
 * The Financial tab is money end to end, so it is **removed from the strip**
 * for a money-blind session rather than disabled in it — and the phone list is
 * built from that same filtered set, so a Warehouse operator sees six rows and
 * not seven. Every row elsewhere on the page that pointed at Financial is
 * dropped by the same filter; a control that lands the operator back on
 * Overview is a dead control.
 */

/* ── layout atoms ──────────────────────────────────────────────────────── */

const TAB_COLUMN_WIDTH = 208

const tabButtonBase: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--sp-sm)',
  width: '100%',
  minHeight: 44,
  padding: '0 11px',
  border: '1px solid transparent',
  borderRadius: 'var(--r-btn)',
  background: 'transparent',
  fontFamily: 'inherit',
  fontSize: 'var(--t-meta)',
  textAlign: 'left',
  cursor: 'pointer',
}

export default function Settings() {
  const money = useCanViewMoney()
  /* Law 13/14 — width decides, and the branch is on the viewport band, never
     on a platform or a user agent. */
  const viewport = useViewport()
  const phone = viewport === 'phone'
  const desktop = viewport === 'desktop'

  const [params, setParams] = useSearchParams()
  const [addOpen, setAddOpen] = useState(false)
  /* Held here, not in the pane: the Branches rail summary, the rail's Export
     Report tile and the header Export button all read this same list, so a
     branch added this session cannot appear in one of them and not the others. */
  const [branches, setBranches] = useState<Branch[]>(BRANCHES)

  const { user } = useAuth()
  const mayEdit = canManageSettings(user?.role ?? 'Client')
  const [leaveError, setLeaveError] = useState<string | null>(null)

  /* §11.1 — "a settings page must show a loading state; stale settings are
     wrong settings". Three distinct states, no timer anywhere. */
  const { load, reload, patch } = useSettingsLoad()
  const settings: SettingsRecord = load.status === 'ready' ? load.settings : SETTINGS_DEFAULTS

  const onSaveSetting = useCallback(
    async (p: Record<string, unknown>) => {
      /* `writeSettings` throws on an invalid value; `useEditMode` catches it,
         puts the message on the field and keeps the draft. */
      writeSettings(p as Partial<SettingsRecord>)
      patch(p as Partial<SettingsRecord>)
      /* Language takes effect on save, not on reload — a picker that needs a
         refresh to show its own result reads as broken. */
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

  /* Law 6 — a money-only tab is removed from the strip, not disabled in it. */
  const tabs = useMemo(() => TABS.filter((t) => money || !t.money), [money])

  const raw = params.get('tab')
  /*
   * Eight tabs became four on 15 Aug. A `?tab=` value is a contract — bookmarks,
   * Administration Modules rows and the phone list all carry one — so a retired
   * key is TRANSLATED through `LEGACY_TAB` rather than dropped on the default.
   * `?tab=financial` lands on Business, where the financial cards now live;
   * `?tab=security` lands on System, where its two cards now live. Only a key
   * that was never a tab falls back.
   */
  const requested: TabKey = isTabKey(raw) ? raw : (raw !== null && LEGACY_TAB[raw]) || DEFAULT_TAB
  const active: TabKey = tabs.some((t) => t.key === requested) ? requested : DEFAULT_TAB
  /* At phone width the *absence* of a tab param is the section list; §11.1
     draws no Overview row there because Overview is what the list replaces. */
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
    /* Law 6 — the financial rows reach the CSV only for a session that can see
       money. They are kept out of FIELD_SECTIONS for exactly this reason: the
       old money-gated TAB filtered them out of `tabs` and therefore out of the
       export, and folding them into Business must not lose that. */
    if (money) walk('Business', FINANCIAL_SECTIONS)
    downloadCsv('babin-settings.csv', rows)
  }

  const exportBranches = () => downloadCsv('babin-branches.csv', branchCsvRows(branches, money))

  const IMPORT_WHY = 'Importing branches writes to the org tree; no backend is connected in this build.'

  const headerActions =
    load.status !== 'ready' ? null : active === 'branches' && !onPhoneList ? (
      <>
        {/* No `tap` here, deliberately, and the omission is the considered
            answer rather than a miss. This is a `span`: no handler, no focus,
            and it says outright that Import is not built. Law 15 sizes TARGETS,
            and there is nothing here to aim at — an invisible 44px band around
            a dead control cannot help anyone reach it, it can only sit over the
            header strip catching presses that then do nothing at all. */}
        <span
          aria-disabled="true"
          title={IMPORT_WHY}
          style={{ ...controlStyle, cursor: 'not-allowed', color: 'var(--muted)', borderStyle: 'dashed', minHeight: 34 }}
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
        {/* `settings.manage` is Owner-only (`rbac.ts:91`). A role that cannot
            manage settings gets no Edit button at all, rather than one that
            refuses on press. */}
        {mayEdit &&
          !onPhoneList &&
          (edit.editing ? (
            <>
              <Button
                icon="check"
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
        {/* 34 to sit level with the `Button`s beside it, so the header strip
            does not step up and down; `tap` for the height those 34 pixels owe
            Law 15. Only the short axis inflates — the label puts this well past
            44 across — so the target grows into the header's padding rather
            than sideways into Export config. */}
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
    /*
     * People renders its custom pane AND any field sections declared for it.
     *
     * This used to be a bare `return <UsersPane />`, which short-circuited
     * before the `FIELD_SECTIONS[active]` renderer below. The export walk near
     * the top of this file iterates `FIELD_SECTIONS[t.key]` for EVERY tab, so
     * the two disagreed by construction: a row added to `FIELD_SECTIONS.people`
     * would appear in babin-settings.csv while rendering on no screen — a
     * setting that exists in the audit trail and nowhere a person could see or
     * change it. Nothing trips it today because `FIELD_SECTIONS` has no
     * `people` key (sections/index.ts maps only `business` and `system`), which
     * is exactly why it would have gone unnoticed until someone added one.
     *
     * Rendering the sections here rather than teaching the export to skip
     * People is the direction that cannot silently diverge again: whatever the
     * CSV claims about this tab is now, by construction, what the tab draws.
     * With no `people` key this is a no-op.
     */
    if (active === 'people')
      return (
        <>
          <UsersPane />
          {FIELD_SECTIONS.people ? <SectionCards sections={FIELD_SECTIONS.people} /> : null}
        </>
      )
    if (active === 'business') {
      /*
       * Business is Organisation + Financial in one pane. Law 6 is applied HERE
       * rather than by dropping a tab: a money-blind session gets the
       * organisation cards and no financial cards at all — removed, not
       * disabled, which is the same treatment the `financial` tab used to get.
       */
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
    ) : (
      <>
        <div style={{ ...cardStyle, padding: 'var(--sp-md)', fontSize: 'var(--t-meta)', color: 'var(--muted)', lineHeight: 1.5 }}>
          The theme and text-size selectors are live and persist. The other controls are presentational — they do not save
          yet, and this page says so rather than implying a write that never happens.
        </div>
        <Card title="Org-wide policy">
          <p style={{ margin: 0, fontSize: 'var(--t-meta)', color: 'var(--text2)', lineHeight: 1.5 }}>
            Roles, permissions, numbering, taxes, fiscal year, backup and audit affect everyone, not just this workspace.
            Changing one is audited and, for the critical ones, restricted to an Owner.
          </p>
        </Card>
        <Card title="System Summary">
          <SummaryRows rows={SYSTEM_SUMMARY.map((r) => ({ label: r.label, value: r.value }))} />
        </Card>
      </>
    )

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

    /* PHONE — §11.1: a list of sections, each tapping through to its own
       screen. Four rows since the 15 Aug cut, and no Overview row — Overview
       was deleted, not hidden, so there is no longer a section the list has to
       reach by a separate button underneath it. */
    if (onPhoneList) {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-sm)' }}>
          {tabs.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => go(t.key)}
                style={{
                  ...cardStyle,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--sp-md)',
                  width: '100%',
                  minHeight: 64,
                  padding: 'var(--sp-md)',
                  fontFamily: 'inherit',
                  textAlign: 'left',
                  cursor: 'pointer',
                }}
              >
                <Icon name={TAB_ICON[t.key]} size={20} style={{ color: 'var(--nav-active-accent)', flexShrink: 0 }} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 'var(--t-ui)', fontWeight: 700, color: 'var(--text)' }}>
                    {t.label}
                  </span>
                  <span style={{ display: 'block', marginTop: 2, fontSize: 'var(--t-th)', color: 'var(--text2)', lineHeight: 1.5 }}>
                    {TAB_SUMMARY[t.key]}
                  </span>
                </span>
                <Icon name="chevron_right" size={16} style={{ color: 'var(--muted)', flexShrink: 0 }} />
              </button>
          ))}
        </div>
      )
    }

    /* PHONE — one section, full screen. Rulings §4: breadcrumbs everywhere,
       and the `←` in the wireframes is shorthand for "this is a sub-page", not
       an order to add a Back button. The crumb is the way up. */
    if (phone) {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)', minWidth: 0 }}>
          <nav aria-label="Breadcrumb" style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            {/* The crumb is the only way back up on phone — §4 rules out a
                Back button — so it is the single most important target on this
                layout, and it was a borderless 32px word with 2px of padding.
                `tap` rather than a taller box because a breadcrumb that stands
                44px tall reads as a button and stops reading as a trail; the
                chevron and the current-page label beside it are inert, so
                nothing is there to be stolen from. */}
            <button
              type="button"
              className="tap"
              onClick={toList}
              style={{
                ...controlStyle,
                minHeight: 32,
                border: 'none',
                background: 'transparent',
                padding: '0 2px',
                color: 'var(--link)',
              }}
            >
              Settings
            </button>
            <Icon name="chevron_right" size={12} style={{ color: 'var(--muted)' }} />
            <span aria-current="page" style={{ fontSize: 'var(--t-meta)', fontWeight: 700, color: 'var(--text)' }}>
              {activeTab?.label ?? 'Overview'}
            </span>
          </nav>
          {panel}
          {/* Below 1280 the rail reflows under the panel rather than collapsing
              behind a handle — Rulings §7. */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>{rail}</div>
        </div>
      )
    }

    /* DESKTOP — left tab column, right panel. TABLET — the same tabs, scrolling
       in one row, panel full width. */
    return (
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: desktop ? `${TAB_COLUMN_WIDTH}px minmax(0,1fr) auto` : 'minmax(0,1fr)',
          gap: 'var(--sp-md)',
          alignItems: 'start',
        }}
      >
        {desktop ? (
          <nav aria-label="Settings sections" style={{ display: 'flex', flexDirection: 'column', gap: 2, position: 'sticky', top: 0 }}>
            {tabs.map((t) => {
              const on = t.key === active
              return (
                <button
                  key={t.key}
                  type="button"
                  aria-current={on ? 'page' : undefined}
                  onClick={() => go(t.key)}
                  style={{
                    ...tabButtonBase,
                    borderColor: on ? 'var(--nav-active-accent)' : 'transparent',
                    background: on ? 'var(--nav-active-bg)' : 'transparent',
                    color: on ? 'var(--nav-active-accent)' : 'var(--text2)',
                    fontWeight: on ? 700 : 500,
                  }}
                >
                  <Icon name={TAB_ICON[t.key]} size={15} style={{ flexShrink: 0 }} />
                  <span style={{ minWidth: 0 }}>{t.label}</span>
                </button>
              )
            })}
          </nav>
        ) : (
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
                    minHeight: 44,
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
                    flexShrink: 0,
                  }}
                >
                  {TAB_SHORT_LABEL[t.key]}
                </button>
              )
            })}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)', minWidth: 0 }}>
          {!desktop && (
            <h2 style={{ margin: 0, fontSize: 'var(--t-h3)', fontWeight: 700, color: 'var(--text)' }}>
              {activeTab?.label ?? 'Overview'}
            </h2>
          )}
          {panel}
          {/* Tablet: the rail's content moves *below* the panel, still visible.
              Not `CollapsibleAside` — Rulings §7 reads "collapse" as reflow, and
              other pages depend on that component's defaults. */}
          {!desktop && <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>{rail}</div>}
        </div>

        {desktop && <Rail label="Settings summary">{rail}</Rail>}
      </div>
    )
  })()

  return (
    <GoTab.Provider value={go}>
      <VisibleTabs.Provider value={tabs}>
        <EditCtx.Provider value={edit}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
            <PageHeader
              icon="settings"
              title="Settings"
              actions={headerActions}
            />

            {/* Law 12 — errors inline, toasts for successes only. */}
            {leaveError && <ErrorBanner title="Unsaved changes." message={leaveError} />}

            {/* These writes are real — `lib/settingsStore` persists them and
                `getSetting` reads them back. But localStorage is per-browser,
                and an Owner changing the VAT rate would reasonably expect it to
                reach everyone. Saying where the value actually lands is the
                difference between a working setting and a misleading one. */}
            {edit.editing && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 'var(--sp-sm)',
                  padding: '10px 12px',
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

            {/* A seed that stops reconciling is shown, not thrown — a
                module-scope throw runs before React mounts and blanks the app
                with no message. §11.3's branch ▸ warehouse join is asserted
                here per branch, not as a group total. */}
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
        </EditCtx.Provider>
      </VisibleTabs.Provider>
    </GoTab.Provider>
  )
}

/* `DestControl` is re-exported so the sibling screens in this module (Tools,
   Business Hours) can keep importing it from `Settings` as they always have,
   without reaching into `sections/`. */
export { DestControl }
