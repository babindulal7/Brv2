import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { lazy, Suspense } from 'react'
import type { ReactNode } from 'react'
import Sidebar from './components/shell/Sidebar'
import BottomBar, { BOTTOM_BAR_HEIGHT } from './components/shell/BottomBar'
import HeaderBar from './components/shell/Header'
import type { Crumb } from './components/shell/Header'
import ScannerFab from './components/shell/ScannerFab'
import Placeholder from './modules/Placeholder'
import { NAV } from './data/nav'
import { ToastProvider } from './components/ui/Toast'
import { CommandPalette } from './components/shell/CommandPalette'
import Login from './modules/auth/Login'
import ScreenLock from './modules/auth/ScreenLock'
import { useAuth } from './lib/auth'
import { useViewport } from './lib/device'

/* ── lazy-loaded route pages (code-splitting) ─────────────────────────── */
const Today             = lazy(() => import('./modules/today/Today'))
const RentalsList       = lazy(() => import('./modules/rentals/RentalsList'))
const BookingDetail     = lazy(() => import('./modules/rentals/BookingDetail'))
const NewRental         = lazy(() => import('./modules/rentals/NewRental'))
const PackingWorkspace  = lazy(() => import('./modules/rentals/PackingWorkspace'))
const HandoverWorkspace = lazy(() => import('./modules/rentals/HandoverWorkspace'))
const ReturnWorkspace   = lazy(() => import('./modules/rentals/ReturnWorkspace'))
const ResetWorkspace    = lazy(() => import('./modules/rentals/ResetWorkspace'))
const EvidenceWorkspace = lazy(() => import('./modules/rentals/EvidenceWorkspace'))
const Pulse             = lazy(() => import('./modules/reports/Pulse'))
const ExpenseReports    = lazy(() => import('./modules/reports/ExpenseReports'))
const ClientReports     = lazy(() => import('./modules/reports/ClientReports'))
const ProductReports    = lazy(() => import('./modules/reports/ProductReports'))
const BackupRestore     = lazy(() => import('./modules/admin/BackupRestore'))
const AuditSettings     = lazy(() => import('./modules/admin/AuditSettings'))
const NumberingSequences = lazy(() => import('./modules/admin/NumberingSequences'))
const CashFlowReport    = lazy(() => import('./modules/reports/CashFlowReport'))
const WorkingCapital    = lazy(() => import('./modules/reports/WorkingCapitalReport'))
const Inventory         = lazy(() => import('./modules/inventory/Inventory'))
const AddBundle         = lazy(() => import('./modules/inventory/AddBundle').then(m => ({ default: m.AddBundle })))
/* 06 Inventory renders — these screens existed but were unreachable. */
const AddEquipment      = lazy(() => import('./modules/inventory/AddEquipment'))
const AssetDetail       = lazy(() => import('./modules/inventory/AssetDetail'))
const Warehouses        = lazy(() => import('./modules/inventory/Warehouses'))
const StockCheck        = lazy(() => import('./modules/inventory/StockCheck'))
const PurchaseRequests  = lazy(() => import('./modules/inventory/PurchaseRequests'))
const Calendar          = lazy(() => import('./modules/calendar/Calendar'))
const Documents         = lazy(() => import('./modules/documents/Documents'))
const OperationsQueues  = lazy(() => import('./modules/operations/OperationsQueues'))
const Finance           = lazy(() => import('./modules/finance/Finance'))
const SystemMonitor     = lazy(() => import('./modules/system/SystemMonitor'))
const AiAssistant       = lazy(() => import('./modules/ai/AiAssistant'))
const Settings          = lazy(() => import('./modules/settings/Settings'))
const EventTriggers     = lazy(() => import('./modules/automation/EventTriggers'))
const SmsCenter         = lazy(() => import('./modules/notifications/SmsCenter'))
const Membership        = lazy(() => import('./modules/clients/Membership'))
const Clients           = lazy(() => import('./modules/clients/Clients'))
const AddClient         = lazy(() => import('./modules/clients/AddClient'))
const ClientDetail      = lazy(() => import('./modules/clients/ClientDetail'))
const BroadcastCenter   = lazy(() => import('./modules/notifications/BroadcastCenter'))
const CasesWorkspace    = lazy(() => import('./modules/operations/CasesWorkspace').then(m => ({ default: m.CasesWorkspace })))
const CrewBooking       = lazy(() => import('./modules/operations/CrewBooking').then(m => ({ default: m.CrewBooking })))
const SubRental         = lazy(() => import('./modules/operations/SubRental').then(m => ({ default: m.SubRental })))

