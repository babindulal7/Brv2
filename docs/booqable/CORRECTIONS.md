# CORRECTIONS — the extraction spec's repo-side claims, checked

**31 August 2026.** Every row below was verified by reading the file cited, or by querying the live
database. Nothing here is quoted from a dated line in an older document.

> ### Scope: written against v1.1 — and **still applies to v2.5**
>
> This register was produced against the v1.1 spec. [`REFERENCE_SPEC_v2.5.md`](REFERENCE_SPEC_v2.5.md)
> arrived at 01:57 on 31 Aug and supersedes v1.1 **for everything about Booqable**.
>
> **It does not supersede this file**, because v2.5 carries the same repo-side material unchanged:
> its §2.4 is the same contract list, its R6 still cites *"Law 9"* for dates (it is **Law 7**), and
> its Appendix A.5 still lists as open two questions this repo settled in code (§7 and §8 below).
>
> Every correction here therefore transfers to v2.5 — and matters **more** there, because v2.5 adds
> eleven further screens whose **Layer D was written from this same list**. Sections 1 and 13 below
> are the only ones v2.5 partly overtakes, and each says how.

**Why this file is the most important one in the pack.** The v1.1 spec is about to be used to drive
roughly fifty screen builds. Its §2.4 opens with *"The contracts to name (measured, do not
re-derive)"* — an instruction to trust that section without checking. Of the §2.4 claims that can
be checked, **most fail**. An error in a shared contract list does not stay one error; it is copied
into every screen spec generated from it. So this file is the correction applied once, at the root,
rather than fifty times at the leaves.

The spec is not a bad document. Its live-session findings are genuinely valuable and its
reasoning is mostly sound — §"What the spec got right" at the end is not a courtesy, it is a real
list. The problem is narrow and specific: **its repo-side claims were written from memory, not
measured**, despite saying otherwise.

---

## Severity key

| | Meaning |
|---|---|
| **BLOCKING** | Build from this and you write code that does not compile, or that is wrong about a law. Fix before any screen spec is generated. |
| **MATERIAL** | Wrong, and it changes a decision or wastes real work. |
| **COSMETIC** | Wrong, but self-correcting the moment someone opens the file. |

---

## 1. The archive that does not exist — **BLOCKING in v1.1, moot in v2.5**

> **Overtaken.** v2.5 contains the capture itself, so the missing archive no longer blocks anything.
> The §7 instruction to "extend the 19 Aug capture" is still unexecutable as written in both
> versions — but with v2.5 in hand, nobody needs to. **Read v2.5 instead of hunting for the
> archive.** The rest of this section is retained because it explains why `docs/pages/` — not
> `docs/booqable/` — is the correct source for our side.

**Spec §7, steps 1 and 2:**

> *"`docs/booqable/` already holds the 19 Aug capture (00-INDEX + 14 page docs + PARITY.md) —
> **extend those files, do not replace them.**"*
> *"Do not re-capture Layer A where a 19 Aug page doc exists. Add sections B, C, D, E, F to it."*

**Repo:** that capture has never existed here. Before this session `docs/booqable/` was not a
directory. There is no saved Booqable DOM anywhere in the workspace — no HTML, no MHTML, no
screenshot set. `BOOQABLE_DESIGN_PRINCIPLES.md:18` cites an evidence base of "51 saved screens"
and 19 Aug parity docs; **those files are not in the repo or the workspace either.**

**Consequence, and it is the one that governs this whole effort.** Layer A — the structural
capture of a Booqable screen — **has no source in this repo for any screen except the two the spec
itself captured live.** It cannot be generated. It can only be re-captured from the live product.
An agent told to "extend the 19 Aug page doc" will find nothing to extend, and the failure mode is
that it writes something plausible instead. That is fabricated structure presented as observation,
which is precisely the class of error this project has already been bitten by.

**Corrected instruction, use this instead of §7 steps 1–2:**

> 1. Read `PLAN.md` → `PROGRESS.md` (newest first) → **`docs/pages/INDEX.md`** →
>    `docs/BOOQABLE_DESIGN_PRINCIPLES.md`.
> 2. `docs/pages/` (55 route docs, written 16–17 Aug against source with `file:line` on every
>    statement) is the repo's real measured reference, and it documents **our** side. Use it for
>    Layers B and D. **Layer A and Layer C require a live Booqable session** and must not be
>    written without one.

