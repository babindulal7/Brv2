# Evidence Workspace

Route `/rentals/:bookingNo/evidence` (`src/App.tsx:231`) · `src/modules/rentals/EvidenceWorkspace.tsx` · 726 lines

**Status: Seed-only.**

---

## 1. What it is

A photo-matching workspace for one booking: a gallery of evidence files, each badged Matched / Review / Unmatched, with a categories rail, a selected-photo detail rail and a match breakdown donut (`src/modules/rentals/EvidenceWorkspace.tsx:179-714`).

Every figure on it comes from the 10-row constant array `PHOTOS` (`src/data/evidence.ts:53-71`); no query file reads the `evidence_files` table (`src/lib/queries/bookings.ts:1102` is the only mention under `src/lib/queries`, and it is a comment).

Any booking number other than the seeded one renders `BookingNotLoaded` instead of the workspace (`src/modules/rentals/EvidenceWorkspace.tsx:174-176`, `src/modules/operations/BookingNotLoaded.tsx:27`).

---

## 2. What renders

Desktop, top to bottom:

| # | Area | Lines |
|---|------|-------|
| 1 | Header block — `<h1>Evidence Workspace</h1>`, a hardcoded **Booked** badge painted with `STATUS.primary` (`src/lib/status.ts:44`), a one-line subtitle, and two links: "Switch to Packing Workspace" → `/rentals/:id/packing`, "View Booking" → `/rentals/:id` | `184-222` |
| 2 | Stage chip group `[Packing][Return][Damage]` with per-stage counts, plus a "Showing {category} — chosen from the Categories rail" note when the active category is not one of the three | `228-266` |
| 3 | Read-only booking strip: Client · Booking · Pickup · Return · Status · Items · Evidence | `269-287` |
| 4 | Four-step progress card (Upload · Processing · Review & Match · Synced); each step's state is fixed by index — `i < 2 ? 'Complete' : i === 2 ? 'In Progress' : 'Pending'` | `290-310` |
| 5 | Three-column grid opens | `312-319` |
| 5a | **Left rail** `FloorAside` width 210, label "Categories": card "Upload Sources" (4 buttons + a dashed drag/drop box + upload limits + a "Not in v1" roadmap line), card "Categories" (11 rows with counts) | `321-383` |
| 5b | **Centre**: card "Processing" (4 tiles — Total / Matched / Need Review / Unmatched with derived percentages, then a reconciliation sentence); card "Gallery" with `All / Matched / Review / Unmatched` chips in the card header action, a bulk bar that appears on selection, the photo grid, and an `EmptyState` when nothing matches | `386-535` |
| 5c | **Right rail** `FloorAside` width 290, label "Selected photo": card "Selected Photo" (preview placeholder, file name, size + timestamp, Matched Product rows, a confidence bar for Review only, four buttons, an inline `ErrorBanner`, and a removal-reason panel); card "Match Breakdown" (`Donut` + `Legend`, `src/components/ui/Charts.tsx:81,154`); an "Archived (n)" card once anything is removed; a footer note card | `540-711` |
| 6 | `MiniBtn` — the Accept / Change / Assign Product pills used inside gallery cards | `717-726` |

**Responsive.** The file reads **both** of the codebase's breakpoints, via `useViewport()` (`src/modules/rentals/EvidenceWorkspace.tsx:114` → `src/lib/device.ts:57`), which bands on `BREAKPOINT = { phone: 768, desktop: 1180 }` (`src/lib/device.ts:43`).