/**
 * Route table follows the ID registry in Navigation & Platform Shells v2.0 §7.
 *   /rentals/BK-2026-0715      /clients/CL-2026-0034
 *   /inventory/EQ000234        /cases/CASE-2026-0041
 * Never `BR-` — that is the branch prefix.
 */
export default function App() {
  const { user } = useAuth()
  return (
    <ToastProvider>
      <CommandPalette />
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<Navigate to={user ? "/today" : "/login"} replace />} />

        {/*
          v2.0 §5.1 removed Reports and Administration from the sidebar — Reports
          is a Finance tab, Administration is inside Settings. Their routes stay
          so existing deep links and breadcrumbs still resolve; they are simply
          no longer a way *in*.
        */}
        <Route path="/reports" element={<Navigate to="/reports/pulse" replace />} />
        <Route path="/admin" element={<Navigate to="/admin/numbering" replace />} />

        <Route
          path="/clients"
          element={
            <Shell crumbs={[{ label: 'Clients' }, { label: 'Directory & Membership' }]} search="Search client, company, PAN, phone…">
              <Clients />
            </Shell>
          }
        />

        {/* Declared before nothing needs it — /new is a static segment, not a
            client ID, so there is no :id route to collide with. */}
        <Route
          path="/clients/new"
          element={
            <Shell crumbs={[{ label: 'Clients' }, { label: 'Add New Client' }]} search="Search client, company, PAN, phone…">
              <AddClient />
            </Shell>
          }
        />

        <Route
          path="/today"
          element={
            <Shell crumbs={[{ label: 'Today Operations' }]} search="Search booking no, client, equipment…">
              <Today />
            </Shell>
          }
        />

        <Route
          path="/rentals"
          element={
            <Shell crumbs={[{ label: 'Rentals List' }]} search="Search booking, client, equipment, invoice…">
              <RentalsList />
            </Shell>
          }
        />

        {/* Declared before /rentals/:bookingNo so "new" is not read as an ID. */}
        <Route
          path="/rentals/new"
          element={
            <Shell crumbs={[{ label: 'Rentals List' }, { label: 'New Rental' }]} search="Search client, equipment…">
              <NewRental />
            </Shell>
          }
        />

        {/* §4.3 — operations are full-screen routes, never modals. */}
        <Route
          path="/rentals/:bookingNo/packing"
          element={
            <Shell
              crumbs={[{ label: 'Rentals List' }, { label: 'Bookings' }, { label: 'BK-2026-0715' }, { label: 'Packing' }]}
              search="Search item, serial, accessory…"
            >
              <PackingWorkspace />
            </Shell>
          }
        />
        <Route
          path="/rentals/:bookingNo/handover"
          element={
            <Shell
              crumbs={[{ label: 'Rentals List' }, { label: 'Bookings' }, { label: 'BK-2026-0715' }, { label: 'Handover' }]}
              search="Search item, serial, accessory…"
            >
              <HandoverWorkspace />
            </Shell>
          }
        />
        <Route
          path="/rentals/:bookingNo/return"
          element={
            <Shell
              crumbs={[{ label: 'Rentals List' }, { label: 'Bookings' }, { label: 'BK-2026-0715' }, { label: 'Return' }]}
              search="Search item, serial, accessory…"
            >
              <ReturnWorkspace />
            </Shell>
          }
        />
        <Route
          path="/rentals/:bookingNo/reset"
          element={
            <Shell
              crumbs={[{ label: 'Rentals List' }, { label: 'Bookings' }, { label: 'BK-2026-0715' }, { label: 'Reset' }]}
              search="Search item, serial, accessory…"
            >
              <ResetWorkspace />
            </Shell>
          }
        />
        <Route
          path="/rentals/:bookingNo/evidence"
          element={
            <Shell
              crumbs={[{ label: 'Rentals List' }, { label: 'Bookings' }, { label: 'BK-2026-0715' }, { label: 'Evidence' }]}
              search="Search file, product, serial…"
            >
              <EvidenceWorkspace />
            </Shell>
          }
        />

        {/* Booking detail. The registry's ID form is BK-YYYY-NNNN. */}
        <Route
          path="/rentals/:bookingNo"
          element={
            <Shell
              crumbs={[{ label: 'Rentals List' }, { label: 'Bookings' }, { label: 'BK-2026-0715' }]}
              search="Search booking, client, equipment, invoice…"
            >
              <BookingDetail />
            </Shell>
          }
        />

        <Route
          path="/inventory"
          element={
            <Shell crumbs={[{ label: 'Inventory' }]} search="Search equipment, serial, SKU, category…">
              <Inventory />
            </Shell>
          }
        />

        {/*
          `06 Inventory` renders. Declared before `/inventory/:code` so a word
          like "new" is never read as an equipment code.
        */}
        <Route
          path="/inventory/new"
          element={
            <Shell crumbs={[{ label: 'Inventory' }, { label: 'Add Equipment' }]} search="Search equipment, serial, SKU, category…">
              <AddEquipment />
            </Shell>
          }
        />

        <Route
          path="/inventory/warehouses"
          element={
            <Shell crumbs={[{ label: 'Inventory' }, { label: 'Warehouses' }]} search="Search warehouse, zone, bay…">
              <Warehouses />
            </Shell>
          }
        />

        <Route
          path="/inventory/stock-check"
          element={
            <Shell crumbs={[{ label: 'Inventory' }, { label: 'Stock Check' }]} search="Scan or search equipment, serial…">
              <StockCheck />
            </Shell>
          }
        />

        <Route
          path="/inventory/purchase-requests"
          element={
            <Shell crumbs={[{ label: 'Inventory' }, { label: 'Purchase Requests' }]} search="Search request, item, supplier…">
              <PurchaseRequests />
            </Shell>
          }
        />

        {/* Last of the /inventory/* group — a bare segment is an asset code. */}
        <Route
          path="/inventory/:code"
          element={
            <Shell crumbs={[{ label: 'Inventory' }, { label: 'Asset' }]} search="Search equipment, serial, SKU, category…">
              <AssetDetail />
            </Shell>
          }
        />

        <Route
          path="/inventory/bundles/new"
          element={
            <Shell crumbs={[{ label: 'Inventory' }, { label: 'Bundles' }, { label: 'New Bundle' }]} search="Search inventory, category…">
              <AddBundle />
            </Shell>
          }
        />

        <Route
          path="/calendar"
          element={
            <Shell crumbs={[{ label: 'Calendar & Dispatch' }]} search="Search events, bookings, equipment…">
              <Calendar />
            </Shell>
          }
        />

        <Route
          path="/documents"
          element={
            <Shell crumbs={[{ label: 'Documents & Registry' }]} search="Search contracts, invoices, gate passes…">
              <Documents />
            </Shell>
          }
        />

        <Route
          path="/operations"
          element={
            <Shell crumbs={[{ label: 'Operations Queues' }]} search="Search job, booking, client, kit…">
              <OperationsQueues />
            </Shell>
          }
        />

        <Route
          path="/operations/cases"
          element={
            <Shell crumbs={[{ label: 'Operations' }, { label: 'Cases' }]} search="Search case ID, title, client…">
              <CasesWorkspace />
            </Shell>
          }
        />

        <Route
          path="/operations/crew"
          element={
            <Shell crumbs={[{ label: 'Operations' }, { label: 'Crew Booking' }]} search="Search crew, role, production…">
              <CrewBooking />
            </Shell>
          }
        />

        <Route
          path="/operations/sub-rental"
          element={
            <Shell crumbs={[{ label: 'Operations' }, { label: 'Sub Rental' }]} search="Search SR ID, equipment, partner…">
              <SubRental />
            </Shell>
          }
        />

        <Route
          path="/finance"
          element={
            <Shell crumbs={[{ label: 'Finance' }]} search="Search invoice, payment, client…">
              <Finance />
            </Shell>
          }
        />

        <Route
          path="/finance/documents"
          element={
            <Shell crumbs={[{ label: 'Finance' }, { label: 'Tax & Invoices' }]} search="Search tax invoices…">
              <Documents />
            </Shell>
          }
        />

        <Route
          path="/reports/pulse"
          element={
            <Shell crumbs={[{ label: 'Finance' }, { label: 'Reports' }, { label: 'Pulse' }]} search="Search reports…">
              <Pulse />
            </Shell>
          }
        />

        <Route
          path="/reports/expenses"
          element={
            <Shell
              crumbs={[{ label: 'Finance' }, { label: 'Reports' }, { label: 'Expense Reports' }]}
              search="Search expense, vendor, category, staff, note…"
            >
              <ExpenseReports />
            </Shell>
          }
        />

        <Route
          path="/reports/clients"
          element={
            <Shell crumbs={[{ label: 'Finance' }, { label: 'Reports' }, { label: 'Client Ledger' }]}>
              <ClientReports />
            </Shell>
          }
        />

        <Route
          path="/reports/inventory"
          element={
            <Shell crumbs={[{ label: 'Finance' }, { label: 'Reports' }, { label: 'Asset Utilization' }]}>
              <ProductReports />
            </Shell>
          }
        />

        <Route
          path="/reports/cash-flow"
          element={
            <Shell crumbs={[{ label: 'Finance' }, { label: 'Reports' }, { label: 'Cash Flow' }]} search="Search reports…">
              <CashFlowReport />
            </Shell>
          }
        />

        <Route
          path="/reports/working-capital"
          element={
            <Shell crumbs={[{ label: 'Finance' }, { label: 'Reports' }, { label: 'Working Capital' }]} search="Search reports…">
              <WorkingCapital />
            </Shell>
          }
        />

        <Route
          path="/clients/memberships"
          element={
            <Shell crumbs={[{ label: 'Clients' }, { label: 'Directory & Membership' }]}>
              <Membership />
            </Shell>
          }
        />

        {/* Last of the /clients/* group, same reasoning as /inventory/:code —
            a bare segment here is a client ID, so it's declared after every
            named static sibling. */}
        <Route
          path="/clients/:id"
          element={
            <Shell crumbs={[{ label: 'Clients' }, { label: 'Client Profile' }]} search="Search client, company, PAN, phone…">
              <ClientDetail />
            </Shell>
          }
        />

        <Route
          path="/notifications"
          element={
            <Shell crumbs={[{ label: 'Notifications' }, { label: 'Broadcast Center' }]}>
              <BroadcastCenter />
            </Shell>
          }
        />

        <Route
          path="/notifications/sms"
          element={
            <Shell crumbs={[{ label: 'Notifications' }, { label: 'SMS Gateway' }]}>
              <SmsCenter />
            </Shell>
          }
        />

        <Route
          path="/automation"
          element={
            <Shell crumbs={[{ label: 'Automation' }, { label: 'Event Triggers' }]}>
              <EventTriggers />
            </Shell>
          }
        />

        <Route
          path="/system"
          element={
            <Shell crumbs={[{ label: 'System Monitor' }]} search="Search services, jobs, incidents…">
              <SystemMonitor />
            </Shell>
          }
        />

        <Route
          path="/ai"
          element={
            <Shell crumbs={[{ label: 'AI Intelligence' }, { label: 'Operations Assistant' }]}>
              <AiAssistant />
            </Shell>
          }
        />

        <Route
          path="/settings"
          element={
            <Shell crumbs={[{ label: 'Settings' }]} search="Search settings, tax rates, branches…">
              <Settings />
            </Shell>
          }
        />

        <Route
          path="/admin/backup"
          element={
            <Shell crumbs={[{ label: 'Administration' }, { label: 'Backup & Restore' }]}>
              <BackupRestore />
            </Shell>
          }
        />

        <Route
          path="/admin/audit"
          element={
            <Shell crumbs={[{ label: 'Administration' }, { label: 'Immutable Audit Trail' }]}>
              <AuditSettings />
            </Shell>
          }
        />

        <Route
          path="/admin/numbering"
          element={
            <Shell crumbs={[{ label: 'Administration' }, { label: 'Numbering Sequences' }]}>
              <NumberingSequences />
            </Shell>
          }
        />

        {UNBUILT.map((u) => (
          <Route
            key={u.to}
            path={u.to}
            element={
              <Shell crumbs={u.crumbs}>
                <Placeholder title={u.title} />
              </Shell>
            }
          />
        ))}

        <Route
          path="*"
          element={
            <Shell crumbs={[{ label: '404' }]}>
              <div style={{ maxWidth: 440, margin: '80px auto', textAlign: 'center' }}>
                <h1 style={{ fontSize: 28, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>Page not found</h1>
                <p style={{ color: 'var(--muted)', marginBottom: 20 }}>The URL does not exist in Babin Rentals OS.</p>
                <a
                  href="/today"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    padding: '8px 16px',
                    borderRadius: 8,
                    background: 'var(--nav-active-accent)',
                    color: '#fff',
                    textDecoration: 'none',
                    fontWeight: 600,
                    fontSize: 13,
                  }}
                >
                  Return to Today
                </a>
              </div>
            </Shell>
          }
        />
      </Routes>
    </ToastProvider>
  )
}

