import { useMemo } from 'react'
import { DateField } from './DateField'
import {
  PRESET_GROUPS,
  computeDatePreset,
  type DatePresetKey,
} from '../../lib/datePresets'
import { getBusinessToday } from '../../lib/bs'

export interface DateRangePresetsProps {
  from: string
  to: string
  onChange: (range: { from: string; to: string }) => void
  anchorDay?: string
  showCustomInputs?: boolean
}

export function DateRangePresets({
  from,
  to,
  onChange,
  anchorDay,
  showCustomInputs = true,
}: DateRangePresetsProps) {
  const todayIso = useMemo(() => {
    if (anchorDay) return anchorDay
    const d = getBusinessToday()
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
  }, [anchorDay])

  // Identify if current from/to matches any preset
  const activePresetKey = useMemo<DatePresetKey | null>(() => {
    if (!from && !to) return 'all_time'
    for (const group of PRESET_GROUPS) {
      for (const p of group.presets) {
        if (p.key === 'all_time') continue
        const res = computeDatePreset(p.key, todayIso)
        if (res.from === from && res.to === to) {
          return p.key
        }
      }
    }
    return null
  }, [from, to, todayIso])

  const handleSelectPreset = (key: DatePresetKey) => {
    const res = computeDatePreset(key, todayIso)
    onChange({ from: res.from, to: res.to })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
      {/* Preset groups in accordions or categorized blocks */}
      <div style={{ display: 'grid', gap: 'var(--sp-sm)' }}>
        {PRESET_GROUPS.map((group) => (
          <div key={group.name} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span
              style={{
                fontSize: '11px',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                color: 'var(--muted)',
                paddingLeft: 4,
              }}
            >
              {group.name}
            </span>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 4 }}>
              {group.presets.map((p) => {
                const isActive = activePresetKey === p.key
                return (
                  <button
                    key={p.key}
                    type="button"
                    className="tap"
                    onClick={() => handleSelectPreset(p.key)}
                    style={{
                      minHeight: 36,
                      padding: '4px 8px',
                      borderRadius: 'var(--r-xs)',
                      border: `1px solid ${isActive ? 'var(--primary)' : 'var(--border)'}`,
                      background: isActive ? 'var(--hover-card)' : 'transparent',
                      color: isActive ? 'var(--primary)' : 'var(--text)',
                      fontSize: 'var(--t-meta)',
                      fontWeight: isActive ? 700 : 500,
                      cursor: 'pointer',
                      textAlign: 'center',
                      whiteSpace: 'nowrap',
                      textOverflow: 'ellipsis',
                      overflow: 'hidden',
                      transition: 'all 120ms ease',
                    }}
                  >
                    {p.label}
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Custom From / To fields */}
      {showCustomInputs && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--muted)' }}>
              Custom Range
            </span>
            {(from || to) && (
              <button
                type="button"
                onClick={() => onChange({ from: '', to: '' })}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--link)',
                  fontSize: 'var(--t-meta)',
                  fontWeight: 600,
                  cursor: 'pointer',
                  padding: 0,
                }}
              >
                Clear
              </button>
            )}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <DateField
              ariaLabel="Start date"
              label="From"
              value={from}
              onChange={(v) => onChange({ from: v, to })}
              showBs={false}
              clearable
            />
            <DateField
              ariaLabel="End date"
              label="To"
              value={to}
              onChange={(v) => onChange({ from, to: v })}
              showBs={false}
              clearable
              align="right"
            />
          </div>
        </div>
      )}
    </div>
  )
}
