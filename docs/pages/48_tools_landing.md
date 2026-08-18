# Tools
Route `/tools` · `src/modules/tools/ToolsLanding.tsx` · 255 lines · **Status: Live**

Mounted at `src/App.tsx:624-631` inside `<Shell crumbs={[{ label: 'Tools' }]} search="Search tools…">`; lazy-imported at `src/App.tsx:68`.

## 1. What it is

A link menu. It renders two headed groups of tiles that navigate to other routes (`src/modules/tools/ToolsLanding.tsx:63-110`, `:184-189`), and holds no state — the file contains no `useState`, no `useEffect` and no `onClick` (verified by search over the whole file; the only hooks called are `useViewport()` and `useCanViewMoney()` at `:138-139`).

Its own header comment describes a six-card page with a CALCULATORS and an ADMIN group (`:9-44`); the code below it has three cards in two groups, the ADMIN group having been deleted in place (`:86-95`).

## 2. What renders

Top to bottom at desktop:

1. **Page header** — `PageHeader` with `icon="tool"`, title `Tools`, and a description whose first clause switches on money visibility: `Calculators and administration utilities` when money is visible, `Administration utilities` when not, both followed by `. Every destination here has one home — Tools owns only what has no home elsewhere.` (`ToolsLanding.tsx:144-153`). `PageHeader` itself is `src/components/ui/Page.tsx:66-108` — 30px icon tile, `--t-h1` title, `--t-meta` description.
2. **Group section, repeated per visible group** (`ToolsLanding.tsx:155-189`): an uppercase `<h2>` at `--t-meta`/700/`letter-spacing 0.06em`/`--text2` (`:157-168`), an optional note paragraph in `--muted` (`:169-171`), then a CSS grid of tiles (`:172-183`).
   - **Calculators** — `desktopColumns: 2`, no note (`:64-66`). Cards: **Depreciation**, icon `chart`, hint `Book view · IRD pool view (blocked on rates)`, to `/tools/depreciation` (`:68-76`); **Pricing**, icon `dollar`, hint `Rate, days, discount — a quote sandbox that books nothing`, to `/tools/pricing` (`:77-83`).
   - **Cinematography suite** — `desktopColumns: 2`, note `Kept by ruling (Rulings §6) — 15 categories of camera, lens, exposure, timecode and power calculators.` (`:96-99`). One card: **Camera & lens tools**, icon `camera`, hint `Crop factor · field of view · depth of field · ND · timecode · storage · battery`, to `/tools/cinematography` (`:100-107`).
   - There is no ADMIN group; it was removed with a comment in its place (`:86-95`).
3. **Footer note bar** — `<FooterNote />` (`:191`), implemented at `src/components/ui/Page.tsx:443-469`.

**Tile shape** (`ToolTile`, `ToolsLanding.tsx:196-255`): a react-router `<Link>` styled with `cardStyle` (`Page.tsx:20-26`), `minHeight: 88`, `padding: 14`; a 34×34 `--nav-active-bg` icon tile (`:212-226`); label at `--t-ui`/700 (`:229`); an optional `Not built yet` badge with a `timer` icon (`:230-248`); the hint at `--t-meta`/`--text2` (`:250`); a trailing `chevron_right` (`:252`). Every icon name used (`chart`, `dollar`, `camera`, `tool`, `timer`, `chevron_right`) is present in the registry at `src/components/ui/Icon.tsx:79-172`.

**Responsive bands.** The file reads `useViewport()` (`ToolsLanding.tsx:5`, `:138`), which is `src/lib/device.ts:57-79` and is defined by `BREAKPOINT = { phone: 768, desktop: 1180 }` (`device.ts:43-51`) — so **both** 768 and 1180 are read. The one thing they change is the grid's column count (`ToolsLanding.tsx:178-180`): phone `1`; tablet `Math.min(2, cards.length)`; desktop `Math.min(group.desktopColumns, cards.length)`.

Because both groups declare `desktopColumns: 2` (`:66`, `:98`), the tablet and desktop branches compute the same numbers on this page — Calculators 2 columns in both bands, Cinematography 1 column in both (`Math.min(2,1)`). **The 1180 threshold is read but produces no visual difference here;** only the 768 phone band changes the layout, to 1-up full width. `FooterNote`, `PageHeader` and `ToolTile` carry no band logic of their own.

## 3. Data sources