- **≥1180 (desktop)** — grid `auto minmax(0,1fr) auto` (`315`); both rails are `collapsible` so they render through `Rail`/`SideRail` → `CollapsibleAside` (`src/modules/operations/FloorAside.tsx:40-49`, `src/components/ui/Page.tsx:315,400`); gallery columns `repeat(auto-fill, minmax(150px, 1fr))` (`64`); no explicit grid placement (`src/modules/operations/FloorAside.tsx:83`).
- **768–1179 (tablet)** — grid `minmax(0,1fr) 300px` (`315`); rails become plain columns (`src/modules/operations/FloorAside.tsx:50-52`); placement is list top-left, left rail beneath it, right rail spanning both rows (`src/modules/operations/FloorAside.tsx:85-89`); gallery is 3-up (`64`).
- **<768 (phone)** — single column (`315`); order becomes list → right rail → left rail (`src/modules/operations/FloorAside.tsx:84`); gallery is 2-up (`64`); the Processing tiles drop from 4-up to 2-up (`388`).
- The route is also in `FLOOR_ROUTE_SUFFIXES` (`src/App.tsx:902`), so `Shell` stamps `data-floor="true"` on `<main>` (`src/App.tsx:1010`) and `src/styles/theme.css:426-437` re-declares the type tokens at 1.1×. That is applied by the route, not by this file (`178`).

---

## 3. Data sources

| Screen area | Kind | Detail |
|---|---|---|
| Photo gallery, Processing tiles, Match Breakdown donut, Selected Photo, Archived card | SEED | `PHOTOS` — 10 hand-written rows, `src/data/evidence.ts:53-71`. Filtered to `live` at `137`, counted at `139-143`, filtered to `visible` at `154`. |
| Matched / Review / Unmatched badges | SEED (derived) | `matchState(p)` over the seeded `source`/`confidence`, `src/data/evidence.ts:43-51`. |
| Confidence percentages and the "≥95% auto-matches · 70–94% needs a human accept" line | SEED | `THRESHOLDS = { matched: 95, review: 70 }`, `src/data/evidence.ts:40`; rendered at `582`. |
| Categories rail (11 rows) | SEED | `CATEGORY_NAMES`, `src/data/evidence.ts:74-86`. |
| Stage chips (3) | SEED | `STAGE_FILTERS`, a literal in the component, `74`. |
| Upload Sources buttons, "Not in v1" roadmap, upload limits | SEED | `UPLOAD_SOURCES` / `UPLOAD_ROADMAP` / `LIMITS`, `src/data/evidence.ts:89-90,99-104`. |
| Four-step progress labels | SEED | `STEPS`, `src/data/evidence.ts:93`. Step states are hardcoded by index at `292`. |
| Bulk bar buttons (7) | SEED | `BULK_ACTIONS`, `src/data/evidence.ts:96`. |
| Booking strip — Client | SEED | `BOOKING.client` = "Himalayan Films Pvt. Ltd.", `src/data/booking.ts:126`. |
| Booking strip — Booking no | route param | `useParams()` (`110`), defaulting to `BOOKING.no` = `B-715` (`111`, `src/data/booking.ts:115`). |
| Booking strip — Pickup / Return dates | SEED (in-component literal) | `new Date('2026-07-16')` / `new Date('2026-07-19')` written in this file at `158-159` and again at `273-274`, converted by `toBs`/`formatBs`/`formatAd` (`src/lib/bs.ts:93,102,114`). |
| Booking strip — Status "Booked" | in-component literal | `275` (and the header badge at `201`). Not read from `BOOKING.status` (`src/data/booking.ts:124`). |
| Booking strip — Items "18" | SEED | `TOTAL_ITEMS = UNITS.length`, `src/data/packing.ts:83` over the 18 rows at `src/data/packing.ts:43-73`. |
| Booking strip — Evidence "n files" | SEED (derived) | `live.length`, `137`/`156`/`277`. |
| Selected Photo timestamp "16 Jul 2026" | in-component literal | `549`. |
| Removal reasons / Archived list | component state | `removed`, `useState<Record<string,string>>` at `124`; written only at `666`. Not persisted anywhere. |
| — | DB | **None.** No table, view or RPC is read by this page. `evidence_files` exists in the generated types (`src/types/supabase.ts:4664`) and its RLS policy is mirrored in `src/lib/rbac.ts:221`, but nothing under `src/lib/queries/` selects from it. |
| — | LOCAL | **`evidence_files` is UNSERVED by `src/lib/mock/corpus.ts`** — it is not a key of the store (`src/lib/mock/corpus.ts:405-423`) and it is not in the `UNSERVED` list either (`src/lib/mock/corpus.ts:33-44`), so mock mode's own "not served" disclosure does not name it. |

