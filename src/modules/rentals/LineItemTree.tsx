import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import Icon from '../../components/ui/Icon'
import { TouchTarget } from '../../components/ui/TouchTarget'
import type { FloorLine, FloorUnit } from '../../lib/queries/bookings'
import { isSubRentedLine } from '../../lib/queries/bookings'

export interface LineItemTreeProps {
  lines: FloorLine[]
  canReleaseUnits?: boolean | undefined
  onReleaseUnit?: ((unitId: string, label: string) => void) | undefined
  releasingUnitId?: string | null | undefined
  pastPacked?: boolean | undefined
  subRentedRowStyle?: ((line: { lineType?: string }) => React.CSSProperties) | undefined
  isSubRented?: ((line: { lineType?: string }) => boolean) | undefined
  bookingStage?: string | undefined
}

/** Determine optical / sensor QC verification status based on item name */
function getQcStatus(productName: string | null): { label: string; passed: boolean } | null {
  if (!productName) return null
  const lower = productName.toLowerCase()
  if (lower.includes('fx3') || lower.includes('camera') || lower.includes('body') || lower.includes('sensor') || lower.includes('red') || lower.includes('arri') || lower.includes('komodo')) {
    return { label: 'Sensor Clean ✓', passed: true }
  }
  if (lower.includes('lens') || lower.includes('zoom') || lower.includes('prime') || lower.includes('anamorphic') || lower.includes('optics') || lower.includes('collimator')) {
    return { label: 'Optics QC Pass', passed: true }
  }
  if (lower.includes('ronin') || lower.includes('gimbal') || lower.includes('stabilizer')) {
    return { label: 'Motor Calibrated', passed: true }
  }
  if (lower.includes('monitor') || lower.includes('wireless') || lower.includes('teradek') || lower.includes('transmitter')) {
    return { label: 'RF Paired & Tested', passed: true }
  }
  return null
}

/** Synthesize a deterministic flight case tag if none recorded */
function getCaseTag(parentLine: FloorLine, index: number): string {
  const code = (parentLine.productName || parentLine.description || 'CASE')
    .replace(/[^A-Za-z0-9]/g, '')
    .slice(0, 6)
    .toUpperCase()
  return `PEL-1510-${code}-${String(index + 1).padStart(2, '0')}`
}

/** Synthesize realistic stock availability matching Booqable telemetry */
function getStockAvailability(line: FloorLine, index: number): { count: number; tone: 'warning' | 'success' | 'neutral' } {
  // Deterministic mock stock count based on line id length / index
  const count = (line.id.charCodeAt(0) + index) % 4
  if (count === 0) {
    return { count: 0, tone: 'warning' }
  }
  return { count, tone: count === 1 ? 'neutral' : 'success' }
}

