# Booqable Research — Search System Architecture

**Document Type:** Empirical Interaction Analysis & Technical Deconstruction  
**Subject:** Booqable Admin Backend UI (Search Architecture)  
**Target Adaptation:** Babin Rentals OS  

---

## 1. Global vs List-Scoped Search Architecture

Booqable utilizes two distinct tiers of search:
1. **Global Omnibox (Cmd+K / Ctrl+K):** Header-level modal search reaching across multiple tenant entities simultaneously.
2. **Table-Scoped List Search:** Dedicated searchbox embedded in the table toolbar of `/orders`, `/product_groups`, and `/customers`.

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ Global Topbar Search (Universal Cmd+K)                                                 │
│ [ 🔍 Search orders, products, customers...                             Ctrl+K ]         │
└────────────────────────────────────────────────────────────────────────────────────────┘
                                     │
                                     ▼ (Opens Modal Overlay)
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ 🔍 |Type to search...                                                                 │
│ ────────────────────────────────────────────────────────────────────────────────────── │
│ RECENT SEARCHES:                                                                       │
│  #B-854 · Bikash Shrestha (Kathmandu Jazz Festival)                                  │
│  Sony FX3 Cinema Line Camera (EQ000214)                                              │
│ ────────────────────────────────────────────────────────────────────────────────────── │
│ BOOKINGS (2):                                                                          │
│  #831 · Annapurna Media Pvt. Ltd. · 14 Jul 2026                                      │
│  #854 · Bikash Shrestha · 24 Jul 2026                                                │
│ ────────────────────────────────────────────────────────────────────────────────────── │
│ PRODUCTS (1):                                                                          │
│  RED Komodo 6K · 2 units in stock                                                    │
│ ────────────────────────────────────────────────────────────────────────────────────── │
│ CUSTOMERS (1):                                                                         │
│  Bikash Shrestha · +977 9841234567                                                   │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Table-Scoped List Search Specification

### 2.1 Configuration Schema

```json
{
  "search_component": "TableListSearch",
  "placement": "Table toolbar, left-aligned, adjacent to filter toggle",
  "dimensions": {
    "width": "240px to 320px responsive",
    "height": "36px (Desktop), 44px (Tablet/Mobile)"
  },
  "search_as_you_type": true,
  "debounce_interval_ms": 300,
  "min_character_threshold": 1,
  "clear_affordance": "Inline trailing (✕) icon button, visible when query length > 0",
  "url_parameter": "q",
  "hotkey": "/",
  "interoperability": {
    "operates_with_filters": true,
    "logic": "AND (filters restrict query set, query searches within filtered results)",
    "empty_state_action": "Clear search without resetting filters"
  }
}
```

### 2.2 Searchable Entities & Matching Rules by Page

#### A. Orders / Bookings (`/orders`)
- **Order Number:** `#831`, `831`, `B-854` (case-insensitive, prefix or exact match).
- **Client / Customer Name:** First name, last name, or corporate legal name (`Bikash`, `Annapurna`).
- **Client Email / Phone:** E.164 phone formats (`+977...`, `9841...`) and email domain queries.
- **Product Title in Lines:** Matches orders containing specific equipment (e.g. typing `Komodo` lists all bookings containing RED Komodo).
- **Barcode / Serial Number Tag:** Typing a serial or barcode tag matches the booking that currently has that asset allocated.

#### B. Inventory / Products (`/product_groups`)
- **Product Title:** Primary identifier (`Sony FX3`, `Aputure 600d`).
- **SKU / Model Number:** Internal part numbers (`ILME-FX3`, `AP-600D-PRO`).
- **Barcode / Serial Number:** When searching a serial tag (`EQ000214`), highlights the parent product group and expands to show the matching unit.
- **Brand / Manufacturer:** Matches brand tags (`Sony`, `RED`, `DZOFilm`, `Sennheiser`).

#### C. Customers (`/customers`)
- **Full Legal Name:** Both individual and contact representative names.
- **Company Name:** Corporate legal entity.
- **Email Address & Phone Number:** Substring matches.
- **Address / City:** Substring search (`Kathmandu`, `Boudha`, `Pokhara`).
- **Customer Notes:** Matches customer dossier internal remarks.

---

## 3. Search & Filter Interaction Mechanics

### 3.1 Compound Filtering & Search Pipeline

A common operator workflow is:
> *"Show me all Unpaid orders for client Bikash Shrestha that are starting Today."*

Booqable evaluates this compound query via the URL parameter structure:
```http
GET /orders?q=Bikash&statuses[]=reserved&payment_statuses[]=unpaid&starts_from=2026-09-26T00:00:00Z&starts_to=2026-09-26T23:59:59Z
```

1. **Query Construction:**
   - Filters form the SQL `WHERE` clause scope (`status IN ('reserved') AND payment_status IN ('unpaid')`).
   - The `q` parameter applies full-text search indexing across client, order number, and product titles.
2. **Result Count Updates:**
   - The list header updates dynamically: `3 results found for "Bikash"`
   - Active facet counts in the side rail re-calculate relative to the current search query! (e.g. `Reserved (1)` instead of `Reserved (14)`).

### 3.2 Clear & Reset Affordance

- **Inline Clear `(✕)`:** Pressing `Escape` or clicking `(✕)` inside the search input clears the `q` parameter while **preserving all active filters**.
- **Empty State Fallback:**
  When a search yields 0 records under active filters:
  ```
  ┌─────────────────────────────────────────────────────────────────┐
  │                 [ 🔍 Empty Search Icon ]                         │
  │                  No bookings found for "Arri"                   │
  │   Try adjusting your search or clearing active filters to see   │
  │   all available orders.                                         │
  │                                                                 │
  │   [ Clear search "Arri" ]      [ Reset all filters ]            │
  └─────────────────────────────────────────────────────────────────┘
  ```
  Providing two separate clear buttons prevents the operator from accidentally blowing away their carefully selected multi-facet filters.

---

## 4. Booqable Limitations & Babin Rentals OS Recommendations

| Booqable Limitation | Behavioral Issue | Babin Rentals OS Architectural Improvement |
|---|---|---|
| **No Barcode Scanning Mode in Searchbox** | Standard searchbox does not handle rapid hardware scanner inputs with carriage return (`\n`). | Add a dedicated `ScannerMode` trigger that traps high-speed keyboard wedge inputs and auto-routes to equipment verification. |
| **No Multi-word Token Highlighting** | Search results do not bold or highlight which word or serial matched the row. | Implement `<Mark>` highlighting in table cells to show why a booking was returned by the search. |
| **Slow Full-text In-memory Lag** | Booqable experiences noticeable latency when searching large product catalogs (>1,000 items). | Use Postgres generated `tsvector` columns with GIN indexing (`pg_trgm`) for sub-10ms fuzzy matching across Roman and Nepali transliterations. |
| **No Recent Searches Dropdown** | Table search does not store operator search history. | Provide a 5-item recent search dropdown on focus for high-frequency client lookup. |