/** Nav destinations that have a route but no screen yet. Derived, not hand-listed. */
const BUILT = new Set([
  '/today',
  '/rentals',
  '/reports/expenses',
  '/admin/backup',
  '/clients/memberships',
  '/notifications',
  '/admin/audit',
  '/automation',
  '/notifications/sms',
  '/reports/clients',
  '/reports/inventory',
  '/admin/numbering',
  '/inventory',
  '/calendar',
  '/documents',
  '/operations',
  '/finance',
  '/system',
  '/ai',
  '/settings',
  '/clients',
  '/clients/new',
  '/clients/CL-2026-0001',
  '/reports',
  '/admin',
  '/finance/documents',
  '/reports/pulse',
  '/reports/cash-flow',
  '/reports/working-capital',
  '/rentals/new',
  '/rentals/BK-2026-0715/packing',
  '/rentals/BK-2026-0715/handover',
  '/rentals/BK-2026-0715/return',
  '/rentals/BK-2026-0715/reset',
  '/rentals/BK-2026-0715/evidence',
])

const UNBUILT: Array<{ to: string; title: string; crumbs: Crumb[] }> = NAV.flatMap((s) => {
  const self = { to: s.to, title: s.label, crumbs: [{ label: s.label }] }
  const kids = (s.children ?? []).map((c) => ({
    to: c.to,
    title: c.label,
    crumbs: [{ label: s.label }, { label: c.label }],
  }))
  return [self, ...kids]
})
  .filter((r) => !BUILT.has(r.to))
  // A section and its first child can share a path (Finance → Dashboard).
  .filter((r, i, all) => all.findIndex((x) => x.to === r.to) === i)

