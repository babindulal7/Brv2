/*
 * TODO(decision) §4.41 — THIS FILE HAS NO IMPORTER. Nothing renders it.
 *
 * Same abandoned split as `InventoryTree.tsx`: the live, routed `AddBundle`
 * carries its own summary rail.
 *
 * ⚠ `FUNCTIONAL_BUGS.md` BUG-007 files this file's `View all blocked items` and
 * the `Preview` / `Duplicate` / `More` quick actions as dead controls. They are
 * dead, and they are also unreachable — and the live screen is fine:
 * `AddBundle:1950` has a working `View all blocked items` toggle and a working
 * Duplicate. Answer PLAN.md §4.41(b) rather than fixing buttons here.
 */
import { memo } from 'react'
import Icon from '../../../components/ui/Icon'
import { Card } from '../../../components/ui/Card'
import { formatMoney, rupees } from '../../../lib/money'

interface BundleSummaryRailProps {
  availability: {
    totalQty: number
    totalReady: number
    blockedItemsList: any[]
  }
  equipmentCount: number
  boxesCount: number
  pricing: {
    sumOfParts: number
    bundleDiscounts: number
    bundleRate: number
    savingPct: number
  }
}

export const BundleSummaryRail = memo(({ availability, equipmentCount, boxesCount, pricing }: BundleSummaryRailProps) => {
  return (
    <div className="bundle-rail" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-lg)' }}>
      
      <Card title="Bundle Summary">
        <div style={{ display: 'flex', gap: 'var(--sp-xl)', alignItems: 'center', marginBottom: 20 }}>
          <div style={{ width: 100, height: 100, borderRadius: '50%', border: '12px solid var(--success-text)', borderTopColor: availability.blockedItemsList.length > 0 ? 'var(--danger-text)' : 'var(--success-text)', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column' }}>
            <span style={{ fontSize: 'var(--t-h3)', fontWeight: 700, color: 'var(--text)' }}>{availability.totalReady} / {availability.totalQty}</span>
            <span style={{ fontSize: 'var(--t-meta)', color: 'var(--success-text)', fontWeight: 500 }}>Ready</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-sm)', flex: 1, fontSize: 'var(--t-meta)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text)' }}><div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--success-text)' }} /> Available</span>
              <span style={{ color: 'var(--text2)', fontWeight: 600 }}>{availability.totalReady}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text)' }}><div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--danger-text)' }} /> Short</span>
              <span style={{ color: 'var(--text2)', fontWeight: 600 }}>{availability.totalQty - availability.totalReady}</span>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-sm)', fontSize: 'var(--t-meta)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--text)' }}>Total Items</span>
            <span style={{ color: 'var(--text)', fontWeight: 600 }}>{availability.totalQty + 1 + 1}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--muted)' }}>Equipment</span>
            <span style={{ color: 'var(--text2)' }}>{equipmentCount}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--muted)' }}>Crew (not in rate)</span>
            <span style={{ color: 'var(--text2)' }}>1</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--muted)' }}>Vehicle (not in rate)</span>
            <span style={{ color: 'var(--text2)' }}>1</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--muted)' }}>Boxes / Bags</span>
            <span style={{ color: 'var(--text2)' }}>{boxesCount}</span>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 'var(--sp-lg)', marginTop: 'var(--sp-lg)', borderTop: '1px solid var(--border)', fontSize: 'var(--t-meta)', fontWeight: 500 }}>
          <span style={{ color: 'var(--text)' }}>Total Weight</span>
          <span style={{ color: 'var(--text)' }}>—</span>
        </div>
      </Card>

      <Card title="Pricing Summary (Equipment Only)">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)', fontSize: 'var(--t-meta)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--text2)', display: 'flex', alignItems: 'center', gap: 'var(--sp-xs)' }}>Sum of Parts <span style={{ color: 'var(--muted)', display: 'flex' }} aria-hidden="true"><Icon name="info" size={14} /></span></span>
            <span style={{ color: 'var(--text)' }}>Rs {formatMoney(rupees(pricing.sumOfParts))}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--text2)' }}>Bundle Discounts</span>
            <span style={{ color: 'var(--danger-text)' }}>- Rs {formatMoney(rupees(pricing.bundleDiscounts))}</span>
          </div>
          
          <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
          
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: 'var(--text)', fontWeight: 600 }}>Bundle Daily Rate</span>
            <span style={{ color: 'var(--success-text)', fontSize: 'var(--t-h3)', fontWeight: 700 }}>Rs {formatMoney(rupees(pricing.bundleRate))}</span>
          </div>
          
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 16px', background: 'var(--st-in-bg)', borderRadius: 'var(--r-xs)', marginTop: 'var(--sp-xs)' }}>
            <span style={{ color: 'var(--success-text)', fontWeight: 500 }}>You Save</span>
            <span style={{ color: 'var(--success-text)', fontWeight: 700 }}>Rs {formatMoney(rupees(pricing.bundleDiscounts))} ({pricing.savingPct}%)</span>
          </div>
        </div>
      </Card>

      <Card title="Availability Summary">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-lg)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-sm)', color: 'var(--success-text)', fontWeight: 600 }}>
            <span style={{ display: 'flex' }} aria-hidden="true"><Icon name="check" size={16} /></span> {availability.totalReady} / {availability.totalQty} Ready
          </div>
          
          {availability.blockedItemsList.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-sm)', color: 'var(--danger-text)', fontWeight: 500, fontSize: 'var(--t-meta)' }}>
              <span style={{ display: 'flex' }} aria-hidden="true"><Icon name="alert_triangle" size={16} /></span> {availability.blockedItemsList.length} blocked items
            </div>
          )}
          
          {availability.blockedItemsList.map((item: any) => (
            <div key={item.id} style={{ padding: '12px', border: '1px solid var(--border)', borderRadius: 'var(--r-xs)', background: 'var(--bg)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 'var(--sp-sm)', marginBottom: 'var(--sp-sm)' }}>
                <span
                  style={{ fontSize: 'var(--t-meta)', fontWeight: 500, color: 'var(--text)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                  title={item.inv.name}
                >
                  {item.inv.name}
                </span>
                <span style={{ fontSize: 'var(--t-th)', padding: '2px 6px', background: 'var(--st-danger-bg)', color: 'var(--st-danger-fg)', borderRadius: 4, fontWeight: 600, flexShrink: 0 }}>Short by {item.blocked}</span>
              </div>
              <div style={{ fontSize: 'var(--t-th)', color: 'var(--muted)' }}>Returns</div>
              <div style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)', display: 'flex', justifyContent: 'space-between' }}>
                <span>4 Shrawan 2083 BS</span>
                <span>19 Jul 2026</span>
              </div>
            </div>
          ))}
          
          {availability.blockedItemsList.length > 0 && (
            <button style={{ background: 'none', border: 'none', color: 'var(--nav-active-accent)', fontSize: 'var(--t-meta)', fontWeight: 500, textAlign: 'left', cursor: 'pointer', padding: 0 }}>
              View all blocked items ({availability.blockedItemsList.length})
            </button>
          )}
        </div>
      </Card>

      <Card title="Quick Actions">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--sp-md)' }}>
          <button style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 'var(--sp-sm)', padding: '16px 0', background: 'var(--hover)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', color: 'var(--text2)', cursor: 'pointer' }} aria-label="Preview Booking">
            <span style={{ display: 'flex' }} aria-hidden="true"><Icon name="file" size={20} /></span>
            <span style={{ fontSize: 'var(--t-th)', fontWeight: 500 }}>Preview</span>
          </button>
          <button style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 'var(--sp-sm)', padding: '16px 0', background: 'var(--hover)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', color: 'var(--text2)', cursor: 'pointer' }} aria-label="Duplicate Bundle">
            <span style={{ display: 'flex' }} aria-hidden="true"><Icon name="plus" size={20} /></span>
            <span style={{ fontSize: 'var(--t-th)', fontWeight: 500 }}>Duplicate</span>
          </button>
          <button style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 'var(--sp-sm)', padding: '16px 0', background: 'var(--hover)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', color: 'var(--text2)', cursor: 'pointer' }} aria-label="More Actions">
            <span style={{ display: 'flex' }} aria-hidden="true"><Icon name="more_vert" size={20} /></span>
            <span style={{ fontSize: 'var(--t-th)', fontWeight: 500 }}>More</span>
          </button>
        </div>
      </Card>

    </div>
  )
})
