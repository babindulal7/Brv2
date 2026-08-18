# Import Clients
Route `/clients/import` · `src/modules/clients/ImportCenter.tsx` · 476 lines

Status: **Partial**

---

## 1. What it is

A single-column CSV intake screen mounted at `/clients/import` (`src/App.tsx:546-553`, lazily imported at `src/App.tsx:79`). It reads an uploaded file, guesses a column mapping, validates every row and shows a per-row verdict — parsing (`src/lib/csv.ts:29-151`), mapping and validation (`src/lib/clientImport.ts:59-191`) are all real code driven by the operator's own file.

It writes nothing. The commit control is a disabled button with no `onClick` (`ImportCenter.tsx:451-455`), and the file's own header states why: nothing under `src/actions/clients/` creates clients from a file (directory holds `blockClient.ts`, `createClient.ts`, `mergeClients.ts`, `updateClient.ts` only) — `ImportCenter.tsx:39-48`.

---

## 2. What renders

### Desktop, top to bottom

| # | Thing | Where |
|---|---|---|
| 1 | `PageHeader` — icon `upload`, title "Import Clients", description ending "Committing the import is not connected yet — nothing here creates a client", one action button **Back to Clients** → `navigate('/clients')` | `ImportCenter.tsx:184-193`; component `src/components/ui/Page.tsx:66-108` |
| 2 | **Upload card** — only while `rawRows.length === 0` | `ImportCenter.tsx:195-268` |
| 2a | Dashed drop zone, `role="button" tabIndex={0}`, drag-over tint, click opens the hidden file input | `ImportCenter.tsx:197-228` |
| 2b | Hidden `<input type="file" accept=".csv,text/csv">`, `display:none`; resets `e.target.value` after each pick | `ImportCenter.tsx:229-239` |
| 2c | Inline parse-error line (red, `error` icon), rendered only when `parseError` is set | `ImportCenter.tsx:240-245` |
| 2d | Text button **Download a sample CSV** → `downloadSampleCsv()` (Blob + `a.download`, client-side, no network) | `ImportCenter.tsx:246-266`, `:70-79` |
| 3 | **File + mapping card** — only while `rawRows.length > 0` | `ImportCenter.tsx:270-336` |
| 3a | File name, `file` icon, "· N data row(s)" | `ImportCenter.tsx:274-278` |
| 3b | Checkbox "First row is headers" (`hasHeaderRow`) | `ImportCenter.tsx:280-288` |
| 3c | Button **Choose Different File** → `reset()` | `ImportCenter.tsx:289-291`, `:165-171` |
| 3d | `<h2>` "Map Columns" + 3-column table (CSV Column · Sample Value · Maps To), one `<Select>` per column over `IMPORT_TARGET_FIELDS` | `ImportCenter.tsx:296-327`; options `src/lib/clientImport.ts:33-46` |
| 3e | Inline red gate line "Map at least one column to Client / Company Name and one to Phone to see the preview" while `!readyToPreview` | `ImportCenter.tsx:329-334`, predicate `:102-104` |
| 4 | **KPI strip**, 4 cards — Ready to Import · Errors · Possible Duplicates · Total Rows | `ImportCenter.tsx:340`, values `:173-180`; component `Page.tsx:203-304` |
| 5 | **Card "Preview & Validate"** — scrolling table (`maxHeight: 420`), columns: skip-checkbox · Row · Name · Phone · Type · Status | `ImportCenter.tsx:342-421` |
| 5a | Status cell precedence: errors → possible duplicate (with a `<Link>` to `/clients/{id}`) → warnings → green "Ready" | `ImportCenter.tsx:382-413` |
| 6 | **Commit bar** — persistent red paragraph stating the gap and the ready-row count, plus an `Unavailable`-wrapped **disabled** primary button "Import N Clients" | `ImportCenter.tsx:428-456`; `src/components/ui/Unavailable.tsx:35-164` |
| 7 | `FooterNote` with the extra line "Import is validation-only — no client-import action exists yet, so no client can be created from this screen" | `ImportCenter.tsx:462`; component `Page.tsx:443-469` |

Sections 4–6 render only when `readyToPreview` is true (`ImportCenter.tsx:338`), i.e. some column is mapped to `name` **and** some column to `phone`.

### Responsive bands

**`ImportCenter.tsx` reads neither 768 nor 1180.** Its import list (`ImportCenter.tsx:1-19`) contains nothing from `src/lib/device.ts` — no `useViewport`, no `useCapability`, no `useTabularLayout`. The page has no width branch of its own.

Two bands reach it only through children:

- `KpiStrip` calls `useViewport()` and clamps its grid to 2 columns below 768 and 3 below 1180 (`Page.tsx:210-212`; thresholds `src/lib/device.ts:43-51`). With 4 KPIs this is the only layout that changes with width on the whole page.
- `Unavailable` calls `useCapability()` (`Unavailable.tsx:44`) and swaps the `title` tooltip for a 500 ms long-press popover when `(hover: hover)` fails (`Unavailable.tsx:70-77`, `:111`; media query at `device.ts:98`). That is a pointer-capability branch, not a width band.

Everything else is fixed-width. Both tables are wrapped in `overflow-x: auto` with hard minimums — `minWidth: 560` for the mapping table (`ImportCenter.tsx:297-298`) and `minWidth: 760` for the preview table (`ImportCenter.tsx:343-344`) — so on a phone they become horizontal scrollers rather than reflowing. `device.ts:139-141` (`useTabularLayout`) exists for exactly that case and this file does not call it.

---

## 3. Data sources

| Screen area | Source kind | Detail |
|---|---|---|
| Headers, data rows, "Sample Value" column, and every Name / Phone / Type cell in the preview | *(none of the three)* — the operator's uploaded file | `File.text()` → `parseCsv` (`ImportCenter.tsx:129-132`; `src/lib/csv.ts:29-151`), held in component state `rawRows` (`ImportCenter.tsx:86`). Never persisted, never sent anywhere. |
| "Possible duplicate of …" and the **Possible Duplicates** KPI | **SEED** | `CLIENTS_DATA` — a hand-written 26-record array (`src/data/clients.ts:171`, ids `C-1`…`C-26`), passed in at `ImportCenter.tsx:117` and matched on phone/email at `src/lib/clientImport.ts:162-167` via `normalizedPhone` (`src/data/clients.ts:1358-1360`). |
| "Maps To" dropdown options | **SEED** | `IMPORT_TARGET_FIELDS`, a constant array of 12 entries (`src/lib/clientImport.ts:33-46`). |
| Downloaded sample CSV contents | **SEED** | `IMPORT_SAMPLE_HEADERS` / `IMPORT_SAMPLE_ROW` (`src/lib/clientImport.ts:193-215`), joined in `downloadSampleCsv` (`ImportCenter.tsx:70-79`). |
| Membership-tier vocabulary used to normalise the Membership column | **SEED** | `MEMBERSHIP_TIERS` (`src/data/clients.ts:48-54`), read at `src/lib/clientImport.ts:157`. |
| Client-type vocabulary | **SEED** | `KNOWN_CLIENT_TYPES` (`src/lib/clientImport.ts:48-52`). |
| Phone validation + canonical stored form | *(rule, not data)* | `src/lib/phone.ts:41-70`, which mirrors the `clients_phone_format` CHECK in `supabase/migrations/0005_clients.sql` per `src/lib/phone.ts:4-12`. |
| Ready / Errors / Total Rows KPI values | *(derived)* | Computed from the parsed file at `ImportCenter.tsx:121-123`, `:173-180`. |
| Footer note strip | **SEED** | `FOOTER_NOTE` constants including the version string (`src/data/nav.ts:428-432`). |

**DB: none.** The file imports neither `lib/supabase` nor anything under `src/lib/queries/` (`ImportCenter.tsx:1-19`). No table, view or RPC is read or written by this page.

**LOCAL: none.** `src/lib/mock/corpus.ts` does serve `clients` (`corpus.ts:412`) and synthesises `client_directory_v` (`corpus.ts:444-500`), so the table is **not** unserved — this page simply never reads it.

Invented on this page: the 26 client records the duplicate check is run against (names, phones, emails, PANs at `src/data/clients.ts:171-994`), the nine values inside the downloadable sample CSV (`src/lib/clientImport.ts:205-215`), and the footer's version string "Babin Rentals OS v3.0.0" (`src/data/nav.ts:431`) — every count in the KPI strip and every cell in the preview table comes from the operator's own file, not from a fixture.

---

## 4. Actions and writes

**No dispatch of any kind.** `ImportCenter.tsx` imports nothing from `src/actions/` (`ImportCenter.tsx:1-19`); there is no `createAction` call, no `ActionContext`, no capability string on this page. Consequently `checkCapability` (`src/actions/core.ts:124-218`) is never consulted here, and there is no action whose `implemented` flag could be true or false.

Every interactive control and what it actually does:

