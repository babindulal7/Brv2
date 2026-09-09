# Verification of the 5 Sep Audit & Competitor Comparison

**Date:** 6 Sep 2026 · **Measured at:** repo HEAD `23e8eb0` + the live Supabase project (read-only)
**Subject:** the 5 Sep "Full Audit & Competitor Comparison" (archive `babin-rentals-os_app.rar`)
**Method:** 12 verification clusters over the audit's 144 claims, each attacked by an independent
adversarial refuter, then a completeness critic. 25 agents, 0 failures. Every finding reproduced
below was re-checked by hand against HEAD or by SQL against live before being written here.

---

## 0. Verdict

**The audit's structure is trustworthy. Its scores are not.**

- Counts, file citations and roadmap dependencies verified near-exactly (9 of 10 cited line counts
  match to the digit; 126 tables / 288 policies / duplicate migrations 0056+0076 / gaps
  0073+0081–0084 all exact).
- **"31% of 108 rows FULL" is wrong. After three adversarial rounds the figure is 12% (13/108).**
  Not-FULL = **88%**.
- The "40% complete" headline survives arithmetically **by coincidence** while its composition
  inverts: FULL collapses 34 → 13, PARTIAL grows 30 → 56. It now means *"almost nothing is finished
  and almost everything is half-built"* — a materially different statement.
- **All eight** of the audit's "ahead of all four competitors" claims were downgraded.
- **Every row has now been argued against at least once.** Three rounds: 73 rows attacked (21 fell,
  28.8%) → the 71 never-attacked CONFIRMED rows (3 fell, 4.2%) → the 21 single-pass overturns
  (5 fell, 23.8%). A fourth round of this kind is not justified; see §12.
- The client money engine and the BS calendar are **fuzz-verified sound** — the first executed checks
  in the whole exercise (§11). What reading could not find, execution did: the VAT rate has three
  independent sources and none is authoritative.

> **How to read this document.** It is layered chronologically, so the totals in §1 (round one) are
> superseded by §9 (round two) and finally by **§12 (round three, definitive)**. Sections 2–8 record
> findings that no later round disturbed. §13 records how far the repo moved underneath the audit.

---

## 1. Corrected totals (the 108 capability rows)

| Mark | Audit | Verified | Delta |
|---|---|---|---|
| FULL | 34 (31.5%) | **15 (13.9%)** | −19 |
| PARTIAL | 30 (27.8%) | **58 (53.7%)** | +28 |
| MISSING | 44 (40.7%) | **35 (32.4%)** | −9 |

Movement: 17 FULL→PARTIAL · 2 FULL→MISSING · 11 MISSING→PARTIAL · 0 PARTIAL→MISSING.
Verdicts: 59 CONFIRMED (55%) · 19 RESTATED (18%) · 30 REFUTED (28%).

Per cluster (verified FULL/PARTIAL/MISSING — was):
`4.1 booking 1/11/3` (was 4/5/6) · `4.2 availability 1/2/5` (2/1/5) · `4.3 inventory 2/9/5` (6/6/4) ·
`4.4 operations 1/8/1` (4/5/1) · `4.5 finance 1/5/8` (5/1/8) · `4.6 documents 0/4/5` (0/2/7) ·
`4.7 clients 1/6/2` (3/3/3) · `4.8 crew 0/5/1` (1/2/3) · `4.9 reporting 1/5/1` (2/3/2) ·
`4.10 platform 7/3/4` (7/2/5).

### What the 15 FULL rows actually are

- **7 clean:** Calendar · Add equipment · Client directory · Overdue chip · Light/dark theme ·
  Command palette · BS dates.
- **1 unverified:** PWA (judged from config; no build, no install check). Mark UNVERIFIED.
- **7 carrying a live defect that voids "usable today":** Create booking (works once) ·
  Product+serial units (serial half empty) · One Floor page (~200 of 246 bookings open an empty
  checklist) · Daily closing (every figure Rs 0) · Roles grid (contradicts live RLS in 6 cells) ·
  Staff PIN (0 enrolled, idle timeout defaults off) · Append-only audit (forgeable AND truncatable).

> **A better headline than any percentage:** not one FULL row is a money write path, and exactly two
> write paths in the whole product are production-safe — `createEquipment` (the only sequence with
> adequate padding) and `approveDailyClosing` (mints no number).

---

## 2. Five findings the audit never filed as findings

All five verified directly against live on 6 Sep 2026.

### 2.1 The numbering table is ONE defect with eleven instances

The audit files this as P0-2 ("apply 0089, half a day"). It also appears in six other rows as six
unrelated defects. It is one defect, and it is why "create" works at most once on the two
highest-traffic entities.

| key | prefix | padding | current | next live mint | reachable minter | status |
|---|---|---|---|---|---|---|
| booking | B- | 1 | 917 | **B-9** | `create_booking` RPC | **bricks after 1** |
| client | C- | 1 | 750 | **C-7** | `createClient` | **bricks after 1** |
| invoice | INV- | 1 | 120 | INV-1 | none (no caller) | latent |
| deposit | DEP- | 1 | 89 | DEP-9 | none found | latent |
| bundle | BND- | 1 | 0 | BND-1 | `createBundle` | bricks on the 10th |
| expense | EXP- | 1 | 0 | EXP-1 | `createExpense` | bricks on the 10th |
| membership / quote | M- / Q- | 1 | 0 | — | none found | latent |
| equipment | EQ | 6 | 1150 | EQ001151 | `createEquipment` | **safe** |
| payment | PAY- | 4 (+yr) | 93 | PAY-0094 | `recordPayment` | safe (format unchecked) |
| **transfer** | — | — | — | — | `createStockTransfer` | **key ABSENT → RAISES** |

