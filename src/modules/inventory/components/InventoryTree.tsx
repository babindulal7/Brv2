/*
 * TODO(decision) §4.41 — THIS FILE HAS NO IMPORTER. Nothing renders it.
 *
 * It came out of a 600-line split (`PROGRESS.md:10209`) that was never adopted:
 * the live, routed `AddBundle` (`App.tsx:348`) carries its own inline tree.
 *
 * ⚠ `FUNCTIONAL_BUGS.md` BUG-007 files the `Collapse All` button below as a
 * dead control, and `FUNCTIONAL_FIX_PLAN.md` item #4 scopes wiring it as an XS
 * fix. **Do not.** This component never renders, so wiring it changes nothing a
 * user can reach. Answer PLAN.md §4.41(b) instead.
 */
import React, { memo } from 'react'
import Icon from '../../../components/ui/Icon'

interface InventoryTreeProps {
  inventory: any[]
  searchQuery: string
  bundleItems: any[]
  toggleItem: (id: string) => void
  selectAllTree: () => void
}

export const InventoryTree = memo(({ inventory, searchQuery, bundleItems, toggleItem, selectAllTree }: InventoryTreeProps) => {
  return (
    <div style={{ borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 'var(--t-ui)', fontWeight: 600, color: 'var(--text)' }}>Inventory Tree</span>
        <div style={{ display: 'flex', gap: 'var(--sp-md)', fontSize: 'var(--t-th)', color: 'var(--nav-active-accent)' }}>
          <button onClick={selectAllTree} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: 0 }} aria-label="Select all inventory items">Select All</button>
          <button style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: 0 }} aria-label="Collapse all inventory categories">Collapse All</button>
        </div>
      </div>
      <div style={{ padding: '8px 16px', display: 'flex', justifyContent: 'space-between', fontSize: 'var(--t-th)', color: 'var(--muted)', borderBottom: '1px solid var(--border)' }}>
        <span style={{ flex: 1 }}>Select equipment models and their children</span>
        <div style={{ display: 'flex', gap: 'var(--sp-lg)', width: 140, justifyContent: 'flex-end', fontWeight: 600 }}>
          <span>Stock</span>
          <span style={{ color: 'var(--text)' }}>Avail</span>
          <span>Res</span>
          <span>Rent</span>
        </div>
      </div>
      
      <div style={{ flex: 1, overflowY: 'auto' }} role="tree" aria-label="Equipment Inventory">
        {inventory.map((parent) => {
          const parentSelected = bundleItems.find(i => i.id === parent.id)
          const pMatch = parent.name.toLowerCase().includes(searchQuery.toLowerCase())
          const cMatch = parent.children.some((c: any) => c.name.toLowerCase().includes(searchQuery.toLowerCase()))
          if (searchQuery && !pMatch && !cMatch) return null

          return (
            <React.Fragment key={parent.id}>
              {/* Parent Node */}
              <div 
                onClick={() => toggleItem(parent.id)} 
                role="treeitem" 
                aria-expanded="true" 
                aria-selected={!!parentSelected}
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') toggleItem(parent.id) }}
                /*
                  Law 14 — the ROW is the control here, not the 16px box drawn inside
                  it: the click handler, `role="treeitem"`, `tabIndex` and the Enter/Space
                  key handler all live on this div, and the little square is decoration
                  the row paints to show its own selected state. So there is no invisible
                  target to add — the hit area already covers the full width.
                  What it did NOT have was a guaranteed height. 8px padding + a 14px name
                  + a 13px code + the 1px rule lands on 44 exactly, with nothing to spare
                  for a shorter font stack or a row whose code line is missing. `--tap` as
                  a floor makes the compliance a stated rule rather than an arithmetic
                  coincidence.
                */
                style={{ padding: '8px 16px', minHeight: 'var(--tap)', display: 'flex', alignItems: 'center', gap: 'var(--sp-md)', background: 'var(--bg)', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}
              >
                <div style={{ width: 16, height: 16, border: '1px solid var(--border)', borderRadius: 3, background: parentSelected ? 'var(--nav-active-accent)' : 'transparent', position: 'relative' }}>
                  {parentSelected && <span style={{ color: 'white', position: 'absolute', top: 1, left: 1, display: 'flex' }}><Icon name="check" size={12} /></span>}
                </div>
                {parent.isParent ? <span style={{ color: 'var(--muted)', display: 'flex' }} aria-hidden="true"><Icon name="chevron_down" size={14} /></span> : <div style={{ width: 14 }} />}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{ fontSize: 'var(--t-meta)', color: 'var(--text)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                    title={parent.name}
                  >
                    {parent.name}
                  </div>
                  <div style={{ fontSize: 'var(--t-th)', color: 'var(--muted)', fontFamily: 'monospace' }}>{parent.code}</div>
                </div>
                <div style={{ display: 'flex', gap: 'var(--sp-lg)', width: 140, flexShrink: 0, justifyContent: 'flex-end', fontSize: 'var(--t-meta)', fontWeight: 600 }}>
                  <span style={{ width: 24, textAlign: 'center', color: 'var(--text)' }}>{parent.stock}</span>
                  <span style={{ width: 24, textAlign: 'center', color: parent.avail > 0 ? 'var(--success-text)' : 'var(--danger-text)' }}>{parent.avail}</span>
                  <span style={{ width: 24, textAlign: 'center', color: 'var(--text)' }}>{parent.reserved}</span>
                  <span style={{ width: 24, textAlign: 'center', color: 'var(--text)' }}>{parent.onRent}</span>
                </div>
              </div>

              {/* Children */}
              {parent.isParent && parent.children.map((child: any) => {
                const childSelected = bundleItems.find(i => i.id === child.id)
                const cMatchItem = child.name.toLowerCase().includes(searchQuery.toLowerCase())
                if (searchQuery && !pMatch && !cMatchItem) return null
                
                return (
                  <div 
                    onClick={() => toggleItem(child.id)} 
                    key={child.id} 
                    role="treeitem" 
                    aria-selected={!!childSelected}
                    tabIndex={0}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') toggleItem(child.id) }}
                    /* Same as the parent row above — the row is the control, `--tap` is
                       its floor rather than an accident of the type scale. */
                    style={{ padding: '8px 16px 8px 48px', minHeight: 'var(--tap)', display: 'flex', alignItems: 'center', gap: 'var(--sp-md)', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}
                  >
                    <div style={{ width: 16, height: 16, border: '1px solid var(--border)', borderRadius: 3, background: childSelected ? 'var(--nav-active-accent)' : 'transparent', position: 'relative' }}>
                      {childSelected && <span style={{ color: 'white', position: 'absolute', top: 1, left: 1, display: 'flex' }}><Icon name="check" size={12} /></span>}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                        title={child.name}
                      >
                        {child.name}
                      </div>
                      <div style={{ fontSize: 'var(--t-th)', color: 'var(--muted)', fontFamily: 'monospace' }}>{child.code}</div>
                    </div>
                    <div style={{ display: 'flex', gap: 'var(--sp-lg)', width: 140, flexShrink: 0, justifyContent: 'flex-end', fontSize: 'var(--t-meta)', fontWeight: 600 }}>
                      <span style={{ width: 24, textAlign: 'center', color: 'var(--text2)' }}>{child.stock}</span>
                      <span style={{ width: 24, textAlign: 'center', color: child.avail > 0 ? 'var(--success-text)' : 'var(--danger-text)' }}>{child.avail}</span>
                      <span style={{ width: 24, textAlign: 'center', color: 'var(--text2)' }}>{child.reserved}</span>
                      <span style={{ width: 24, textAlign: 'center', color: 'var(--text2)' }}>{child.onRent}</span>
                    </div>
                  </div>
                )
              })}
            </React.Fragment>
          )
        })}
      </div>
    </div>
  )
})