Invented on this page: every photo (10 file names, timestamps, file sizes, products, serials, bundles, sources and confidence values in `src/data/evidence.ts:53-71`), the 95/70 confidence thresholds (`src/data/evidence.ts:40`), the per-category counts and the donut's shares (all derived from those 10 rows), the 50 MB / 500 MB / 500-file upload limits (`src/data/evidence.ts:99-104`), the client name and item count (`src/data/booking.ts:126`, `src/data/packing.ts:83`), and the pickup/return/status values hardcoded at `158-159`, `273-275`, `549`.

---

## 4. Actions and writes

**One dispatch on the page.**

| Control | Line | Capability | Action file | `implemented` | Mapped in `checkCapability`? |
|---|---|---|---|---|---|
| **Mark as Review** | `608-629` | `evidence.review` (`src/actions/rentals/reviewEvidence.ts:12`) | `src/actions/rentals/reviewEvidence.ts:10` (`REVIEW_EVIDENCE`) | **false** — the config sets no `implemented` key, and `src/actions/core.ts:89` defaults it to `false` | **Yes** — `src/actions/core.ts:205-206` → `rbac.canWriteFloor` (`src/lib/rbac.ts:227-229`) |

Written exactly: **renders, dispatches REVIEW_EVIDENCE with `{ evidenceId, action: 'review' }` and the signed-in `{ userId, role }`, action is a stub (`src/actions/core.ts:223` fails it closed before validate, execute, events or audit).** The rejection is caught at `622-625` and rendered inline via `ErrorBanner` (`642-646`), so the operator sees `"REVIEW_EVIDENCE" is not connected to the database yet, so nothing was saved.` (`src/actions/core.ts:99-101`). The permission gate at `src/actions/core.ts:236-241` is never reached — every role gets the same not-implemented error. `execute` itself only `console.log`s `[DB TX] ...` (`src/actions/rentals/reviewEvidence.ts:20`).

If there is no session, the button sets an inline message and does not dispatch at all (`611-616`).

**Controls that dispatch nothing:**

| Control | Line | Behaviour |
|---|---|---|
| **Unmatch** | `631-635` | Disabled `Button` wrapped in `Unavailable` (`src/components/ui/Unavailable.tsx:35`) carrying `UNMATCH_UNAVAILABLE_REASON` (`106-107`). Deliberately dead — `ReviewEvidenceInput.action` is only `'review' \| 'remove'` (`src/actions/rentals/reviewEvidence.ts:6`). |
| **Remove → Confirm removal** | `636-638`, `663-672` | Requires a ≥5-char reason (`665`), then writes **component state only** (`setRemoved`, `666`). No action is dispatched, nothing is persisted, and the state dies on reload. |
| **Change Product** | `591` | `<Button icon="refresh">` with no `onClick`. |
| Upload Sources ×4 (Take Photo, Record Video, Upload Files, Upload Folder) | `324-328` | `<Button>` with no `onClick`. |
| Drag & drop box | `330-335` | A `<div>` with no `onDrop`/`onDragOver`/`<input type=file>`. Text only. |
| Bulk bar ×7 (Assign Product, Assign Category, Download, Export ZIP, Generate PDF, Rotate, Remove) | `436-438` | `<Button>` with no `onClick`. |
| Accept / Change (Review cards), Assign Product (Unmatched cards) | `507-508`, `513` | `MiniBtn` accepts only a `label` prop and renders a `<button>` with no handler (`717-726`). |

