import { localStore, isIndexedDbAvailable } from './localStore'
import { db as outbox } from './offlineQueue'
import { captureError } from './monitoring'

/**
 * # Purging the device's READ caches when an identity leaves it
 *
 * ## The defect this closes
 *
 * `logout()` used to call `supabase.auth.signOut()` and nothing else. Nothing
 * anywhere in `src/` called `caches.delete`, and nothing cleared the Dexie
 * domain store — a repo-wide grep for either returned zero hits.
 *
 * That is a **Law 6 breach on a shared warehouse tablet**, and RLS cannot reach
 * it, because the response never leaves the device:
 *
 *  - `vite.config.ts` registers two Workbox runtime caches — a
 *    `StaleWhileRevalidate` on `/rest/v1/(equipment|clients|bundles)` and a
 *    `NetworkFirst` on `/rest/v1/(bookings|booking_items)`. Workbox keys those
 *    entries on **URL only**; the JWT rides in the `Authorization` header and is
 *    not part of the key.
 *  - So an Owner's cached `/rest/v1/bookings?...` response — carrying
 *    `deposit_paisa` and `total_paisa` — is a plain Cache Storage entry on the
 *    device. When the Owner signs out and a Warehouse, Technician or Driver user
 *    signs in on the same tablet, `NetworkFirst` serves that Owner-shaped body to
 *    the money-blind session the moment the network is slow or absent.
 *  - The same applies to `localStore`, whose row shapes declare
 *    `daily_rate_paisa`, `outstanding_paisa`, `deposit_paisa` and `total_paisa`.
 *    It has no readers today, so this half is latent rather than live — but it
 *    becomes live the day a read path is added, which is exactly the work now
 *    starting.
 *
 * ## What this deliberately does NOT clear: the outbox
 *
 * `offlineQueue`'s Dexie database holds **work that has not reached the server
 * yet**. A warehouse tablet in a dead zone can accumulate a full shift of packs,
 * handovers and returns in it. Clearing it on sign-out would silently destroy a
 * day of real work at exactly the moment an operator does the most ordinary
 * thing in the world — hand the tablet to the next shift.
 *
 * So the outbox is spared, and `pendingLeft` reports what is still in it, for the
 * caller to surface. That leaves a real, **unresolved** question:
 *
 * > ⚠ TODO(decision) — queued mutations are not scoped to the user who made
 * > them. A pending write created by the Owner will replay under whichever
 * > session happens to be signed in when the network returns, and the server
 * > will attribute it to that user. The fix is a `userId` column on
 * > `QueuedMutation` plus a drain filter, but "whose write is it, and may it
 * > replay under a different operator?" is an audit and accountability question,
 * > not an engineering one. Raised for PLAN.md §4; not invented here.
 *
 * ## Why an allowlist rather than "delete every cache"
 *
 * `caches.keys()` also returns Workbox's **precache** (`workbox-precache-v2-…`),
 * which holds the application shell — the HTML, JS and CSS that let the app open
 * at all with no signal. Deleting that would trade a money leak for a tablet that
 * cannot boot in the warehouse, which is the one thing this build exists to
 * prevent. Only the two named data caches go.
 */

/** The Workbox runtime caches that hold PostgREST response bodies. Must match
 *  `vite.config.ts`'s `runtimeCaching[].options.cacheName` exactly. */
const DATA_CACHE_NAMES = ['supabase-reference-data', 'supabase-operational-data'] as const

export interface PurgeReport {
  /** Workbox data caches actually deleted on this device. */
  cachesDeleted: string[]
  /** Dexie domain tables emptied. */
  tablesCleared: string[]
  /** Unsynced mutations left in the outbox on purpose — see the note above. */
  pendingLeft: number
  /** Anything that failed. A purge is best-effort: a partial purge is still
   *  better than none, so failures are collected rather than thrown. */
  failures: string[]
}

/**
 * Empty every device-local cache that holds another identity's rows, keeping the
 * offline outbox and the application shell.
 *
 * Best-effort and never throws: it is called from `logout()`, and a sign-out that
 * fails because a cache API misbehaved would strand the operator in a session
 * they asked to leave.
 */
export async function purgeDeviceReadCaches(): Promise<PurgeReport> {
  const report: PurgeReport = { cachesDeleted: [], tablesCleared: [], pendingLeft: 0, failures: [] }

  /* 1 — Workbox runtime data caches. `caches` is absent on the dev server (no
     service worker is registered there, `devOptions` is unset) and in a
     non-secure context, so its absence is normal, not a failure. */
  if (typeof caches !== 'undefined') {
    for (const name of DATA_CACHE_NAMES) {
      try {
        if (await caches.delete(name)) report.cachesDeleted.push(name)
      } catch (cause) {
        report.failures.push(`cache ${name}: ${cause instanceof Error ? cause.message : String(cause)}`)
      }
    }
  }

  /* 2 — the Dexie domain cache. `syncMeta` goes too: it holds per-table sync
     cursors, and a cursor inherited from the previous identity would make the
     next user's first pull resume from a high-water mark set against rows they
     may not even be allowed to see, silently skipping their own. */
  if (isIndexedDbAvailable()) {
    for (const table of [localStore.products, localStore.clients, localStore.bookings, localStore.settings, localStore.syncMeta]) {
      try {
        await table.clear()
        report.tablesCleared.push(table.name)
      } catch (cause) {
        report.failures.push(`table ${table.name}: ${cause instanceof Error ? cause.message : String(cause)}`)
      }
    }

    /* 3 — count, never clear. See the header. */
    try {
      report.pendingLeft = await outbox.mutations.where('status').anyOf('pending', 'syncing').count()
    } catch (cause) {
      report.failures.push(`outbox count: ${cause instanceof Error ? cause.message : String(cause)}`)
    }
  }

  if (report.failures.length > 0) {
    captureError(new Error(`purgeDeviceReadCaches: ${report.failures.join(' · ')}`), {
      where: 'devicePurge',
      cachesDeleted: report.cachesDeleted.length,
      tablesCleared: report.tablesCleared.length,
    })
  }

  return report
}
