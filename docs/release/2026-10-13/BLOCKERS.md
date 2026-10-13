# Babin Rentals OS — Evidence-Based Blocker Register

**Date:** 2026-10-13 (Nepal time, Asia/Kathmandu)  
**Auditor / Integration Agent:** TestingRealityChecker (`agency-reality-checker`)  
**Methodology:** Direct inspection of runtime gates, responsive layout constraints, and permissions matrix.  
**Release Recommendation:** **HOLD** (Cannot promote to production until P0 and P1 blockers are resolved or authorized).  

---

## 1. Blocker Severity Classification

- **P0 (Release-Blocking / Hard Stop):** Security breach, data loss risk, unverified production schema, or violation of non-negotiable architectural laws (e.g. N-5).
- **P1 (Pre-Deployment Critical):** Usability failure, clipped navigation/headers, broken responsive flow on standard mobile viewports (360px–390px), or missing functional handlers.
- **P2 (Quality & Polish):** Secondary workflow refinements, unwired menu entries pending backend RPCs, or minor non-blocking UI discrepancies.

---

## 2. Active Blocker Register

### BLOCKER-01: Calendar Phone Header Overflow (P1)
- **Component:** `src/modules/calendar/Calendar.tsx`
- **Description:** On phone viewports (<768px, tested at 360px–390px), Calendar passes `leading={<FilterButton />} `, `primary={<Button>Check availability</Button>}`, and `extra={navButtons}` (Today button, prev/next month chevrons, BS/AD month pill) directly into the 64px fixed-height application header.
- **Impact:** Total header width required exceeds 712px, crushing the title "Calendar" to 0px, causing profile/search buttons to clip off-screen, and breaking touch target spacing.
- **Required Resolution:**
  1. Remove leading `FilterButton` on phone viewports (`!phone ? ... : undefined`) and move "Filters" into the More menu.
  2. Compact the primary CTA on phone to "Availability" (≥44px tap target).
  3. Relocate `navButtons` out of the 64px header on phone into a dedicated content date toolbar directly above the month grid, preserving full BS/AD month labels and 44px buttons.
  4. Preserve contextual phone search (`MobileHeaderSearch`).
- **Status:** **IN PROGRESS (Target of Current Sprint)**

---

### BLOCKER-02: Finance, Operations, and Settings Phone Header Crowding (P1)
- **Component:** `src/modules/finance/Finance.tsx`, `src/modules/operations/OperationsQueues.tsx`, `src/modules/settings/Settings.tsx`
- **Description:** Similar to Calendar, these modules pass multiple contextual buttons into the header which crowd or truncate on 375px phone screens.
- **Impact:** Header controls compete for width; titles truncate aggressively or push action buttons out of viewport.
- **Required Resolution:** Consolidate secondary buttons into More menus, ensure page-level single primary action ownership, and align with the 64px single-header specification.
- **Status:** **QUEUED (Follows Calendar Acceptance)**

---

### BLOCKER-03: Live Supabase JWT & PostgREST Staging Verification Unperformed (P0)
- **Component:** Supabase Cloud Infrastructure / RLS / RPCs
- **Description:** While local PGlite passes 160 migrations, 30 lifecycle steps, and anon exposure checks, verification against a live network-accessible Supabase project using real authenticated JWTs (Owner, Coordinator, Warehouse, Client) has not yet been executed for this release commit.
- **Impact:** Network-level RLS, PostgREST view serializations, real token expiry, and storage bucket policies cannot be certified on PGlite alone.
- **Hard Stop:** Under N-5, no automated or unreviewed database push may be performed. The Owner must review the release artifact, rehearse `BACKUP_PROTOCOL.md`, and authorize migration execution.
- **Status:** **HOLD (Pending Staging Provisioning & Owner Sign-off)**

---

### BLOCKER-04: Secondary Creation Actions Excluded Pending Real RPCs (P2)
- **Component:** `src/components/ui/creation/CreationActionRegistry.ts`
- **Description:** In accordance with `RULINGS-2026-10-13.md`, creation flows that previously generated fake toasts (generic booking, equipment drawer, expense drawer) were stripped from the global Add menu. Secondary entities (`maintenance.new`, `task.new`, `agreement.new`) remain disabled until backed by verified database actions.
- **Impact:** Users cannot initiate these secondary entities from the global header.
- **Resolution:** Retain honest exclusion. Do not re-enable until dedicated, atomic RPCs and tables are implemented.
- **Status:** **ACCEPTED / CONTROLLED DEFERRED**
