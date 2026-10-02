import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import Icon from '../../components/ui/Icon'
import type { IconName } from '../../components/ui/Icon'
import { PageHeader, FooterNote, cardStyle } from '../../components/ui/Page'
import { FilterButton, FilterDrawer } from '../../components/ui/FilterDrawer'
import { PageShell } from '../../components/ui/PageShell'
import { useViewport } from '../../lib/device'
import { useCanViewMoney } from '../../lib/moneyVisibility'
import { isMoneySurface, getToolsStatus } from '../../lib/queries/tools'
import DepreciationCalculator from './DepreciationCalculator'
import PricingCalculator from './PricingCalculator'
import CineTools from '../settings/Tools'
import LateFeeCalculator from './LateFeeCalculator'
import QrGenerator from './QrGeneratorModal'
import BundleQuickBuilder from './BundleQuickBuilder'
import CouponsManager from './CouponsManager'

/**
 * **Tools — Integrated Workbench**
 *
 * All calculators are integrated directly within this screen via tabs:
 * Overview · Depreciation · Pricing · Cinematography
 *
 * No external links or shortcut bounces to standalone pages.
 */

export type ToolsTab = 'overview' | 'depreciation' | 'pricing' | 'cinematography' | 'latefee' | 'qr' | 'bundle' | 'coupons'

interface ToolCard {
  label: string
  hint: string
  icon: IconName
  tab: ToolsTab
  to: string
  unbuilt?: boolean
}

interface ToolGroup {
  heading: string
  desktopColumns: number
  note?: string
  cards: ToolCard[]
}

const GROUPS: ToolGroup[] = [
  {
    heading: 'Calculators',
    desktopColumns: 2,
    cards: [
      {
        label: 'Depreciation',
        hint: 'Book view · IRD pool view (schedule & book value curve)',
        icon: 'chart',
        tab: 'depreciation',
        to: '/tools/depreciation',
      },
      {
        label: 'Pricing',
        hint: 'Rate, days, discount — quote sandbox engine',
        icon: 'dollar',
        tab: 'pricing',
        to: '/tools/pricing',
      },
    ],
  },
  {
    heading: 'Commercial Utilities',
    desktopColumns: 2,
    cards: [
      {
        label: 'Late Fee',
        hint: 'Overtime returns past 6:00 AM cutoff + 25% surcharge',
        icon: 'timer',
        tab: 'latefee',
        to: '/tools/latefee',
      },
      {
        label: 'Coupons & Promos',
        hint: 'Active promo codes, 25% cap rule & sandbox simulator',
        icon: 'receipt',
        tab: 'coupons',
        to: '/tools/coupons',
      },
    ],
  },
  {
    heading: 'Equipment & Package Utilities',
    desktopColumns: 2,
    cards: [
      {
        label: 'QR & Barcode Generator',
        hint: 'Serialized gear asset tags and printable barcode labels',
        icon: 'barcode',
        tab: 'qr',
        to: '/tools/qr',
      },
      {
        label: 'Bundle Quick-Builder',
        hint: 'Create kit packages with combined day-rates & discounts',
        icon: 'box',
        tab: 'bundle',
        to: '/tools/bundle',
      },
    ],
  },
  {
    heading: 'Cinematography suite',
    desktopColumns: 2,
    note: '15 categories of camera, lens, exposure, timecode and power calculators.',
    cards: [
      {
        label: 'Camera & lens tools',
        hint: 'Crop factor · field of view · depth of field · ND · timecode · storage · battery',
        icon: 'camera',
        tab: 'cinematography',
        to: '/tools/cinematography',
      },
    ],
  },
]

function visibleGroups(money: boolean): ToolGroup[] {
  if (money) return GROUPS
  return GROUPS.map((g) => ({
    ...g,
    cards: g.cards.filter((c) => !isMoneySurface(c.to)),
  })).filter((g) => g.cards.length > 0)
}

