# Add Client
Route `/clients/new` · `src/modules/clients/AddClient.tsx` · 1118 lines

Status: **Partial**

---

## 1. What it is

A single-page client creation form mounted at `/clients/new` (`src/App.tsx:148-155`, lazily imported at `src/App.tsx:76`), reached from the Clients page's **New Client** button (`src/modules/clients/Clients.tsx:148`) and from the directory's empty-state (`Clients.tsx:222`).

It is a pure form — it runs no query on mount (no `useList`/`use…` query hook appears in its imports, `AddClient.tsx:1-38`). Everything it draws before Save is either local state (`:212-256`) or a constant array; the one write is `createClient` (`AddClient.tsx:408-433`), which is a real implemented insert into `clients`.

Roughly half of what the form collects is deliberately not written, and the page says so in a permanent box at the bottom (`NOT_SAVED_YET`, `AddClient.tsx:195-201`, rendered `:1078-1094`).

---

## 2. What renders

### Desktop, top to bottom

| # | Thing | Where |
|---|---|---|
| 1 | `PageHeader` "Add New Client" + description, with **Cancel** (ghost) and **Save Client** (primary). The primary label swaps to "Saving Client…" then "Client Saved" | `AddClient.tsx:556-569` |
| 2 | `ErrorBanner` "This client was not saved" — only when `saveError` is set | `:573` |
| 3 | `ErrorBanner` "Possible existing client" with **View Existing** and **Continue Anyway** — only when `duplicateMatch` is non-null | `:575-594` |
| 4 | Two-column grid: form column + right rail. Rail track exists only at desktop | `:596-603` |
| 5 | **① Basic Information** — Client Type (two toggle buttons, Organisation / Individual), Name (label swaps by type), then Organisation-only Contact Person + Designation, then Phone (fixed `🇳🇵 +977` prefix box) + Email | `:605-742`; type cards `:607-642`, name `:643-653`, contact `:656-678`, phone `:681-728`, email `:729-740` |
| 6 | **② Contact & Address** — Address, City, District (`Select`), Postal Code, Country (`Select`: Nepal/India/China/Other); then Organisation-only Business Reg. No. + Website **or** Individual-only Government ID (Citizenship/Passport + number), then VAT / PAN No. | `:744-827` |
| 7 | **③ Additional Information** — Organisation Type (Org only), Profession chips (Individual only), Segment chips, Client Since (`type="date"`), Source, Referred By, Membership Tier, Credit Limit *(money only)*, Payment Terms *(money only)*, Preferred Contact Method checkboxes, Notes textarea with a 300-char counter | `:829-978` |
| 8 | **Upload Documents (Optional)** card — Browse Files button, drag-and-drop zone, hidden `<input type="file" multiple>`, error line, and the staged file list with per-file Remove | `:980-1063` |
| 9 | Right rail (`Rail width={330}`): **Client Summary** card (empty placeholder until a name is typed, then avatar + `SummaryRows`), **Ready to Book?** checklist, **Help** `<details>` with the Client Type guide | `:469-552`, rendered `:1066-1069` |
| 10 | `FooterNote` (dates/timezone line from `src/data/nav.ts:428-432`) | `:1077` |
| 11 | "Not saved with this client yet" box — five bullets from `NOT_SAVED_YET` | `:1078-1094` |
| 12 | "Discard changes?" `Modal` — Keep Editing / Discard | `:1096-1115` |

Section chrome is local: `SectionCard` (numbered circle + title + body) at `:144-169`, `Field` (label, required star, error line **or** help line) at `:109-142`, and the field grid `fieldRow = repeat(auto-fit, minmax(210px, 1fr))` at `:171`.

### Responsive bands

The file reads `useViewport()` (`AddClient.tsx:14`, called `:207`), which is the 768 / 1180 hook — `BREAKPOINT = { phone: 768, desktop: 1180 }` (`src/lib/device.ts:43-51`). It reads **no** other breakpoint and does not call `useCapability()` or `useTabularLayout()`.

Only one of the three bands is tested, and it is tested twice:

| Band | What changes |
|---|---|
| ≥ 1180 (desktop) | Grid is `minmax(0,1fr) auto` (`:599`) and the rail cards go inside `Rail width={330}`, i.e. the collapsible aside (`:1066-1069`) |
| < 1180 (tablet **and** phone — identical) | Grid is a single `1fr` column (`:599`) and the same three rail cards render as a plain stacked column below the form (`:1070-1072`) |

Everything else reflows by CSS only: `fieldRow`'s `auto-fit` (`:171`) and the chip rows' `flexWrap` (`:845`, `:872`). No table exists on this page, so no `minWidth` floor is involved.

