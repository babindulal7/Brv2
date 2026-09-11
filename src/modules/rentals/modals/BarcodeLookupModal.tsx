import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Modal } from '../../../components/ui/Modal'
import { Button } from '../../../components/ui/Page'
import Icon from '../../../components/ui/Icon'
import { supabase } from '../../../lib/supabase'

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

export function BarcodeLookupModal({ isOpen, onClose }: BarcodeLookupModalProps) {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [results, setResults] = useState<LookupResult[]>([])
  const [searched, setSearched] = useState(false)

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    const term = query.trim()
    if (!term) return

    setSearching(true)
    setSearched(true)
    setResults([])

    try {
      const hits: LookupResult[] = []

      // 1. Search bookings by booking_no or id
      const { data: bookings } = await supabase
        .from('bookings')
        .select('id, booking_no, stage, clients:client_id (name)')
        .or(`booking_no.ilike.%${term}%,id.eq.${term.length === 36 ? term : '00000000-0000-0000-0000-000000000000'}`)
        .limit(5)

      if (bookings) {
        for (const b of bookings as any[]) {
          hits.push({
            type: 'booking',
            id: b.id,
            title: `Booking ${b.booking_no}`,
            subtitle: `${b.stage} · Client: ${b.clients?.name ?? 'Unknown'}`,
            url: `/rentals/${b.booking_no || b.id}`,
          })
        }
      }

      // 2. Search equipment items/units by barcode or serial_no
      const { data: units } = await supabase
        .from('equipment_items')
        .select('id, barcode, serial_no, status, equipment:equipment_id (name, brand, model)')
        .or(`barcode.ilike.%${term}%,serial_no.ilike.%${term}%`)
        .limit(5)

      if (units) {
        for (const u of units as any[]) {
          const equip = u.equipment
          const name = equip ? `${equip.brand || ''} ${equip.model || equip.name || 'Equipment'}`.trim() : 'Equipment Unit'
          hits.push({
            type: 'equipment',
            id: u.id,
            title: `${name} (${u.barcode || u.serial_no})`,
            subtitle: `Status: ${u.status} · Serial: ${u.serial_no || 'N/A'}`,
            url: `/inventory/${u.id}`,
          })
        }
      }

      setResults(hits)
    } catch {
      // Fallback empty
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
      title="🔍 Barcode & QR Quick Scan"
      size="md"
    >
      <form onSubmit={handleSearch} style={{ display: 'grid', gap: 'var(--sp-md)' }}>
        <p style={{ margin: 0, fontSize: 'var(--t-body)', color: 'var(--text2)' }}>
          Scan or paste any barcode, serial number, or booking reference to instantly locate it.
        </p>

        <div style={{ position: 'relative' }}>
          <input
            type="text"
            autoFocus
            placeholder="Scan barcode or enter serial # / booking #…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{
              width: '100%',
              minHeight: 'var(--tap)',
              padding: '0 40px 0 14px',
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
              cursor: 'pointer',
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

        {!searching && searched && results.length === 0 && (
          <p style={{ margin: '8px 0', fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>
            No bookings or equipment units matched “{query}”.
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
