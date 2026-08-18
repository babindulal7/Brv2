# Duplicate & Merge Center
Route `/clients/duplicates` · `src/modules/clients/DuplicateCenter.tsx` · 420 lines

## 1. What it is
A triage screen that groups client records looking like the same real-world entity and offers to merge each group into one survivor (`DuplicateCenter.tsx:188-420`). The detector is real code — `findDuplicateGroups` re-derives on every render (`DuplicateCenter.tsx:209`; `src/data/clients.ts:1393-1450`) — but it runs over the `CLIENTS_DATA` seed array, not the database (`DuplicateCenter.tsx:195`, `src/data/clients.ts:171-973`). The single write dispatches `MERGE_CLIENTS`, whose action carries no `implemented` flag, so the dispatcher refuses it before `execute` (`src/actions/clients/mergeClients.ts:9-37`; `src/actions/core.ts:222-225`).

## 2. What renders
Top to bottom at desktop:

1. **`PageHeader`** — `users` icon, title, description reading `Checked N clients for matching phone, email, PAN, or name.` plus `N merged this session.` when `mergedCount` is non-zero, and one action button `Back to Clients` → `navigate('/clients')` (`DuplicateCenter.tsx:318-327`; counts at `:211-212`).
2. **Inline "Merging… nothing has changed yet."** — a `timer` icon + line, rendered only while `merging` (`DuplicateCenter.tsx:332-337`).
3. **Inline merge-failure line** — `role="alert"`, `error` icon, `var(--danger-text)`, persistent (no timer), holding either the "Not merged —" or "Partially merged —" sentence (`DuplicateCenter.tsx:338-355`; text built at `:304-313`).
4. **Either** the empty state (`DuplicateCenter.tsx:357-361`) **or** a vertical stack of one `GroupCard` per detected group (`:363-372`).
   `GroupCard` (`DuplicateCenter.tsx:103-186`) is a `Card` whose title is `Possible duplicate · matched on <Phone, Email, PAN, Name>` (`:117`), whose header action is a permanently disabled `Not a Duplicate` button wrapped in `Unavailable` (`:119-124`), and whose body is:
   - a grid of one selectable panel per candidate, `gridTemplateColumns: repeat(N, minmax(230px, 1fr))` with `overflowX: 'auto'` (`:126-133`), each panel a `<label>` with a radio and `SummaryRows` of ID · Phone · Email · PAN · Type · Total Rentals, plus **Lifetime Spend only when `money` is true** (`:134-171`, money row at `:166`);
   - a grey paragraph explaining that the selected record survives and the others are marked merged, not deleted (`:174-177`);
   - a primary `Merge into selected` button (`:179-183`).
5. **`FooterNote`** with the extra string `Merging closes a record — Law 3: nothing is deleted, every entity has a named terminal action` (`DuplicateCenter.tsx:375`; component at `src/components/ui/Page.tsx:443-469`).
6. **Confirm `Modal`**, mounted whenever `pendingMerge` is set (`DuplicateCenter.tsx:377-417`): title `Merge these clients?`, a subtitle stating records are merged one at a time, a body listing the survivor and each record that would be marked merged (`:399-416`), and a footer of `Cancel` + a `danger` `Confirm Merge` disabled while `merging` (`:383-396`).

**Responsive: this file reads neither 768 nor 1180.** There is no `useViewport`, no `useCapability`, no `matchMedia` and no `@media` anywhere in `DuplicateCenter.tsx` — the only breakpoint constant in the codebase is `BREAKPOINT = { phone: 768, desktop: 1180 }` (`src/lib/device.ts:43`) and this file never imports `lib/device`. What actually changes with width does so in components it renders through, not in this page:

- `Shell` drops the `Sidebar` and mounts `BottomBar` below 768 (`src/App.tsx:957-958`, `:1004`, `:1033`).
- `Modal` goes full-screen (`maxWidth: '100%'`, `height: 100dvh`, radius 0) below 768, and is capped at its `md` token of 520px otherwise since this call site passes no `sheet` (`src/components/ui/Modal.tsx:95-100`, `:33-39`).
- `Unavailable` swaps the `title` tooltip for a 500 ms long-press popover when `hasHover` is false — a **capability** branch (`pointer`/`hover`), not a width branch (`src/components/ui/Unavailable.tsx:44`, `:70-77`, `:111`).