The `transfer` sequence key does not exist on live: `createStockTransfer` throws
`Number sequence transfer does not exist` on every production attempt while succeeding in mock.

### 2.2 `storage.buckets` is empty — zero buckets

Kills five separately-filed rows at the root: pack condition photos · return damage photos ·
client KYC upload · `evidence_files` · `invoices.pdf_url`. "Add a PDF renderer" is therefore not a
standalone week — it needs a bucket, a policy and an upload path first. Same for the Handover
signature canvas: it would produce a blob with nowhere to go.

### 2.3 The live corpus is hollow past Packed

Only **46 of 246** bookings carry a single `booking_lines` row.

| stage | bookings | with lines | lines |
|---|---|---|---|
| Returned | 130 | **0** | 0 |
| Closed | 60 | **0** | 0 |
| Booked | 30 | 30 | 60 |
| Packed | 16 | 16 | 32 |
| Quote | 7 | **0** | 0 |
| On Rent | 3 | **0** | 0 |

Return runs at `On Rent` and Reset at `Returned` — both have zero lines, so both render nothing on
production for a reason unrelated to serialisation. **But Pack IS runnable** (30 Booked, 60 lines;
`readBookingLines` selects only `id, qty`). Any claim that the floor loop is unreachable in
production is wrong: it is *unused*, not unreachable.

### 2.4 The audit log is neither complete, trustworthy, nor durable

`log_audit_event` is bound to **6 of 124** live tables (5% coverage). `anon` holds INSERT on
`audit_events`. And — not previously recorded anywhere — **both `anon` and `authenticated` hold
TRUNCATE** on it, which no row-level append-only trigger can see. Forged rows are not "permanently
unremovable"; the whole log can be erased by the same role that forges it.

### 2.5 `invoice_lines` has no INSERT policy at all on live

One policy, SELECT only. Not "invoice_lines refuses writes because of a CHECK" — there is simply no
INSERT or ALL policy. Every claim that some line type (crew, sub-rental, damage) "reaches an
invoice" is impossible on production regardless of the calling code.

---

## 3. Corrections to the audit's own P0/P1 list

| Item | Audit | Verified |
|---|---|---|
| **P0-1** client UUID→code link | P0, "1 hour" | **REFUTED — already fixed.** `clients.ts:570` dispatches `column = CLIENT_UUID_RE.test(ref) ? 'id' : 'client_code'` (commit `a399bce`, 5 Sep 01:57 — *before* the archive was taken). |
| **P0-2** numbering | "apply one migration, ½ day" | **CONFIRMED, badly understated.** Live stops at `0078`; **0079–0095 are unapplied — thirteen files.** Four sequences truncate today, not one. See §2.1. |
| **P0-3** no invoice path | P0 | **CONFIRMED.** `CreateInvoiceModal.tsx:307` — *"No action dispatched … Do not wire this without that answer"* (§4.46). Also `createInvoice` has **zero non-test callers**, and `invoices.invoice_no` is still NOT NULL on live (0086 unapplied) while `createInvoice` omits it — the header insert would fail even if wired. |
| **P0-4** no documents/PDF | P0 | **CONFIRMED, and deeper.** No PDF dependency, no importers; `printSlip.ts`'s only importer is a test; Packing and Handover contain **no print reference at all**. Plus §2.2: nowhere to store a file. |
| **P0-5** Bundles reads a literal | P0 | **REFUTED — already fixed.** `Bundles.tsx:420` calls `useBundleRecords` and renders `bundles.rows`. The audit's own cited line 33 *is* the DB import. |
| **P1-5** no `sub_rentals` table | "no data model" | **REFUTED as framed.** `0003_operations.sql:1520` states it deliberately: a sub-rental is a `booking_lines` row with `line_type='Sub-rental'` carrying `supplier_cost`/`markup_amount`. The model exists; `createSubRental` is `implemented:false`. |
| **P1-9** Booqable token in git | "5 git-tracked scripts" | **Half refuted.** At HEAD all four scripts read `process.env.BOOQABLE_TOKEN` ("no longer stored in this file"); the 2 Sep scrub removed the literals. The plaintext token **does** survive in two untracked worktrees (`.claude/worktrees/gracious-antonelli-*`, `practical-jang-*`). Local-disk exposure, not a committed secret — the fix includes deleting the worktrees. |

Confirmed unchanged: **P1-1** (saveDraft / cancelRental / extendRental all `false`) · **P1-3** (no
signature canvas) · **P1-4** (LateFeePanel mounted by nothing) · **P1-6** (NewRental sends no
`units`) · **P1-7** (11 of 13 report pages seed) · **P1-8** (CrewBooking reads zero query modules).

---

## 4. Statements that must be struck from the audit

**Unsupportable — cannot be fixed by editing the number:**

- **The 20 module percentages.** No rubric exists; scores contradict their own row marks (Clients
  scores 70 against 1 FULL / 6 PARTIAL / 2 MISSING); two modules double-count one defect. Delete
  them — the per-module row counts already carry the information.
- **The 57-screen classification split.** The audit's split was refuted; the replacement split was
  itself refuted on three named screens plus an unquantified class of dynamic-`import()` write paths
  invisible to a static scan. Two competing splits, both known wrong. Strike the section.