`Button` renders `<button type="button" onClick={onClick}>` (`src/components/ui/Page.tsx:144-148`), so an omitted `onClick` is an inert but fully enabled-looking control.

**Local-state controls that do work:** stage chips (`236`), category rail (`355`), gallery filter chips (`420`), select checkbox (`477`), active-photo preview (`467`), bulk-bar Clear (`441`), removal Cancel (`661`), EmptyState "Clear all filters" (`529` — see §7).

---

## 5. Gates

**Route reach.** The route is mounted inside `BookingShell` → `Shell` (`src/App.tsx:230-240`, `919`, `943`). `Shell` holds on `authLoading` (`src/App.tsx:964-970`), redirects to `/login` when there is no user (`src/App.tsx:973-975`), and otherwise refuses only money surfaces: `isForbidden = !canViewMoney(user.role) && isMoneySurface(pathname)` (`src/App.tsx:993`). `MONEY_ROUTES` is `/finance`, `/reports`, `/admin`, `/tools/pricing`, `/tools/depreciation` (`src/data/nav.ts:147-153`), so `/rentals/...` is not a money surface.

Consequence: **every signed-in role reaches this page**, including `Client`, which `src/lib/rbac.ts:53-55` defines as external ("portal only, never a staff surface"). There is no staff check on the route and none in the component.

**Money visibility.** The file does not import `useCanViewMoney` (`src/lib/moneyVisibility.ts:24`) and renders no currency anywhere — the only figures are file sizes in MB (`549`), counts, and percentages. Nothing is hidden under Law 6 because nothing on the page is money.

**Role rules that exist but never bite.** `evidence.review` resolves to `canWriteFloor` — Owner, Admin, Manager, Warehouse (`src/lib/rbac.ts:92,227-229`). Because `implemented` is false, `src/actions/core.ts:222-224` throws before the permission loop at `236`, so a Coordinator, Technician, Accounts, Driver or Client pressing Mark as Review gets the identical "not connected to the database yet" message an Owner gets.

---

## 6. States drawn

`PageBody` (`src/components/ui/PageBody.tsx:119`) is **not** imported here. The states are hand-assembled from `StateViews`:

- **Loading — none in the component.** It has no async data, so nothing loads. The only skeleton is the route's `Suspense` fallback in `Shell` (`src/App.tsx:1026`), plus the "Restoring session…" hold at `src/App.tsx:964-970`.
- **Error — hand-rolled, dispatch failures only.** `ErrorBanner` (`src/components/ui/StateViews.tsx:171`) rendered at `642-646` from the `dispatchError` state (`135`). There is no load-error path because there is no load.
- **Empty — yes, two.** `EmptyState` (`src/components/ui/StateViews.tsx:34`) inside the gallery grid when `visible.length === 0` (`524-532`), and a plain "No photo selected." paragraph when there is no `current` (`679`).
- **Restricted — none in this file.** `RestrictedState` (`src/components/ui/StateViews.tsx:213`) is reachable only through `Shell`'s money guard (`src/App.tsx:1020-1023`), which never fires on this route (§5).
- **A fifth, page-specific state:** `BookingNotLoaded` for any booking number other than `B-715` (`174-176`, `src/modules/operations/BookingNotLoaded.tsx:27`).

---

## 7. Known gaps