The candidate grid itself is unconditioned: three candidates demand 690px+ of track and simply scroll horizontally at any narrower width (`DuplicateCenter.tsx:126-133`) — the shape `src/lib/device.ts:9-14` names as the failure the module was written to prevent.

## 3. Data sources

| Screen area | Source kind | Detail |
| --- | --- | --- |
| Header counts (`Checked N` / `N merged this session`) | SEED | Derived from the `clients` state, seeded once from `CLIENTS_DATA` (`DuplicateCenter.tsx:195`, `:211-212`); array literal `src/data/clients.ts:171-973`, 26 records `C-1`…`C-26`. |
| Duplicate groups (cards, match reasons, grouping) | SEED | `findDuplicateGroups(clients)` (`DuplicateCenter.tsx:209`) → `src/data/clients.ts:1393-1450`, union-find over `matchReasons` (`:1366-1379`) run against the same seed array. |
| Candidate panel rows — ID, Phone, Email, PAN, Type, Total Rentals | SEED | Fields read straight off each `ClientRecord` (`DuplicateCenter.tsx:158-165`); values are literals, e.g. `C-1` at `src/data/clients.ts:172-211`. |
| Lifetime Spend | SEED | `formatMoney(c.totalSpentPaisa)` (`DuplicateCenter.tsx:166`; formatter `src/lib/money.ts:62-69`); the figures are `rupees(...)` literals, e.g. `rupees(4850000)` at `src/data/clients.ts:202`. |
| Post-merge survivor totals (rentals, spend, deposits, bookings) | SEED | Computed locally by `mergeInto` from the same seed records (`DuplicateCenter.tsx:86-101`); never persisted. |
| Merge write | DB *(target only, nothing reaches it)* | `client_merges` exists in `supabase/migrations/0005_clients.sql:284-308`, and `mergeClients` declares permission `client.merge` (`src/actions/clients/mergeClients.ts:11`), but `execute` only `console.log`s (`:18`) — there is no query file and no `lib/dataAccess` call on this path. |
| LOCAL corpus | — | Not used. `src/lib/mock/corpus.ts:127-153` and `:412` do serve a `clients` table, but this page imports nothing from `lib/queries` and never reaches the mock engine. `client_merges` is absent from the corpus store (`corpus.ts:405-423`) and absent from its `UNSERVED` list (`corpus.ts:33-44`) — it is simply not modelled there. |

Invented on this page: every figure — the 26 client records themselves, their phones, emails, PANs and names (the inputs the detector matches on), their Total Rentals counts, and the Lifetime Spend rupee amounts — all come from the constant array `src/data/clients.ts:171-973`.

## 4. Actions and writes

| Control | file:line | Dispatch | Capability | `implemented` | Mapped in `checkCapability`? |
| --- | --- | --- | --- | --- | --- |
| `Confirm Merge` (modal footer) | `DuplicateCenter.tsx:387-395` → `confirmMerge` `:226-314` → dynamic import `:251` | `mergeClients` / `MERGE_CLIENTS`, once per non-survivor record, sequentially (`:266-277`) | `client.merge` (`src/actions/clients/mergeClients.ts:11`) | **false** — the config sets no `implemented` key at all (`mergeClients.ts:9-37`), and `src/actions/core.ts:223` treats anything but `true` as a stub | **Yes** — `case 'client.merge': return rbac.canMergeClients(ctx.role)` (`src/actions/core.ts:208-209`), i.e. Owner/Admin/Manager (`src/lib/rbac.ts:99`, `:239-241`) |

So: **renders, dispatches `MERGE_CLIENTS`, action is a stub (`core.ts:223` fails it closed)**. The permission gate is never reached, because the `implemented` check runs first (`core.ts:222-225`) and throws `ActionNotImplementedError` (`core.ts:95-105`). Every Confirm Merge therefore ends on the inline "Not merged — …" line (`DuplicateCenter.tsx:304-306`), for every role including Owner.

Controls that dispatch nothing:

- `Merge into selected` — sets `pendingMerge` and opens the modal only (`DuplicateCenter.tsx:180-182`, `:369`).
- Survivor radio buttons — local `survivorId` state (`DuplicateCenter.tsx:149-155`, `:113`).
- `Back to Clients` — `navigate('/clients')` (`DuplicateCenter.tsx:323-325`).
- `Cancel` and the modal's close ✕ / overlay tap — `setPendingMerge(null)` (`DuplicateCenter.tsx:379`, `:384-386`; `src/components/ui/Modal.tsx:122`, `:186-188`).

Button with no handler at all:

- **`Not a Duplicate`** — `<Button variant="ghost" disabled>` with no `onClick`, wrapped in `Unavailable` carrying the reason "Not built yet — dismissing a match has to be stored against the pair or the detector raises it again on the next load, and no dismiss action exists" (`DuplicateCenter.tsx:119-124`, reason at `:76-77`). There is no dismiss/not-duplicate action anywhere under `src/actions/`.

## 5. Gates

**Route reach.** `/clients/duplicates` mounts inside `Shell` with no role guard of its own (`src/App.tsx:555-562`). `Shell` holds during auth restore (`App.tsx:964-970`), redirects to `/login` when there is no `user` (`:973-975`), and renders `RestrictedState` only when `!canViewMoney(user.role) && isMoneySurface(pathname)` (`:993`, `:1020-1023`). `MONEY_ROUTES` is `/finance`, `/reports`, `/admin`, `/tools/pricing`, `/tools/depreciation` (`src/data/nav.ts:147-153`) — `/clients/duplicates` is not among them. **Every signed-in role reaches this route**, including the four money-blind roles (Warehouse, Technician, Driver, Client — `src/lib/rbac.ts:45-50`) and the external `Client` role that `src/lib/rbac.ts:52-55` says should guard every staff surface.

**Money visibility.** `const money = useCanViewMoney()` (`DuplicateCenter.tsx:190`) → `src/lib/moneyVisibility.ts:24-27` → `canViewMoney(role)` (`src/lib/rbac.ts:36-38`), false for Warehouse/Technician/Driver/Client and false for no session at all.

**Hidden under Law 6:** exactly one row — `Lifetime Spend` is omitted from `SummaryRows` rather than masked (`DuplicateCenter.tsx:166`). Nothing else on the page is money-shaped, so a money-blind role sees the full card otherwise: name, client ID, phone, email, PAN, type and total rentals for every candidate. `mergeInto` still sums `totalSpentPaisa`, `outstandingPaisa` and `depositHeldPaisa` for all roles (`DuplicateCenter.tsx:94-98`), but those results are never rendered.

**Dispatch identity.** `dispatchContext()` returns `null` when there is no `user`, and passes `isOnline` explicitly rather than letting `ActionContext` default to online (`DuplicateCenter.tsx:221-224`; `src/actions/core.ts:74-79`). A null context short-circuits before any dispatch and writes its own inline reason (`DuplicateCenter.tsx:233-241`).

## 6. States drawn

| State | Present? | How |
| --- | --- | --- |
| Loading | **Not on the page.** Route-level only: `Suspense fallback={<LoadingSkeleton type="card" label="Loading…" />}` in `Shell` (`src/App.tsx:1026`). The page's own in-flight feedback is a hand-rolled line, "Merging… nothing has changed yet." (`DuplicateCenter.tsx:332-337`). |
| Error | **Hand-rolled.** A `role="alert"` paragraph in danger text, persistent, never a toast (`DuplicateCenter.tsx:338-355`). `ErrorBanner` / `PageBody` are not imported. Route-level `ErrorBoundary` wraps the page (`src/App.tsx:1025`). |
| Empty | **Yes, shared.** `EmptyState` — "No duplicates found" / "Every one of the N active client records has a distinct phone, email, PAN and name." (`DuplicateCenter.tsx:357-361`; component `src/components/ui/StateViews.tsx:34-84`). Against the shipped seed this is the state the page always shows — no pair of the 26 records matches on phone, email, PAN or name. |
| Restricted | **None.** `RestrictedState` is not imported here, and `Shell`'s copy cannot fire on this route because it is not a money surface (`src/App.tsx:993`; `src/data/nav.ts:147-153`). |

`src/components/ui/PageBody.tsx` is not used by this page.

## 7. Known gaps