---

## 3. Data sources

| Screen area | Kind | Detail |
|---|---|---|
| Client Type cards (label, icon, blurb, placeholder example) | **SEED** | `TYPE_OPTIONS` — module literal in `AddClient.tsx:57-60` (not under `src/data`) |
| Organisation Type options | **SEED** | `ORG_TYPES` — `AddClient.tsx:62-65` |
| Profession chips | **SEED** | `PROFESSIONS` — `AddClient.tsx:67-70` |
| Segment chips | **SEED** | `SEGMENTS` — `AddClient.tsx:72-75` |
| District `Select` | **SEED** | `NEPAL_DISTRICTS` — `src/data/clients.ts:1289-1316` (24 names), imported `AddClient.tsx:30`, rendered `:771-775` |
| Source `Select` | **SEED** | `CLIENT_SOURCES` — `src/data/clients.ts:1318-1332`, rendered `AddClient.tsx:903-907` |
| Payment Terms `Select` | **SEED** | `PAYMENT_TERMS_OPTIONS` — `src/data/clients.ts:1334-1342`, rendered `AddClient.tsx:939-943` |
| Preferred Contact checkboxes | **SEED** | `PREFERRED_CONTACT_METHODS = ['Phone','Email','WhatsApp']` — `src/data/clients.ts:1344`, rendered `AddClient.tsx:952-962`; default-checked all three (`:239`) |
| Membership Tier `Select` | **SEED** | `MEMBERSHIP_TIERS` — `src/data/clients.ts:48-54`, rendered `AddClient.tsx:918-922` |
| "Possible existing client" banner (name, phone, type, and the id "View Existing" navigates to) | **SEED** | `CLIENTS_DATA` — the 26-record array at `src/data/clients.ts:171` onward; matched by last-9-digits at `AddClient.tsx:287-292`, drawn `:575-594`, navigation target `:584` |
| "Client Since" default value | **SEED** | `TODAY` — a frozen constant `new Date(Date.UTC(2026, 6, 31))`, `src/lib/bs.ts:153`; used `AddClient.tsx:233`. Its BS/AD echo comes from `toBs`/`formatBs`/`formatAd` (`src/lib/bs.ts:93`, `:102`, `:114`) via `formatSinceDate` (`AddClient.tsx:89-95`) |
| Client Summary rows, "Ready to Book?" ticks, phone "Saved as …" echo, Notes counter, staged-file list | *local state* | Computed from what the operator typed — `summaryRows` `:313-333`, checklist `:509-530`, `phoneWillSave` `:276`, `documents` `:242` |
| **Save** — the client row | **DB** | `clients` via `idempotentInsert('clients', payload)` — `src/actions/clients/createClient.ts:389`, implementation `src/lib/dataAccess.ts:80-125`. Column set declared at `createClient.ts:163-179`, built `:349-385` |
| **Save** — the client code | **DB (RPC)** | `supabase.rpc('next_document_number', { p_sequence_key: 'client' })` — `createClient.ts:338-340`. The code shown in the success toast is this value (`AddClient.tsx:435`) |
| All of the above when `VITE_DATA_SOURCE=mock` | **LOCAL** | `src/lib/supabase.ts:42`, `:66-68`. `clients` **is** served by the corpus (`src/lib/mock/corpus.ts:127`, registered `:412`) and is not in `UNSERVED` (`corpus.ts:33-44`); `next_document_number` is implemented locally at `src/lib/mock/client.ts:413-417`. The seed-fed parts of this page (duplicate banner, all the option lists) are unaffected by the switch — they never go through `supabase` at all |

Note on kinds: `TYPE_OPTIONS`, `ORG_TYPES`, `PROFESSIONS` and `SEGMENTS` are invented vocabularies declared inside the page file rather than in `src/data/*.ts`; they are marked SEED because that is what they are, not because of where they live.

**Invented on this page:** the duplicate-warning banner's client — name, phone and client type read off `CLIENTS_DATA` (`src/data/clients.ts:171`+, `AddClient.tsx:581`) — and the default "Client Since" date, which is the frozen build day 31 Jul 2026 (`src/lib/bs.ts:153`), not today's date. No money figure on the page is invented: Credit Limit is typed by the operator and echoed through `parseMoney`/`formatMoney` (`src/lib/money.ts:76`, `:62`) at `AddClient.tsx:327-330`, and it is not saved.

---

## 4. Actions and writes

### The one dispatch

