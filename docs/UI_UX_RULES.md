# Babin Rentals OS — UI / UX Rules & Design Standards

**Authority:** Binding UI Engineering Rules  
**Last Reconciled:** 23 September 2026

---

## 1. The #1 Product Priority: Ease of Use (R-39)

**Fewest clicks is the #1 product priority (Ruled 19 Sep 2026, R-39).**  
Ease of use outranks visual flourish while remaining subordinate to non-negotiable architectural laws, safety gates, and permissions.

- **Tap Budget Doctrine:** Every user flow carries an explicit tap budget measured from user intent to committed completion. Any flow exceeding its budget is treated as a defect.
- **Defaults Are Doctrine:** Any input field that can be safely inferred, auto-selected, or prefilled with a sensible default must be prefilled. Avoidably empty fields are defects.
- **In-Place Workspaces:** Prefer inline drawers and persistent workspaces over multi-page navigation hops. Avoid wizard patterns (`Previous`/`Next`) for complex records like New Rental.

---

## 2. Design Tokens & Anti-Drift (R-40)

- **Typography System:**
  - Display / Headlines: `--font-display` (`Outfit`, sans-serif)
  - Body / UI: `--font-body` (`Source Sans 3`, sans-serif)
  - Identifiers, Barcodes, Booking Numbers: `--font-id` (`JetBrains Mono Variable`, monospace)
  - *Banned Fonts:* `Inter` is not used anywhere in the codebase.
- **Color System:**
  - Warm dark theme default with gold accents (`#d8a93a`) and blue workspace accents (`#3b82f6`).
  - Strict token consumption: Use semantic CSS variables (`var(--app)`, `var(--card)`, `var(--border)`, `var(--text-primary)`, etc.). Never introduce hardcoded hex colors or untracked Tailwind palette classes.

---

## 3. Responsive Breakpoints & Sizing (Laws 13 & 14)

- **Canonical Breakpoints:**
  - **Mobile:** `360px` to `767px`
  - **Tablet:** `768px` to `1279px`
  - **Desktop:** `1280px` and above
  - *Legacy Note:* The older `1180px` desktop breakpoint is strictly superseded.
- **Touch Target Floor:**
  - **Primary Floor Verbs:** Minimum **56px** height (Pack, Handover, Return, Reset, Confirm).
  - **Secondary / Desktop Actions:** Minimum **44px** height.
  - Form inputs and clickable rows must satisfy the 44px/56px target floor to ensure mistake-free warehouse operation on touch screens.
- **Orientation & Platform Independence (Law 14):**
  - Layout components must not branch based on user-agent or platform (`isMobile`, `isDesktop`). Layouts respond purely to CSS media queries and container bounds.

---

## 4. Interaction & Feedback Invariants

- **Law 11 — Never Color Alone:** Every status indicator (e.g. `Packed`, `On Rent`, `Overdue`) must pair color with unambiguous text labels, distinct icons, and accessible aria attributes.
- **Law 12 — Inline Errors, Success-Only Toasts:**
  - Form validation failures, database refusals, and constraint conflicts render **inline** next to the relevant field or action.
  - Toast notifications are reserved strictly for asynchronous successes and carry optional direct navigation links.
- **Law 15 — Vocabulary:**
  - The term "customer" is banned from UI copy, buttons, labels, and placeholders. They are always "clients".
- **Law 16 — No Fake Intelligence:**
  - No speculative or mock AI assistant cards, fake recommendation chips, or fabricated compliance badges. Every UI element must correspond to a live data model or operator action.

---

## 5. Authoritative Domain Glossary (Law 15 Reconciliation)

To eliminate copy drift across modules and floor touchpoints:

- **Rental vs. Booking:**
  - Use **"Rental"** for the client-facing transaction, commercial lifecycle, order, and operator views (e.g. *New Rental*, *Rental Agreement*, *Active Rentals*).
  - Use **"Booking"** strictly for internal database reservations, monotonic numbering (e.g. `BK-2026-0001`), and schema-level stage state machines.
  - Never mix both terms within the same button or header.
- **Equipment vs. Unit vs. Gear:**
  - Use **"Equipment"** for inventory catalog records, categories, and generic item listings.
  - Use **"Unit"** for physical serialized assets or bulk inventory instances in the warehouse.
  - Banned terms: *Gear*, *Item-kit*, *Hardware*, *Machinery*, *Apparatus*.
- **Client vs. Customer:**
  - Exclusively **"Client"**; the term *Customer* is prohibited in all copy, accessibility names, and code identifiers.
- **Modal Confirmations:**
  - Browser-native `window.confirm()` or `window.alert()` are strictly prohibited; all destructive or unsaved-state confirmations must use `ConfirmDialog`.


## 11. Shared Add / Edit / Booking workspace pattern (ruled 6 Oct 2026)

One composition for every record screen, so Add and Edit differ only by prefilled values and the primary label. The semantic roles below are the contract; styling comes from the existing tokens and Card treatment (no new imagery, motion or layouts).

| Role | Component | Rule |
|---|---|---|
| Workspace | `RecordWorkspace` | Body column plus summary rail. Rail is sticky at >=1280px (`src/lib/breakpoints.ts`) and flows below the sections under it |
| Section | `RecordSection` | One Card per section in the fixed order below. Essential sections never collapse; optional sections collapse while empty (`collapsible`, `defaultOpen`, `collapsedHint`). Collapsed content stays mounted |
| Error summary | `RecordErrorSummary` + `focusRecordField` | `role="alert"` list; each entry is a button that opens the owning section and focuses the control. Field errors also render inline (`aria-invalid`, `aria-describedby`) |
| Action bar | `RecordActions` | One persistent bar: **Cancel / Create** or **Cancel / Save changes**. Booking creation adds Save draft / Confirm booking via `extra`; creating a client or equipment adds **Create & add another** via `extra` (saves, clears the form, mints a fresh `client_uuid` — never on an edit or a bundle) |
| Leave guard | `useUnsavedRecord` + `UnsavedLeaveDialog` | Active only while dirty. Cancel and link clicks ask; clean forms never prompt |

Section order: Client = Identity > Contact > Addresses > Commercial details > Notes. Equipment = Identity > Units & location > Purchase > Pricing > Maintenance & notes. Bundle = Identity > Components > Rates > Summary. Booking = Client & schedule > Equipment, bundles & services > Crew & delivery > Pricing & terms.

Behaviour contract: entries survive a failed save; one idempotency key per unchanged content (a changed form mints a new one); duplicate submits are blocked while busy; success is shown only after the write is confirmed; a concurrent-change refusal keeps the draft and offers **Reload latest record**; focus moves to the error box after a failed save; return navigation keeps every query parameter except `action` (and `tab=new` on create).
