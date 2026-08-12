import { useState, useRef, useMemo, useEffect } from 'react'
import Icon from './Icon'
import { STORAGE_LOCATIONS } from '../../data/warehouse'
import { grouped } from '../../lib/money'

/**
 * Interactive Warehouse Map.
 * Generates a topological layout based on Room -> Zone groupings, as exact X/Y
 * coordinates are not provided by the warehouse data seed.
 */
export default function WarehouseMap({ warehouseId }: { warehouseId: string }) {
  const [scale, setScale] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [dragging, setDragging] = useState(false)
  const lastPoint = useRef({ x: 0, y: 0 })
  const containerRef = useRef<HTMLDivElement>(null)

  const locations = useMemo(() => STORAGE_LOCATIONS.filter((l) => l.warehouseId === warehouseId), [warehouseId])

  const rooms = useMemo(() => {
    const rMap = new Map<string, Map<string, { used: number; capacity: number; count: number }>>()
    for (const l of locations) {
      if (!rMap.has(l.room)) rMap.set(l.room, new Map())
      const zMap = rMap.get(l.room)!
      if (!zMap.has(l.zone)) zMap.set(l.zone, { used: 0, capacity: 0, count: 0 })
      const z = zMap.get(l.zone)!
      z.used += l.used
      z.capacity += l.capacity
      z.count += 1
    }
    return Array.from(rMap.entries()).map(([room, zones]) => ({
      room,
      zones: Array.from(zones.entries()).map(([zone, stats]) => ({ zone, ...stats })),
    }))
  }, [locations])

  // Prevent default scroll when zooming with mouse wheel inside the map
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault()
      const zoomIntensity = 0.1
      const delta = e.deltaY > 0 ? -zoomIntensity : zoomIntensity
      setScale((s) => Math.min(Math.max(0.4, s + delta), 3))
    }
    el.addEventListener('wheel', handleWheel, { passive: false })
    return () => el.removeEventListener('wheel', handleWheel)
  }, [])

  const zoomIn = () => setScale((s) => Math.min(3, s + 0.25))
  const zoomOut = () => setScale((s) => Math.max(0.4, s - 0.25))
  const reset = () => {
    setScale(1)
    setPan({ x: 0, y: 0 })
  }

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: 600,
        /* `--app-bg` is not a token — `theme.css` defines `--app`. Undefined and
           with no fallback, this painted transparent in both themes. */
        background: 'var(--app)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--r-sm)',
        overflow: 'hidden',
      }}
    >
      {/* Controls Overlay */}
      <div
        style={{
          position: 'absolute',
          bottom: 20,
          right: 20,
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--sp-sm)',
          zIndex: 10,
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            background: 'var(--card)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--r-sm)',
            overflow: 'hidden',
            boxShadow: 'var(--shadow-modal)',
          }}
        >
          <button
            type="button"
            onClick={zoomIn}
            aria-label="Zoom In"
            style={{
              width: 36,
              height: 36,
              display: 'grid',
              placeItems: 'center',
              background: 'transparent',
              border: 'none',
              borderBottom: '1px solid var(--border)',
              color: 'var(--text)',
              cursor: 'pointer',
            }}
          >
            <Icon name="plus" size={16} />
          </button>
          <button
            type="button"
            onClick={zoomOut}
            aria-label="Zoom Out"
            style={{
              width: 36,
              height: 36,
              display: 'grid',
              placeItems: 'center',
              background: 'transparent',
              border: 'none',
              color: 'var(--text)',
              cursor: 'pointer',
            }}
          >
            <Icon name="minus" size={16} />
          </button>
        </div>
        <button
          type="button"
          onClick={reset}
          aria-label="Reset Map"
          style={{
            width: 36,
            height: 36,
            display: 'grid',
            placeItems: 'center',
            background: 'var(--card)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--r-sm)',
            color: 'var(--text)',
            cursor: 'pointer',
            boxShadow: 'var(--shadow-modal)',
          }}
        >
          <Icon name="refresh" size={16} />
        </button>
      </div>

      {/* Viewport */}
      <div
        ref={containerRef}
        style={{ width: '100%', height: '100%', cursor: dragging ? 'grabbing' : 'grab', touchAction: 'none' }}
        onPointerDown={(e) => {
          setDragging(true)
          lastPoint.current = { x: e.clientX, y: e.clientY }
          ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
        }}
        onPointerMove={(e) => {
          if (!dragging) return
          setPan((p) => ({ x: p.x + (e.clientX - lastPoint.current.x), y: p.y + (e.clientY - lastPoint.current.y) }))
          lastPoint.current = { x: e.clientX, y: e.clientY }
        }}
        onPointerUp={(e) => {
          setDragging(false)
          ;(e.target as HTMLElement).releasePointerCapture(e.pointerId)
        }}
        onPointerCancel={(e) => {
          setDragging(false)
          ;(e.target as HTMLElement).releasePointerCapture(e.pointerId)
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: `translate(calc(-50% + ${pan.x}px), calc(-50% + ${pan.y}px)) scale(${scale})`,
            transformOrigin: 'center center',
            transition: dragging ? 'none' : 'transform 0.1s ease',
            display: 'flex',
            flexWrap: 'wrap',
            gap: 'var(--sp-3xl)',
            justifyContent: 'center',
            padding: 'var(--sp-3xl)',
            width: 'max-content',
            maxWidth: 1200,
          }}
        >
          {rooms.length === 0 ? (
            <div style={{ color: 'var(--muted)', fontSize: 'var(--t-ui)' }}>No storage mapped for this warehouse.</div>
          ) : (
            rooms.map((r) => (
              <div
                key={r.room}
                style={{
                  background: 'var(--card2)',
                  border: '2px solid var(--border)',
                  borderRadius: 12,
                  padding: 'var(--sp-xl)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 'var(--sp-lg)',
                  minWidth: 320,
                }}
              >
                <div style={{ fontSize: 'var(--t-h2)', fontWeight: 700, color: 'var(--text)' }}>
                  {r.room}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 'var(--sp-md)' }}>
                  {r.zones.map((z) => {
                    const fill = Math.round((z.used / Math.max(1, z.capacity)) * 100)
                    const tone = fill >= 90 ? 'var(--danger)' : fill >= 70 ? 'var(--progress)' : 'var(--success)'
                    return (
                      <div
                        key={z.zone}
                        style={{
                          background: 'var(--card)',
                          border: '1px solid var(--border)',
                          borderRadius: 'var(--r-sm)',
                          padding: 'var(--sp-md)',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 6,
                        }}
                      >
                        <span style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)' }}>
                          {z.zone}
                        </span>
                        <span style={{ fontSize: 'var(--t-th)', color: 'var(--muted)' }}>
                          {z.count} {z.count === 1 ? 'location' : 'locations'}
                        </span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 'var(--sp-xs)' }}>
                          <span
                            aria-hidden
                            style={{
                              flex: 1,
                              height: 4,
                              borderRadius: 'var(--r-badge)',
                              background: 'var(--chart-grid)',
                              overflow: 'hidden',
                            }}
                          >
                            <span
                              style={{ display: 'block', height: '100%', width: `${fill}%`, background: tone }}
                            />
                          </span>
                          <span
                            className="figure"
                            style={{ fontSize: 'var(--t-th)', fontWeight: 700, color: tone, minWidth: 26, textAlign: 'right' }}
                          >
                            {fill}%
                          </span>
                        </div>
                        <div className="figure" style={{ fontSize: 'var(--t-th)', color: 'var(--text2)', textAlign: 'right' }}>
                          {grouped(z.used)} / {grouped(z.capacity)}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
