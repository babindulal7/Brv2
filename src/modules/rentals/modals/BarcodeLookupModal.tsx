import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Modal } from '../../../components/ui/Modal'
import { Button } from '../../../components/ui/Button'
import Icon from '../../../components/ui/Icon'
import { supabase } from '../../../lib/supabase'
import { captureError } from '../../../lib/monitoring'

interface BarcodeLookupModalProps {
  isOpen: boolean
  onClose: () => void
}

interface LookupResult {
  type: 'booking' | 'equipment'
  id: string
  title: string
  subtitle: string
  url: string
}

interface BookingSearchRow {
  id: string
  booking_no?: string | null
  stage?: string | null
  clients?: { name?: string | null } | null
}

interface UnitSearchRow {
  id: string
  barcode?: string | null
  serial_no?: string | null
  asset_tag?: string | null
  status?: string | null
  product?: {
    id: string
    name?: string | null
    asset_code?: string | null
    brand?: string | null
    model?: string | null
  } | null
}

interface ProductSearchRow {
  id: string
  name?: string | null
  asset_code?: string | null
  brand?: string | null
  model?: string | null
  status?: string | null
}

export function BarcodeLookupModal({ isOpen, onClose }: BarcodeLookupModalProps) {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [results, setResults] = useState<LookupResult[]>([])
  const [searched, setSearched] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    const term = query.trim()
    if (!term) return

    setSearching(true)
    setSearched(true)
    setSearchError(null)
    setResults([])

    try {
      const hits: LookupResult[] = []

      // 1. Search bookings by booking_no or id
      const { data: bookings, error: bErr } = await supabase
        .from('bookings')
        .select('id, booking_no, stage, clients:client_id (name)')
        .or(`booking_no.ilike.%${term}%,id.eq.${term.length === 36 ? term : '00000000-0000-0000-0000-000000000000'}`)
        .limit(5)

      if (bErr) throw bErr

      if (bookings) {
        for (const b of bookings as unknown as BookingSearchRow[]) {
          hits.push({
            type: 'booking',
            id: b.id,
            title: `Booking ${b.booking_no}`,
            subtitle: `${b.stage} · Client: ${b.clients?.name ?? 'Unknown'}`,
            url: `/rentals/${encodeURIComponent(b.booking_no || b.id)}`,
          })
        }
      }

      // 2. Search canonical inventory units via product_units_v
      const { data: units, error: uErr } = await supabase
        .from('product_units_v')
        .select('id, barcode, serial_no, asset_tag, status, product:products_v (id, name, asset_code, brand, model)')
        .or(`barcode.ilike.%${term}%,serial_no.ilike.%${term}%,asset_tag.ilike.%${term}%`)
        .limit(5)

      if (uErr) throw uErr

      const matchedProductIds = new Set<string>()

      if (units) {
        for (const u of units as unknown as UnitSearchRow[]) {
          const equip = u.product
          if (equip?.id) matchedProductIds.add(equip.id)
          const name = equip
            ? `${equip.brand || ''} ${equip.model || equip.name || 'Equipment'}`.trim()
            : 'Equipment Unit'
          const navRef = u.asset_tag || u.serial_no || u.barcode || equip?.asset_code || u.id
          hits.push({
            type: 'equipment',
            id: u.id,
            title: `${name} (${u.asset_tag || u.serial_no || u.barcode || 'Unit'})`,
            subtitle: `Status: ${u.status} · Serial: ${u.serial_no || 'N/A'}${u.barcode ? ` · Barcode: ${u.barcode}` : ''}`,
            url: `/inventory/${encodeURIComponent(navRef)}`,
          })
        }
      }

      // 3. Search catalogue products via products_v (asset_code or name)
      const { data: products, error: pErr } = await supabase
        .from('products_v')
        .select('id, name, asset_code, brand, model, status')
        .or(`asset_code.ilike.%${term}%,name.ilike.%${term}%`)
        .limit(5)

      if (pErr) throw pErr

      if (products) {
        for (const p of products as unknown as ProductSearchRow[]) {
          if (matchedProductIds.has(p.id)) continue
          const name = `${p.brand || ''} ${p.model || p.name}`.trim()
          hits.push({
            type: 'equipment',
            id: p.id,
            title: `${name} (${p.asset_code})`,
            subtitle: `Product · Status: ${p.status}`,
            url: `/inventory/${encodeURIComponent(p.asset_code || p.id)}`,
          })
        }
      }

      setResults(hits)
    } catch (err: unknown) {
      captureError(err, { where: 'BarcodeLookupModal.search', query: term })
      setSearchError('Equipment search failed.')
      setResults([])
    } finally {
      setSearching(false)
    }
  }

  const handleSelect = (url: string) => {
    onClose()
    navigate(url)
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="🔍 Find by Barcode or Serial"
      size="md"
    >
      <form onSubmit={handleSearch} style={{ display: 'grid', gap: 'var(--sp-md)' }}>
        <p style={{ margin: 0, fontSize: 'var(--t-body)', color: 'var(--text2)' }}>
          Enter or paste any barcode, serial number, asset tag, or booking reference to instantly locate it.
        </p>

        {searchError && (
          <div
            role="alert"
            style={{
              padding: '10px 14px',
              borderRadius: 'var(--r-sm)',
              /* §21 / ErrorBanner shape: solid status pair, white on danger.
                 `--danger-bg` aliases to solid --st-danger-bg while
                 `--danger-border`/`#dc2626` were light-theme literals — the
                 old triple rendered red text on a solid red fill. */
              background: 'var(--st-danger-bg)',
              border: '1px solid var(--st-danger-bg)',
              color: 'var(--st-danger-fg)',
              fontSize: 'var(--t-meta)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 8,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Icon name="alert_triangle" size={16} />
              <span>{searchError}</span>
            </div>
            <Button type="button" onClick={() => void handleSearch()} style={{ minHeight: 30, padding: '0 10px' }}>
              Retry
            </Button>
          </div>
        )}

        <div style={{ position: 'relative' }}>
          <input
            type="text"
            autoFocus
            placeholder="Enter barcode, serial #, or booking #…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{
              width: '100%',
              minHeight: 'var(--tap)',
              padding: '0 44px 0 14px',
              borderRadius: 'var(--r-input)',
              border: '1px solid var(--input-border)',
              background: 'var(--input-bg)',
              color: 'var(--text)',
              fontSize: 'var(--t-body)',
              fontFamily: 'inherit',
            }}
          />
          <button
            type="submit"
            aria-label="Search"
            disabled={searching || !query.trim()}
            style={{
              position: 'absolute',
              right: 4,
              top: '50%',
              transform: 'translateY(-50%)',
              width: 36,
              height: 36,
              display: 'grid',
              placeItems: 'center',
              borderRadius: 'var(--r-btn)',
              border: 'none',
              background: 'var(--primary)',
              color: 'var(--on-brand)',
              cursor: searching || !query.trim() ? 'not-allowed' : 'pointer',
              opacity: searching || !query.trim() ? 0.6 : 1,
            }}
          >
            <Icon name="search" size={15} />
          </button>
        </div>

        {/* Results */}
        {searching && (
          <p style={{ margin: '8px 0', fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>
            Searching database…
          </p>
        )}

        {!searching && searched && !searchError && results.length === 0 && (
          <p style={{ margin: '8px 0', fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>
            No equipment matches this barcode or serial.
          </p>
        )}

        {results.length > 0 && (
          <div style={{ display: 'grid', gap: 6, maxHeight: 260, overflowY: 'auto' }}>
            {results.map((r) => (
              <button
                key={r.id}
                type="button"
                className="tap"
                onClick={() => handleSelect(r.url)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '10px 12px',
                  borderRadius: 'var(--r-sm)',
                  border: '1px solid var(--border)',
                  background: 'var(--card)',
                  textAlign: 'left',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  width: '100%',
                }}
              >
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 'var(--r-badge)',
                    background: r.type === 'booking' ? 'var(--chip-blue-bg)' : 'var(--chip-amber-bg)',
                    color: r.type === 'booking' ? 'var(--chip-blue-fg)' : 'var(--chip-amber-fg)',
                    display: 'grid',
                    placeItems: 'center',
                    flexShrink: 0,
                  }}
                >
                  <Icon name={r.type === 'booking' ? 'file' : 'box'} size={15} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 'var(--t-ui)', fontWeight: 600, color: 'var(--text)' }}>
                    {r.title}
                  </div>
                  <div style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>
                    {r.subtitle}
                  </div>
                </div>
                <Icon name="chevron_right" size={14} style={{ color: 'var(--muted)' }} />
              </button>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid var(--border)', paddingTop: 'var(--sp-md)' }}>
          <Button onClick={onClose}>
            Close
          </Button>
        </div>
      </form>
    </Modal>
  )
}

