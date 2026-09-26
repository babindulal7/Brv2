# Booqable Quick Action System — Component Models & Interaction Breakdown

**Document Version:** 1.0.0  
**Research Target:** Booqable Admin Backend (`https://babin-rentals.booqable.com/orders/8b04f58b-4d90-452e-abd2-35e9c148b3e9`)  
**Derived Target:** Babin Rentals OS Context Actions & Operational Drawers  
**Reference Evidence:** `screenshots/08-quick-action-panel-open.png` through `12-more-actions.png`

---

## 1. Architectural Philosophy & Component Hierarchy

Booqable structures its order operations around a **high-visibility, state-driven speed panel**. Rather than requiring staff to navigate disparate menus or sub-pages to execute transitions, the top-right header acts as a deterministic cockpit. The primary verb dynamically morphs based on the order's current operational state:

```
Order State: Draft     ──> Primary Action: [ Reserve ] (Blue)
Order State: Reserved  ──> Primary Action: [ ^ Pickup ] (Orange Split Button)
Order State: Started   ──> Primary Action: [ Return ] (Green Primary)
Order State: Returned  ──> Primary Action: [ Close / Archive ] (Neutral)
```

### 1.1 Structural Layout Model
```
┌────────────────────────────────────────────────────────────────────────────┐
│ Order Detail Action Header                                                 │
│                                                                            │
│ ┌───────────────────────────┐    ┌───────────────────────────────────────┐ │
│ │ Order Identity & Status   │    │ Action Cluster                        │ │
│ │ #1039 · [Reserved Badge]  │    │ [More Actions ▾] [Secondary] [Primary]│ │
│ └───────────────────────────┘    └───────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────────────────┘
                                   │
                  ┌────────────────┴────────────────┐
                  ▼                                 ▼
┌───────────────────────────────────┐ ┌──────────────────────────────────────┐
│ Operational Handover/Return Modal │ │ Dual-Column Payment Dialog           │
│                                   │ │                                      │
│ ┌───────────────────────────────┐ │ │ ┌──────────────────┬───────────────┐ │
│ │ ActionHeader & Client Context │ │ │ │ Financial Summary│ Payment Rails │ │
│ ├───────────────────────────────┤ │ │ │ Subtotal         │ [Credit Card] │ │
│ │ ItemChecklist                 │ │ │ │ VAT 13%          │ [Pay Link]    │ │
│ │  ├[x] Sony FX3A [SN: 1042]    │ │ │ │ Total Due        │ [Cash / Other]│ │
│ │  ├[x] Sigma 24-70 [SN: 8810]  │ │ │ │ ──────────────── │ ───────────── │ │
│ │  └[x] 99Wh V-Mount [SN: 331]  │ │ │ │ Deposit Liability│ Amount Input  │ │
│ ├───────────────────────────────┤ │ │ └──────────────────┴───────────────┘ │
│ │ BarcodeScannerDock            │ │ ├──────────────────────────────────────┤
│ ├───────────────────────────────┤ │ │ Sticky Execution Footer              │
│ │ Sticky Execution Footer       │ │ │ [Cancel]           [Register Payment]│
│ │ [Scan]   [Pick up 8/8 items]  │ │ └──────────────────────────────────────┘
│ └───────────────────────────────┘ │
└───────────────────────────────────┘
```

---

## 2. Component Specifications

### 2.1 Component 1: `QuickActionButton` (State-Adaptive Primary / Secondary CTA)
The primary execution trigger located in the order header and table row action bar.

* **DOM Role / Tag:** `<button type="button" class="btn-quick-action btn-primary" aria-label="Pick up 8 items">`
* **Visual Variants:**
  - **Primary State Action:** Filled background (`#F97316` orange for Handover/Pickup, `#16A34A` green for Return, `#2563EB` blue for Reserve).
  - **Secondary Supporting Action:** Bordered/ghost button (`border: 1px solid #D1D5DB`, text `#374151`, background `#FFFFFF`).
  - **Split Button (`^ Pickup`):** Contains a left action label and a right split chevron button that reveals immediate fast-action shortcuts (e.g. *Pick up all without scanning*, *Partial pickup*).
* **Geometry:**
  - Height: `38px` (desktop), `44px` (touch-screen / mobile compliance).
  - Padding: `0 16px` (standard), `0 10px` (split chevron section).
  - Border radius: `6px`.