---

## 2. Every law number in one cluster is wrong — **BLOCKING**

The spec cites laws by number throughout, including inside rulings it asks the reader to apply.
Three are wrong, and all three appear repeatedly (§4.4, §4.5, §4.6, R6, §9.7).

| Spec says | Actually | Real law at that number |
|---|---|---|
| "Law 15 — width decides" | **Law 14** — Width decides, 768 / 1180, never orientation | Law 15 is 44×44 touch targets |
| "Law 16 — 44×44" | **Law 15** — 44×44 touch targets, every device, desktop included | Law 16 is *No AI panel renders until backed by a validated computation* |
| "Law 9" for dates (R6) | **Law 7** — Store AD in UTC, BS rendered never stored | Law 9 is *Days mandatory on every priced line* |

Cited from `PLAN.md:24-34`.

**Why this is blocking rather than pedantic.** "Law 16" in the spec's §4.4 ruling means 44×44
touch targets. Law 16 in this repo governs **AI panels**. An agent applying "Law 16" to a hover
card will look up the wrong law and either apply an irrelevant constraint or conclude the ruling
is nonsense. The repo's own component code cites the numbers correctly — `Page.tsx:117` reads
`Law 15 - 44x44` — so a generated spec and the code it describes would disagree in writing.

The laws the spec cites correctly: **2** (Single Query), **6** (Warehouse sees no money),
**11** (never colour alone), **12** (errors inline), **17** (no "customer"). Those are fine.

---

## 3. §2.4's engine inventory is missing half the engines — **BLOCKING**

The spec lists 19 modules in `src/lib`. **There are 37**, plus four subdirectories
(`booqable/`, `queries/`, `edit/`, `mock/`) it never mentions.

The 18 omitted are not helpers. Several are load-bearing business logic:

`availability.ts` · `bookingRules.ts` · `bookingTransition.ts` · `damage.ts` · `lateFee.ts` ·
`fieldGating.ts` · `clientImport.ts` · `csv.ts` · `phone.ts` · `i18n.ts` · `settingsStore.ts` ·
`seed.ts` · `seedCompact.ts` · `monitoring.ts` · `device.ts` · `breakpoints.ts` · `collapse.ts` ·
`menuFlip.ts`

**Consequence:** an agent told these 19 are "the engines, measured, do not re-derive" will conclude
that availability checking, late fees, damage and booking transitions are unbuilt, and will
propose rebuilding engines that already exist. Given Law 1 (*pages never implement business
logic*), the likely form of that mistake is worse than a duplicate module — it is business logic
written into a screen because the engine was believed missing.

Minor, same section: `auth` and `theme` are **`.tsx`**, not `.ts` (`src/lib/auth.tsx:1`). Matters
only for import paths copied from the spec.

---

## 4. `BrandKey` — the spec invents a member and drops a real one — **BLOCKING**

**Spec §2.4:** `BrandKey = neutral|primary|progress|success|danger|purple`

**Repo (`src/lib/status.ts:126-143`):** `'neutral' | 'primary' | 'progress' | 'warn' | 'success' | 'danger'`

`purple` does not exist — the code comment records it as retired outright. `warn` **does** exist
and has entries in all three `BRAND` maps. A component written against the spec's union fails to
typecheck on `purple` and silently loses the warn tone.

---

## 5. `Card` — the spec describes the one that is not exported — **BLOCKING**

**Spec §2.4:** `Card {title,action,children,style,bodyStyle}` (no `subtitle`).

**Repo:** there are **two** `Card` components and the spec describes the wrong one.

- `src/components/ui/Page.tsx` — a `Card` with roughly the spec's props, plus an `id` the spec
  omits. **Not what the barrel exports.**
- `src/components/ui/Card.tsx:17-23` — `CardProps` has **`subtitle`**, plus `footer`, `padding`,
  and extends `HTMLAttributes<HTMLDivElement>`. **This is what `import { Card } from 'components/ui'`
  resolves to** (`src/components/ui/index.ts:5,13`).

So the spec's flat assertion "no `subtitle`" is false for the Card any screen actually imports.
The two also differ in padding and header typography (12/14px + `--t-ui` + `h2` versus
16/20px + `--t-h3` + `h3`).

