# Item 11 Comprehensive Audit: Deep Architecture & Edge Cases
**Date:** 4 October 2026  
**Auditor:** AI Agent & Babin Systems Engineering  
**Scope:** Tasks 41–44 in `next-improvements.xlsx` (Item 11)  
**Status:** Audit Completed · Verified with Gate Invariants & Production Build

---

## 1. Task 41: Offline Queue Resilience, Dexie Schema & Idempotency Audit

### 1.1 Architecture & Schema Migration (Dexie v1 → v2 → v3)
- **Database Engine:** Dexie (`BabinOfflineQueue`) indexed on IndexedDB.
- **Schema Progression:**
  - `v1`: `mutations: '++id, clientUuid, table, status, timestamp'`
  - `v2`: Safe data cleanup transaction. Deduplicates pre-existing rows in primary-key order before applying the uniqueness index to prevent IndexedDB `VersionChangeAbort` crash (which would permanently lock the database on mobile devices).
  - `v3`: Enforces Law 8 uniqueness with compound index:
    `mutations: '++id, clientUuid, table, status, timestamp, &[table+action+clientUuid]'`
- **Idempotency Guarantee:**
  - Pre-check in `enqueueMutation()` warns gracefully on duplicate write attempt.
  - Compound unique constraint `&[table+action+clientUuid]` guarantees duplicate rejection even if invoked directly.
  - Client reuses `clientUuid` on replay (never generates a fresh one).

### 1.2 Queue Lifecycle & Recovery
- **Drain Logic (`drainQueue`):**
  - Concurrency lock (`let draining = false`) prevents overlapping worker drains.
  - Network-aware: Bails if `navigator.onLine === false`.
  - Crash recovery (`resetStaleSyncingMutations`): Queries any mutations stuck in `syncing` (e.g., if app crashed or tab was killed during drain) and reverts them to `pending`.
  - Replays in strict `timestamp` order (`sortBy('timestamp')`).
- **Postgres Conflict Handling:**
  - Detects error code `23505` (unique violation) on `client_uuid`: treats as resolved rather than an error (write already landed on server right before connection severed).
- **Retry & Dead-Letter Isolation:**
  - `MAX_RETRIES = 5`.
  - On failure, increments `retryCount`. If `retryCount < 5`, reverts to `status: 'pending'` for next drain.
  - If `retryCount >= 5`, transitions to `status: 'failed'` (dead-letter queue). Dead letters are excluded from auto-drain and quarantined for operator review (`getDeadLetterMutations()`).
- **Law 3 Compliance:**
  - Queued `delete` actions are immediately dead-lettered with `retryCount: MAX_RETRIES` (`"Delete is not a supported offline action (Law 3)"`).
- **Environment Safety:**
  - `canUseOfflineQueue()` guards against missing IndexedDB (e.g., Firefox private mode, SSR, node/vitest headless environments), preventing unhandled promise crashes at import time.

---

## 2. Task 42: Supabase Storage Policies & Access Rules Audit

### 2.1 Bucket Definitions & Structure (`0133_create_documents_storage_bucket.sql`)
- Two buckets seeded in `storage.buckets`:
  1. `documents`: Invoices, rental agreements, packing slips, credit notes, commercial PDFs.
  2. `evidence`: Return condition photos, damage reports, dispatch signatures.
- Both buckets designated as private.

### 2.2 Security Finding (P1 Vulnerability)
- **Current Policy Analysis in Migration 0133:**
  ```sql
  create policy "documents_evidence_select_policy"
    on storage.objects for select
    to authenticated, anon
    using (bucket_id in ('documents', 'evidence'));

  create policy "documents_evidence_insert_policy"
    on storage.objects for insert
    to authenticated, anon
    with check (bucket_id in ('documents', 'evidence'));

  create policy "documents_evidence_update_policy"
    on storage.objects for update
    to authenticated, anon
    using (bucket_id in ('documents', 'evidence'));

  create policy "documents_evidence_delete_policy"
    on storage.objects for delete
    to authenticated, anon
    using (bucket_id in ('documents', 'evidence'));
  ```
- **Identified Hazards:**
  1. **Anonymous Read/Write:** `to authenticated, anon` exposes both commercial PDFs (`documents`) and custody evidence photos (`evidence`) to unauthenticated public callers with the anon key.
  2. **Law 3 & Evidence Tampering:** Granting `anon` `DELETE` and `UPDATE` on `storage.objects` allows malicious actors or rogue clients to delete handover evidence or tamper with past inspection photos.