| screen area | source kind | detail |
|---|---|---|
| Group headings, notes, card labels, hints, icons, destinations | SEED | `GROUPS` constant — **in the component file, not `src/data/`**: `ToolsLanding.tsx:63-110`. Hand-typed UI copy; no query file, no table. |
| Page header title + description | SEED | Literals in `ToolsLanding.tsx:144-153`; the description branches on `useCanViewMoney()`. |
| Which cards survive for a money-blind role | SEED | `MONEY_ROUTES` constant array in `src/data/nav.ts:147-153`, read through `isMoneySurface()` (`nav.ts:156-159`) from `ToolsLanding.tsx:132`. |
| Footer note bar (dates line, timezone line, version) | SEED | `FOOTER_NOTE` in `src/data/nav.ts:428-432`, rendered by `Page.tsx:443-469`. |
| Role → money visibility | — (session) | `useCanViewMoney()` (`src/lib/moneyVisibility.ts:24-27`) → `canViewMoney()` (`src/lib/rbac.ts:36-38`) over the signed-in `AuthUser.role` (`src/lib/auth.tsx:13-21`). Not a table read. |

The page imports exactly seven things (`ToolsLanding.tsx:1-7`): `Link`, `Icon`, `IconName`, `PageHeader`/`FooterNote`/`cardStyle`, `useViewport`, `useCanViewMoney`, `isMoneySurface`. **None of them is a query.** No DB row and no LOCAL row reaches this page: it issues no request, so `src/lib/mock/corpus.ts` (which serves 13 tables and names its gaps in `UNSERVED`, `corpus.ts:22-44`) is never consulted from here — there is no table to call UNSERVED.

Invented on this page: there are no figures at all — the only invented strings are the six card labels/hints and two group headings in `ToolsLanding.tsx:63-110`, and the footer bar's three lines including the version `Babin Rentals OS v3.0.0` (`src/data/nav.ts:428-432`).

## 4. Actions and writes

**No dispatch. No write. No capability string.** The file imports nothing from `src/actions/` (`ToolsLanding.tsx:1-7`), and a search of the file for `onClick` returns nothing, so `src/actions/core.ts`'s `createAction`/`checkCapability` (`core.ts:124-218`, `:220-254`) is never reached from this page.

Every interactive element is a react-router `<Link>` whose `to` is a mounted route:

| control | file:line | destination | route mounted at |
|---|---|---|---|
| Depreciation tile | `ToolsLanding.tsx:68-76` → `:198` | `/tools/depreciation` | `src/App.tsx:633-640` (`DepreciationCalculator`, `App.tsx:69`) |
| Pricing tile | `ToolsLanding.tsx:77-83` → `:198` | `/tools/pricing` | `src/App.tsx:642-649` (`PricingCalculator`, `App.tsx:70`) |
| Camera & lens tools tile | `ToolsLanding.tsx:100-107` → `:198` | `/tools/cinematography` | `src/App.tsx:693-700` (`CineTools` = `src/modules/settings/Tools.tsx`, `App.tsx:73`) |

Buttons with no handler: **none — the page renders no `<button>`.** The one dead path is the `Not built yet` badge branch (`ToolsLanding.tsx:230-248`), which no card can trigger — see §7.

## 5. Gates

**Route reach.** `/tools` sits inside `Shell` (`App.tsx:624-631`). `Shell` holds during session restore (`App.tsx:964-970`), redirects to `/login` with no session (`:973-975`), then computes `isForbidden = !canViewMoney(user.role) && isMoneySurface(pathname)` (`:993`). `/tools` is **not** in `MONEY_ROUTES` — the list is `/finance`, `/reports`, `/admin`, `/tools/pricing`, `/tools/depreciation` (`src/data/nav.ts:147-153`) and `isMoneySurface` matches only `path === r || path.startsWith(r + '/')` (`nav.ts:156-159`). So **all nine roles in `SystemRole` reach `/tools`**, and `permittedNav()` keeps the Tools nav item for every role for the same reason (`nav.ts:110-116`).

**Money visibility.** `useCanViewMoney()` (`src/lib/moneyVisibility.ts:24-27`) returns `canViewMoney(user.role)` (`src/lib/rbac.ts:36-38`), false for the `MONEY_BLIND` set — **Warehouse, Technician, Driver, Client** (`rbac.ts:45-50`).