`[ruled]` **"The Card contract" is ambiguous in this repo and must not be cited as settled.** The
reconciliation of the two Cards is a real open item; see `CAPTURE-BACKLOG.md`.

`PageHeader` verified as claimed: `{icon,title,description,actions}`, no `subtitle`
(`src/components/ui/Page.tsx:73,101-103`). `Kpi`'s seven names are right, but `delta` is an
**object** `{direction:'up'|'down'; text:string; good?:boolean}` and `icon`/`accent` are
**required** (`Page.tsx:174-184`) — a flat prop list produces type errors at every call site.

---

## 6. `ClickableRow` does not exist, and neither does the document that names it — **MATERIAL**

**Spec §4.4:** *"Build on the `ClickableRow` component already named as item 3 in the 11 Aug
improvement order."*

**Repo:** no `ClickableRow`. The string appears nowhere in the tree, and neither does
"improvement order" — **nothing corroborates that document existing at all.**

The nearest thing is `Table.tsx`'s `onRowClick` (`src/components/ui/Table.tsx:24,113-118`), and it
is not a substitute: it attaches a click handler to the `<tr>` with **no `tabIndex`, no `role`, no
Enter/Space handler and no 44px height floor** — so it fails Law 15 and is not keyboard-reachable.
`Table.tsx` is additionally **not exported from the barrel** and is written in Tailwind classes
that compile to nothing in this app's bundle (`src/components/ui/index.ts:20-29`).

**Corrected:** the "one row, one tab stop" ruling is sound and worth keeping, but it is a **GAP —
not built**, and building it starts from scratch, not from an existing component.

---

## 7. The facet-counts finding is inverted — **MATERIAL, and it changes the work**

**Spec §9.2:**