- **Recommended Remediation (Migration 0152):**
  - Revoke `anon` access from storage operations.
  - Restrict `INSERT` / `SELECT` to `authenticated` staff roles (or signed URLs for client document downloads).
  - Deny `UPDATE` and `DELETE` on `evidence` bucket objects entirely (Law 3 / tamper-proof evidence).

---

## 3. Task 43: Production Bundle Size, Chunk Splitting & Font Loading Audit

### 3.1 Build Output Analysis (`npm run build`)
- **Build Mode:** Vite 5.4.21 + Rollup, TypeScript 5.7 strict (`tsc --noEmit && vite build`).
- **Two Distinct Entry Points:**
  - `index.html` (Babin Rentals OS application): Main operational interface.
  - `marketing.html` (Public marketing website): Dedicated bundle (`150.52 kB` raw / `54.91 kB` gzip) with separate CSS (`src/marketing/marketing.css`), preventing heavy business logic (Supabase, Dexie, Router) from loading on public landing visits.
- **Manual Vendor Chunking:**
  - `vendor-react` (`react`, `react-dom`, `react-router-dom`): `179.67 kB` (gzip: `59.05 kB`).
  - `vendor-supabase` (`@supabase/supabase-js`): `218.41 kB` (gzip: `57.01 kB`).
  - `vendor-icons` (`@tabler/icons-react`): `37.13 kB` (gzip: `5.93 kB`).
  - `vendor-scanner` (`@zxing/browser`, `@zxing/library`): `453.49 kB` (gzip: `117.44 kB`).
- **Application Core:**
  - `dist/assets/main-*.js`: `536.17 kB` (gzip: `159.57 kB`). Exceeds 500 kB limit warning; further code splitting can extract `dexie` or GSAP into separate vendor chunks if desired.
- **Source Map Security:**
  - `sourcemap: false` is pinned in `vite.config.ts`, preventing disclosure of proprietary code paths in production builds.

### 3.2 Nepali & Offline Font Precaching
- **Font Assets:** Self-hosted `.woff2` files for Outfit (display), Source Sans 3 (body), JetBrains Mono (monospaced figures), Asar & Hind (Nepali / Devanagari script).
- **Service Worker Precaching (`VitePWA`):**
  - Default workbox excludes `.woff` and `.woff2`.
  - Configured explicitly: `globPatterns: ['**/*.{js,wasm,css,html,woff,woff2,ico,png,svg}']`.
  - Total precache: 259 assets (6.90 MB), guaranteeing offline font availability in signal-dead warehouse basements without CDN fallback failure.

---

## 4. Task 44: Booqable Bridge Sync Logic, Failure Modes & Edge Cases Audit

### 4.1 Bridge Codebase & Current Status
- **Location:** The Booqable bridge mappers and edge functions are archived/parked in `graft/src/lib/booqable` and `graft/supabase/functions/` (`booqable-proxy`, `booqable-webhook`).
- **Tables Supporting Sync (`0040_booqable_sync.sql`):**
  - `external_refs`: Maps local IDs to Booqable IDs (`provider = 'booqable'`).
  - `sync_inbox`: Inbound webhook events queue.
  - `sync_outbox`: Outbound changes to push to Booqable.
  - `sync_conflicts`: Logs conflicts for operator resolution.
  - `external_invoices`: Booqable invoice mirror.
- **Live Corpus Status:**
  - 100 clients and 71 products were imported into `external_refs`.
  - 0 booking orders are mapped in `external_refs`.
  - The live orders #700–#899 (200 rows) were imported, while #900–#945 were seeded synthetically by migration `0082` (formerly `0076`).

### 4.2 Failure Modes & Edge Cases
1. **Numbering Space Collision:**
   - Synthetic seed orders occupied the `B-900` to `B-945` range. Real Booqable orders past #899 would hit `bookings_booking_no_key UNIQUE` constraint errors on import.
   - Handled by architectural ruling: Babin Rentals OS is decoupling from Booqable authority. All new bookings mint monotonically via `next_document_number('booking')` (`BK-` format).
2. **Delete Rejection (Law 3):**
   - Booqable allows hard order deletion; Babin Rentals OS enforces `trg_bookings_reject_delete` (Law 3). Inbound webhook DELETE events will fail unless translated to `status = 'cancelled'`.
3. **Stage Transition Invariant (Law 1 / R-40):**
   - Booqable orders lack rigorous gate checks (e.g. equipment readiness, deposit status, line serialization).
   - Inbound sync from Booqable cannot bypass `apply_booking_stage_transition()`.
4. **Current Operational Verdict:**
   - The Booqable bridge is decoupled and offline. The primary system of record is Babin Rentals OS itself.