| Dispatch | Capability | Action file | `implemented` | Mapped in `checkCapability`? |
|---|---|---|---|---|
| `createClient(input, ctx)` — awaited, inside `try/catch` (`AddClient.tsx:408-440`) | `client.create` (`src/actions/clients/createClient.ts:261`) | `src/actions/clients/createClient.ts` | **true** (`createClient.ts:274`) | **Yes** — `src/actions/core.ts:162-163` → `rbac.canCreateClient` (`src/lib/rbac.ts:145-147`) → `BOOKING_DESK` = Owner, Admin, Manager, Coordinator, Warehouse (`src/lib/rbac.ts:71-77`) |

What the call site does, in order (`AddClient.tsx:390-441`):

1. `validate()` — required set is **name and phone only**, plus a format check on phone and on email if present (`:352-365`).
2. Refuses with an inline sentence if there is no signed-in user; `dispatchContext()` returns `null` rather than a default identity (`:368-369`, `:393-400`).
3. Mints one idempotency key per press via `newClientUuid()` (`src/lib/supabase.ts:80-82`), held in a ref and reused by retries (`AddClient.tsx:269`, `:405`).
4. Dynamically imports the action and awaits it (`:408-433`).
5. On resolve only: `setSaved(true)`, one success toast carrying the code the database allocated, then `navigate('/clients')` (`:434-436`).
6. On reject: `setSaving(false)` and an inline persistent `saveError` (`:437-440`, banner at `:573`).

What the write actually inserts (`createClient.ts:349-385`): `client_uuid`, `client_code`, `name`, `phone`, `email`, `type_parent` (only when picked), `org_subtype` (Organisation only), `address_line`, `city`, `district`, `postal_code`, `country`, `pan_vat`, `notes`, `created_by`. It refuses outright when `navigator.onLine === false` rather than queueing (`createClient.ts:323-328`), and it re-checks that Postgres returned a row with an `id` before reporting success (`:407-430`). Failure messages are mapped per constraint at `:197-242`.

### Buttons and controls with no dispatch

| Control | Where | What it does |
|---|---|---|
| **Cancel** | `:561-563` | Opens the discard `Modal` if `isDirty`, else `navigate('/clients')` (`:443-446`) |
| **Discard** / **Keep Editing** | `:1103-1108` | Navigation / close. No write |
| **View Existing** | `:584-586` | `navigate('/clients/${duplicateMatch.id}')` — a seed id such as `C-1` |
| **Continue Anyway** | `:587-589` | Sets `dismissedDuplicate` |
| Client Type, Profession, Segment toggles | `:612-638`, `:849-862`, `:876-889` | Local state only |
| Preferred Contact checkboxes | `:954-959` | Local state; the value is never sent (reason at `:186-189`, `createClient.ts:374-378`) |
| **Browse Files** / dropzone / per-file **Remove** | `:986-988`, `:991-1018`, `:1051-1058` | `addFiles` validates MIME type and a 10 MB cap and pushes into local state (`:448-465`). **There is no upload dispatch anywhere in the file** — the staged files are dropped when the page unmounts |

No button on this page is `disabled`-with-a-reason; the only disabled states are Save/Cancel during an in-flight save (`:561`, `:564`).

---

## 5. Gates

**Route.** No role gate on `/clients/new` (`src/App.tsx:148-155`). `Shell` holds during session restore (`src/App.tsx:964-970`), redirects to `/login` when there is no user (`:973-975`), and refuses money surfaces to money-blind roles (`:993`) — but that test is `isMoneySurface(pathname)` over `MONEY_ROUTES = ['/finance','/reports','/admin','/tools/pricing','/tools/depreciation']` (`src/data/nav.ts:147-159`), and `/clients/new` is not in it. **All nine roles** (`src/types/database.ts:116-125`) reach and can fill in this form, including the external `Client` role.

**Write permission is separate and narrower.** `client.create` resolves to `BOOKING_DESK` (`src/lib/rbac.ts:71-77`, `:145-147`), so **Technician, Accounts, Driver and Client** get `ActionPermissionError` from the dispatcher (`src/actions/core.ts:236-241`) after pressing Save. Nothing on the page tests `canCreateClient` before rendering — the only call sites of that function are `core.ts:163` and the test files (verified by search across `src/`). So those four roles see a complete form, type a client into it, and learn at Save time that they may not create one.

**Money.** `useCanViewMoney()` at `AddClient.tsx:206` → `src/lib/moneyVisibility.ts:24-27` → `rbac.canViewMoney` (`src/lib/rbac.ts:36-38`), whose `MONEY_BLIND` set is Warehouse, Technician, Driver, Client (`src/lib/rbac.ts:45-50`).

**Hidden under Law 6 (absent, not masked):**