**What Law 6 hides here.** `visibleGroups(money)` (`ToolsLanding.tsx:130-135`) returns `GROUPS` untouched when money is visible; otherwise it drops every card whose `to` satisfies `isMoneySurface`, then drops any group left with zero cards. For the four money-blind roles that removes **Depreciation** and **Pricing** (both listed in `MONEY_ROUTES`), which empties and therefore deletes the whole **Calculators** group — cards are absent, not disabled. What remains is the header, the **Cinematography suite** group with its single card (`/tools/cinematography` is not a money route), and the footer. The header description also switches to `Administration utilities` (`:151`), which is now wrong — §7.

Typed-URL backstop: a money-blind role that types `/tools/pricing` or `/tools/depreciation` hits `isForbidden` at `App.tsx:993` and gets `RestrictedState` (`App.tsx:1020-1023`), so the nav omission and the guard agree.

## 6. States drawn

**None in this file.** `ToolsLanding.tsx` imports neither `PageBody` (`src/components/ui/PageBody.tsx:119-207`) nor `StateViews` (`src/components/ui/StateViews.tsx` — `EmptyState:34`, `LoadingSkeleton:87`, `ErrorBanner:171`, `RestrictedState:213`), and renders no state branch of its own. It has no query, so there is nothing to be loading, failed or empty.

What the reader still sees comes from `Shell`, not the page:

- **Loading** — the lazy chunk's `Suspense` fallback `<LoadingSkeleton type="card" label="Loading…" />` (`App.tsx:1026`).
- **Error** — `<ErrorBoundary>` wrapping the route (`App.tsx:1025`, component at `src/components/shell/ErrorBoundary.tsx`).
- **Restricted** — `RestrictedState` at `App.tsx:1020-1023`, which **never fires on `/tools`** because `/tools` is not a money surface (`nav.ts:147-153`).
- **Empty** — none anywhere. If every group were filtered out at `ToolsLanding.tsx:132-134` the page would render a header and a footer with nothing between them. That is unreachable today: the Cinematography group is not money-gated, so it always survives.

## 7. Known gaps

1. **The money-blind description is false.** `ToolsLanding.tsx:150-152` tells a Warehouse/Technician/Driver/Client user the page is `Administration utilities`, but the Admin group was deleted (`:86-95`) and the only thing left for those roles is the cinematography suite (`:96-108`, filtered at `:130-135`). The comment above the description (`:147-149`) states the exact intent this line now violates — "names only what this role can actually open".
2. **The file's own header contradicts the file.** `:9-44` reads "Six cards. Calculators + Admin", "CALCULATORS: Depreciation · Pricing (2-up) / ADMIN: Audit Log · Activity Log · Numbering (3-up) · Backup & Restore", and "Four of the six cards open screens that already exist under `modules/admin/`". Three cards exist (`:63-110`) and no group is 3-up.
3. **The Law 6 comment describes a gate that no longer has a subject.** `:112-129` argues at length about not hiding "the four admin cards" from the floor and about an "emptied group" dropping out; the admin cards were removed at `:86-95`. The mechanism (`:130-135`) is live, the reasoning is stale.
4. **Dead `unbuilt` flag and unreachable badge.** The `unbuilt?: boolean` field (`:51-52`) is set by no card in `GROUPS` (`:63-110`), so the `Not built yet` badge branch (`:230-248`) cannot render.
5. **The 1180 band is read but inert on this page.** `:178-180` branches tablet vs desktop, yet both groups declare `desktopColumns: 2` (`:66`, `:98`) and the tablet cap is also 2, so the two bands compute identical column counts. Only the 768 phone band changes anything.
6. **Contradiction with where the admin screens went.** `:115-118` justifies keeping Tools unrestricted partly because "Audit Log is 'view-only for every role including Owner'". Those four screens now live under `/admin/*` (`App.tsx:651-685`, with `/tools/audit-log` etc. redirecting there at `App.tsx:132-135`), and `/admin` **is** in `MONEY_ROUTES` (`nav.ts:147-153`). So `isMoneySurface('/admin/audit-log')` is true and the Shell guard (`App.tsx:993`) now serves `RestrictedState` to Warehouse, Technician, Driver and Client for exactly the screens this comment says are open to every role.
7. **No open `TODO(decision)` in this file.** The only occurrence (`:31`) records a decision already closed.