1. **No `TODO(decision)` marker in the file** (grep for `TODO`/`FIXME` in `DuplicateCenter.tsx` returns nothing). The open decision that governs it lives in the detector: no fuzzy/edit-distance matching until someone rules the tolerable false-positive rate (`src/data/clients.ts:1381-1386`).
2. **The merge cannot land, for any role.** `mergeClients` sets no `implemented` (`src/actions/clients/mergeClients.ts:9-37`) and `src/actions/core.ts:223` throws before validate/execute. `client.merge` *is* mapped (`core.ts:208-209`), so this is a build gap, not a permission gap — the failure text the operator reads comes from `ActionNotImplementedError` (`core.ts:98-101`) via `DuplicateCenter.tsx:304-306`.
3. **Even if flipped to implemented, nothing would persist.** `execute` only `console.log`s `[DB TX] Merged client duplicate … into survivor …` and returns `{ success: true }` (`src/actions/clients/mergeClients.ts:17-36`) — no `lib/dataAccess` call, no `client_merges` insert.
4. **The action's input cannot satisfy the table it names.** `client_merges` requires `typed_confirmation` non-empty and not `"yes"`, `moved_summary jsonb not null`, and a `client_uuid` idempotency key (`supabase/migrations/0005_clients.sql:286-307`). `MergeClientsInput` is `{ survivorId, duplicateId }` only (`src/actions/clients/mergeClients.ts:4-7`) and the confirm modal collects no typed confirmation of any kind (`DuplicateCenter.tsx:377-417`).
5. **Dead control:** `Not a Duplicate` is disabled with no handler and no persistence path (`DuplicateCenter.tsx:119-124`, reason `:76-77`). Nothing under `src/actions/` implements dismissal, so a triaged false positive is re-raised on every render (`:209`).
6. **Contradiction with the Clients directory — this page does not read the database.** `Clients.tsx:62` calls `useClients()`, which reads `client_directory_v` (`src/lib/queries/clients.ts:347`), and its own comment states "The `CLIENTS_DATA` seed array this file used to import is gone from it entirely" (`Clients.tsx:56-61`). This page imports `CLIENTS_DATA` directly (`DuplicateCenter.tsx:14`, `:195`). So the detector never sees a client created, edited or imported through the app, and "Checked 26 clients" (`:321`) is a statement about `src/data/clients.ts`, not about the directory the operator arrived from (`Clients.tsx:157-159`, `ClientDetail.tsx:501-503`).
7. **A merge that did land would only exist in component state.** The commit is `setClients(prev => …)` stamping `mergedIntoId`/`mergedAt` locally (`DuplicateCenter.tsx:283-293`); nothing writes it anywhere, so a reload restores the records — precisely the failure the file's own header describes for dismissals (`:58-75`). Unreachable today only because `landed.length` is always 0.
8. **"N merged this session" in the header can never be non-zero** while the action is a stub (`DuplicateCenter.tsx:212`, `:321`).
9. **The empty-state sentence overstates what was checked.** It claims each record has "a distinct phone, email, PAN and name" (`DuplicateCenter.tsx:360`), but `matchReasons` skips the PAN limb entirely when the field is absent (`src/data/clients.ts:1374`) and `C-23` carries no `pan` at all (`src/data/clients.ts:862-889`) — a missing PAN is reported as a distinct one.
10. **No width awareness.** The candidate grid is `repeat(N, minmax(230px,1fr))` with `overflowX: auto` at every width (`DuplicateCenter.tsx:126-133`); a three-record group needs ~690px and horizontally scrolls below that. `src/lib/device.ts:9-14` names exactly this ("a horizontal scrollbar rather than a layout") as the condition the breakpoint module exists to remove.
11. **The external `Client` role reaches this screen.** The route carries no `isStaff` gate (`src/App.tsx:555-562`, `:973-993`) and is not a money surface (`src/data/nav.ts:147-153`), while `src/lib/rbac.ts:52-55` states "Client is external. Guard every staff surface with this." A `Client`-role session (the fallback identity for an authenticated user with no staff row — `src/lib/auth.tsx:117-130`) can read every seeded client's name, phone, email and PAN here.
12. **Minor doc/policy disagreement on who may merge.** `supabase/migrations/0005_clients.sql:316-317` comments `created_by` as "Owner or Manager only"; the live policy `client_merges_all` is Owner/Admin/Manager (`supabase/migrations/0038_client_money_masking_corrections.sql:152-156`) and `rbac.canMergeClients` mirrors the policy, not the comment (`src/lib/rbac.ts:99`, `:239-241`).
13. **`client_merges` is unmodelled in mock mode.** It is neither in the corpus store (`src/lib/mock/corpus.ts:405-423`) nor in `UNSERVED` (`:33-44`), so mock mode would not even flag it as missing. Moot while nothing queries it.
14. The file's header comments cite `PLAN.md §6.4`, `PROGRESS.md` and `SUCCESS_FABRICATION_REGISTER_2026-08-12.md` as the reasons for its current shape (`DuplicateCenter.tsx:17-18`, `:28-31`). Those documents were not read for this pack; only the code was.