| Control | Handler | What it does |
|---|---|---|
| **Back to Clients** button | `ImportCenter.tsx:189` | `navigate('/clients')`. Client-side route change only. |
| Drop zone (click / drag-drop) | `ImportCenter.tsx:198-209` | Opens the hidden file input, or reads the dropped file via `handleFile`. |
| Hidden file input | `ImportCenter.tsx:233-237` | `handleFile(file)` → `parseCsv` → local state. No upload. |
| **Download a sample CSV** | `ImportCenter.tsx:248`, `:70-79` | Builds a Blob in the browser and clicks a synthetic `<a download>`. No network. |
| "First row is headers" checkbox | `ImportCenter.tsx:281-287` | `setHasHeaderRow` — local state only. |
| Per-column "Maps To" `<Select>` | `ImportCenter.tsx:312-316` | `setMapping` — local state only. |
| Per-row skip checkbox | `ImportCenter.tsx:361-373` | Adds/removes `rowIndex` in `skippedRows` — local state only. |
| **Choose Different File** | `ImportCenter.tsx:289` | `reset()` (`:165-171`) — clears all local state. |
| Duplicate `<Link>` "Name (C-n)" | `ImportCenter.tsx:395-397` | Navigates to `/clients/{id}` (`src/App.tsx:576-583`). |
| **Import N Clients** (primary) | — | **Has no handler at all.** Rendered `disabled` (`ImportCenter.tsx:452`) inside `<Unavailable reason={…}>` (`:451`, reason text `:56-57`). It does not dispatch anything, stubbed or otherwise. |

Buttons with no handler: exactly one — the Import button above (`ImportCenter.tsx:452-454`).

For completeness, since the file's header discusses it (`ImportCenter.tsx:39-42`): the capability an equivalent write would carry, `client.create`, **is** mapped in the switch (`src/actions/core.ts:162-163` → `rbac.canCreateClient`, `src/lib/rbac.ts:145-147`, role set `BOOKING_DESK` at `rbac.ts:71-77`), and `createClient` is `implemented: true` (`src/actions/clients/createClient.ts:274`). So the missing piece here is a file-level import action, not a permission ruling.

---

## 5. Gates

**Route reach.** `/clients/import` is mounted inside `Shell` (`src/App.tsx:546-553`). `Shell` holds a "Restoring session…" screen while auth resolves (`App.tsx:964-970`) and redirects to `/login` when there is no user (`App.tsx:973-975`). That is the only gate that applies.

**Law 6 route guard does not fire here.** `isForbidden = !canViewMoney(user.role) && isMoneySurface(pathname)` (`App.tsx:993`), and `MONEY_ROUTES` is `/finance`, `/reports`, `/admin`, `/tools/pricing`, `/tools/depreciation` (`src/data/nav.ts:147-153`, matcher `:156-159`). `/clients` is not in that list, so the page is **not** a money surface: all nine roles in `SystemRole` reach it once signed in — including the four money-blind ones (`Warehouse`, `Technician`, `Driver`, `Client` — `src/lib/rbac.ts:45-50`) and the external `Client` role (`rbac.ts:53-55`).

**Money visibility.** The page never calls `useCanViewMoney` (`src/lib/moneyVisibility.ts:24-27`) — it is not imported (`ImportCenter.tsx:1-19`) — and it renders no money at all: no `formatMoney`, no `Paisa`, no rupee figure anywhere in the file. Nothing is hidden under Law 6 on this page because there is nothing money-shaped on it.

**In-page role checks: none.** `useAuth` is not imported (`ImportCenter.tsx:1-19`). Every control above is identically available to every signed-in role.

One consequence worth stating plainly: because the duplicate matcher runs over the seed array, any signed-in role — including the money-blind floor roles and the external `Client` role — can surface a seed client's name and id in the preview by uploading a file whose phone or email matches one (`ImportCenter.tsx:391-398`, matcher `src/lib/clientImport.ts:162-167`).

---

## 6. States drawn

| State | Present? | How |
|---|---|---|
| Loading | **No.** | `PageBody` and `StateViews` are not imported (`ImportCenter.tsx:1-19`). File reading is async (`ImportCenter.tsx:129-131`) with no pending indicator — between dropping a file and the mapping table appearing, nothing on screen changes. The only loading affordance is the route-level `Suspense` fallback for the lazy chunk (`App.tsx:1026`, `LoadingSkeleton` from `src/components/ui/StateViews.tsx:87`), which is gone before the component renders. |
| Error | **Yes — hand-rolled, three places.** | Parse failure line (`ImportCenter.tsx:240-245`), fed by `parseCsv`'s error strings (`csv.ts:113-148`) or `'That file has no rows.'` (`ImportCenter.tsx:150`) or the read-failure catch (`:162`); the unmapped-columns gate line (`:329-334`); and the persistent commit-bar paragraph (`:428-450`). All inline and persistent, none using `ErrorBanner` (`StateViews.tsx:171`). |
| Empty | **Yes — hand-rolled.** | The upload drop zone *is* the zero state, shown whenever `rawRows.length === 0` (`ImportCenter.tsx:195-268`). `EmptyState` (`StateViews.tsx:34`) is not used. There is no separate "0 rows after mapping" state — a header-only file is caught earlier as an error. |
| Restricted | **No.** | `RestrictedState` (`StateViews.tsx:213`) appears only in the shell guard (`App.tsx:1020-1023`), which cannot trigger for this route (see §5). |