1. **No `TODO(decision)` markers in the file.** All 726 lines read; there are none.
2. **The one write is a stub.** `src/actions/rentals/reviewEvidence.ts` (41 lines) sets no `implemented`, so `src/actions/core.ts:223` throws for every caller. `execute` only `console.log`s (`src/actions/rentals/reviewEvidence.ts:20`). Mark as Review can never record anything today (`608-629`).
3. **Remove writes nothing.** "Confirm removal" mutates `removed` in component state (`666`) and dispatches no action — the §10 soft delete it names is not implemented. Reloading the page restores every removed photo.
4. **The Archived card claims a retention it cannot back.** "Retained and audited. Visible to Owner and Manager in the Archived filter." (`701-703`) — no store holds the removal, no Archived filter exists on this page or elsewhere, and no role rule is consulted.
5. **"Clear all filters" clears only one filter.** `onAction={() => setFilter('All')}` (`529`) leaves `category` untouched. Since all 10 seeded photos carry `category: 'Packing'` (`src/data/evidence.ts:54-70`), selecting any of the other 10 categories produces the empty state whose only action visibly does nothing.
6. **Two of the three stage chips are permanently zero.** The Return and Damage counts are computed over `live` (`231`), and no seeded photo carries either category (`src/data/evidence.ts:54-70`).
7. **A dead branch.** `reconciles` (`146`) compares `Matched + Review + Unmatched` to `total`, but the counts are built by bucketing every photo through `matchState`, which returns exactly one of the three (`139-143`, `src/data/evidence.ts:43-51`). The sum is a tautology, so "Counts do not reconcile to the total." (`406`) is unreachable.
8. **On-screen text points at a settings surface that does not exist.** "Thresholds live in Settings ▸ Evidence." (`583`). Settings has four tabs — business, people, branches, system (`src/data/settings.ts:131-136`) — and no Evidence tab or legacy alias (`src/data/settings.ts:146-157`). `THRESHOLDS` is a hardcoded constant (`src/data/evidence.ts:40`); `settingsStore` carries `evidenceRetentionDays` (`src/lib/settingsStore.ts:57,287`) but no confidence thresholds.
9. **Contradiction with Packing Workspace over the same booking.** `src/modules/rentals/PackingWorkspace.tsx:879` renders "34 photos · 28 matched · 4 review · 2 unknown" from `src/data/packing.ts:93`; this page derives **10 / 6 / 2 / 2** from `src/data/evidence.ts:53-71`. Two seed files, one booking, four disagreeing figures. (A third number is in the same packing seed: the per-unit `evidence` counts at `src/data/packing.ts:44-72` sum to 27.)
10. **The Selected Photo rail can show a photo the gallery is hiding.** `visible` is filtered by category *and* match state (`154`); `current` is `live.find(id === active) ?? live[0]` with no filter applied (`155`). Switching category leaves the previous photo in the rail.
11. **Booking facts are written twice.** Pickup/Return dates (`158-159`, `273-274`), Status (`201`, `275`) and the Selected Photo date (`549`) are literals in the component, while `src/data/booking.ts:114-135` already exports `BOOKING.pickup`, `BOOKING.ret` and `BOOKING.status` for the same booking. Nothing keeps the two in step.
12. **`dispatchError` is sticky by design.** It is cleared only by the next Mark as Review press (`617`) and shares its state slot with the no-session message (`612`), so an unrelated later action leaves the old banner on screen (`135`, `642-646`).
13. **A contrast failure the file records and leaves.** "`--muted` on the selected row's tint measures 4.38:1 — under AA." (`377-378`), on the category rail's counts.
14. **An unchecked cast.** `PHOTOS.find((x) => x.id === pid) as Photo` (`693`) — safe only because `removed`'s keys originate from `PHOTOS` ids; a stale key would render `undefined.file`.
15. **`evidence_files` is invisible to the mock-mode disclosure.** It is neither served by `buildStore()` (`src/lib/mock/corpus.ts:405-423`) nor listed in `UNSERVED` (`src/lib/mock/corpus.ts:33-44`), so the banner that exists to name unserved tables does not name this one.
16. **Unmatch is a dead control by design**, with its reasoning written out at `106-107` and rendered through `Unavailable` (`631-635`). Recorded here as a gap because the verb it needs does not exist in `ReviewEvidenceInput` (`src/actions/rentals/reviewEvidence.ts:6`).
