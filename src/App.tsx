import { Routes, Route, Navigate, useLocation, useParams, useSearchParams } from 'react-router-dom'
import { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import Sidebar from './components/shell/Sidebar'
import BottomBar, { BAR_BOX } from './components/shell/BottomBar'
import HeaderBar from './components/shell/Header'
import type { Crumb } from './components/shell/Header'
import ScannerFab from './components/shell/ScannerFab'
import { ErrorBoundary } from './components/shell/ErrorBoundary'
import { LoadingSkeleton, RestrictedState } from './components/ui/StateViews'
import NotFound from './pages/NotFound'
import Placeholder from './modules/Placeholder'
import { WelcomeOnboarding } from './lib/WelcomeOnboarding'
import { NAV, isMoneySurface, isStaffSurface, FLOOR_ROUTE_SUFFIXES } from './data/nav'
import { ToastProvider } from './components/ui/Toast'
import { SyncProvider } from './lib/syncContext'
import { CommandPalette } from './components/shell/CommandPalette'
import Login from './modules/auth/Login'
import ForgotPassword from './modules/auth/ForgotPassword'
import ResetPassword from './modules/auth/ResetPassword'
import ScreenLock from './modules/auth/ScreenLock'
import { useAuth } from './lib/auth'
import { useViewport } from './lib/device'
import { canViewMoney, isStaff } from './lib/rbac'
import { installRoutePreload } from './lib/routePreload'
import { OperationsWorkspaceProvider } from './modules/operations/OperationsWorkspaceContext'
import { WorkspaceProvider, useWorkspace } from './lib/workspaceContext'

/* ── lazy-loaded route pages (code-splitting) ─────────────────────────── */
const Today             = lazy(() => import('./modules/today/Today'))
const RentalsList       = lazy(() => import('./modules/rentals/RentalsList'))
const BookingDetail     = lazy(() => import('./modules/rentals/BookingDetail'))
const PackingWorkspace  = lazy(() => import('./modules/rentals/PackingWorkspace'))
const HandoverWorkspace = lazy(() => import('./modules/rentals/HandoverWorkspace'))
const ReturnWorkspace   = lazy(() => import('./modules/rentals/ReturnWorkspace'))
const ResetWorkspace    = lazy(() => import('./modules/rentals/ResetWorkspace'))
const EvidenceWorkspace = lazy(() => import('./modules/rentals/EvidenceWorkspace'))
const Pulse             = lazy(() => import('./modules/reports/Pulse'))
const ExpenseReports    = lazy(() => import('./modules/reports/ExpenseReports'))
const ClientReports     = lazy(() => import('./modules/reports/ClientReports'))
const InventoryReports  = lazy(() => import('./modules/reports/InventoryReports'))
const ProductReports    = lazy(() => import('./modules/reports/ProductReports'))
const EquipmentPerformance = lazy(() => import('./modules/reports/EquipmentPerformance'))
const AssetRoiReport    = lazy(() => import('./modules/reports/AssetRoiReport'))
const PromotionsReports = lazy(() => import('./modules/reports/PromotionsReports'))
const StaffReports      = lazy(() => import('./modules/reports/StaffReports'))
const ForecastingReports = lazy(() => import('./modules/reports/ForecastingReports'))
const BackupRestore     = lazy(() => import('./modules/admin/BackupRestore'))
const AuditSettings     = lazy(() => import('./modules/admin/AuditSettings'))
const ActivityLog       = lazy(() => import('./modules/admin/ActivityLog'))
const AuditLog          = lazy(() => import('./modules/admin/AuditLog'))
const NumberingSequences = lazy(() => import('./modules/admin/NumberingSequences'))
const CashFlowReport    = lazy(() => import('./modules/reports/CashFlowReport'))
const WorkingCapital    = lazy(() => import('./modules/reports/WorkingCapitalReport'))
const Inventory         = lazy(() => import('./modules/inventory/Inventory'))
const BundleDetail      = lazy(() => import('./modules/inventory/BundleDetail'))
const AssetDetail       = lazy(() => import('./modules/inventory/AssetDetail'))
const PurchaseRequests  = lazy(() => import('./modules/inventory/PurchaseRequests'))
const Calendar          = lazy(() => import('./modules/calendar/Calendar'))
const Documents         = lazy(() => import('./modules/documents/Documents'))
const OperationsQueues  = lazy(() => import('./modules/operations/OperationsQueues'))
const Finance           = lazy(() => import('./modules/finance/Finance'))
const DailyClosing      = lazy(() => import('./modules/finance/DailyClosing'))
const Settings          = lazy(() => import('./modules/settings/Settings'))
const ToolsLanding      = lazy(() => import('./modules/tools/ToolsLanding'))
const Clients           = lazy(() => import('./modules/clients/Clients'))
const ClientDetail      = lazy(() => import('./modules/clients/ClientDetail'))
const CasesWorkspace    = lazy(() => import('./modules/operations/CasesWorkspace').then(m => ({ default: m.CasesWorkspace })))
const CrewBooking       = lazy(() => import('./modules/crew/CrewBooking').then(m => ({ default: m.CrewBooking })))
const SubRental         = lazy(() => import('./modules/operations/SubRental').then(m => ({ default: m.SubRental })))
const DeliveryWorkspace = lazy(() => import('./modules/operations/DeliveryWorkspace'))
const TimesheetTab      = lazy(() => import('./modules/crew/TimesheetTab'))
const ProductionsList   = lazy(() => import('./modules/rentals/ProductionsList'))
const WarrantyTracker   = lazy(() => import('./modules/inventory/WarrantyTracker'))

function RentalsNewRedirect() {
  const [searchParams] = useSearchParams()
  const params = new URLSearchParams(searchParams)
  params.set('action', 'new')
  return <Navigate to={`/rentals?${params.toString()}`} replace />
}

export default function App() {
  const { user } = useAuth()
  const [showOnboarding, setShowOnboarding] = useState(false)

  useEffect(() => {
    installRoutePreload()
    const completed = localStorage.getItem('babin-onboarding-completed')
    if (completed !== 'true') {
      setShowOnboarding(true)
    }
  }, [])

  return (
    <ToastProvider>
      <SyncProvider>
        <OperationsWorkspaceProvider>
          <WorkspaceProvider>
            <CommandPalette />
            {showOnboarding && <WelcomeOnboarding onClose={() => setShowOnboarding(false)} />}
            <Routes>
          <Route path="/login" element={<Login />} />
        {/*
          Password reset, built 15 Aug 2026. Mounted beside /login and outside
          <Shell> for the same reason: a locked-out operator has no session, so
          anything inside the shell would bounce them straight back to /login —
          and `/reset-password` in particular is reached while Supabase HAS
          established a session, which would bounce them to /today instead and
          swallow the recovery link. Neither screen may sit behind the guard.

          NOTE — these two are NOT part of the administrative cut. They post-date
          the cut package and were re-added by hand when it was applied.
        */}
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/" element={<Navigate to={user ? "/dashboard" : "/login"} replace />} />

        {/*
          v2.0 §5.1 removed Reports from the sidebar — it is a Finance tab
          (`09_FINANCE.md`). Its routes stay so existing deep links and
          breadcrumbs still resolve; they are simply no longer a way *in*.
        */}
        <Route path="/reports" element={<Navigate to="/reports/pulse" replace />} />
        {/*
          Administration lives in **Settings ▸ System**, ruled 15 Aug 2026.

          It used to answer to two URLs at once: `/admin/audit-log` and
          `/tools/audit-log` both mounted the same screen, four pages behind
          eight routes, reachable from two different landing pages. `/admin/*`
          is the single spelling now and Tools is calculators only.

          Law 3 — nothing is deleted, so the `/tools/*` URLs that shipped still
          resolve, as `replace` redirects to their one home. `/admin` itself
          lands on the Settings tab that now lists them.
        */}
        <Route path="/admin" element={<Navigate to="/settings?tab=system" replace />} />
        <Route path="/tools/audit-log" element={<Navigate to="/admin/audit-log" replace />} />
        <Route path="/tools/activity-log" element={<Navigate to="/admin/activity-log" replace />} />
        <Route path="/tools/numbering" element={<Navigate to="/admin/numbering" replace />} />
        <Route path="/tools/backup" element={<Navigate to="/admin/backup" replace />} />

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
        <Route path="/clients/new" element={<Navigate to="/clients?tab=new" replace />} />

        <Route
          path="/dashboard"
          element={
            <Shell crumbs={[{ label: 'Today' }]} search="Search booking no, client, equipment…">
              <Today />
            </Shell>
          }
        />

        <Route
          path="/today"
          element={
            <Shell crumbs={[{ label: 'Today' }]} search="Search booking no, client, equipment…">
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

        <Route
          path="/rentals/productions"
          element={
            <Shell crumbs={[{ label: 'Rentals', to: '/rentals' }, { label: 'Productions Hub' }]} search="Search productions, client, shoot…">
              <ProductionsList />
            </Shell>
          }
        />

        {/* Declared before /rentals/:bookingNo so "new" is not read as an ID. */}
        <Route path="/rentals/new" element={<RentalsNewRedirect />} />

        {/* §4.3 — operations are full-screen routes, never modals. */}
        <Route
          path="/rentals/:bookingNo/packing"
          element={
            <BookingShell
              tail="Packing"
              search="Search item, serial, accessory…"
            >
              <PackingWorkspace />
            </BookingShell>
          }
        />
        <Route
          path="/rentals/:bookingNo/handover"
          element={
            <BookingShell
              tail="Handover"
              search="Search item, serial, accessory…"
            >
              <HandoverWorkspace />
            </BookingShell>
          }
        />
        <Route
          path="/rentals/:bookingNo/return"
          element={
            <BookingShell
              tail="Return"
              search="Search item, serial, accessory…"
            >
              <ReturnWorkspace />
            </BookingShell>
          }
        />
        <Route
          path="/rentals/:bookingNo/reset"
          element={
            <BookingShell
              tail="Reset"
              search="Search item, serial, accessory…"
            >
              <ResetWorkspace />
            </BookingShell>
          }
        />
        <Route
          path="/rentals/:bookingNo/evidence"
          element={
            <BookingShell
              tail="Evidence"
              search="Search file, product, serial…"
            >
              <EvidenceWorkspace />
            </BookingShell>
          }
        />

        {/* Booking detail. The ID form is whatever `data/numbering.ts` issues
            for `BK`. It is not written down here at all any more: `BookingShell`
            reads the number off the route, which is the only version that cannot
            contradict the URL beside it. */}
        <Route
          path="/rentals/:bookingNo"
          element={
            <BookingShell search="Search booking, client, equipment, invoice…">
              <BookingDetail />
            </BookingShell>
          }
        />

        {/* Crew Booking spec v3.2 §1 — top-level module, sidebar item 6 of the
            fixed 11 (the wireframe shell block; `data/nav.ts`). */}
        <Route
          path="/crew"
          element={
            <Shell crumbs={[{ label: 'Crew Assist' }]} search="Search crew, skills, production…">
              <CrewBooking />
            </Shell>
          }
        />

        <Route
          path="/crew/timesheet"
          element={
            <Shell crumbs={[{ label: 'Crew Assist', to: '/crew' }, { label: 'Timesheet' }]} search="Search staff, role…">
              <TimesheetTab />
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

        <Route
          path="/inventory/warranty"
          element={
            <Shell crumbs={[{ label: 'Inventory', to: '/inventory' }, { label: 'Warranty & RMA Tracker' }]} search="Search equipment, serial, provider…">
              <WarrantyTracker />
            </Shell>
          }
        />

        {/*
          Integrated in-page: /inventory/new redirects to /inventory?tab=new so
          operators remain inside the Inventory module workspace without detached shortcuts.
        */}
        <Route path="/inventory/new" element={<Navigate to="/inventory?tab=new" replace />} />

        {/*
          Integrated in-page: Warehouses moved to Settings ▸ Branches & Warehouses (§11.3).
          /inventory/warehouses redirects to /settings?tab=branches&view=warehouses.
        */}
        <Route path="/inventory/warehouses" element={<Navigate to="/settings?tab=branches&view=warehouses" replace />} />

        <Route path="/inventory/stock-check" element={<Navigate to="/inventory?tab=stock-check" replace />} />

        <Route
          path="/inventory/purchase-requests"
          element={
            <Shell crumbs={[{ label: 'Inventory', to: '/inventory' }, { label: 'Purchase Requests' }]} search="Search request, item, supplier…">
              <PurchaseRequests />
            </Shell>
          }
        />

        {/* Last of the /inventory/* group — a bare segment is an asset code.
            Param name must match AssetDetail's useParams<{ assetId }>() —
            it read `:code` here while asking for `assetId`, so the route
            never actually received a value and every visit silently fell
            back to PARENTS[0] regardless of which asset was requested.
            Found while wiring Hover Intel System v2.1's "Open Asset Detail"
            trigger, the first real caller of this route. */}
        <Route
          path="/inventory/:assetId"
          element={
            <Shell crumbs={[{ label: 'Inventory', to: '/inventory' }, { label: 'Asset' }]} search="Search equipment, serial, SKU, category…">
              <AssetDetail />
            </Shell>
          }
        />

        {/*
          Integrated in-page: /inventory/bundles/new redirects to /inventory?tab=bundles&action=new
          so operators create bundles in-page within the Bundles workspace.
        */}
        <Route path="/inventory/bundles/new" element={<Navigate to="/inventory?tab=bundles&action=new" replace />} />

        {/*
          Declared after `/inventory/bundles/new` to match this file's grouping
          convention, NOT to protect it: react-router 7 ranks by specificity
          (static segment 10, dynamic 3), so `/inventory/bundles/new` (35) beats
          `/inventory/bundles/:bundleRef` (28) whatever the declaration order,
          and `/inventory/:assetId` is a two-segment pattern that cannot match a
          three-segment path at all.

          The param is a REF, not an id: `queries/bundleRecords.ts` maps
          `id: b.bundleCode` and drops the uuid, so every link carries `BND-…`.
          The query dispatches on shape anyway, per the 4 Sep ruling that a
          uuid-only lookup for a code-only caller is a P0 waiting to happen.
        */}
        <Route
          path="/inventory/bundles/:bundleRef"
          element={
            <Shell crumbs={[{ label: 'Inventory', to: '/inventory' }, { label: 'Bundles', to: '/inventory?tab=bundles' }, { label: 'Bundle' }]} search="Search inventory, category…">
              <BundleDetail />
            </Shell>
          }
        />

        {/*
          `/inventory/bundles/:bundleRef/edit` — four segments, so it cannot
          collide with the three-segment detail route above under any ranking.
          The ref is the same one the detail page was opened with, and the edit
          screen reads it the same way (code or uuid), so the two never disagree
          about which bundle is on screen.
        */}
        {/*
          Integrated in-page: /inventory/bundles/:bundleRef/edit redirects to
          /inventory/bundles/:bundleRef?action=edit so operators edit bundles
          in-place within BundleDetail without isolated shortcut sub-pages.
        */}
        <Route
          path="/inventory/bundles/:bundleRef/edit"
          element={<BundleEditRedirect />}
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

        {/* Moved under Inventory 30 Aug — a case is a finding about GEAR (missing,
            damaged), so it files with the assets it concerns. The Operation page
            keeps its Cases chip; only the address moved. */}
        <Route
          path="/inventory/cases"
          element={
            <Shell crumbs={[{ label: 'Inventory', to: '/inventory' }, { label: 'Cases' }]} search="Search case ID, title, client…">
              <CasesWorkspace />
            </Shell>
          }
        />

        {/* Dynamic sibling of /inventory/cases, same convention as /clients/:id
            and /inventory/:assetId — declared right after its static parent. */}
        <Route
          path="/inventory/cases/:id"
          element={
            <Shell crumbs={[{ label: 'Inventory', to: '/inventory' }, { label: 'Cases' }]} search="Search case ID, title, client…">
              <CasesWorkspace />
            </Shell>
          }
        />

        {/* Legacy addresses — Cases lived under /operations until 30 Aug. */}
        <Route path="/operations/cases" element={<Navigate to="/inventory/cases" replace />} />
        <Route path="/operations/cases/:id" element={<CasesLegacyRedirect />} />

        {/* Moved to a top-level route 9 Aug 2026 (Crew Booking spec v3.2 §1) —
            Crew Assist is its own sidebar module, not an Operations queue. */}
        <Route path="/operations/crew" element={<Navigate to="/crew" replace />} />

        <Route
          path="/operations/sub-rental"
          element={
            <Shell crumbs={[{ label: 'Operations', to: '/operations' }, { label: 'Sub Rental' }]} search="Search SR ID, equipment, partner…">
              <SubRental />
            </Shell>
          }
        />

        <Route
          path="/operations/delivery"
          element={
            <Shell crumbs={[{ label: 'Operations', to: '/operations' }, { label: 'Delivery & Logistics' }]} search="Search dispatch, booking, address, rider…">
              <DeliveryWorkspace />
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

        {/* §9.3. Money surface by prefix — `isMoneySurface('/finance/payments')`
            already matches on `/finance`, so the Shell guard refuses a typed URL
            for a money-blind role without `MONEY_ROUTES` gaining an entry. The
            screen spreads `financeRestriction()` too: the guard is a route table,
            that one is the query's own contract. */}
        {/* §5.4. Money surface by prefix — `isMoneySurface('/finance/closing')`
            matches on `/finance`, so the Shell guard already refuses a typed
            URL for a money-blind role; the screen carries its own Law 6 guard
            too, because a route table and a screen answer different questions. */}
        <Route
          path="/finance/closing"
          element={
            <Shell crumbs={[{ label: 'Finance', to: '/finance' }, { label: 'Daily Closing' }]}>
              <DailyClosing />
            </Shell>
          }
        />

        <Route path="/finance/invoices" element={<Navigate to="/finance?tab=invoices" replace />} />
        <Route path="/finance/payments" element={<Navigate to="/finance?tab=payments" replace />} />
        <Route path="/finance/expenses" element={<Navigate to="/finance?tab=expenses" replace />} />
        <Route path="/finance/documents" element={<Navigate to="/documents" replace />} />
        <Route path="/finance/reports" element={<Navigate to="/finance?tab=reports" replace />} />

        <Route
          path="/reports/pulse"
          element={
            <Shell crumbs={[{ label: 'Finance', to: '/finance' }, { label: 'Reports', to: '/finance?tab=reports' }, { label: 'Pulse' }]} search="Search reports…">
              <Pulse />
            </Shell>
          }
        />

        <Route
          path="/reports/expenses"
          element={
            <Shell
              crumbs={[{ label: 'Finance', to: '/finance' }, { label: 'Reports', to: '/finance?tab=reports' }, { label: 'Expense Reports' }]}
              search="Search expense, vendor, category, staff, note…"
            >
              <ExpenseReports />
            </Shell>
          }
        />

        <Route
          path="/reports/clients"
          element={
            <Shell crumbs={[{ label: 'Finance', to: '/finance' }, { label: 'Reports', to: '/finance?tab=reports' }, { label: 'Client Ledger' }]}>
              <ClientReports />
            </Shell>
          }
        />

        <Route
          path="/reports/promotions"
          element={
            <Shell crumbs={[{ label: 'Finance', to: '/finance' }, { label: 'Reports', to: '/finance?tab=reports' }, { label: 'Promotions' }]}>
              <PromotionsReports />
            </Shell>
          }
        />

        <Route
          path="/reports/staff"
          element={
            <Shell crumbs={[{ label: 'Finance', to: '/finance' }, { label: 'Reports', to: '/finance?tab=reports' }, { label: 'Staff Performance' }]}>
              <StaffReports />
            </Shell>
          }
        />

        <Route
          path="/reports/inventory"
          element={
            <Shell crumbs={[{ label: 'Finance', to: '/finance' }, { label: 'Reports', to: '/finance?tab=reports' }, { label: 'Inventory Reports' }]}>
              <InventoryReports />
            </Shell>
          }
        />

        {/* §4.41(a) ruling, 2 Sep 2026: this content lived at /reports/inventory
            until 6fb1c62 replaced it in place with a different report. Routed
            back at its own path; /reports/inventory links across. Not in the
            §9.6 register — its 43-count is pinned by rulings §11.3. */}
        <Route
          path="/reports/products"
          element={
            <Shell crumbs={[{ label: 'Finance', to: '/finance' }, { label: 'Reports', to: '/finance?tab=reports' }, { label: 'Product Reports' }]}>
              <ProductReports />
            </Shell>
          }
        />

        <Route
          path="/reports/equipment-performance"
          element={
            <Shell crumbs={[{ label: 'Finance', to: '/finance' }, { label: 'Reports', to: '/finance?tab=reports' }, { label: 'Equipment Performance' }]}>
              <EquipmentPerformance />
            </Shell>
          }
        />

        <Route
          path="/reports/asset-roi"
          element={
            <Shell crumbs={[{ label: 'Finance', to: '/finance' }, { label: 'Reports', to: '/finance?tab=reports' }, { label: 'Asset ROI' }]}>
              <AssetRoiReport />
            </Shell>
          }
        />

        <Route
          path="/reports/forecasting"
          element={
            <Shell crumbs={[{ label: 'Finance', to: '/finance' }, { label: 'Reports', to: '/finance?tab=reports' }, { label: 'Forecasting & AI' }]}>
              <ForecastingReports />
            </Shell>
          }
        />

        <Route
          path="/reports/cash-flow"
          element={
            <Shell crumbs={[{ label: 'Finance', to: '/finance' }, { label: 'Reports', to: '/finance?tab=reports' }, { label: 'Cash Flow' }]} search="Search reports…">
              <CashFlowReport />
            </Shell>
          }
        />

        <Route
          path="/reports/working-capital"
          element={
            <Shell crumbs={[{ label: 'Finance', to: '/finance' }, { label: 'Reports', to: '/finance?tab=reports' }, { label: 'Working Capital' }]} search="Search reports…">
              <WorkingCapital />
            </Shell>
          }
        />

        <Route path="/clients/memberships" element={<Navigate to="/clients?tab=membership" replace />} />
        <Route path="/clients/import" element={<Navigate to="/clients?tab=import" replace />} />
        <Route path="/clients/duplicates" element={<Navigate to="/clients?tab=duplicates" replace />} />
        <Route path="/clients/referral/new" element={<Navigate to="/clients?tab=referral" replace />} />

        {/* Last of the /clients/* group, same reasoning as /inventory/:code —
            a bare segment here is a client ID, so it's declared after every
            named static sibling. */}
        <Route
          path="/clients/:id"
          element={
            <Shell crumbs={[{ label: 'Clients', to: '/clients' }, { label: 'Client Profile' }]} search="Search client, company, PAN, phone…">
              <ClientDetail />
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

        {/* Audit *Settings* is a different screen from the Audit *Log* and
            `10_TOOLS.md` does not list it, so it keeps its own route. */}
        <Route
          path="/admin/audit"
          element={
            <Shell crumbs={[{ label: 'Administration', to: '/settings?tab=system' }, { label: 'Immutable Audit Trail' }]}>
              <AuditSettings />
            </Shell>
          }
        />

        <Route
          path="/admin/audit-settings"
          element={
            <Shell crumbs={[{ label: 'Admin', to: '/settings?tab=system' }, { label: 'Audit Settings' }]}>
              <AuditSettings />
            </Shell>
          }
        />

        {/* ── Tools — nav item 10, `10_TOOLS.md` ──────────────────────────
            Six cards plus the cinematography suite kept by Rulings §6: two
            calculators (§10.2, §10.3), four admin screens (§10.4–§10.7), and
            the suite at its ruled path below. */}
        <Route
          path="/tools"
          element={
            <Shell crumbs={[{ label: 'Tools' }]} search="Search tools…">
              <ToolsLanding />
            </Shell>
          }
        />

        <Route path="/tools/depreciation" element={<Navigate to="/tools?tab=depreciation" replace />} />
        <Route path="/tools/pricing" element={<Navigate to="/tools?tab=pricing" replace />} />

        <Route
          path="/admin/audit-log"
          element={
            <Shell crumbs={[{ label: 'Settings', to: '/settings' }, { label: 'Audit Log' }]}>
              <AuditLog />
            </Shell>
          }
        />

        <Route
          path="/admin/activity-log"
          element={
            <Shell crumbs={[{ label: 'Settings', to: '/settings' }, { label: 'Activity Log' }]}>
              <ActivityLog />
            </Shell>
          }
        />

        <Route
          path="/admin/numbering"
          element={
            <Shell crumbs={[{ label: 'Settings', to: '/settings' }, { label: 'Numbering Sequences' }]}>
              <NumberingSequences />
            </Shell>
          }
        />

        <Route
          path="/admin/backup"
          element={
            <Shell crumbs={[{ label: 'Settings', to: '/settings' }, { label: 'Backup & Restore' }]}>
              <BackupRestore />
            </Shell>
          }
        />

        {/* The cinematography calculator suite — kept by Rulings §6, which also
            settles where it lives: `/tools/cinematography`. `11_SETTINGS.md`'s
            eight sections include no Tools, so `/settings/tools` had no home in
            either spec. Law 3 — nothing is deleted, so the old path still
            resolves as a `replace` redirect, the same treatment the four
            `/admin/*` URLs get above. */}
        <Route path="/tools/cinematography" element={<Navigate to="/tools?tab=cinematography" replace />} />
        <Route path="/settings/tools" element={<Navigate to="/tools?tab=cinematography" replace />} />

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
              <NotFound />
            </Shell>
          }
        />
      </Routes>
          </WorkspaceProvider>
        </OperationsWorkspaceProvider>
      </SyncProvider>
    </ToastProvider>
  )
}

/**
 * Which of NAV's destinations already mount a real screen, so `UNBUILT` below
 * knows not to shadow them with a Placeholder route.
 *
 * INVARIANT — an entry here is only meaningful if the `UNBUILT` derivation can
 * produce its path. That derivation walks `NAV`, and `NAV` is **flat** (the
 * fixed 11, no `children` anywhere — `data/nav.ts` keeps `NavChild` as a type
 * only), so the only paths it can ever yield are the eleven top-level `to`s
 * listed below. Nothing else belongs in this set.
 *
 * It held ~30 other entries until 22 Aug 2026 ('/clients/C-1',
 * '/rentals/B-715/packing', '/reports/expenses', …) — fossils from when NAV
 * had children. They could never match anything `UNBUILT` produces, but they
 * read as routing config and invited the next author to "register" a new
 * screen here to no effect. Audit item 3.5 cut the set to the producible
 * eleven. All eleven are built today, so `UNBUILT` is empty; the machinery
 * stays for the day a nav item ships before its screen — and if NAV ever
 * regains children, their paths join this set the day their screens exist.
 */
const BUILT = new Set(
  [
    '/rentals/new', //  1  New Rental
    '/dashboard', //    2  Dashboard
    '/operations', //   3  Operation
    '/rentals', //      4  Rentals
    '/calendar', //     5  Calendar
    '/crew', //         6  Crew Assist
    '/inventory', //    7  Inventory
    '/clients', //      8  Clients
    '/finance', //      9  Finance
    '/tools', //       10  Tools
    '/settings', //    11  Settings
  ],
)

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
import { IS_MOCK } from './lib/supabase'
import Icon from './components/ui/Icon'

function OfflineBanner() {
  const isOnline = useNetwork()
  
  if (isOnline) return null

  return (
    <div style={{
      /*
       * The yellow status pair, not a literal — and deliberately the SAME pair
       * every "waiting / needs attention" surface uses, so the offline bar
       * cannot drift into a colour of its own.
       *
       * History, because this line has been wrong twice: it originally read the
       * legacy warning-bg / warning-text alias pair with hard-coded fallbacks,
       * and warning-bg was never defined in theme.css — so the fallback WAS the
       * colour, in both themes. Fixed 16 Aug by moving to --st-progress-*. Under
       * DESIGN_DIRECTION_SPEC_v4.1 (25 Aug) the legacy --warning* aliases are
       * deleted outright and --st-progress-* now resolves to the v4.1 yellow
       * (--ready / --on-ready), which is the "waiting / in-house" hue. Offline
       * is exactly that: work is paused, not broken, so yellow and not red.
       */
      background: 'var(--st-progress-bg)',
      color: 'var(--st-progress-fg)',
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
 * **Mock-data banner — not dismissible, on every screen, at every width.**
 *
 * `VITE_DATA_SOURCE=mock` serves a local corpus instead of Supabase. The rule
 * this banner enforces comes straight from the dev-bypass post-mortem in
 * `lib/auth.tsx`: that shim carried a loud `console.warn` and it was still
 * mistaken for real data for a full session. A console message is not a
 * disclosure — the screen has to say it.
 *
 * Uses the `progress` (amber) status pair rather than OfflineBanner's colours:
 * `--warning-bg` is not defined anywhere in `theme.css`, so OfflineBanner
 * silently paints its hard-coded `#4d3a00` literal in BOTH themes. Do not copy
 * that pair. `--st-progress-*` is defined in light and dark, and is already the
 * "this data is seeded" notice on BookingDetail.
 *
 * NOTE — not part of the administrative cut; re-added by hand when it was
 * applied, because the cut package predates mock mode.
 */
function MockBanner() {
  if (!IS_MOCK) return null
  return (
    <div
      role="status"
      style={{
        background: 'var(--st-progress-bg)',
        color: 'var(--st-progress-fg)',
        padding: '6px 16px',
        fontSize: 'var(--t-meta)',
        fontWeight: 600,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
        borderBottom: '1px solid var(--border)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
        <Icon name="error" size={16} />
        <span style={{ minWidth: 0 }}>
          Mock mode (clean database) — all pre-seeded demo records removed. Login with owner@babinrentals.com.
        </span>
      </div>
      <button
        type="button"
        onClick={() => {
          try {
            localStorage.removeItem('babin.mock.overlay.v1')
            localStorage.removeItem('babin.mock.session.v1')
            window.location.reload()
          } catch {
            /* ignore */
          }
        }}
        style={{
          background: 'transparent',
          border: '1px solid currentColor',
          color: 'inherit',
          padding: '2px 8px',
          borderRadius: 4,
          cursor: 'pointer',
          fontSize: '11px',
          fontWeight: 600,
          whiteSpace: 'nowrap',
        }}
      >
        Reset Local Cache
      </button>
    </div>
  )
}

/*
 * FLOOR_ROUTE_SUFFIXES moved to `data/nav.ts` on 22 Aug 2026 — it gained a
 * second reader (`isStaffSurface`, the Client route-reach guard) and two
 * copies of the same five suffixes would drift. The DEVICES.md §7 rationale
 * ("apply FLOOR_UI_SCALE on Pack/Handover/Return/Reset rather than leaving it
 * a manual preference") travels with the constant.
 */

/**
 * **The crumb reads the route, not a literal.**
 *
 * All six parameterised booking routes used to pass
 * `crumbs={[…, { label: 'B-715' }, …]}` while their path was
 * `/rentals/:bookingNo/…`, so every booking's Packing, Handover, Return, Reset,
 * Evidence and detail page claimed to be booking B-715. Rulings §4 makes the
 * breadcrumb the *only* wayfinding on these screens — there is no `←` — so a
 * wrong crumb is the only orientation the operator gets, and it was wrong for
 * every booking but one.
 *
 * The comment above the detail route already warned "Never re-state it here";
 * the crumb four lines below it restated it anyway. Reading `useParams` is the
 * fix that cannot drift, because there is nowhere left to write the number down.
 */
/**
 * `/operations/cases/:id` → `/inventory/cases/:id` (the 30 Aug move). A plain
 * `<Navigate>` cannot carry a param across, so this one-liner reads it.
 */
function CasesLegacyRedirect() {
  const { id } = useParams()
  return <Navigate to={id ? `/inventory/cases/${id}` : '/inventory/cases'} replace />
}

function BundleEditRedirect() {
  const { bundleRef } = useParams<{ bundleRef: string }>()
  const [searchParams] = useSearchParams()
  const p = new URLSearchParams(searchParams)
  p.set('action', 'edit')
  return <Navigate to={`/inventory/bundles/${bundleRef}?${p.toString()}`} replace />
}

function BookingShell({
  tail,
  search,
  children,
}: {
  /** The step this route is, appended after the booking. Omitted on the detail page. */
  tail?: string
  search?: string
  children: ReactNode
}) {
  const { bookingNo } = useParams()
  // Non-last crumbs link; the current page (the booking itself, or its
  // workspace step) keeps no `to` — Header renders the last one inert.
  const crumbs: Crumb[] = [
    { label: 'Rentals List', to: '/rentals' },
    { label: 'Bookings', to: '/rentals' },
    { label: bookingNo ?? 'Booking' },
    ...(tail ? [{ label: tail }] : []),
  ]
  return (
    <Shell crumbs={crumbs} {...(search === undefined ? {} : { search })}>
      {children}
    </Shell>
  )
}

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
  const { user, loading: authLoading, isLocked, setLocked } = useAuth()
  /* DEVICES.md §7 build order item 2 — below 768 the bottom bar replaces the
     Sidebar as primary navigation rather than sitting alongside a squeezed
     rail. Law 13: branch on capability (viewport), not platform. */
  const viewport = useViewport()
  const phone = viewport === 'phone'
  const isFloor = FLOOR_ROUTE_SUFFIXES.some((s) => pathname.endsWith(s))
  const hasElevatedStickyBar = isFloor || pathname === '/rentals/new'

  // Restoring a persisted Supabase session is async. Redirecting during that
  // window would flash /login on every refresh and throw away the route the
  // user actually asked for, so hold until the first session lookup resolves.
  if (authLoading) {
    return (
      <div style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', background: 'var(--app)', color: 'var(--text2)', fontSize: 'var(--t-meta)' }}>
        Restoring session…
      </div>
    )
  }

  // Redirect to login if not authenticated
  if (!user) {
    return <Navigate to="/login" replace />
  }

  /*
   * Law 6 — the backstop for a typed URL, the one case nav omission cannot
   * cover.
   *
   * Two drifts closed here. The role test was `role === 'Warehouse'` only, while
   * Technician, Driver and Client are equally money-blind per `lib/rbac.ts`'s
   * MONEY_BLIND set. And the route test was the literal
   * `pathname.startsWith('/finance')` while `data/nav.ts` had already declared
   * `/reports` and `/admin` money-adjacent and withheld them from the nav — so
   * the nav hid a module the guard then let a typed URL through to. Both now
   * read one predicate, `isMoneySurface()`, over one list.
   *
   * The report screens each drop their own figures via `useCanViewMoney()`, so
   * this is defence in depth rather than the only gate — but a money-blind role
   * should not reach a hollowed-out Finance report at all.
   *
   * The second clause is the same backstop for the external role (22 Aug 2026,
   * audit theme 3 #7): a Client session typing a floor URL, /clients/import,
   * /clients/duplicates or /crew used to get the screen with RLS-emptied data
   * — reachable-but-hollowed, exactly what `lib/rbac.ts:isStaff`'s own doc
   * ("guard every staff surface with this") forbids. Nav omission is handled
   * in `permittedNav()` over the same `isStaffSurface()` list, so the two
   * gates cannot disagree.
   */
  const isForbidden =
    (!canViewMoney(user.role) && isMoneySurface(pathname)) ||
    (!isStaff(user.role) && isStaffSurface(pathname))

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100dvh',
        overflow: 'hidden',
        /* v4.2 §3 — the shell is TRANSPARENT so <body>'s fixed canvas gradient
           is the app's backdrop. Painting --app here was hiding the canvas
           behind an opaque flat fill, which also left the glass surfaces
           nothing to blur. Theme transition moved to body (theme.css). */
        background: 'transparent',
      }}
    >
      <a className="skip-to-content" href="#main-content">Skip to content</a>
      <MockBanner />
      <OfflineBanner />

      <div className="app-shell-layout" style={{ flex: 1, display: 'flex', minHeight: 0, overflow: 'hidden' }}>
        {!phone && <Sidebar active={pathname + query} />}
        <div className="app-shell-content" style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0 }}>
          <WorkspaceContextConsumer search={search} crumbs={crumbs} />
          <div className="app-workspace" style={{ flex: 1, display: 'flex', minHeight: 0, position: 'relative', overflow: 'hidden' }}>
            <WorkspaceContent isForbidden={isForbidden} user={user} phone={phone} hasElevatedStickyBar={hasElevatedStickyBar} isFloor={isFloor}>
              {children}
            </WorkspaceContent>
          </div>
        </div>
      </div>

      {phone && <BottomBar active={pathname + query} />}
      <ScannerFab />

      {/* Screen Lock Overlay */}
      {isLocked && <ScreenLock onUnlock={() => setLocked(false)} />}
    </div>
  )
}

function WorkspaceContextConsumer({ crumbs, search }: { crumbs: Crumb[], search?: string | undefined }) {
  return (
    <HeaderBar
      crumbs={crumbs}
      {...(search !== undefined ? { searchPlaceholder: search } : {})}
    />
  )
}

interface WorkspaceContentProps {
  isForbidden: boolean
  user: ReturnType<typeof useAuth>['user']
  phone: boolean
  hasElevatedStickyBar: boolean
  isFloor: boolean
  children: ReactNode
}

function WorkspaceContent({
  isForbidden,
  user,
  phone,
  hasElevatedStickyBar,
  isFloor,
  children
}: WorkspaceContentProps) {
  const { setLeftPanelElement, setRightPanelElement, setHeaderActionsElement } = useWorkspace()
  const { pathname } = useLocation()
  const mainRef = useRef<HTMLElement>(null)

  // The workspace is the scroll container, not window. Without this reset a
  // shorter destination page can inherit the previous page's scroll position and
  // render its title underneath the fixed shell header.
  useLayoutEffect(() => {
    if (mainRef.current) mainRef.current.scrollTop = 0
  }, [pathname])

  return (
    <div className="workspace-content" style={{ display: 'flex', flex: 1, minWidth: 0, minHeight: 0 }}>
      {/* Left Panel Mount Point */}
      <div ref={setLeftPanelElement} style={{ display: 'contents' }} />

      <main
        ref={mainRef}
        id="main-content"
        className="app-workspace-main"
        tabIndex={-1}
        data-floor={isFloor ? 'true' : undefined}
        style={{
          flex: 1,
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column',
          padding: phone
            ? `var(--page-padding) var(--page-padding) calc(${hasElevatedStickyBar ? '88px' : '24px'} + ${BAR_BOX})`
            : 'var(--page-padding)',
          overflowY: 'auto',
          overflowX: 'hidden',
          /* Reserve the scrollbar gutter so a page with a scrollbar and a
             page without one keep the identical content width — otherwise
             centered header content and page columns shift on navigation. */
          scrollbarGutter: 'stable',
        }}
      >
        <div className="workspace-page-actions" ref={setHeaderActionsElement} />
        {isForbidden ? (
          <div style={{ maxWidth: 420, margin: '10vh auto 0' }}>
            <RestrictedState reason={`Your role (${user?.role ?? 'unknown'}) does not have access to this module.`} />
          </div>
        ) : (
          <ErrorBoundary>
            <Suspense fallback={<LoadingSkeleton type="card" label="Loading…" />}>
              {children}
            </Suspense>
          </ErrorBoundary>
        )}
      </main>

      {/* Right Panel Mount Point */}
      <div ref={setRightPanelElement} style={{ display: 'contents' }} />
    </div>
  )
}