Neither `PageBody.tsx` nor any of the four `StateViews` components is used by this file.

---

## 7. Known gaps

1. **No `TODO(decision)` markers** in `ImportCenter.tsx`, `src/lib/clientImport.ts` or `src/lib/csv.ts` (grepped, zero hits).
2. **The commit does not exist.** The Import button is disabled and carries no handler (`ImportCenter.tsx:451-455`); there is no import action under `src/actions/clients/` (dir: `blockClient.ts`, `createClient.ts`, `mergeClients.ts`, `updateClient.ts`). The page states this in three places (`:187`, `:443-449`, `:462`) rather than faking a write.
3. **Duplicate matching runs against seed data, not the client table.** `CLIENTS_DATA` (26 invented records) is the corpus (`ImportCenter.tsx:117`; `src/data/clients.ts:171`), while the Clients directory reads `client_directory_v` through `useClients` (`src/modules/clients/Clients.tsx:62`; `src/lib/queries/clients.ts`). A CSV row duplicating a *real* client is reported "Ready"; a row matching a fixture that has no live counterpart is flagged. Same contradiction exists on `src/modules/clients/DuplicateCenter.tsx:195`, which also seeds from `CLIENTS_DATA`.
4. **The app's own sample CSV fails the app's own validation.** `IMPORT_SAMPLE_ROW`'s client-type cell is `'Company'` (`src/lib/clientImport.ts:210`), but `KNOWN_CLIENT_TYPES` is `Organisation | Individual | Unassigned` (`src/lib/clientImport.ts:48-52`). Download the sample and re-upload it and the one row comes back with the warning `Client Type "Company" not recognized — defaulted to Organisation.` (`src/lib/clientImport.ts:151`).
5. **Ragged files are refused outright, contradicting the parser's stated intent.** `csv.ts:129-134` calls a mismatched column count "Reported, not fatal", but it is pushed onto `errors`, so `ok` is false (`csv.ts:150`) and `ImportCenter.tsx:145-148` rejects the file before mapping. The comment and the behaviour disagree.
6. **Toggling "First row is headers" leaves stale skip marks.** The toggle only calls `setHasHeaderRow` (`ImportCenter.tsx:281-287`), which shifts every `rowIndex` by one (`:99`, `:108`), but `skippedRows` (`:91`) is keyed by index and is cleared only in `handleFile` (`:128`) and `reset` (`:170`). Un-ticking a row, then toggling the checkbox, silently excludes a different row.
7. **Two columns mapped to the same field: the later column wins silently.** `row.forEach` overwrites `raw[target]` (`ImportCenter.tsx:113-116`), and `mappedFields` is a `Set` (`:101`), so the "ready" gate still passes and nothing warns.
8. **The drop zone is not keyboard-operable.** It carries `role="button"` and `tabIndex={0}` but only an `onClick` — no `onKeyDown` (`ImportCenter.tsx:197-228`) — and the real file input is `display: none` (`:238`). A keyboard-only user can focus the zone and cannot open the picker.
9. **Warnings on a duplicate row are never shown.** The status cell's ladder puts `duplicateOf` ahead of `warnings` (`ImportCenter.tsx:391-407`), so a row that is both a possible duplicate and carries e.g. an unrecognised membership tier displays only the duplicate line.
10. **`ImportRowResult.skip` is dead.** Declared at `src/lib/clientImport.ts:108`, always returned `false` (`:190`), and never read by the page, which tracks skipping in its own `skippedRows` set (`ImportCenter.tsx:91`).
11. **Stale comment in the engine.** `src/lib/clientImport.ts:6-8` says the page "simulates the commit step exactly the way every other 'New X' screen in this app already does" — it no longer does; the simulated commit was removed (`ImportCenter.tsx:28-48`).
12. **Stale comment in `Select`.** `src/components/ui/Select.tsx:9-10` states the component "has zero live JSX call sites today"; `ImportCenter.tsx:312` is a live call site.
13. **No progress or cancel for large files.** `file.text()` resolves in one shot (`ImportCenter.tsx:129-131`) and `results` recomputes every mapped row on each mapping change (`:106-119`), with no row cap — the 340-row scenario the header describes (`:33-38`) is fine, but nothing bounds it.