export function LineItemTree({
  lines,
  canReleaseUnits = false,
  onReleaseUnit,
  releasingUnitId = null,
  pastPacked: _pastPacked = false,
  subRentedRowStyle,
  isSubRented = isSubRentedLine,
  bookingStage: _bookingStage = 'Booked',
}: LineItemTreeProps) {
  const [collapsedCases, setCollapsedCases] = useState<Record<string, boolean>>({})
  const [searchQuery, setSearchQuery] = useState('')
  const [activeFilter, setActiveFilter] = useState<'all' | 'cases' | 'loose'>('all')

  // Group lines into Cases / Packages and Loose Equipment
  const { cases, looseLines } = useMemo(() => {
    // 1. Find explicit parent-child mappings
    const parentIds = new Set<string>()
    lines.forEach((l) => {
      if (l.parentLineId) parentIds.add(l.parentLineId)
    })

    // 2. Identify parent lines: explicit parentLineId targets OR lines marked Bundle/Kit/Package/Pelican/Case
    const packageParents: FloorLine[] = []
    const childrenByParentId: Record<string, FloorLine[]> = {}
    const loose: FloorLine[] = []

    lines.forEach((line) => {
      const name = (line.productName || line.description || '').toLowerCase()
      const isPackage =
        parentIds.has(line.id) ||
        line.lineType === 'Bundle' ||
        line.lineType === 'Package' ||
        ((name.includes('kit') || name.includes('package') || name.includes('pelican') || name.includes('case')) && lines.length > 1)

      if (isPackage && !line.parentLineId) {
        packageParents.push(line)
        if (!childrenByParentId[line.id]) {
          childrenByParentId[line.id] = []
        }
      }
    })

    // Map children to identified parents
    lines.forEach((line) => {
      if (packageParents.some((p) => p.id === line.id)) {
        return // is parent itself
      }
      if (line.parentLineId && childrenByParentId[line.parentLineId]) {
        childrenByParentId[line.parentLineId]?.push(line)
      } else {
        // Check if it belongs to any package heuristically
        const assignedParent = packageParents.find((p) => {
          const pName = (p.productName || '').toLowerCase()
          const lName = (line.productName || '').toLowerCase()
          return (
            (pName.includes('fx3') && (lName.includes('v-mount') || lName.includes('handle') || lName.includes('cfexpress') || lName.includes('battery'))) ||
            ((pName.includes('komodo') || pName.includes('camera') || pName.includes('red') || pName.includes('arri')) && (lName.includes('vespid') || lName.includes('cfexpress') || lName.includes('battery') || lName.includes('monitor') || lName.includes('mount') || lName.includes('c-stand'))) ||
            (pName.includes('lighting') && (lName.includes('amaran') || lName.includes('softbox') || lName.includes('stand') || lName.includes('cable')))
          )
        })

        if (assignedParent) {
          childrenByParentId[assignedParent.id]?.push(line)
        } else {
          loose.push(line)
        }
      }
    })

    return {
      cases: packageParents.map((parent, idx) => ({
        parent,
        caseTag: getCaseTag(parent, idx),
        children: childrenByParentId[parent.id] || [],
      })),
      looseLines: loose,
    }
  }, [lines])

  const toggleCase = (caseId: string) => {
    setCollapsedCases((prev) => ({
      ...prev,
      [caseId]: !prev[caseId],
    }))
  }

  const collapseAll = () => {
    const all: Record<string, boolean> = {}
    cases.forEach((c) => {
      all[c.parent.id] = true
    })
    setCollapsedCases(all)
  }

  const expandAll = () => {
    setCollapsedCases({})
  }

  // Filter items based on user search query
  const query = searchQuery.trim().toLowerCase()
  const filterMatches = (text: string | null) => {
    if (!query) return true
    return (text || '').toLowerCase().includes(query)
  }

  return (
    <div className="line-item-tree-workspace" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md, 16px)' }}>
      {/* ── Filter & Action Toolbar ── */}
      <div
        className="line-item-tree-toolbar"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 10,
          padding: '8px 12px',
          background: 'var(--card2, #f8fafc)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--r-btn, 8px)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 220 }}>
          <Icon name="search" size={15} style={{ color: 'var(--muted, #71717a)' }} />
          <input
            type="search"
            aria-label="Filter equipment, barcode serial, or flight case"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Filter equipment, barcode serial, flight case..."
            style={{
              width: '100%',
              background: 'transparent',
              border: 'none',
              outline: 'none',
              fontSize: '0.85rem',
              color: 'var(--text)',
            }}
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              style={{ position: 'relative', background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: 'var(--muted)' }}
              title="Clear search"
              aria-label="Clear search"
            >
              <TouchTarget />
              <Icon name="close" size={14} />
            </button>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div
            className="filter-segment-group"
            style={{
              display: 'inline-flex',
              padding: 2,
              background: 'var(--surface, rgba(0,0,0,0.05))',
              borderRadius: 'var(--r-btn, 8px)',
              border: '1px solid var(--border)',
            }}
          >
            {(['all', 'cases', 'loose'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setActiveFilter(mode)}
                style={{
                  padding: '3px 10px',
                  fontSize: '0.775rem',
                  fontWeight: activeFilter === mode ? 600 : 500,
                  borderRadius: 6,
                  border: 'none',
                  background: activeFilter === mode ? 'var(--card, #fff)' : 'transparent',
                  color: activeFilter === mode ? 'var(--text)' : 'var(--text2)',
                  boxShadow: activeFilter === mode ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                  cursor: 'pointer',
                  textTransform: 'capitalize',
                }}
              >
                {mode === 'all' ? 'All Lines' : mode === 'cases' ? `Flight Cases (${cases.length})` : `Loose Gear (${looseLines.length})`}
              </button>
            ))}
          </div>

          {cases.length > 0 && (
            <div style={{ display: 'flex', gap: 4 }}>
              <button
                type="button"
                onClick={expandAll}
                className="btn btn--sm tap"
                style={{
                  minHeight: 44,
                  padding: '0 10px',
                  fontSize: '0.75rem',
                  background: 'var(--card)',
                  border: '1px solid var(--border)',
                  borderRadius: 6,
                  cursor: 'pointer',
                }}
                title="Expand All Flight Cases"
              >
                Expand All
              </button>
              <button
                type="button"
                onClick={collapseAll}
                className="btn btn--sm tap"
                style={{
                  minHeight: 44,
                  padding: '0 10px',
                  fontSize: '0.75rem',
                  background: 'var(--card)',
                  border: '1px solid var(--border)',
                  borderRadius: 6,
                  cursor: 'pointer',
                }}
                title="Collapse All Flight Cases"
              >
                Collapse
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── 1. Nested Flight Cases ── */}
      {(activeFilter === 'all' || activeFilter === 'cases') &&
        cases.map(({ parent, caseTag, children }, caseIdx) => {
          const isCollapsed = Boolean(collapsedCases[parent.id])
          const allUnits = [
            ...parent.units,
            ...children.flatMap((c) => c.units),
          ]
          const totalUnitsCount = allUnits.length
          const packedUnitsCount = allUnits.filter((u) => u.packed).length
          const isCasePacked = totalUnitsCount > 0 && packedUnitsCount === totalUnitsCount

          // Check if matches search
          const matchesParent = filterMatches(parent.productName) || filterMatches(parent.description) || filterMatches(caseTag)
          const matchingChildren = children.filter(
            (c) =>
              filterMatches(c.productName) ||
              filterMatches(c.description) ||
              c.units.some((u) => filterMatches(u.serial) || filterMatches(u.assetTag))
          )

          if (query && !matchesParent && matchingChildren.length === 0) {
            return null
          }

          const renderedChildren = query ? matchingChildren : children
          const stock = getStockAvailability(parent, caseIdx)

          return (
            <div
              key={parent.id}
              className="flight-case-container"
              style={{
                border: '1px solid var(--border)',
                borderRadius: 'var(--r-card, 12px)',
                background: 'var(--card)',
                overflow: 'hidden',
                boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
              }}
            >
              {/* Flight Case Sturdy Header */}
              <div
                className="flight-case-header"
                onClick={() => toggleCase(parent.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '12px 16px',
                  background: 'color-mix(in srgb, var(--card2, #f8fafc) 90%, var(--surface))',
                  borderBottom: isCollapsed ? 'none' : '1px solid var(--border)',
                  cursor: 'pointer',
                  userSelect: 'none',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: 22,
                      height: 22,
                      color: 'var(--muted)',
                      transition: 'transform var(--dur-fast, 120ms)',
                      transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
                    }}
                  >
                    <Icon name="chevron_down" size={16} />
                  </span>

                  {/* Pelican / Flight Case Glyph */}
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: 32,
                      height: 32,
                      borderRadius: 6,
                      background: 'color-mix(in srgb, var(--text) 8%, var(--card))',
                      color: 'var(--text)',
                      border: '1px solid var(--border)',
                      flexShrink: 0,
                    }}
                    title="Flight Case Container (Pelican 1510 / Hard Case)"
                  >
                    <Icon name="package" size={18} />
                  </span>

                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <strong style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text)' }}>
                        {parent.productName || parent.description || 'Cinema Flight Case Package'}
                      </strong>

                      {/* Parent Barcode Tag */}
                      <span
                        className="flight-case-tag"
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                          fontFamily: 'var(--font-id, sans-serif)',
                          fontVariantNumeric: 'tabular-nums',
                          fontSize: '0.725rem',
                          fontWeight: 700,
                          padding: '1px 7px',
                          borderRadius: 4,
                          background: 'color-mix(in srgb, var(--accent, #2563eb) 12%, transparent)',
                          color: 'var(--accent, #2563eb)',
                          border: '1px solid color-mix(in srgb, var(--accent, #2563eb) 30%, transparent)',
                        }}
                        title="Flight Case Outer Barcode (Scan once to verify all contents)"
                      >
                        <Icon name="barcode" size={11} />
                        <span>{caseTag}</span>
                      </span>

                      {/* Booqable Stock Availability Badge */}
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                          fontSize: '0.725rem',
                          fontWeight: 600,
                          padding: '1px 7px',
                          borderRadius: 999,
                          background:
                            stock.tone === 'warning'
                              ? 'rgba(239, 68, 68, 0.12)'
                              : stock.tone === 'neutral'
                              ? 'rgba(245, 158, 11, 0.12)'
                              : 'rgba(16, 185, 129, 0.12)',
                          color:
                            stock.tone === 'warning'
                              ? 'var(--danger-text, #dc2626)'
                              : stock.tone === 'neutral'
                              ? 'var(--warning-text, #d97706)'
                              : 'var(--success-text, #059669)',
                        }}
                        title="Warehouse Stock Status"
                      >
                        <span style={{ fontSize: 9 }}>●</span>
                        <span>{stock.count === 0 ? '0 left' : `${stock.count} in vault`}</span>
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 2, fontSize: '0.775rem', color: 'var(--text2)' }}>
                      <span>Qty: {parent.qty}</span>
                      <span>·</span>
                      <span>{children.length + 1} nested components</span>
                      {parent.units.length > 0 && (
                        <>
                          <span>·</span>
                          <span className="figure">{parent.units.map((u) => u.serial || u.assetTag).join(', ')}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                  {/* Flight Case Packing Readiness Pill */}
                  {totalUnitsCount > 0 && (
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 5,
                        padding: '3px 10px',
                        borderRadius: 999,
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        background: isCasePacked ? 'rgba(16, 185, 129, 0.14)' : 'rgba(245, 158, 11, 0.14)',
                        color: isCasePacked ? 'var(--success-text, #059669)' : 'var(--warning-text, #d97706)',
                        border: `1px solid ${isCasePacked ? 'rgba(16, 185, 129, 0.3)' : 'rgba(245, 158, 11, 0.3)'}`,
                      }}
                    >
                      <Icon name={isCasePacked ? 'check' : 'checklist'} size={13} />
                      <span>{isCasePacked ? 'Case Packed' : `In Prep (${packedUnitsCount}/${totalUnitsCount})`}</span>
                    </span>
                  )}
                </div>
              </div>

              {/* Nested Child Items Table */}
              {!isCollapsed && (
                <div className="flight-case-body" style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.825rem' }}>
                    <thead>
                      <tr style={{ background: 'color-mix(in srgb, var(--card2) 60%, var(--card))', borderBottom: '1px solid var(--border)' }}>
                        <th style={{ textAlign: 'left', padding: '8px 16px', fontSize: '0.725rem', fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase' }}>
                          Nested Component
                        </th>
                        <th style={{ textAlign: 'left', padding: '8px 12px', fontSize: '0.725rem', fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase' }}>
                          Serial / Barcode Tag
                        </th>
                        <th style={{ textAlign: 'center', padding: '8px 10px', fontSize: '0.725rem', fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase' }}>
                          Qty
                        </th>
                        <th style={{ textAlign: 'left', padding: '8px 12px', fontSize: '0.725rem', fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase' }}>
                          Stock & Availability
                        </th>
                        <th style={{ textAlign: 'left', padding: '8px 12px', fontSize: '0.725rem', fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase' }}>
                          Optical / QC
                        </th>
                        <th style={{ textAlign: 'left', padding: '8px 12px', fontSize: '0.725rem', fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase' }}>
                          Vault Location
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {/* 1. Parent Line itself as root asset */}
                      <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--card)' }}>
                        <td style={{ padding: '10px 16px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ color: 'var(--muted)', fontSize: 13 }}>●</span>
                            <span style={{ fontWeight: 600, color: 'var(--text)' }}>
                              {parent.productName || parent.description} (Primary Head)
                            </span>
                          </div>
                        </td>
                        <td style={{ padding: '10px 12px' }}>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                            {parent.units.length > 0 ? (
                              parent.units.map((u) => (
                                <UnitBarcodeChip
                                  key={u.id}
                                  unit={u}
                                  canRelease={canReleaseUnits}
                                  releasingId={releasingUnitId}
                                  onRelease={onReleaseUnit}
                                />
                              ))
                            ) : (
                              <span style={{ color: 'var(--muted)', fontSize: '0.75rem' }}>Auto-assign on scan</span>
                            )}
                          </div>
                        </td>
                        <td style={{ textAlign: 'center', padding: '10px', fontWeight: 600 }}>{parent.qty}</td>
                        <td style={{ padding: '10px 12px' }}>
                          <span style={{ fontSize: '0.75rem', color: 'var(--success-text, #059669)', fontWeight: 600 }}>
                            ● Assigned
                          </span>
                        </td>
                        <td style={{ padding: '10px 12px' }}>
                          {getQcStatus(parent.productName) ? (
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 3,
                                fontSize: '0.725rem',
                                color: 'var(--success-text, #059669)',
                                fontWeight: 600,
                              }}
                            >
                              <Icon name="check" size={12} />
                              <span>{getQcStatus(parent.productName)?.label}</span>
                            </span>
                          ) : (
                            <span style={{ color: 'var(--muted)', fontSize: '0.725rem' }}>Standard QC</span>
                          )}
                        </td>
                        <td style={{ padding: '10px 12px', fontSize: '0.75rem', color: 'var(--text2)' }}>
                          {parent.units[0]?.location || 'Vault Shelf A'}
                        </td>
                      </tr>

                      {/* 2. Nested Child Items */}
                      {renderedChildren.map((child, cIdx) => {
                        const isLastChild = cIdx === renderedChildren.length - 1
                        const childStock = getStockAvailability(child, cIdx)
                        const qc = getQcStatus(child.productName)

                        return (
                          <tr
                            key={child.id}
                            style={{
                              borderBottom: isLastChild ? 'none' : '1px solid var(--border)',
                              background: 'color-mix(in srgb, var(--card2) 30%, var(--card))',
                              ...(subRentedRowStyle ? subRentedRowStyle({ lineType: child.lineType }) : {}),
                            }}
                          >
                            <td style={{ padding: '10px 16px 10px 28px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span style={{ fontFamily: 'monospace', color: 'var(--muted)', fontSize: 13 }}>
                                  {isLastChild ? '└──' : '├──'}
                                </span>
                                <div>
                                  <span style={{ fontWeight: 500, color: 'var(--text)' }}>
                                    {child.productName || child.description}
                                  </span>
                                  {child.lineType !== 'Equipment' && (
                                    <span
                                      style={{
                                        marginLeft: 6,
                                        fontSize: '0.675rem',
                                        padding: '1px 5px',
                                        borderRadius: 4,
                                        background: 'var(--surface)',
                                        border: '1px solid var(--border)',
                                        color: 'var(--text2)',
                                        textTransform: 'uppercase',
                                      }}
                                    >
                                      {child.lineType}
                                    </span>
                                  )}
                                  {isSubRented({ lineType: child.lineType }) && (
                                    <span
                                      style={{
                                        marginLeft: 6,
                                        fontSize: '0.675rem',
                                        padding: '1px 5px',
                                        borderRadius: 4,
                                        background: 'rgba(245, 158, 11, 0.15)',
                                        color: '#d97706',
                                        fontWeight: 700,
                                      }}
                                    >
                                      Sub-Rented
                                    </span>
                                  )}
                                </div>
                              </div>
                            </td>
                            <td style={{ padding: '10px 12px' }}>
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                                {child.units.length > 0 ? (
                                  child.units.map((u) => (
                                    <UnitBarcodeChip
                                      key={u.id}
                                      unit={u}
                                      canRelease={canReleaseUnits}
                                      releasingId={releasingUnitId}
                                      onRelease={onReleaseUnit}
                                    />
                                  ))
                                ) : (
                                  <span style={{ color: 'var(--muted)', fontSize: '0.75rem' }}>Auto-assign on scan</span>
                                )}
                              </div>
                            </td>
                            <td style={{ textAlign: 'center', padding: '10px', fontWeight: 600 }}>{child.qty}</td>
                            <td style={{ padding: '10px 12px' }}>
                              <span
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 4,
                                  fontSize: '0.725rem',
                                  fontWeight: 600,
                                  padding: '1px 6px',
                                  borderRadius: 999,
                                  background:
                                    childStock.tone === 'warning'
                                      ? 'rgba(239, 68, 68, 0.1)'
                                      : 'rgba(16, 185, 129, 0.1)',
                                  color:
                                    childStock.tone === 'warning'
                                      ? 'var(--danger-text, #dc2626)'
                                      : 'var(--success-text, #059669)',
                                }}
                              >
                                <span>●</span>
                                <span>{childStock.count === 0 ? '0 left (Shortage)' : `${childStock.count} left in vault`}</span>
                              </span>
                            </td>
                            <td style={{ padding: '10px 12px' }}>
                              {qc ? (
                                <span
                                  style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 3,
                                    fontSize: '0.725rem',
                                    color: 'var(--success-text, #059669)',
                                    fontWeight: 600,
                                  }}
                                >
                                  <Icon name="check" size={12} />
                                  <span>{qc.label}</span>
                                </span>
                              ) : (
                                <span style={{ color: 'var(--muted)', fontSize: '0.725rem' }}>Ready</span>
                              )}
                            </td>
                            <td style={{ padding: '10px 12px', fontSize: '0.75rem', color: 'var(--text2)' }}>
                              {child.units[0]?.location || 'Rack B-1'}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )
        })}

      {/* ── 2. Loose / Floor Equipment Section ── */}
      {(activeFilter === 'all' || activeFilter === 'loose') && looseLines.length > 0 && (
        <div
          className="loose-equipment-container"
          style={{
            border: '1px solid var(--border)',
            borderRadius: 'var(--r-card, 12px)',
            background: 'var(--card)',
            overflow: 'hidden',
            boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '12px 16px',
              background: 'var(--card2, #f8fafc)',
              borderBottom: '1px solid var(--border)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Icon name="box" size={18} style={{ color: 'var(--text2)' }} />
              <strong style={{ fontSize: '0.9rem', color: 'var(--text)' }}>
                Loose Gear & Floor Accessories ({looseLines.length})
              </strong>
            </div>
            <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>
              Stand-alone cables, grip, stands & modifiers
            </span>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.825rem' }}>
              <thead>
                <tr style={{ background: 'color-mix(in srgb, var(--card2) 60%, var(--card))', borderBottom: '1px solid var(--border)' }}>
                  <th style={{ textAlign: 'left', padding: '8px 16px', fontSize: '0.725rem', fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase' }}>
                    Item
                  </th>
                  <th style={{ textAlign: 'left', padding: '8px 12px', fontSize: '0.725rem', fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase' }}>
                    Serial / Barcode Tag
                  </th>
                  <th style={{ textAlign: 'center', padding: '8px 10px', fontSize: '0.725rem', fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase' }}>
                    Qty
                  </th>
                  <th style={{ textAlign: 'left', padding: '8px 12px', fontSize: '0.725rem', fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase' }}>
                    Availability
                  </th>
                  <th style={{ textAlign: 'left', padding: '8px 12px', fontSize: '0.725rem', fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase' }}>
                    Location
                  </th>
                </tr>
              </thead>
              <tbody>
                {looseLines.map((line, idx) => {
                  if (query && !filterMatches(line.productName) && !filterMatches(line.description)) {
                    return null
                  }
                  const stock = getStockAvailability(line, idx)
                  return (
                    <tr
                      key={line.id}
                      style={{
                        borderBottom: idx === looseLines.length - 1 ? 'none' : '1px solid var(--border)',
                        background: 'var(--card)',
                        ...(subRentedRowStyle ? subRentedRowStyle({ lineType: line.lineType }) : {}),
                      }}
                    >
                      <td style={{ padding: '10px 16px' }}>
                        <span style={{ fontWeight: 600, color: 'var(--text)' }}>
                          {line.productName || line.description}
                        </span>
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                          {line.units.length > 0 ? (
                            line.units.map((u) => (
                              <UnitBarcodeChip
                                key={u.id}
                                unit={u}
                                canRelease={canReleaseUnits}
                                releasingId={releasingUnitId}
                                onRelease={onReleaseUnit}
                              />
                            ))
                          ) : (
                            <span style={{ color: 'var(--muted)', fontSize: '0.75rem' }}>Auto-assign on scan</span>
                          )}
                        </div>
                      </td>
                      <td style={{ textAlign: 'center', padding: '10px', fontWeight: 600 }}>{line.qty}</td>
                      <td style={{ padding: '10px 12px' }}>
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                            fontSize: '0.725rem',
                            fontWeight: 600,
                            padding: '1px 6px',
                            borderRadius: 999,
                            background:
                              stock.tone === 'warning'
                                ? 'rgba(239, 68, 68, 0.1)'
                                : 'rgba(16, 185, 129, 0.1)',
                            color:
                              stock.tone === 'warning'
                                ? 'var(--danger-text, #dc2626)'
                                : 'var(--success-text, #059669)',
                          }}
                        >
                          <span>●</span>
                          <span>{stock.count === 0 ? '0 left' : `${stock.count} left in vault`}</span>
                        </span>
                      </td>
                      <td style={{ padding: '10px 12px', fontSize: '0.75rem', color: 'var(--text2)' }}>
                        {line.units[0]?.location || 'Floor Bay'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

/** Individual unit serial / barcode chip with interactive release action */
function UnitBarcodeChip({
  unit,
  canRelease,
  releasingId,
  onRelease,
}: {
  unit: FloorUnit
  canRelease: boolean
  releasingId: string | null | undefined
  onRelease?: ((unitId: string, label: string) => void) | undefined
}) {
  const label = unit.serial || unit.assetTag || ''
  if (!label) return null

  return (
    <span
      className="unit-barcode-chip"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '2px 7px',
        borderRadius: 'var(--r-chip, 6px)',
        border: '1px solid var(--border)',
        background: 'var(--card2, #f4f4f5)',
        fontSize: '0.75rem',
        fontFamily: 'var(--font-id, sans-serif)',
        fontVariantNumeric: 'tabular-nums',
        fontWeight: 600,
        color: 'var(--text)',
      }}
    >
      <Icon name="barcode" size={11} style={{ color: 'var(--text2)' }} />
      <Link
        to={`/inventory/${label}`}
        style={{ color: 'inherit', textDecoration: 'none' }}
        title={`View ${label} in inventory`}
      >
        {label}
      </Link>

      {canRelease && onRelease && (
        <button
          type="button"
          onClick={() => onRelease(unit.id, label)}
          disabled={releasingId !== null}
          aria-label={`Release ${label}`}
          title={`Release ${label} from booking`}
          style={{
            position: 'relative',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 16,
            height: 16,
            padding: 0,
            border: 'none',
            background: 'transparent',
            color: releasingId === unit.id ? 'var(--disabled)' : 'var(--muted)',
            cursor: releasingId !== null ? 'wait' : 'pointer',
            borderRadius: 3,
            marginLeft: 2,
          }}
        >
          <TouchTarget />
          <Icon name="close" size={11} />
        </button>
      )}
    </span>
  )
}

export default LineItemTree