* **Interactive States:**
  - `Hover`: Background `darken(10%)`, `box-shadow: 0 1px 3px rgba(0,0,0,0.1)`.
  - `Disabled`: Opacity `0.5`, `cursor: not-allowed`, background `#9CA3AF`.
  - `Loading`: Spinner replaces leading icon; label text updates to *"Processing..."*.

---

### 2.2 Component 2: `ActionModal` / `ActionDrawer` (Handover & Return Cockpit)
The operational workspace where physical asset validation occurs.

* **DOM Role / Tag:** `<dialog role="dialog" aria-modal="true" aria-labelledby="action-modal-title">`
* **Geometry & Layout:**
  - Width: `680px` max (desktop center modal) or `480px` slide-over drawer anchored to the right viewport edge.
  - Height: `max-height: 85vh` with fixed header, scrollable body, and sticky bottom footer.
  - Border radius: `8px`.
  - Backdrop: `background: rgba(15, 23, 42, 0.65)`, `backdrop-filter: blur(4px)`.
* **Section Anatomy:**
  1. `ModalHeader`: Title (`"Pick up items"` or `"Return items"`), subtitle (Order `#1039` · Saugat Dhital), close button `[×]`.
  2. `ModalBody`: Scrollable item checklist with group headers (e.g. *Main Cameras*, *Lenses*, *Accessories*).
  3. `ModalFooter`: Sticky at bottom, contains scanner shortcut button on the left and primary confirmation CTA on the right.

---

### 2.3 Component 3: `ActionHeader`
Summarizes the order context, client identity, and operational stage.

* **DOM Structure:**
  ```html
  <header class="action-header">
    <div class="action-header-left">
      <h2 id="action-modal-title" class="action-title">Pick up items</h2>
      <div class="action-subtitle">
        <span class="order-ref">Order #1039</span>
        <span class="bullet-divider">·</span>
        <span class="client-name">Saugat Dhital</span>
        <span class="bullet-divider">·</span>
        <span class="rental-window">Sep 26, 06:00 – Sep 28, 06:00</span>
      </div>
    </div>
    <button type="button" class="btn-close" aria-label="Close modal">
      <svg class="close-icon">...</svg>
    </button>
  </header>
  ```
* **Typography:**
  - Title: `18px` / `font-weight: 700`, color `var(--text-primary, #111827)`.
  - Subtitle: `13px`, color `var(--text-muted, #6B7280)`.

---

### 2.4 Component 4: `ItemChecklist`
The interactive verification list where individual serial numbers and line items are confirmed.

* **DOM Structure:**
  ```html
  <div class="item-checklist" role="list">
    <div class="checklist-group">
      <div class="checklist-group-title">Camera Packages (1)</div>
      <div class="checklist-item" role="listitem">
        <input type="checkbox" id="item-chk-1" checked class="item-checkbox" />
        <label for="item-chk-1" class="item-details">
          <span class="item-name">Sony FX3A Cinema Line Body Kit</span>
          <span class="item-serial-chip">SN: 1042-FX3</span>
        </label>
        <span class="item-status-pill verified">Scanned</span>
      </div>
    </div>
  </div>
  ```
* **Item Row Layout:**
  - Height: `48px` minimum.
  - Padding: `8px 12px`.
  - Alternating or bordered: `border-bottom: 1px solid #F3F4F6`.
  - Serial Chip: `font-family: monospace`, `font-size: 11px`, background `#F3F4F6`, padding `2px 6px`, border-radius `4px`.
* **Verification States:**
  - `Pending`: Checkbox empty, gray outline.
  - `Scanned / Verified`: Checkbox filled green, row background `#F0FDF4`, badge text *"Scanned"*.
  - `Missing / Flagged`: Red alert chip, warning border.

---

### 2.5 Component 5: `BarcodeScannerDock`
The real-time scanning interface embedded within the handover modal or floating at the bottom.

* **DOM Structure:**
  ```html
  <div class="barcode-scanner-dock">
    <div class="scanner-input-group">
      <svg class="barcode-icon">...</svg>
      <input type="text" placeholder="Scan barcode or type serial..." class="scanner-input" autofocus />
      <button type="button" class="scanner-camera-btn" title="Open camera scanner">
        <svg class="camera-icon">...</svg>
      </button>
    </div>
    <div class="scan-feedback" role="status" aria-live="polite">
      Ready for barcode input (8 items remaining)
    </div>
  </div>
  ```