import { useNetwork } from './lib/network'
import Icon from './components/ui/Icon'

function OfflineBanner() {
  const isOnline = useNetwork()
  
  if (isOnline) return null

  return (
    <div style={{
      background: 'var(--warning-bg, #4d3a00)', // fallback brown/yellow
      color: 'var(--warning-text, #ffc833)', // fallback yellow
      padding: '8px 16px',
      fontSize: 'var(--t-meta)',
      fontWeight: 500,
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      borderBottom: '1px solid var(--border)'
    }}>
      <Icon name="error" size={16} />
      <span>You are offline. Changes will be saved locally and synced when you reconnect.</span>
    </div>
  )
}

/**
 * DEVICES.md §7 build order item 3 — "apply `FLOOR_UI_SCALE` on Pack /
 * Handover / Return / Reset / Scanner rather than leaving it a manual
 * preference." These five suffixes are the one place that decides "is this a
 * floor screen" — previously each workspace hardcoded its own
 * `data-floor="true"` on its root div, which meant a screen renamed or a new
 * floor route added could silently lose the scale. Evidence carries it too:
 * it was already opted in from earlier work and belongs to the same
 * pack/return/reset family read at arm's length. Scanner needs no entry here
 * — `ScannerFab` is a single global component, not a route, and already
 * carries its own `data-floor="true"` correctly.
 */