**Parentheticals proven wrong:** `3 wide tables still scroll` (→ 13, disputed; nobody rendered a
screen at 375px) · `130 i18n keys, 2 importers` (→ 15 keys, 3 importers) · `71 files BS`
(unresolvable — three clusters report 73 / 69 / 46) · `30 files WhatsApp` (→ 4 non-test files) ·
`8 crew tables` (→ 9) · `calendar.ts:508` (does not resolve; cite `data/calendar.ts:1021`) ·
`bell links to 404` (the bell is a *disabled button*; the real dead link is `AlertsPanel.tsx:129`) ·
`storefront ruled NEVER` (no such ruling exists in this workspace) · `createExpense ✅` (there is no
such action — it is a query-layer write at `finance.ts:1384` called from `Expenses.tsx:515`,
bypassing the dispatcher, its capability check and its audit emission).

**Dead links — overstated.** `/system` is linked from nowhere. Of eight links to unrouted paths,
five are inside `src/archive/CommunicationSettings.tsx` (unrouted, unreachable) and its data module
has no live consumer. **Exactly three are reachable in-app:** `AlertsPanel.tsx:129` → `/notifications`
(the Today page's "View all"), and `ExpenseReports.tsx:637` and `:696` → `/automation`.
**Plus two from outside the app:** `vite.config.ts:41,44` declares PWA jump-list shortcuts to
`/scan` and `/operations/packing`, neither of which is a route — so two of the installed app's four
shortcuts open the 404 catch-all.

**Duplicate URLs — confirmed, one pairing garbled.** Three components mount twice: `Documents` at
`/documents` + `/finance/documents` (as claimed), `AuditSettings` at `/admin/audit` +
`/admin/audit-settings`, and `CasesWorkspace` (list + detail, intentional). The audit's pairing of
"`/clients/memberships` and `/admin/audit-settings`" is not a duplicate pair.

---

## 5. What the migration lag actually costs

Live is at `0078_daily_closings` (1 Sep); the repo has through `0093`.

**The gap is not schema.** Only 2 of 126 tables are missing on live — `booking_no_migration_map` (a
one-shot migration scratch table) and `categories` (superseded by `inventory_categories`). Both
benign. All 22 tables the roadmap depends on exist live.

**The gap is behaviour:** 42 policies, plus the functions and triggers of the unapplied files. Concretely:

- `0089` — live `next_document_number` still uses bare `lpad()`. See §2.1.
- `0092` — `pg_proc` has **zero** `%law6%` functions. The audit's flagship "money masking enforced
  in Postgres" claim is **repo-only**.
- `0079` (VAT rate), `0091` (audit anonymous refusal), `0090` (R-06 handover warn), `0085`–`0088` —
  all repo-only. Every ✅ in the audit citing them is a repo claim, not a production one.

Nobody had dry-run these against production's actual drift. §14 does it.

---

## 6. What the audit got right, and why the rest is still usable

- Counts: 234 `.tsx` · 126 tables · 288 policies · 42 action files · 19 `implemented:true` ·
  2 unflagged — all exact or within 3 of HEAD.
- Live row counts (246 / 366 / 204 / 0 / 0 / 0) — exact.
- Migration hygiene (dupes `0056` + `0076`, gaps `0073` + `0081–0084`) — exact.
- Sidebar (10 items + Settings) — exact.
- Nine of ten cited line counts exact; only `NewRental` differs (4,580 at HEAD vs 4,777) because
  `467e7f1` shrank it after the archive was taken.
- **Every §6 roadmap dependency claim is true.** `document_registry`, `signatures`,
  `payment_reversals`, `notification_templates`, `booking_crew_lines`, `maintenance_records`,
  `user_roles`, `portal_sessions`, `apply_booking_stage_transition` and `ReportToolbar.tsx` all
  exist; and the three it says need new tables (`rate_cards`, `price_groups`, `custom_fields`)
  genuinely do not. **The §6 sizing is trustworthy** — subject to §2.2 (documents need a bucket
  first).
- §7's ordering, and especially step 5 ("until one real cycle has happened on production, the
  completion figure stays put"), survive intact and remain the right gate.

---

## 7. The most dangerous class, currently scored 10–15%

Thirteen finished-looking report screens present invented money as authoritative.
`/reports/clients` shows an Owner an "Outstanding Ageing" donut totalling **Rs 5,42,000** against a
database holding **0 invoices** — and exports it to CSV. Under a live lens this outranks most of the
audit's P1s, and the audit scores Reports at 15%.

---

## 8. Limits of this verification

1. **Nothing was executed.** No test run, build, screenshot, rendered page or HTTP request across
   144 rows. Every "usable today" verdict is static reading plus SQL catalogue inspection.
2. **No RLS claim was tested as a role.** All policy findings are read from `pg_policies` /
   `has_table_privilege` at service-role. Nobody authenticated as Warehouse or Accounts and
   attempted a write. The flagship security claims are inferences from policy text.
3. **Anon reachability assumed, never established.** Nobody checked whether the app is deployed or
   whether the anon key ships in a built artefact.
4. **71 of 144 rows received no adversarial pass.** Of the 73 that did, 21 were overturned — a 29%
   hit rate, and roughly one in seven of those overturns was itself wrong and had to be reversed by
   the critic. (An earlier draft of this report repeated the critic's claim of "21 of 21, a 100%
   hit rate" and "123 unattacked". Both were wrong: the refute stage was fed every non-CONFIRMED
   row, not just the ones it overturned. Corrected here from the run record.)
5. The 21 `implemented:false` actions were rediscovered ad hoc, never enumerated as a set. The most
   user-visible failure class — a reachable, enabled control that dispatches and throws
   `ActionNotImplementedError` — still has no consolidated list or severity ordering.

---

## 9. Round two — the 71 previously-unattacked rows

**Method.** Blind re-derivation: attackers received the feature name and the recorded mark only,
never the original evidence, so they could not inherit a bad citation or be anchored by a confident
one. Every agreement had to carry the attacker's *own* independent evidence. Every medium- or
high-confidence disagreement then went to a third agent that investigated from scratch and could
rule for the record, for the attacker, or for neither. 15 agents, 0 failures.

### The hypothesis was wrong

The design assumption was that CONFIRMED rows would be the softest in the corpus, because agreeing
with the audit is the cheapest verdict available. **They were the hardest, by a factor of nearly
seven.**

| | Round 1 (non-CONFIRMED) | Round 2 (CONFIRMED) |
|---|---|---|
| rows attacked | 73 | 71 |
| disputes raised | — | 4 (5.6%) |
| marks actually changed | 21 | **3** |
| hit rate | **28.8%** | **4.2%** |

The CONFIRMED marker was doing real work: it sorted the audit into a soft half and a hard half, and
the sort was accurate. Three qualifications matter more than the headline:

1. **The surviving errors changed character.** All three round-two overturns are *rubric-application
   disputes, not factual errors*. In two of them the adjudicator states the facts were never in
   dispute — only which clause governs. What survives one adversarial pass is not misreading; it is
   **rubric drift at the PARTIAL boundary**.
2. **The residual bias is uniformly optimistic.** All three successful overturns moved a row *down*.
   The one attempt to move a row *up* was rejected. **A residual error in these rows is ~3:0 likely
   to be a mark that is too generous.**
3. **4.2% is a lower bound on error, not a measure of truth.** It measures how often a second reader
   using the same method disagrees. See §10.

### The four rulings

| Cluster · feature | Record | Attacker | Final | Won |
|---|---|---|---|---|
| 4.1 · Create booking (`create_booking` RPC) | FULL | PARTIAL | **PARTIAL** | attacker |
| 4.1 · Coupons / promo codes | PARTIAL | MISSING | **MISSING** | attacker |
| 4.3 · Edit / archive / bulk actions | MISSING | PARTIAL | **MISSING** | record |
| 4.8 · Vehicles + trips + fuel logs | PARTIAL | MISSING | **MISSING** | attacker |

**Create booking** gained new evidence from the third pass: the booking counter is stranded *twice
over*. Beyond the `lpad` truncation, `bookings` already holds `B-900`…`B-945` **including `B-918`**,
so applying `0089` alone would mint `B-918` and collide immediately. Only `0085` — which advances the
counter past 945 — clears it, and **both are repo-only**. `create_booking` is SECURITY INVOKER with
no exception block, so the unique violation aborts the transaction and rolls the counter bump back
with it.

**Edit / archive / bulk** is the one 2-1 split, and the mark is right for a reason neither earlier
pass gave: a live Edit control exists whose `onSave` only calls `setDraft`, but it is gated behind
`units.length`, and live has 0 `product_units` across all 204 products — so the control never paints
in production. **Mark MISSING with a stated dependency:** create one serialised product with one
unit and the panel appears, the silent-discard defect becomes reachable, and MISSING is wrong that
same day.

### Corrected capability totals

| Mark | Audit | After round 1 | **After round 2** |
|---|---|---|---|
| FULL | 34 (31.5%) | 15 (13.9%) | **14 (13.0%)** |
| PARTIAL | 30 (27.8%) | 58 (53.7%) | **57 (52.8%)** |
| MISSING | 44 (40.7%) | 35 (32.4%) | **37 (34.3%)** |

14 + 57 + 37 = 108. **Not-FULL = 94/108 = 87.0%.** None of the four rulings touches a module-score
row, so the 108 is complete and self-consistent.

One open item deliberately excluded: the late-fee row. `LateFeePanel` has zero importers and
`settleLateFee`'s only two non-test callers are both inside that orphan file — the entire apply/waive
settlement surface is unreachable. If that row currently sits above MISSING, the totals become
**14 / 56 / 38**. It was surfaced but never adjudicated.

### 20 new defects, in two classes the rubric cannot see

**Class A — fabricated data rendered as live (7 instances).** One systemic defect, and worse than
any individual row: the app is confidently wrong to an owner's face, and in two cases the
fabrication *leaves the building*.

- **366 of 366 live clients wear a fabricated "Academy" membership badge.** `client_memberships` is
  empty on live (verified). The badge exits the app in CSV exports.
- `/documents` renders hardcoded seed rows as the live register (`document_registry` = 0 rows).
- The Membership tab shows 5 hardcoded members and their money figures, with the honesty footer
  suppressed on the embedded path (`{!embedded && <FooterNote />}`).
- The seed string *"Seed corpus — operational stages (0076)"* renders as the customer-facing
  **Project** on the 46 operable live bookings — and is one of only two searchable columns.
- Cash Flow prints a collections *recommendation* derived from literals.
- "Save view" alerts success over a write nothing reads.
- New Purchase Request reports success and writes nothing (fabricated `PR-2026-NNNN`, row vanishes
  on reload).

**Class B — built but unreachable (5 instances).** LateFeePanel · the Quote stage no press can
produce · `quote_expires_at` no screen can set · an approved daily closing that can be neither read
back nor voided while a live unique index blocks re-approval · the two PWA jump-list shortcuts.

### Three promoted above their filed severity — all verified on live

1. **Four of five live staff accounts cannot sign in** (P2 → **P1**). `auth.users` = 1,
   `public.users` = 5, matched = **1**. `auth_user_role()` returns `'Client'` for anyone unmatched
   and the `_v` views gate on `auth_is_staff()`. This is a defect about *the audit* as much as the
   app: **every Warehouse / Admin / Coordinator claim in this document is repo-true with no live
   seat to test it from.**
2. **A Warehouse user creating a discounted booking loses the entire booking** (P2 → **P1**).
   Verified on live: `bookings_insert` and `booking_lines_all` both admit Warehouse;
   `booking_discounts` has exactly one policy, `booking_discounts_money_blind` (cmd ALL,
   `auth_can_view_money()`), and that function returns false for Warehouse/Technician/Driver/Client.
   `create_booking` is SECURITY INVOKER with no exception block, and `NewRental.tsx:2486` attaches a
   Manual discount whenever `discountPct > 0`. Header, lines and units are all lost to an opaque RLS
   error. **The only new defect that is a cross-layer interaction — policy × payload × role — which
   is exactly the class single-layer reading nearly missed.**
3. **The `Client` role is the unknown-identity fallback** (P2, reclassified as *architecture*).
   `STAFF_ROUTES` confines 3 URLs out of an 11-item nav — the client-side guard implements roughly a
   quarter of what its own comment claims. Latent today (`user_roles` = 0 rows); RLS is the real
   backstop.

Also newly verified and worth its own line: **0 of 190 completed bookings carry `actual_return_at`.**
No on-time-vs-late history exists at all, so late-return reporting is unmeasurable, not merely empty.

### What is now genuinely uncertain

**The 21 rows overturned in round one are now the least-verified block in the audit**, and nothing
said so until now. An overturn is a *single-pass verdict*: pass one said X, pass two said Y, and Y
was never itself attacked. Round two's structure gave them no scrutiny. At round two's observed
attacker error rate on contested rows (1 of 4), **an expected ~5 of those 21 are wrong.** They are
the highest-yield target for any round three — far more than re-attacking the 67 agreements.

Second: every mark whose truth is a snapshot of live corpus state (the hollow corpus, 0
`product_units`, 0 payments, 0 `client_memberships`, empty `storage.buckets`, `auth.users` = 1) is
settled as an *observation* and unsettled as a *verdict about the software*. Shelf life: one data
load.

---

## 10. What this method structurally cannot catch

Three passes have driven *reading* error close to zero. They have not touched, and cannot touch, any
of the following. The method is static text at a pinned commit plus catalogue interrogation of a
database: everything it finds is a property of artifacts at rest. **Nothing has been executed.**

- **(a) Arithmetic — the biggest hole by value.** Every question asked was "does A reach B", never
  "is the value correct". A row can be FULL, fully wired, fully policied, and compute the wrong rupee
  figure forever: VAT on the wrong base, rounding half-up vs banker's vs paisa truncation, deposit
  netted before or after tax, late-fee band boundaries off by an hour, proration on a partial day.
  This repo proves the class: a **BS↔AD off-by-one survived months** until a table was ported and
  revealed every date before 17 Jul 2026 was a day ahead. No grep finds that.
- **(b) Anything requiring the program to run.** Effect loops, stale closures, `key` collisions,
  `DomainEvents` subscribers drifting, a `focusout`-committing `DateField` that never commits because
  a modal steals focus. The `BsAdDate` finding (Tailwind classes that compile to nothing) was caught
  only because someone happened to remember Tailwind isn't in the app bundle — the identical defect
  in `CommandPalette` shipped for months.
- **(c) Concurrency and transaction semantics.** Lost updates with no `FOR UPDATE`, deadlock ordering
  between `bookings` and `booking_line_units`, a double-submitted Confirm, two operators scanning the
  same unit, two branches closing the same day. Single-user-invisible, two-user-fatal — and this
  audit has never had two users.
- **(d) Effective permissions vs declared ones.** `pg_policies` gives policy *text*. What a real seat
  can do is structurally unanswerable here, because `auth.users` holds one row.
- **(e) Intent.** The rubric asks "is it built and does it work", never "is this what Babin asked
  for". A screen can be FULL, wired, correct and fast, and implement the wrong workflow.
- **(f) Negative space.** MISSING is a mark on a row somebody wrote. A capability nobody thought to
  list produces no row and is invisible to 100% of passes. "Can an operator correct a mis-keyed
  payment?" has no row. The 108 is a list of things somebody imagined, audited to high precision;
  its *completeness* has never been tested by anything.
- **(g) Performance, scale, environment.** 246 bookings hides N+1s and missing indexes. The catalogue
  shows an index exists; it never shows the planner using it. Also out of frame: the Booqable proxy,
  edge functions, CORS, storage policies, email/SMS delivery, timezone, service-worker staleness.
- **(h) The correlated-reviewer problem.** Three passes shared one toolset, one commit and one
  rubric. Their agreement is evidence against misreading and **no evidence whatsoever** against
  (a)–(g). A fourth pass of the same kind would converge toward 0% while the real defect rate stayed
  where it is. Three of round two's four disputes were rubric arguments — what a method looks like
  when it has run out of facts and begun arguing with itself.

**What would break the ceiling, in yield order.** Each opens a class this method cannot see at all;
only the last needs new infrastructure.

1. Seed `auth.users` rows for the four staff identities **on a Supabase branch** and drive the app as
   Warehouse and Coordinator. Converts most repo-true RBAC and Law 6 claims into live-true ones —
   opens (d). ~1 day.
2. Property-based tests over money and BS↔AD dates against hand-computed expected values — opens (a).
   ~1 day.
3. Run the app: a scripted floor pass Pack → Handover → Return with a rendered-DOM probe — opens (b)
   and (f). ~1 day.
4. A two-session concurrency harness on booking creation and daily closing — opens (c).

---

## 11. Arithmetic probe — ceiling-breaker (a), executed 7 Sep 2026

§10(a) named arithmetic as the biggest hole by value: three rounds asked "does A reach B" and never
once "is the value correct". This section closes it for the client-side engine. **These are the first
executed checks in the entire audit** — code run against exact-decimal references, not read.

### The engine is sound — a genuinely good result

| Check | Method | Result |
|---|---|---|
| `price()` chain (subtotal → discount → taxable → VAT → total) | 457,144 combinations fuzzed against exact `BigInt` decimal arithmetic | **0 mismatches** |
| Float half-rupee boundaries | 33,714 of those land exactly on a `.50` boundary — the case where IEEE-754 error flips a rounding | **0 mismatches** |
| `grouped()` lakh digit grouping | ~120k values to 200,000,000 vs an independent reference implementation | **0 mismatches** |
| `roundHalfUp()` on negatives | reversals and credit notes | correct: `−1.5 → −2` (bare `Math.round` gives `−1` and would drift) |
| `lateFee()` band guards | read | correct — Full Day is only reachable at ≥120 min, so `Math.max(1, …)` is redundant, not a bug. **An on-time return is not charged.** |
| BS↔AD table (2078–2095) | year lengths + epoch arithmetic + real-world anchors | **sound.** All 18 years are 365 or 366 (14/4 split). Derived New Year dates match reality *including the irregular one*: 1 Baishakh 2081 = **13** Apr 2024, not 14. |
| The corrected BS anchor | derived from the table, not the test | 1 Shrawan 2083 = **2026-07-17** ✓ · 31 Jul 2026 = 2083-04-15 ✓ |

The §2.8 `REFERENCE_CASE` self-check at `money.ts:356` reconciles exactly — I recomputed all five
figures by hand. It is a real load-bearing guard, and worth keeping: it is asserted at module load
and reported (not thrown) so a broken engine cannot silently paint money on six screens.

The historical fraction-vs-percent unit bug (`invoices.vat_rate` stores `0.1300`; `price()` expects
`13` — a 100× error) **is genuinely fixed.** `createInvoice.ts:538` writes `vatPercent / 100` in the
right direction, and `finance.ts`'s `vatRate` has only two references — its type and its mapping —
and is never consumed by `price()`. No call site passes a fraction into `vatPercent`.

### But the VAT rate has three independent sources and none is authoritative

Verified on live and at HEAD:

| Source | Value | Scope |
|---|---|---|
| App UI — `settingsStore.vatRatePercent` | `13` | **`localStorage`, per browser, per device** (`settingsStore.ts:454,497`) |
| DB column — `invoices.vat_rate` | default `0.1300` | per invoice row |
| DB function — `recalculate_invoice_totals()` | **hardcodes `0.13`** | ignores the column entirely |

Confirmed by catalogue: `pg_get_functiondef(recalculate_invoice_totals)` contains `0.13` = **true**
and contains `vat_rate` = **false**. The `system_settings` table exists on live and holds **0 rows** —
the intended shared home for settings is empty. `0079`, which would make the column authoritative,
is **repo-only**.

**Consequence:** change the VAT rate in Settings ▸ Finance and (1) only that browser changes, (2) no
other machine or user sees it, (3) the database ignores all of it and computes at a hardcoded 13%.
Two coordinators on two laptops can quote different VAT on the same booking, and neither figure is
what the invoice would carry.

This is invisible to every wiring question the three rounds asked — the path *does* reach the engine,
and the engine *is* correct. It is exactly the class §10(a) predicted, and it is the reason the
arithmetic probe was worth running even though the engine passed.

### What this probe did NOT cover

`crewBilling()` (90 lines), `parseMoney()` round-trips, and **all** database-side money arithmetic —
the invoice-totals trigger, payment↔invoice sync, refund and reversal handling. Prior work already
records defects in that DB-side layer; none of it is re-verified here. The engine being sound says
nothing about the ledger being sound.

---

## 12. Round three — the 21 single-pass overturns

**Method.** Two independent blind lenses per row — **Lens A** judged *code reality* (does the path
exist and execute), **Lens B** judged *live reality* (would it work on production today) — then an
adjudicator on every three-way split, told explicitly not to average two deliberately-opposed
readings. 21 agents, 0 failures.

**Result: 8 disputes, the record fell on 5 of 21 = 23.8%.** §9 predicted "an expected ~5 of those 21
are wrong", derived from round two's 1-in-4 attacker error rate. **The estimator held exactly.**

| Feature | From | To | Lens A | Lens B |
|---|---|---|---|---|
| Advance / deposit tiers (4.1) | PARTIAL | **MISSING** | MISSING | PARTIAL |
| Roles — 8 + Manager, per-module grid (4.10) | FULL | **PARTIAL** | FULL | PARTIAL |
| Utilisation view (4.2) | MISSING | **PARTIAL** | PARTIAL | — |
| In-app notifications / digest (4.6) | PARTIAL | **MISSING** | MISSING | — |
| Shift handover / timesheet (4.4) | PARTIAL | **MISSING** | MISSING | MISSING |

The record stood on three, all where Lens A was *more generous* than the record and was overruled:
Return per-serial, Reset / cleaning queue (both A=FULL, record PARTIAL), and the Settings-numbering
assertion.

**The lens split is itself the finding.** Where A and B diverged, the divergence *was* the answer —
the deposit-tier row is the clean case: A found no engine in the file the row names, B found a live
readable `deposit_required` column and wanted to rescue it to PARTIAL. The adjudicator ruled MISSING
because the readable column is the *adjacent* feature (deposit amount), its only producer in the app
is a hardcoded `rupees(0)`, and 0 of 204 live products carry `deposit_percent`. A stored percentage
with a writer, no reader and no consumer is a data-entry field, not a tier engine.

### Final capability totals

| Mark | Audit | R1 | R2 | **R3 final** |
|---|---|---|---|---|
| FULL | 34 (31.5%) | 15 | 14 | **13 (12.0%)** |
| PARTIAL | 30 (27.8%) | 58 | 57 | **56 (51.9%)** |
| MISSING | 44 (40.7%) | 35 | 37 | **39 (36.1%)** |

13 + 56 + 39 = 108. **Not-FULL = 95/108 = 88.0%.** All five changes are capability rows; none
touches a module-score row.

**Marginal yield across three rounds: 28.8% → 4.2% → 23.8%.** The curve is not decaying — it is
*sorted*. Round two attacked rows that had already survived a dissent and found almost nothing;
round three attacked rows whose current mark had never been challenged and found plenty. **The
predictor of error is not how many times a row has been looked at, but whether its current verdict
has ever been argued against.** A fourth round of this kind is not justified: no block of
never-challenged verdicts remains.

### Two new P0s, both verified on live

1. **No staff seat can ever be created on production.** `public.users` has RLS enabled and exactly
   **one** policy — `users_select_own/SELECT`. **Zero INSERT, UPDATE or ALL policies.** Combined with
   `auth.users` = 1, the four staff identities cannot be onboarded through the application by anyone,
   including the Owner. §9's "four of five staff cannot sign in" is not a data gap that someone
   forgot to fill — it is **structurally unfixable from the app**. Promote to P0.
2. **`anon` can forge *and* TRUNCATE `audit_events`.** Confirmed again: `has_table_privilege('anon',
   'audit_events','TRUNCATE')` = true, RLS on, `log_audit_event` bound to 6 of 124 tables.

And a direct extension of §11: **unchecking "Include VAT" still bills 13%.** The app correctly sends
`vatPercent: includeVat ? vatRatePercent : 0` (`CreateInvoiceModal.tsx:224`), but
`recalculate_invoice_totals()` hardcodes `0.13` and never reads `vat_rate` — so the database charges
tax the operator explicitly declined. Latent only because no invoice can be created at all.

---

## 13. Baseline drift — the repo moved 9 commits during this audit

Everything above is pinned to `23e8eb0`, which is correct method. It is also now historical.

**HEAD is `2950cc0`, nine commits later**, and two new migrations landed: `0094`
(`booking_stage_transitions` is the sole door) and `0095` (`views_are_read_only`). Several commits
address findings in this report — `b4c4822` "*the masking views stop accepting writes, and the
numbering stops truncating*", `2950cc0` "*Confirm can work on the live catalogue*", `34cfaae`
"*Add Equipment: the warehouse picker offered four facilities that do not exist*".

Two corrections follow:

- **"No repo migration revokes TRUNCATE" is false at current HEAD.** `0095` does exactly that
  (`revoke insert, update, delete, truncate on all tables in schema public from anon`). The *live*
  exposure stands; the repo fix exists.
- **The lag is now thirteen migration FILES.** Live is still `0078_daily_closings`
  (re-checked 7 Sep). The repo went 0093 → 0095 while production received nothing.

  ⚠ **Counting correction.** Earlier drafts of this report said "fifteen" and then "seventeen"
  migrations. Both counted NUMBERS, not FILES. `0081`–`0084` do not exist — they are the numbering
  gaps recorded in §0. The unapplied set is **thirteen files**: 0079, 0080, 0085–0095.

**That is the most important structural fact in this document.** The repo is fixing faster than
production is receiving, so the gap *widened* during the audit. Every fix landing in
`supabase/migrations/` — including the two that close this report's own top security and numbering
findings — is invisible to the only database that has customers' data in it. Until a migration
actually applies, "fixed" and "not fixed" look identical from production.

---

## 14. Migration dry-run — would `db push` work? No.

§5 said "nobody has dry-run these against production's actual drift." This does it: one analysis per
file, every precondition checked against the live catalogue, every constraint counted against the
246 real bookings. Read-only throughout — no DDL was executed.

**Verdicts: 5 WOULD_APPLY · 6 RISKY · 2 WOULD_FAIL.**

### The order — and a stale note that would break it

**Plain ascending filename order is dependency-correct.** Every hard constraint is satisfied by it,
and the `0081`–`0084` gaps are inert (no file references them):

`0079 → 0080 → 0085 → 0086 → 0087 → 0088 → 0089 → 0090 → 0091 → 0092 → 0093 → 0094 → 0095`

| Constraint | Why it matters |
|---|---|
| **0080 before 0087** | Both `CREATE OR REPLACE sync_payment_to_invoice()`. 0080 last silently reverts 0087's refund filter and reversal re-sync — and 0080's own post-conditions would not notice. |
| **0085 before 0088** | 0088's first executable statement guards on `bookings_booking_no_is_digits`, which only 0085 creates. **And 0085 must COMMIT in a separate earlier transaction** — a non-concurrent index build scans with `SnapshotAny` and would hit `22P02` on 0085's own recently-dead `B-<n>` tuples. `db push` runs files separately, so this holds. |
| **0085 before 0089** | 0089's mint probe computes `B-918`/`B-919`, finds both already in `bookings`, and raises — naming 0085 in the error text. |
| **0093 before 0095** | 0095 exists to clean up after 0093. 0093's `grant insert/update on ALL TABLES` includes the 26 `_v` views (the SEC-01 hole) and its `alter default privileges … to anon` restores the default ACL. **0093 has no post-condition that tests a view or anon's write shape** — run after 0095 it would report success while re-opening the hole. |

⚠ **A working note recorded elsewhere gives the order as `0089 → 0085 → 0088`. That is stale and
would abort.** The 6 Sep patch to 0089 inverted the dependency. Correct order is filename order.

### The two hard failures, both proven against live data

- **`0088`** — fails on its *first* executable statement. `bookings_booking_no_is_digits` does not
  exist live (16 constraints on `bookings`; that is not one of them). Second-order: `(booking_no)::bigint`
  is invalid for **246 of 246** live rows — `select (booking_no)::bigint from bookings limit 1` returns
  `22P02: invalid input syntax for type bigint: "B-899"`.
- **`0089`** — fails on its own post-condition. Counter at 917 mints `B-918`/`B-919`; both exist in
  `bookings`. **28 live bookings sit *above* the counter** (max `B-945`), so the counter is behind
  its own data. The whole file rolls back, including the formatter fix and the `transfer` sequence
  insert.

### Four blockers to clear first — all independently verified

1. **`0085`'s safety gate cannot fire.** It classifies a booking as a real Booqable order only via an
   `external_refs` row with `entity='orders'`. Live `external_refs` holds **clients=100, products=71,
   orders=0** — the order import never ran. So the "is this a real order?" count is structurally 0
   and the gate passes unconditionally, *including in the exact scenario it was written to refuse*.
   **A gate that cannot fail is not a gate.**
2. **`0085` renumbers all 246 bookings irreversibly**, `B-<n>` → bare digits, changing the
   externally-known identity of every booking already printed on client paper. It then re-points the
   counter to 899 so the next mint is **900** — after moving the 46 seed bookings out of 900–945 to
   free that band (46 rows confirmed in range). Whether the OS owns 900–945 while Booqable still
   issues is **PLAN §4.48, open**. There is no down migration. Close the ruling in writing first.
3. **`0092` commits an unaudited write to a real product.** Its post-condition has an escape hatch —
   `if not has_table_privilege('authenticated','products','UPDATE') then return` — written for a
   scratch rebuild. On live that hatch **does not fire**: `has_table_privilege` returns **true**
   (platform default ACL). So the probe's `update products set updated_at = now()` runs for real
   against a production row, inside the file's own `begin/commit`. `products` has **0 non-internal
   triggers**, so the prior value is written nowhere and cannot be recovered. Fix: wrap the probe in
   a rollback-sentinel sub-block, the pattern 0094 and 0095 already use.
4. **Do not split the batch.** If §4.48 stalls and someone pushes everything *except* 0085: 0079,
   0080, 0086, 0087 apply, then **0088 aborts and the push stops** — 0089–0095 never land. That
   leaves `0086` applied without the formatter fix, so `next_document_number('invoice')` still
   truncates: `'INV-'||lpad('121',1,'0')` and `lpad('122',1,'0')` are **both `INV-1`**. The first
   tax invoice ever issued succeeds; the second raises `23505`. The formatter fix ships in **both**
   0085 and 0089 (byte-identical bodies), so a full run closes this three files early and it never
   arms. **Apply 0085 or apply nothing — there is no safe subset containing 0086.**

### One RISKY finding worth its own line

**`0080` removes the only mechanism that moves an invoice out of `Draft`, and nothing replaces it.**
No issue-invoice function exists live; `createInvoice.ts` writes `status: 'Draft'` and no action ever
updates it. Meanwhile `finance.ts:320` defines `UNSETTLED_INVOICE_STATUSES = ['Sent','Partially Paid']`
and feeds three read paths, one of which is the Daily Closing's outstanding figure. After 0080 a
part-paid invoice stays `Draft` — so **money owed disappears from receivables, the outstanding list
and Daily Closing**. Latent today (0 invoices, 0 payments); arms on the first invoice.

### What static analysis still cannot tell you

Whether the files actually apply. This is precondition reasoning against a catalogue, not an
execution. Lock contention, trigger interaction under real concurrency, statement timeouts on the
246-row backfill, and anything depending on execution order *within* a statement remain unknown.
The cheapest way to close that gap is a throwaway database that mirrors production's state at 0078 —
**not** a Supabase branch, which builds fresh from all migrations and would therefore never reproduce
the `B-<n>` collisions that cause both hard failures.