* **Behavior:**
  - Input field maintains persistent autofocus during scanning mode.
  - Auto-submits on `Enter` keypress (standard hardware barcode wedge scanner behavior).
  - Emits acoustic feedback: single chime on successful match, error buzz on unknown barcode or item not belonging to order.

---

### 2.6 Component 6: `PaymentModal` (Dual-Column Split Settlement Dialog)
The financial reconciliation dialog triggered by `"Register payment"` or `"New payment"`.

* **DOM Structure:**
  - **Container:** `max-width: 760px`, dual-column grid (`grid-template-columns: 300px 1fr`).
  - **Left Column (Summary & Totals):**
    - Subtotal, Discount line, 13% VAT line, Grand Total.
    - Security Deposit line (strictly separated as liability).
    - Amount Paid to date, Total Outstanding Due (`highlighted in bold red`).
  - **Right Column (Payment Processing Rails):**
    - Allocation toggle: `[ Order Amount ]` vs `[ Security Deposit ]`.
    - Payment Rail Selectors (Radio Cards):
      1. `Credit Card` (with Stripe / gateway integration).
      2. `Payment Link` (SMS / WhatsApp / Email direct checkout URL).
      3. `Cash / Other` (Bank Transfer, Fonepay QR, Cash on Hand).
    - Amount Input: Pre-filled with total outstanding due.
    - Reference / Note Input: Optional transaction ID.
* **Footer Actions:**
  - Secondary: `[ Cancel ]`
  - Primary: `[ Register Payment ]` (Disabled if amount $\le 0$ or exceeds ceiling).

---

### 2.7 Component 7: `MoreActionsKebab` (Secondary Actions Menu)
Dropdown menu anchoring contextual operations that do not warrant prominent header button real estate.

* **DOM Role / Tag:** `<div class="dropdown-menu" role="menu">`
* **Trigger:** Icon button `[...]` (Kebab) or `[ More actions ▾ ]`.
* **Menu Items by Category:**
  - **Printing / Documents:**
    - `Print picklist` (Opens formatted warehouse staging sheet).
    - `Print packing slip` (Client gear manifest).
    - `Generate / Download Invoice` (VAT compliant PDF).
  - **Communication:**
    - `Email quote / invoice` (Opens pre-filled email modal).
    - `Send WhatsApp handover link`.
  - **Lifecycle Modifications:**
    - `Duplicate / Clone booking`.
    - `Extend rental period` (Check availability and add days).
    - `Apply manual discount` (Subject to Law 10 approval gates).
    - `Cancel booking` (Requires reason, triggers deposit release or cancellation fee).

---

## 3. Operational State Transition Flow

```
┌────────────────────────────────────────────────────────────────────────┐
│ State: DRAFT                                                           │
│  - Primary: [ Reserve ] ──> Commits inventory stock                    │
│  - Secondary: [ Add Items ], [ Send Quote ]                            │
│  - Financial Gate: Advance payment required if Total >= 5,000          │
└────────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌────────────────────────────────────────────────────────────────────────┐
│ State: RESERVED                                                        │
│  - Primary: [ ^ Pickup ] (Orange) ──> Opens Handover Modal             │
│  - Secondary: [ Pack Items ], [ Register Payment ]                     │
│  - Hardware Gate: All barcodes scanned + client ID verified            │
└────────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌────────────────────────────────────────────────────────────────────────┐
│ State: ON RENT / STARTED                                               │
│  - Primary: [ Return ] (Green) ──> Opens Check-In & Inspection Modal   │
│  - Secondary: [ Extend Rental ], [ Report Incident / Swap Gear ]       │
│  - Temporal Gate: Flags Overdue if current time > stops_at + 30 mins   │
└────────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌────────────────────────────────────────────────────────────────────────┐
│ State: RETURNED                                                        │
│  - Primary: [ Reset / Inspect ] ──> Runs technical bench QC            │
│  - Secondary: [ Settle Deposit ], [ Issue Final Invoice ]              │
│  - Law Gate: RETURNED ≠ AVAILABLE until Job: Reset completes           │
└────────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌────────────────────────────────────────────────────────────────────────┐
│ State: CLOSED                                                          │
│  - Primary: [ Archive ]                                                │
│  - Status: Read-only, immutable history                                │
└────────────────────────────────────────────────────────────────────────┘
```
