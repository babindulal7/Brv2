import { memo } from 'react'
import Icon from '../../../components/ui/Icon'
import { TouchTarget } from '../../../components/ui/TouchTarget'
import { formatMoney, rupees } from '../../../lib/money'

interface BundleItemsTableProps {
  hydratedBundleItems: any[]
  clearAllItems: () => void
  updateItem: (id: string, field: string, val: string) => void
  toggleItem: (id: string) => void
}

export const BundleItemsTable = memo(({ hydratedBundleItems, clearAllItems, updateItem, toggleItem }: BundleItemsTableProps) => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', background: 'var(--bg)', flex: 1, overflow: 'hidden' }}>
      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 'var(--t-ui)', fontWeight: 600, color: 'var(--text)' }}>
          <span style={{ width: 22, height: 22, borderRadius: '50%', background: 'var(--nav-active-accent)', color: 'white', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, marginRight: 'var(--sp-sm)', verticalAlign: 'middle' }}>3</span>
          Bundle Items <span style={{ color: 'var(--muted)', fontWeight: 400 }}>({hydratedBundleItems.length})</span>
        </span>
        <button 
          onClick={clearAllItems} 
          style={{ background: 'none', border: 'none', fontSize: 'var(--t-th)', color: 'var(--nav-active-accent)', cursor: 'pointer', padding: 0 }}
          aria-label="Clear all bundle items"
        >
          Clear All Items
        </button>
      </div>

      <div style={{ overflowX: 'auto', flex: 1 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--t-meta)', minWidth: 600 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text2)', textAlign: 'left', background: 'var(--hover)' }}>
              <th style={{ padding: '8px 12px', fontWeight: 500 }}>Equipment Model<br/><span style={{ fontSize: 'var(--t-th)', color: 'var(--muted)' }}>Category</span></th>
              <th style={{ padding: '8px 12px', fontWeight: 500, textAlign: 'center' }}>Required<br/>Qty</th>
              <th style={{ padding: '8px 12px', fontWeight: 500, textAlign: 'right' }}>Original Rate<br/><span style={{ fontSize: 'var(--t-th)' }}>per day</span></th>
              <th style={{ padding: '8px 12px', fontWeight: 500, width: 140 }}>Discount</th>
              <th style={{ padding: '8px 12px', fontWeight: 500, textAlign: 'right' }}>Bundle Price<br/><span style={{ fontSize: 'var(--t-th)' }}>per day</span></th>
              <th style={{ padding: '8px 12px', fontWeight: 500, textAlign: 'center' }}>Children</th>
              <th style={{ padding: '8px 12px', fontWeight: 500, textAlign: 'center' }}>Availability</th>
              <th style={{ padding: '8px 12px', fontWeight: 500, textAlign: 'center' }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {hydratedBundleItems.map((item) => (
              <tr key={item.id} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '8px 12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-sm)' }}>
                    <div>
                      <div style={{ color: 'var(--text)', fontWeight: 500 }}>{item.inv.name}</div>
                      <div style={{ fontSize: 'var(--t-th)', color: 'var(--muted)' }}>{item.inv.cat}</div>
                    </div>
                  </div>
                </td>
                <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                  <input 
                    type="number" 
                    min="1" 
                    aria-label={`Required quantity for ${item.inv.name}`}
                    value={item.qty} 
                    onChange={(e) => updateItem(item.id, 'qty', e.target.value)} 
                    style={{ width: 50, height: 28, textAlign: 'center', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text)', fontSize: 'var(--t-meta)' }} 
                  />
                </td>
                <td style={{ padding: '8px 12px', textAlign: 'right', color: 'var(--text)' }}>
                  Rs {formatMoney(rupees(item.orig))}
                </td>
                <td style={{ padding: '8px 12px' }}>
                  <div style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: 4, height: 28 }}>
                    <button 
                      onClick={() => updateItem(item.id, 'discMode', item.discMode === '%' ? 'Rs' : '%')} 
                      style={{ padding: '0 8px', background: 'var(--bg)', borderRight: '1px solid var(--border)', borderTop: 'none', borderBottom: 'none', borderLeft: 'none', display: 'flex', alignItems: 'center', color: 'var(--muted)', fontSize: 'var(--t-th)', borderRadius: '4px 0 0 4px', cursor: 'pointer' }}
                      aria-label="Toggle discount mode between percentage and flat rate"
                    >
                      {item.discMode}
                    </button>
                    <input 
                      type="text" 
                      aria-label={`Discount value for ${item.inv.name}`}
                      value={item.discVal} 
                      onChange={(e) => updateItem(item.id, 'discVal', e.target.value)} 
                      style={{ width: '100%', height: '100%', background: 'var(--bg)', border: 'none', color: 'var(--text)', fontSize: 'var(--t-meta)', padding: '0 8px', minWidth: 0, borderRadius: '0 4px 4px 0' }} 
                    />
                  </div>
                </td>
                <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                  <div style={{ color: 'var(--success-text)', fontWeight: 600 }}>Rs {formatMoney(rupees(item.finalRate))}</div>
                  <div style={{ color: 'var(--muted)', fontSize: 'var(--t-th)', textDecoration: 'line-through' }}>Rs {formatMoney(rupees(item.orig))}</div>
                </td>
                <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                  <span style={{ display: 'inline-block', padding: '2px 8px', background: 'var(--hover)', border: '1px solid var(--border)', borderRadius: 'var(--r-btn)', color: 'var(--text2)', fontSize: 'var(--t-th)' }}>
                    0
                  </span>
                </td>
                <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                  <div style={{ color: item.blocked > 0 ? 'var(--danger-text)' : 'var(--text)' }}>{item.ready} / {item.qty}</div>
                  {item.blocked > 0 ? (
                    <div style={{ color: 'var(--danger-text)', fontSize: 'var(--t-th)', fontWeight: 600 }}>Short by {item.blocked}</div>
                  ) : (
                    <div style={{ color: 'var(--success-text)', fontSize: 'var(--t-th)' }}>Available</div>
                  )}
                </td>
                <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                  {/*
                    Law 14 / §7.3 — hit area, not paint. This is a 16px glyph in 4px
                    of padding: 24×24, a bit over half the floor. Growing the PAINT to
                    44 would widen the Action column and set the height of every row in
                    a table that is meant to stay dense, so the invisible target grows
                    instead. It has room to: the cell holds nothing else, the row is
                    ~46px tall from the two-line Equipment Model and Availability cells
                    either side, and the nearest other control (the discount input) is a
                    full column away.
                  */}
                  <button 
                    onClick={() => toggleItem(item.id)} 
                    style={{ position: 'relative', background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', display: 'inline-flex', padding: 'var(--sp-xs)' }}
                    aria-label={`Remove ${item.inv.name} from bundle`}
                  >
                    <TouchTarget />
                    <Icon name="close" size={16} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        
        {hydratedBundleItems.length === 0 && (
          <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--muted)', fontSize: 'var(--t-meta)' }}>
            Search inventory on the left to add items to your bundle.
          </div>
        )}
      </div>
    </div>
  )
})