- the **Credit Limit (NPR)** field — the whole `Field` is behind `money &&` (`:925-934`)
- the **Payment Terms** field — same (`:935-946`)
- the **Payment Terms** and **Credit Limit** rows of the Client Summary card (`:326-330`)
- the money limbs of the dirty check, so a money-blind session's typed figures could not make the page dirty even if the fields were reachable (`:309-310`)

Note the intersection: **Warehouse is money-blind and yet is one of the five roles allowed to create a client.** A Warehouse user gets the full form minus the two money fields, and the save succeeds — which is coherent, because neither money field is written anyway (`createClient.ts:371-373`).

---

## 6. States drawn

`PageBody` is **not imported** by this file (imports `AddClient.tsx:1-38`), so none of the four shared states come from it.

| State | Present? | Where |
|---|---|---|
| **Loading** | Partly, hand-rolled | No fetch, so no page-level loading. In-flight save is the button label "Saving Client…" plus `disabled` on both header buttons (`:561`, `:564-566`). The route-level `Suspense` fallback for the lazy chunk is `LoadingSkeleton type="card"` in the Shell (`src/App.tsx:1026`) |
| **Error** | Yes, hand-rolled ×4 | Save failure → `ErrorBanner` (`:573`, component `src/components/ui/StateViews.tsx:171-210`); duplicate warning → a second `ErrorBanner` (`:575-594`); per-field errors → the `Field` error line with an `error` icon (`:132-137`); file-picker rejection → an inline red line (`:1032-1037`). None is dismissed by a timer; `saveError` persists until the next Save attempt (`:402`) |
| **Empty** | Yes, hand-rolled | "No client added yet / Fill in the details to see summary" in the Client Summary card when `name` is blank (`:472-479`). Not the shared `EmptyState` (`StateViews.tsx:34`) |
| **Restricted** | **None** | The file never renders `RestrictedState` and never imports it (`:1-38`). The Shell's `RestrictedState` (`src/App.tsx:1020-1023`) cannot fire here because `/clients/new` is not a money route (`src/data/nav.ts:147-153`). A role that cannot create a client is shown the form and refused only on Save |

---

## 7. Known gaps

1. **The file's own header describes a page that no longer exists.** `AddClient.tsx:53-55`: *"No data layer exists yet (Phase 1), so Save simulates and navigates back to /clients without persisting — the same contract AddEquipment already uses."* `handleSave` (`:390-441`) awaits a real implemented insert and reports from its outcome. The comment is stale by the whole width of the feature.

2. **`createClient.ts`'s two `TODO(decision)` blocks say `client.create` is denied for every role; it is not.** `createClient.ts:59-79` (*"`client.create` is not one of them, so `checkCapability` returns `undefined` and the dispatcher denies this action before `execute` ever runs"*), repeated at `:244-254` and `:271-273`. `src/actions/core.ts:162-163` maps it to `rbac.canCreateClient`, ruled 15 Aug 2026 (`src/lib/rbac.ts:138-147`). Same class of stale-header contradiction the Clients page carries for `client.block` (`docs/pages/04_clients.md` §7.1).

3. **`TODO(decision)` — the `client_code` format mismatch, open.** `createClient.ts:81-98`: the live CHECK is `^CL-[0-9]{4}-[0-9]{4}$` while `src/data/numbering.ts` emits `C-1`, and `0055_ruled_identifier_formats.sql` is written but not applied. The same block records that the live `clients` table already holds `CL-2026-0102` while the `client` sequence sits at `0`, so the allocator will collide on `clients_client_code_key` at the 102nd create. Both surface on this page as the inline "not saved" banner (`AddClient.tsx:573`) with the text from `describeInsertFailure` (`createClient.ts:207-221`).

4. **`TODO(refactor)` — the payload is cast through `never` twice.** `createClient.ts:389`, reasoned `:391-402`: `src/types/database.ts`'s hand-written `clients` entry describes columns the table does not have (`client_no`, `full_name`, `mobile`, `address`, `is_blocked`), so the insert is typechecked only by the local `ClientInsertPayload` (`:163-179`).

5. **Uploaded documents go nowhere.** `addFiles` (`:448-465`) validates and stages; nothing reads `documents` except the list renderer (`:1039-1062`) and `isDirty` (`:308`). No storage call, no `client_documents` write, no dispatch. Stated on-page (`NOT_SAVED_YET`, `:199`).

