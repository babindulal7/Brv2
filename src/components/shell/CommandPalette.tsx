import React, { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  IconSearch,
  IconCalendar,
  IconPackage,
  IconUsers,
  IconReceipt,
  IconSettings,
  IconTruck,
  IconBarcode,
  IconPlus,
  IconSun,
  IconMoon,
  IconX,
  IconArrowRight,
} from '@tabler/icons-react'
import { useTheme } from '../../lib/theme'

export interface PaletteAction {
  id: string
  title: string
  subtitle?: string
  category: 'Navigation' | 'Actions' | 'Operations' | 'Finance'
  icon: React.ReactNode
  shortcut?: string
  onSelect: () => void
}

export const CommandPalette: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const navigate = useNavigate()
  const { theme, toggle } = useTheme()
  const inputRef = useRef<HTMLInputElement>(null)

  // Listen for ⌘K or Ctrl+K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setIsOpen((prev) => !prev)
      }
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen])

  useEffect(() => {
    if (isOpen) {
      setSearch('')
      setSelectedIndex(0)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [isOpen])

  const actions: PaletteAction[] = [
    // Navigation
    {
      id: 'nav-dashboard',
      title: 'Dashboard',
      subtitle: 'Overview KPIs, activity feed, and fiscal metrics',
      category: 'Navigation',
      icon: <IconCalendar className="w-4 h-4" />,
      shortcut: 'G D',
      onSelect: () => navigate('/'),
    },
    {
      id: 'nav-bookings',
      title: 'Bookings & Quotes',
      subtitle: 'Canonical booking list and pipeline',
      category: 'Navigation',
      icon: <IconCalendar className="w-4 h-4" />,
      shortcut: 'G B',
      onSelect: () => navigate('/rentals'),
    },
    {
      id: 'nav-operations',
      title: 'Operations Hub',
      subtitle: 'Packing, Handover, Return, Reset queues',
      category: 'Operations',
      icon: <IconPackage className="w-4 h-4" />,
      shortcut: 'G O',
      onSelect: () => navigate('/operations'),
    },
    {
      id: 'nav-inventory',
      title: 'Inventory & Catalog',
      subtitle: 'Serialised assets, consumables, bundles, and stock',
      category: 'Navigation',
      icon: <IconPackage className="w-4 h-4" />,
      shortcut: 'G I',
      onSelect: () => navigate('/inventory'),
    },
    {
      id: 'nav-warehouses',
      title: 'Warehouses',
      subtitle: 'Depots, zones, bin locations, and stock distribution',
      category: 'Navigation',
      icon: <IconPackage className="w-4 h-4" />,
      onSelect: () => navigate('/inventory/warehouses'),
    },
    {
      id: 'nav-purchase-requests',
      title: 'Purchase Requests',
      subtitle: 'Procurement requests, approvals, and supplier orders',
      category: 'Navigation',
      icon: <IconReceipt className="w-4 h-4" />,
      onSelect: () => navigate('/inventory/purchase-requests'),
    },
    {
      id: 'nav-clients',
      title: 'Clients & CRM',
      subtitle: 'Client directory, credit limits, and document registry',
      category: 'Navigation',
      icon: <IconUsers className="w-4 h-4" />,
      shortcut: 'G C',
      onSelect: () => navigate('/clients'),
    },
    {
      id: 'nav-finance',
      title: 'Finance & Invoices',
      subtitle: 'Invoices, immutable payments, security deposits, VAT',
      category: 'Finance',
      icon: <IconReceipt className="w-4 h-4" />,
      shortcut: 'G F',
      onSelect: () => navigate('/finance'),
    },
    {
      id: 'nav-logistics',
      title: 'Crew & Fleet Logistics',
      subtitle: 'Technician schedules, vehicles, and trip logs',
      category: 'Navigation',
      icon: <IconTruck className="w-4 h-4" />,
      onSelect: () => navigate('/crew'),
    },
    {
      id: 'nav-settings',
      title: 'Settings & Audit Logs',
      subtitle: 'Branches, RBAC permissions, immutable audit logs',
      category: 'Navigation',
      icon: <IconSettings className="w-4 h-4" />,
      onSelect: () => navigate('/settings'),
    },

    // Quick Actions
    {
      id: 'act-new-booking',
      title: 'Create New Booking / Quote',
      subtitle: 'Start a fresh quotation with causal dates',
      category: 'Actions',
      icon: <IconPlus className="w-4 h-4 text-emerald-400" />,
      shortcut: '⌘ N',
      onSelect: () => navigate('/rentals/new'),
    },
    {
      id: 'act-scan',
      title: 'Launch Scanner Focus',
      subtitle: 'Focus continuous barcode/QR scanner',
      category: 'Actions',
      icon: <IconBarcode className="w-4 h-4 text-blue-400" />,
      shortcut: '⌘ B',
      onSelect: () => {
        const fab = document.querySelector('[data-scanner] button') as HTMLButtonElement | null
        fab?.click()
      },
    },
    {
      id: 'act-toggle-theme',
      title: `Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`,
      subtitle: 'Toggle theme preference',
      category: 'Actions',
      icon: theme === 'dark' ? <IconSun className="w-4 h-4 text-amber-400" /> : <IconMoon className="w-4 h-4 text-blue-400" />,
      onSelect: toggle,
    },
  ]

  const filtered = actions.filter(
    (a) =>
      a.title.toLowerCase().includes(search.toLowerCase()) ||
      (a.subtitle && a.subtitle.toLowerCase().includes(search.toLowerCase())) ||
      a.category.toLowerCase().includes(search.toLowerCase())
  )

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex((prev) => (prev < filtered.length - 1 ? prev + 1 : 0))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : filtered.length - 1))
    } else if (e.key === 'Enter' && filtered[selectedIndex]) {
      e.preventDefault()
      filtered[selectedIndex].onSelect()
      setIsOpen(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 p-4 bg-black/75 backdrop-blur-sm animate-fadeIn">
      <div className="fixed inset-0" onClick={() => setIsOpen(false)} />

      <div className="relative z-10 w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh]">
        {/* Search Header */}
        <div className="flex items-center px-4 py-3.5 border-b border-slate-800 bg-slate-950/60">
          <IconSearch className="w-5 h-5 text-slate-400 mr-3 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setSelectedIndex(0)
            }}
            onKeyDown={handleKeyDown}
            placeholder="Type a command, search bookings, clients, inventory, or invoices..."
            className="flex-1 bg-transparent text-sm text-slate-100 placeholder-slate-500 outline-none font-medium"
          />
          <button
            onClick={() => setIsOpen(false)}
            className="p-1 rounded-md text-slate-500 hover:text-slate-300 hover:bg-slate-800 transition-colors"
          >
            <IconX className="w-4 h-4" />
          </button>
        </div>

        {/* Results List */}
        <div className="flex-1 overflow-y-auto p-2 divide-y divide-slate-800/40">
          {filtered.length === 0 ? (
            <div className="p-8 text-center text-slate-500 text-sm">
              No results found for &ldquo;{search}&rdquo;
            </div>
          ) : (
            filtered.map((item, idx) => {
              const isSelected = idx === selectedIndex
              return (
                <div
                  key={item.id}
                  onClick={() => {
                    item.onSelect()
                    setIsOpen(false)
                  }}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={`flex items-center justify-between px-3.5 py-3 rounded-xl cursor-pointer transition-colors ${
                    isSelected
                      ? 'bg-blue-600/20 text-white border border-blue-500/40'
                      : 'text-slate-200 hover:bg-slate-800/60 border border-transparent'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`p-2 rounded-lg ${
                        isSelected
                          ? 'bg-blue-500 text-white'
                          : 'bg-slate-800 text-slate-300'
                      }`}
                    >
                      {item.icon}
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold truncate">{item.title}</div>
                      {item.subtitle && (
                        <div className="text-xs text-slate-400 truncate">{item.subtitle}</div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 ml-3">
                    {item.shortcut && (
                      <kbd className="px-2 py-0.5 text-[10px] font-mono bg-slate-800 border border-slate-700 text-slate-400 rounded">
                        {item.shortcut}
                      </kbd>
                    )}
                    {isSelected && <IconArrowRight className="w-4 h-4 text-blue-400" />}
                  </div>
                </div>
              )
            })
          )}
        </div>

        {/* Footer info */}
        <div className="px-4 py-2.5 bg-slate-950/80 border-t border-slate-800 flex items-center justify-between text-[11px] text-slate-500 font-mono">
          <div className="flex items-center gap-3">
            <span>↑↓ Navigate</span>
            <span>↵ Select</span>
            <span>ESC Close</span>
          </div>
          <span>Babin Rentals OS ⌘K</span>
        </div>
      </div>
    </div>
  )
}