export default function ToolsLanding() {
  const viewport = useViewport()
  const money = useCanViewMoney()
  const groups = useMemo(() => visibleGroups(money), [money])
  const [params, setParams] = useSearchParams()
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [selectedGroup, setSelectedGroup] = useState('')
  const filteredGroups = selectedGroup ? groups.filter((group) => group.heading === selectedGroup) : groups
  const visibleToolCount = filteredGroups.reduce((total, group) => total + group.cards.length, 0)

  useEffect(() => {
    void getToolsStatus()
  }, [])

  const currentTab = (params.get('tab') ?? 'overview') as ToolsTab
  const activeTab: ToolsTab = ['overview', 'depreciation', 'pricing', 'cinematography', 'latefee', 'qr', 'bundle', 'coupons'].includes(currentTab)
    ? currentTab
    : 'overview'

  const setTab = (t: ToolsTab) => {
    const next = new URLSearchParams(params)
    if (t === 'overview') next.delete('tab')
    else next.set('tab', t)
    setParams(next)
  }

  const tabs: Array<{ key: ToolsTab; label: string; icon: IconName; money?: boolean }> = [
    { key: 'overview', label: 'Overview', icon: 'tool' },
    ...(money
      ? [
          { key: 'depreciation' as const, label: 'Depreciation', icon: 'chart' as const, money: true },
          { key: 'pricing' as const, label: 'Pricing', icon: 'dollar' as const, money: true },
          { key: 'latefee' as const, label: 'Late Fee', icon: 'timer' as const },
        ]
      : []),
    { key: 'coupons' as const, label: 'Coupons & Promos', icon: 'receipt' as const },
    { key: 'qr' as const, label: 'QR & Barcodes', icon: 'barcode' as const },
    { key: 'bundle' as const, label: 'Bundle Builder', icon: 'box' as const },
    { key: 'cinematography', label: 'Cinematography Suite', icon: 'camera' },
  ]

  return (
    <PageShell width="full">
      <PageHeader
        icon="tool"
        title="Tools"
        {...(activeTab === 'overview' ? { leading: <FilterButton onClick={() => setFiltersOpen((open) => !open)} controls="tools-filters" expanded={filtersOpen} activeCount={Number(Boolean(selectedGroup))} /> } : {})}
        description="Integrated calculators and technical utilities — work within the workbench without external shortcuts."
      />
      <FilterDrawer id="tools-filters" open={filtersOpen && activeTab === 'overview'} onClose={() => setFiltersOpen(false)} resultCount={visibleToolCount} noun="tools" activeCount={Number(Boolean(selectedGroup))} onClearAll={() => setSelectedGroup('')} standardFooter onApply={() => setFiltersOpen(false)}>
        <label style={{ display: 'grid', gap: 8, fontWeight: 600 }}>Category
          <select aria-label="Filter tools by category" value={selectedGroup} onChange={(event) => setSelectedGroup(event.target.value)} style={{ minHeight: 44, width: '100%' }}>
            <option value="">All categories</option>
            {groups.map((group) => <option key={group.heading} value={group.heading}>{group.heading}</option>)}
          </select>
        </label>
      </FilterDrawer>

      {/* Tabs strip */}
      <div
        role="tablist"
        aria-label="Tools navigation"
        style={{
          display: 'flex',
          gap: 'var(--sp-xs)',
          borderBottom: '1px solid var(--border)',
          overflowX: 'auto',
        }}
      >
        {tabs.map((t) => {
          const on = activeTab === t.key
          return (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => setTab(t.key)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 7,
                height: 38,
                padding: '0 14px',
                border: 'none',
                borderBottom: `2px solid ${on ? 'var(--nav-active-accent)' : 'transparent'}`,
                background: 'transparent',
                color: on ? 'var(--nav-active-accent)' : 'var(--text2)',
                fontSize: 'var(--t-meta)',
                fontWeight: on ? 700 : 500,
                cursor: 'pointer',
                fontFamily: 'inherit',
                whiteSpace: 'nowrap',
                marginBottom: -1,
              }}
            >
              <Icon name={t.icon} size={14} />
              {t.label}
            </button>
          )
        })}
      </div>

      {activeTab === 'overview' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-lg)' }}>
          {filteredGroups.map((group) => (
            <section key={group.heading} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-sm)' }}>
              <h2
                style={{
                  margin: 0,
                  fontSize: 'var(--t-meta)',
                  fontWeight: 700,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  color: 'var(--text2)',
                }}
              >
                {group.heading}
              </h2>
              {group.note && (
                <p style={{ margin: 0, fontSize: 'var(--t-meta)', color: 'var(--muted)', lineHeight: 1.5 }}>
                  {group.note}
                </p>
              )}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: `repeat(${
                    viewport === 'phone'
                      ? 1
                      : viewport === 'tablet'
                        ? Math.min(2, group.cards.length)
                        : Math.min(group.desktopColumns, group.cards.length)
                  }, minmax(0, 1fr))`,
                  gap: 'var(--sp-md)',
                }}
              >
                {group.cards.map((card) => (
                  <Link
                    key={card.tab}
                    to={card.to}
                    onClick={(e) => {
                      e.preventDefault()
                      setTab(card.tab)
                    }}
                    style={{
                      ...cardStyle,
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 12,
                      minHeight: 88,
                      padding: 14,
                      textAlign: 'left',
                      fontFamily: 'inherit',
                      cursor: 'pointer',
                      border: '1px solid var(--border)',
                      background: 'var(--card)',
                      textDecoration: 'none',
                    }}
                  >
                    <span
                      aria-hidden
                      style={{
                        width: 34,
                        height: 34,
                        borderRadius: 'var(--r-sm)',
                        display: 'grid',
                        placeItems: 'center',
                        background: 'var(--nav-active-bg)',
                        color: 'var(--nav-active-accent)',
                        flexShrink: 0,
                      }}
                    >
                      <Icon name={card.icon} size={18} />
                    </span>
                    <span style={{ minWidth: 0, flex: 1, display: 'flex', flexDirection: 'column', gap: 3 }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 'var(--t-ui)', fontWeight: 700, color: 'var(--text)' }}>
                          {card.label}
                        </span>
                      </span>
                      <span style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)', lineHeight: 1.45 }}>
                        {card.hint}
                      </span>
                    </span>
                  </Link>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {activeTab === 'depreciation' && money && <DepreciationCalculator embedded />}
      {activeTab === 'pricing' && money && <PricingCalculator embedded />}
      {activeTab === 'latefee' && <LateFeeCalculator />}
      {activeTab === 'coupons' && <CouponsManager />}
      {activeTab === 'qr' && <QrGenerator />}
      {activeTab === 'bundle' && <BundleQuickBuilder />}
      {activeTab === 'cinematography' && <CineTools embedded />}

      <FooterNote extra={['All calculators run locally within Tools without navigating away']} />
    </PageShell>
  )
}
