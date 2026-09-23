# Babin Rentals OS — System Architecture

**Status:** Authoritative Architectural Specification  
**Last Reconciled:** 23 September 2026

---

## 1. Technology Stack

- **Frontend Client:** React 18.3, TypeScript 5.7, Vite 5.4, React Router DOM 7.1.
- **Styling & UI Tokens:** Tailwind CSS v4, CSS Variables in `src/styles/theme.css` and `src/styles/ui-v2.css`.
- **Database & Storage:** Supabase PostgreSQL 15+, Row Level Security (RLS), Supabase Storage.
- **Local Persistence & Offline Outbox:** Dexie.js (IndexedDB wrapper) for non-custodial offline events.
- **Offline / Embedded Test Engine:** `@electric-sql/pglite` 0.5.8 for local migration execution and lifecycle gating without Docker.
- **Testing:** Vitest 3.2, `@testing-library/react`, JSDOM.

---

## 2. Core Architectural Boundaries

### 2.1 The 6-Stage Custody State Machine
Rentals advance through a monotonic, database-enforced lifecycle:

```
[ Quote ] ──(confirmRental)──> [ Booked ] ──(floorVerb: Pack)──> [ Packed ]
                                                                     │
                                                               (floorVerb: Handover)
                                                                     ▼
[ Closed ] <──(closeRental)─── [ Returned ] <──(floorVerb: Return)─ [ On Rent ]
```

- Every transition is validated by `apply_booking_stage_transition()` in PostgreSQL.
- Database triggers create and maintain `inventory_reservations` automatically with GiST conflict detection.
- **R-40 Fail-Closed Rule:** Stage transitions pass `queueOnFailure: false` and must be confirmed by reading `bookings.stage` back before floor verbs seal. Stage transitions are never queued offline.

### 2.2 RPC Transaction Boundaries
Mutations that span multiple tables execute in single atomic PostgreSQL transactions:
1. `create_booking(jsonb)`: Atomically inserts booking header, equipment lines, crew assignments (`booking_crew_lines`), and transport logistics (`booking_transport`). Partial creation is impossible (R-43).
2. `apply_booking_stage_transition(uuid, text, text, jsonb)`: Atomically checks gates, creates reservations, transitions stage, and records the transition audit log.
3. `next_document_number(text)`: Atomically mints sequential document numbers (`BK-`, `INV-`, `PAY-`).

### 2.3 Money-Blindness Architecture (Law 6)
- Roles: `Warehouse`, `Technician`, `Driver`, and `Client` are money-blind.
- **Database Enforcement:** PostgreSQL base tables enforce column-level security. Money fields (`rate_paisa`, `subtotal_paisa`, `total_paisa`, `outstanding_paisa`) are masked or omitted in staff views using `auth_can_view_money()`.
- **UI Enforcement:** `useRoleMoney()` and `rbac.ts` prevent rendering money containers or table columns, ensuring zero leaked figures in HTML or network payloads.

---

## 3. Data Flow & Offline Strategy

```text
[ User Action / UI Component ]
               │
               ▼
   [ Action Layer (src/actions/) ]
               │
      Is Custody Stage Transition?
         ├── YES ──> [ Direct Supabase RPC ] ──> Must commit online (Fail-Closed)
         └── NO  ──> [ dataAccess.ts ]
                          ├── Online  ──> [ Supabase PostgREST ]
                          └── Offline ──> [ Dexie Outbox Queue ] ──> [ Background Replay ]
```

- **Custody Actions (Pack, Handover, Return, Close):** Must commit directly to the database. If connectivity fails, the session remains `In Progress` with an inline error.
- **Non-Custodial Events (Scanned barcodes, operational notes, queue stamps):** Queue in Dexie outbox when offline and replay upon reconnection with idempotency keys.

---

## 4. Quality & Merge Gates

Every pull request and build must pass all five local verification gates in the same run:

```bash
npm run typecheck         # tsc --noEmit (0 errors)
npm run check:pglite      # Applies all 131 migrations from scratch in PGlite
npm run check:lifecycle   # Runs 18-step E2E lifecycle verification against Postgres
npm run test              # Vitest suite (3,478 unit and integration tests)
npm run build             # Production Vite bundle build
```