> *"This is our biggest unbuilt filter item… `GAP — not built. Recommended: one Postgres function
> booking_facets(filters jsonb)`."*
> And §9.8 open decision 2: *"do counts respect the other active filters (true faceting) or only
> the base scope?"*

**Repo:** `src/lib/queries/facetCounts.ts` (142 lines) already implements faceted counting, and
implements the **harder, more useful** semantics. Its rule:

> **Each option is counted with its own group's selection removed.**

Its own doc comment explains why, and the reasoning is better than the spec's: count an option
against the filters as they stand and the moment somebody ticks *Open*, every sibling reads 0 —
because no row is both Open and Packed. The group could then only ever be narrowed, never widened,
and `Packed 0` would be actively false. Dropping the group's own chips first answers the question
the user is actually asking — *if I add this, what do I get* — while every **other** group still
constrains.

So **§9.8 open decision 2 is already answered in code, in the more useful direction.** Do not
re-open it.

**But the real gap is elsewhere, and the spec missed it.** The engine is built and **completely
unwired**:

- `countFacet` is imported by exactly one file: `src/lib/queries/__tests__/facetCounts.test.ts:9`.
- `useFacetCounts` has **no caller anywhere in `src/`**.
- `FilterDrawer.tsx`'s `FilterOptionList`, which draws the count beside an option
  (`FilterDrawer.tsx:640-647,796`), is mounted **only in its own test file**.

**No screen renders an option count today.** The correction is therefore not "build a facet
engine" — it is "**wire the one that exists to `/rentals`**", which is a much smaller job with a
much better starting point.

On the spec's cost argument: it is right that N options means N round trips, and
`facetCounts.ts` says so itself and names a grouped RPC as the correct answer *for a large group*,
which is why the hook is opt-in per group rather than automatic. `booking_facets()` genuinely does
not exist — confirmed against all 72 migrations and against the live database. So the RPC
recommendation is a reasonable future step; it is just not the current gap.

---

## 8. Money on list rows — the spec is wrong in both directions — **MATERIAL**

The spec's §9.7 says our `bookings.ts` "deliberately carries no money on list rows at all", and
raises §9.8 open decision 1 on whether to add it.

**Repo:** a money field **already exists** on booking list rows. `BookingListRow.depositRequired`
(`Paisa | null`) and its mapped `RentalListRow.deposit`
(`src/lib/queries/bookings.ts:99-108`). It is opt-in via `listBookings({ withDeposit: true })`,
sourced from the **masked view `bookings_deposit_v`** in a second query, and `RentalsList.tsx`
passes it only behind `useCanViewMoney()`.

That is a considered Law 6 implementation — masked at the view, gated at the component — and the
spec does not know it exists.

What is **genuinely absent** from a list row is the **rental total** and the **outstanding
balance**, and they are absent for a deeper reason than choice: `fetchCanonicalBooking` cannot
produce a Rental Total either, because `CanonicalEngineInput` types `crew`, `transport`,
`vatPercent` and `payments` as literally `null` (`src/lib/bookingQuery.ts:462-483`).

**So open decision 1 is not "should list rows carry money" — that ship has sailed for deposits.
It is "should list rows carry the *rental total*", and the blocker is that nothing in the repo can
compute one yet.** That is a materially different question with a materially different cost.

---

## 9. `todaysIncoming` excludes returned bookings — **BLOCKING for §4.3's mapping**

**Spec §4.3:** Coming back → stages `[On Rent]`, *"plus `Returned` for the same day"*.

**Repo (`src/lib/queries/bookings.ts:538-545`):** `chips.stage = ['On Rent']` **only**, and it
additionally sets `presence.actual_return_at = false`, which **positively excludes** any booking
that has been returned. A same-day `Returned` booking cannot appear on either count.

The spec's proposed mapping is not a description of the code; it is an undeclared change to it.
If Coming back should show same-day returns, that is a product change with a query change behind
it, and it needs to be argued as one.

---

## 10. `next_document_number` — wrong argument name, and it fails at runtime — **MATERIAL**

**Spec §2.4:** `next_document_number(kind)`.

**Repo and live:** `next_document_number(p_sequence_key text) returns text`
(`supabase/migrations/0055_ruled_identifier_formats.sql:140`; confirmed against the live database).

supabase-js RPC calls pass **named** arguments. `{ kind: … }` does not fail at typecheck — it fails
at runtime, in production, on document creation.

---

## 11. `PageBody`'s status ladder is not a plain switch — **MATERIAL**

**Spec §2.4:** *"`PageBody` status wrapper, fixed order restricted → error → loading → empty →
children."*

**Repo (`src/components/ui/PageBody.tsx:20-24,182-207`):** the **rank** is exactly that and is
unconfigurable — correct. But the ladder is **not purely exclusive**: the `hasRows` prop makes the
error banner render *above* children, and makes a `loading` render children under `aria-busy`
instead of a skeleton.

That prop exists specifically to fix the blank-the-table-on-refresh bug. **A spec describing this
as a plain switch will drive agents to re-introduce it.**

---

## 12. The audit-feed proposal names a column that does not exist — **MATERIAL**

**Spec §4.5:** *"`filter: latest N by occurred_at`"*, and triggers on *"bookings, clients,
invoices, payments, security_deposits, **inventory_units**"*.

**Live database:**
- The timestamp column is **`created_at`**. There is no `occurred_at`.
- The sixth trigger table is **`product_units`**. `inventory_units` does not exist.

Both confirmed live; triggers verified on `bookings`, `clients`, `invoices`, `payments`,
`product_units`, `security_deposits`. See [`LIVE-DB-VERIFICATION.md`](LIVE-DB-VERIFICATION.md) §4.

---

## 13. Test-count provenance — **MATERIAL**

**Spec §7 gate:** *"`vitest` all pass (2174/2174 across 88 files as of 30 Aug)"*.

**This repo, measured 31 Aug:** **2,169 tests across 87 files**, `tsc --noEmit` 0 errors.

The 2,174/88 figure is a **sandbox** number. `PROGRESS.md`'s own 30 Aug entry records the
distinction explicitly — *"The sandbox counts above are the sandbox's; this repo's after-apply
verification: 2,169 / 87"* — the difference being a retired calendar guard test.

**Related, and worth more than the number itself.** The three `*30Aug2026.zip` files at the
workspace root are handoff bundles, and they did **not** land together. Hash-compared against the
tree on 31 Aug, twice, several hours apart:

| Zip | Status |
|---|---|
| `babin-dashboard-rename-30Aug2026.zip` | applied — `nav.ts` still matches |
| `babin-operations-cases-30Aug2026.zip` | applied — `App.tsx` still matches |
| `babin-booqable-layout-30Aug2026.zip` | **applied at 00:28:52 on 31 Aug — during this audit** |

⚠ **The third zip was applied by a concurrent session while this pack was being written.** At the
first hash pass it was unapplied; at the second, `Today.tsx` and `OperationsQueues.tsx` both
hash-matched it exactly. Two verification agents read two different files under the same path and
reported different line numbers — **that discrepancy was real, not agent error.**

Two consequences worth carrying:

1. **Any measurement in this pack taken before 00:28:52 describes the previous tree.** Line numbers
   in `Today.tsx` and `OperationsQueues.tsx` citations are the most exposed.
2. **This repo is edited concurrently.** Hash-diff before assuming a zip landed, in either
   direction, **and re-check at the end of a long session** — a fact established at the start may
   not hold at the end.

The zip in question is the Booqable dashboard rework — the very thing the spec's §4 worked example
describes — so it is now in the tree, and `dashboard.md`'s structural claims should be re-read
against the current file before being built on.

---

## 14. Smaller corrections

| # | Spec says | Repo says | Sev |
|---|---|---|---|
| a | Icon registry lacks `lock` | **`lock` IS registered** (`IconLock`, added for the restricted state). The other six named are genuinely absent, and `clock`'s glyph exists under the key `timer` (`Icon.tsx:141,168-170`) | COSMETIC |
| b | Dashboard period control implies multi-scope / Custom | `OFFERED_PERIODS` is `['Today','Tomorrow']` only; the five-scope control incl. This Week / Next 7 Days / Custom is on **`/operations`**, not the Dashboard (`Today.tsx:99-148`) | MATERIAL |
| c | §4.5 maps a Booqable right rail onto our Alerts panel and mini Calendar | Both were **removed from the Dashboard on 30 Aug**; `CalendarPanel.tsx` was deleted outright and Alerts now renders only in `/operations`' rail. The Dashboard's right track is a collapsible **Quick actions** rail (`Today.tsx:470-478,765-798,909-913`) | BLOCKING |
| d | `create_booking(jsonb)` | ✅ correct — `create_booking(p_payload jsonb)`, confirmed live | — |
| e | Booking number `^B-[0-9]+$`, migration 0055 | ✅ correct — 200/200 live rows match, range `B-700`→`B-899` | — |
| f | All 26 §2.4 tables and views | ✅ **all 26 exist live.** Plus `cases`, which the spec omits | — |

---

## What the spec got RIGHT

A corrections register that only attacks is less trustworthy than one that also confirms. These
verified cleanly and several are genuinely valuable:

1. **The rental-day question was real, and §4.6 ruling 1 was right about it** — correctly
   identified as a product call, and correctly left unresolved. It has **since been ruled 06:00 and
   built** (`src/lib/operationalDay.ts`, new; the `TODO(decision)` is gone from
   `src/lib/queries/bookings.ts`). See `DECISION-SHEET.md` B1. The spec called this one exactly
   right, including its instruction to confirm before building.
2. **All 26 tables and views in §2.4 exist**, verified live. This is the spec's strongest section.
3. **The booking-number contract** is exactly right.
4. **`/dashboard` with `/today` as a replace-redirect** is exactly how it is built.
5. **`periodRange` really was taken by `/operations` on 30 Aug**, as claimed.
6. **The two money definitions** (§9.3) genuinely resolve the 19 Aug "Revenue disagrees with the
   register" puzzle — ex-tax including unpaid orders versus totalling issued invoices. They answer
   different questions and were never meant to match. The ruling that follows — *every money tile
   carries a one-line definition on the tile* — is cheap, correct, and should be adopted.
7. **The decomposition of the ten Booqable notes** (§4.5) into typed records is the best analytical
   work in the document. Nine of ten rows are typed records living as prose, invisible to every
   report. The conclusion — our panel is an activity feed over typed events, not a notes box — is
   right, and the live database supports it: `audit_events` holds 5,378 rows with a rich schema.
8. **§8's own honest-limits section** is exemplary, and its central warning proved correct: the
   live session found a hover card and two tooltips the archive did not contain. Any screen specced
   from an archive alone will have the same hole.

**The pattern.** Everything the spec observed *in Booqable* holds up. Everything it asserted
*about this repo* needs checking. It should have said "unverified" where it said "measured" — and
§8 shows the author knew how to make exactly that distinction.
