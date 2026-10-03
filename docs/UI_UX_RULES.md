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