const FLOOR_ROUTE_SUFFIXES = ['/packing', '/handover', '/return', '/reset', '/evidence']

function Shell({
  crumbs,
  search,
  children,
}: {
  crumbs: Crumb[]
  search?: string
  children: ReactNode
}) {
  const { pathname, search: query } = useLocation()
  const { user, isLocked, setLocked } = useAuth()
  /* DEVICES.md §7 build order item 2 — below 768 the bottom bar replaces the
     Sidebar as primary navigation rather than sitting alongside a squeezed
     rail. Law 13: branch on capability (viewport), not platform. */
  const viewport = useViewport()
  const phone = viewport === 'phone'
  const isFloor = FLOOR_ROUTE_SUFFIXES.some((s) => pathname.endsWith(s))

  // Redirect to login if not authenticated
  if (!user) {
    return <Navigate to="/login" replace />
  }

  // RBAC Permission Check (Mock basic logic based on role)
  const isForbidden = user.role === 'Warehouse' && pathname.startsWith('/finance')

  return (
    <div
      style={{
        display: 'flex',
        minHeight: '100vh',
        background: 'var(--app)',
        transition: 'background-color var(--dur-theme) ease',
      }}
    >
      {!phone && <Sidebar active={pathname + query} />}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <OfflineBanner />
        <HeaderBar crumbs={crumbs} {...(search ? { searchPlaceholder: search } : {})} />
        <main
          data-floor={isFloor ? 'true' : undefined}
          style={{ flex: 1, padding: phone ? `16px 20px ${24 + BOTTOM_BAR_HEIGHT}px` : '16px 20px 24px' }}
        >
          {isForbidden ? (
            <div style={{ textAlign: 'center', marginTop: '20vh' }}>
              <h1 style={{ color: 'var(--danger)', margin: '0 0 8px' }}>Permission Denied</h1>
              <p style={{ color: 'var(--text2)', margin: 0 }}>
                Your role ({user.role}) does not have access to this module.
              </p>
            </div>
          ) : (
            <Suspense fallback={
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '40vh' }}>
                <div style={{ width: 28, height: 28, border: '3px solid var(--border)', borderTopColor: 'var(--primary)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
              </div>
            }>
              {children}
            </Suspense>
          )}
        </main>
      </div>
      {phone && <BottomBar active={pathname + query} />}
      <ScannerFab />

      {/* Screen Lock Overlay */}
      {isLocked && <ScreenLock onUnlock={() => setLocked(false)} />}
    </div>
  )
}