6. **Five collected fields are discarded and are *not* named in the "Not saved with this client yet" box.** `NOT_SAVED_YET` (`:195-201`) lists credit/terms, membership, preferred contact, documents, and professions/segments/source/referred-by. Absent from both that list and the insert payload (`createClient.ts:349-385`):
   - **Contact Person** (`:658-668`) — and it is also the second line of the "Ready to Book?" checklist (`:515-520`) and the first row of the Client Summary (`:315`), so the operator is told it matters
   - **Designation / Role** (`:669-676`)
   - **Website** (`:807-809`)
   - **Business Reg. No.** / **Government ID** — one state variable, `businessRegNo`, shared by both inputs (`:804-806`, `:819`)
   - **Client Since** (`:897-899`) — the column defaults to `current_date` server-side (`createClient.ts:383`), so the date picker cannot change anything

7. **Duplicate detection runs against the seed array, not the database.** `:287-292` searches `CLIENTS_DATA` (`src/data/clients.ts:171`+). A client that exists in `clients` but not in the seed produces no warning at all — the operator learns about it from the `clients_phone_key` failure after Save (`createClient.ts:198-202`). Conversely, the banner can name a client that does not exist in the database, and **View Existing** (`:584`) then navigates to a seed id such as `C-1`.

8. **Once dismissed, duplicate detection never comes back.** `dismissedDuplicate` (`:247`) is set by "Continue Anyway" (`:587`) and is a hard early return in the memo (`:288`); nothing resets it when `phone` changes. Typing a second, genuinely different duplicate number after dismissing the first shows nothing.

9. **Four fields wire up an error line that `validate()` can never fill.** `errors.contactName` (`:658`), `errors.address` (`:746`), `errors.city` (`:757`), `errors.country` (`:784`), each with a matching `clearError` call. `validate()` (`:352-365`) sets only `name`, `phone` and `email`. Dead paths left behind by the 12 Aug ruling documented at `:335-351`.

10. **PAN is validated only after the round trip.** `validate()` does not check it (`:352-365`); `createClient.validate` throws "PAN/VAT must be exactly nine digits" (`createClient.ts:306-309`), and the database CHECK is mapped at `:222-224`. So a bad PAN surfaces as the page-wide "This client was not saved" banner (`:573`) rather than on the VAT / PAN field (`:823-825`), which has no `error` prop at all.

11. **`isDirty` misses eight controls, so Cancel can discard work silently.** `:294-311` covers name, contact, designation, email, phone, address, city, district, postal code, business reg, PAN, referred-by, notes, documents and (money only) credit limit and terms. It does **not** cover `professions`, `segments`, `preferredMethods`, `source`, `website`, `membership`, `clientSince` or `govIdType`. Choosing three segments and a source, then pressing Cancel (`:443-446`), leaves without the "Discard changes?" modal.

12. **The idempotency key is never cleared.** `saveKey` is minted at `:405` and no code path resets it — its own comment concedes this (`:266-268`). After a failed save the operator can correct the phone number and press Save again; that genuinely different client is submitted under the first attempt's `client_uuid`, which is the key `idempotentInsert` replays on (`src/lib/dataAccess.ts:112-120`).

13. **The "Ready to Book?" checklist asserts two rules nothing on this path enforces.** `:523` — "VAT / PAN missing — required before a booking can be confirmed"; `:527` — "Address missing — required on the invoice". Neither `validate()` (`:352-365`) nor `createClient.validate` (`createClient.ts:276-310`) requires either, and both save as `NULL` (`createClient.ts:361`, `:367`). Whether the booking-confirm path enforces the PAN rule was not traced for this page.

14. **The file picker's accept list and the code's accept list are written in different alphabets.** The input advertises extensions, `accept=".pdf,.jpg,.jpeg,.png"` (`:1024`), while `addFiles` tests `file.type` against MIME strings, `ACCEPTED_TYPES = ['application/pdf','image/jpeg','image/png']` (`:77`, tested `:453`). A file the OS reports with an empty `type` passes the dialog filter and is then rejected by the page.

15. **Only the last rejected file is reported.** `addFiles` assigns to a single `err` inside the loop (`:450`, `:454`, `:458`) and calls `setDocError(err)` once (`:463`). Dropping five oversized files names one of them.

16. **The dropzone is keyboard-inert.** `:991-1018` carries `role="button"` and `tabIndex={0}` (`:1003-1004`) but only an `onClick` handler — no `onKeyDown`. It takes focus and does nothing on Enter or Space. The **Browse Files** button beside it (`:986-988`) is the only keyboard route to the picker.

17. **A role that cannot create a client is given the whole form anyway.** See §5 — nothing calls `canCreateClient` in any module file; Technician, Accounts, Driver and Client fill the form and are refused at dispatch (`src/actions/core.ts:236-241`). The refusal is rendered correctly and persistently (`:439`, `:573`), but it arrives after the typing, not before it.
