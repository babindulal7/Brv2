import React, { useState, useRef, useEffect } from 'react'
import { IconBarcode, IconCheck, IconCornerDownLeft } from '@tabler/icons-react'

export interface ScannerInputProps {
  onScan: (code: string) => void
  placeholder?: string
  autoFocus?: boolean
  continuous?: boolean
  className?: string
}

export const ScannerInput: React.FC<ScannerInputProps> = ({
  onScan,
  placeholder = 'Scan barcode / QR or enter asset code...',
  autoFocus = true,
  continuous = true,
  className = '',
}) => {
  const [value, setValue] = useState('')
  const [recentScan, setRecentScan] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (autoFocus && inputRef.current) {
      inputRef.current.focus()
    }
  }, [autoFocus])

  // Listen for global ⌘+B / Ctrl+B scanner shortcut (Phase 5 requirement)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault()
        inputRef.current?.focus()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = value.trim()
    if (!trimmed) return

    onScan(trimmed)
    setRecentScan(trimmed)
    setValue('')

    if (continuous) {
      inputRef.current?.focus()
    }

    setTimeout(() => {
      setRecentScan(null)
    }, 2500)
  }

  return (
    <div className={`w-full flex flex-col gap-2 ${className}`}>
      <form onSubmit={handleSubmit} className="relative flex items-center">
        <div className="absolute left-3.5 flex items-center pointer-events-none text-blue-400">
          <IconBarcode className="w-5 h-5" />
        </div>

        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={placeholder}
          className="w-full min-h-[46px] pl-11 pr-24 py-2.5 text-sm font-mono rounded-xl bg-slate-900 border border-slate-700 text-slate-100 placeholder-slate-500 transition-all focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 shadow-inner"
        />

        <div className="absolute right-2 flex items-center gap-1.5">
          <button
            type="submit"
            disabled={!value.trim()}
            className="min-h-[36px] px-3 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:hover:bg-blue-600 text-white font-medium text-xs flex items-center gap-1 transition-all cursor-pointer shadow-sm"
          >
            <span>Scan</span>
            <IconCornerDownLeft className="w-3.5 h-3.5" />
          </button>
        </div>
      </form>

      {/* Real-time scan confirmation feedback */}
      {recentScan && (
        <div className="flex items-center gap-2 text-xs text-emerald-400 bg-emerald-950/60 border border-emerald-800/80 px-3 py-1.5 rounded-lg animate-fadeIn">
          <IconCheck className="w-4 h-4 shrink-0" />
          <span>
            Scanned: <span className="font-mono font-bold text-white">{recentScan}</span>
          </span>
        </div>
      )}
    </div>
  )
}
