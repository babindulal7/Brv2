# Forecasting & AI

Route `/reports/forecasting` · `src/modules/reports/ForecastingReports.tsx` · 197 lines

Status: **Seed-only**

---

## 1. What it is

A read-only report screen: four key-figure cards and three forecast tables (purchase
recommendations, predicted maintenance, seasonal demand), every figure read from the constant
arrays in `src/data/forecastingReports.ts:3-26`.

It has no query file, no action dispatch and no filter controls — its only two working controls
are the shared toolbar's CSV and Print buttons (`src/components/ui/ReportToolbar.tsx:608-617`).

The whole screen is gated behind money visibility (`src/modules/reports/ForecastingReports.tsx:57`),
so a money-blind role sees a Restricted state and nothing else.

---

## 2. What renders

Top to bottom at desktop:

| # | Element | Lines |
|---|---|---|
| 1 | `PageHeader` — `activity` icon, "Forecasting & AI", "Predictive models for revenue, purchases, and maintenance." | `ForecastingReports.tsx:74-78` |
| 2 | `ReportToolbar` — renders only the **CSV** and **Print** buttons | `ForecastingReports.tsx:85` |
| 3 | `<section aria-label="Key figures">` — a 4-column grid of `ForecastKpiCard`: Forecast Revenue · Expected Bookings · Predicted Shortages · Forecast Accuracy | `ForecastingReports.tsx:87-116` |
| 4 | `ReflowRail` wrapping a column of three card sections | `ForecastingReports.tsx:118-194` |
| 4a | "Inventory Purchase Forecast" table — Category · Recommended Item · Reason / Formula · Confidence | `ForecastingReports.tsx:120-142` |
| 4b | "Maintenance Forecast" table — Asset ID · Item · Predicted Service Date · Trigger · Priority | `ForecastingReports.tsx:144-168` |
| 4c | "Seasonal Demand Outlook" table — Event / Period · Dates · Expected Lift · Top Categories | `ForecastingReports.tsx:170-192` |

The toolbar draws no date picker, no branch select and no compare select: `ReportToolbar` renders a
control only when the page passes its capability prop (`ReportToolbar.tsx:520`, `:575`, `:595`), and
this page passes only `title` and `csv` (`ForecastingReports.tsx:85`).

### Responsive bands

The file reads **both 768 and 1180**, indirectly — it imports no breakpoint itself, but both hooks
it calls resolve through `useViewport()` in `src/lib/device.ts:57-79`, whose thresholds are
`BREAKPOINT = { phone: 768, desktop: 1180 }` (`device.ts:43`).

- `useBandColumns()` (`ForecastingReports.tsx:46`, defined `src/components/ui/Page.tsx:391-394`) —
  `bandCols(4)` gives **2 cards at phone (<768), 3 at tablet (768–1179), 4 at desktop (≥1180)**
  (`ForecastingReports.tsx:87`).
- `ReflowRail` (`ForecastingReports.tsx:118`, defined `Page.tsx:349-371`) — at **desktop** it returns
  `Rail` → `CollapsibleAside` with `width = 288` (`Page.tsx:361-366`, `CollapsibleAside.tsx:155-183`),
  a sticky 288px box with its own inner scroll. Below 1180 it returns a plain full-width flex column
  (`Page.tsx:368-370`). The three tables are therefore **narrower at desktop than at tablet** — see
  §7 gap 6.
- Shell-level: below 768 the Sidebar is replaced by `BottomBar` and the main pad reserves `BAR_BOX`
  (`src/App.tsx:957-958`, `:1004`, `:1017`, `:1033`).

There is **no phone table fallback**: `useTabularLayout()` (`device.ts:139-141`) is not imported
here, so the four- and five-column tables stay tables below 768.

---

## 3. Data sources

| Screen area | Source kind | Detail |
|---|---|---|
| Forecast Revenue / Expected Bookings / Predicted Shortages / Forecast Accuracy cards | SEED | `FORECAST_METRICS` — `src/data/forecastingReports.ts:3-8`; read at `ForecastingReports.tsx:90`, `:97`, `:104`, `:111` |
| Inventory Purchase Forecast table (3 rows) | SEED | `PURCHASE_FORECAST` — `src/data/forecastingReports.ts:10-14`; mapped at `ForecastingReports.tsx:132` |
| Maintenance Forecast table (3 rows) | SEED | `MAINTENANCE_FORECAST` — `src/data/forecastingReports.ts:16-20`; mapped at `ForecastingReports.tsx:157` |
| Seasonal Demand Outlook table (3 rows) | SEED | `SEASONAL_DEMAND` — `src/data/forecastingReports.ts:22-26`; mapped at `ForecastingReports.tsx:182` |
| CSV export body | SEED | Same four constants, re-serialised in `forecastCsv()` — `ForecastingReports.tsx:21-41` |
| Money-gate decision (whether the page renders at all) | DB | Session role from `users.primary_role`, selected in `src/lib/auth.tsx:78` and assigned at `:165`; consumed via `useCanViewMoney()` — `src/lib/moneyVisibility.ts:24-27` |

No DB table, view or RPC supplies any figure on this page — the file imports no query module
(`ForecastingReports.tsx:1-8`).

**LOCAL: nothing.** `src/lib/mock/corpus.ts` builds a 17-key store (`corpus.ts:405-426`) and lists
its 10 known-absent tables (`corpus.ts:33-44`); no forecast, prediction, recommendation or
seasonal-demand table appears in either list. There is no forecast table for the local corpus to
serve or to declare UNSERVED — the concept does not exist in the store at all.

`formatMoney` (`ForecastingReports.tsx:6`, defined `src/lib/money.ts:62-69`) only formats the seeded
paisa literal `rupees(12500000)` (`forecastingReports.ts:4`).

Invented on this page: every figure — Rs 1,25,00,000 forecast revenue, 840 expected bookings, 15
predicted shortages, 92.4% forecast accuracy, all three purchase recommendations and their
confidence levels, all three maintenance predictions and their service dates, and all three seasonal
lift percentages.

---

## 4. Actions and writes

**No dispatches.** The file imports nothing from `src/actions/` (`ForecastingReports.tsx:1-8`), so
`createAction` and `checkCapability` (`src/actions/core.ts:124-218`, `:220-254`) are never reached
from this screen. There is no capability string to map.

The two controls that exist both belong to the shared toolbar and both do real work:

| Control | Handler | Effect |
|---|---|---|
| **CSV** | `exportCsv` — `ReportToolbar.tsx:609`, `:502-516` | Builds the provenance header plus `forecastCsv()`'s body (`ForecastingReports.tsx:21-41`), quotes through `csvCell`, and downloads `forecasting-<day>.csv` via a Blob anchor (`ReportToolbar.tsx:300-361`). No write, no network. |
| **Print** | `ReportToolbar.tsx:615-617` | `window.print()`. |

Buttons with no handler: **none on this page.** The only other clickable element is the rail's
collapse/expand handle (`CollapsibleAside.tsx:65-97`, `:165-169`), which toggles a
localStorage-backed flag.

The CSV spec omits `generatedBy` (`ForecastingReports.tsx:85`), so the export's header carries no
"Generated by" line (`ReportToolbar.tsx:334`).

---

## 5. Gates

**Route guard (App.tsx).** The route is mounted at `src/App.tsx:510-517` inside `Shell`. `Shell`
holds while auth resolves (`App.tsx:964-970`), redirects to `/login` with no session
(`App.tsx:973-975`), then computes
`isForbidden = !canViewMoney(user.role) && isMoneySurface(pathname)` (`App.tsx:993`).
`/reports` is a money-surface prefix (`src/data/nav.ts:147-153`, matched by `isMoneySurface` at
`nav.ts:156-159`), so `/reports/forecasting` matches and a money-blind role gets the Shell's own
`RestrictedState` (`App.tsx:1020-1023`) — the component is never mounted.

**Money visibility (Law 6).** `MONEY_BLIND = { Warehouse, Technician, Driver, Client }`
(`src/lib/rbac.ts:45-50`); `canViewMoney` is `!MONEY_BLIND.has(role)` (`rbac.ts:36-38`);
`useCanViewMoney()` returns `false` for any absent session (`moneyVisibility.ts:24-27`).

| Role | Reaches the report body? |
|---|---|
| Owner, Admin, Manager, Coordinator, Accounts | Yes |
| Warehouse, Technician, Driver, Client | No — stopped at `App.tsx:993`, and again at `ForecastingReports.tsx:57` |

**What is hidden under Law 6: the entire page.** The component gates on `money` before rendering
anything but the header (`ForecastingReports.tsx:57-70`) — including the Maintenance Forecast and
Seasonal Demand tables, which carry no rupees. The file states this is deliberate and broader than
Law 6 requires (`ForecastingReports.tsx:49-56`).

**Reachability.** Reports is not in `NAV` (`nav.ts:132-136`), so there is no sidebar entry. The way
in is Finance ▸ Reports tab → `ReportCatalog` (`src/modules/finance/Finance.tsx:1042`), whose
`forecast` entry points at `/reports/forecasting` (`src/modules/reports/catalog.ts:497`).

---

## 6. States drawn

| State | Present? | How |
|---|---|---|
| Loading | **No** in the page. The only spinner is `Shell`'s `Suspense` fallback for the lazy chunk (`App.tsx:1026`), and constants need no load. |
| Error | **No** in the page. `ErrorBoundary` at `App.tsx:1025` is the only backstop. |
| Empty | **No.** The three tables map constants that always have 3 rows each (`forecastingReports.ts:10`, `:16`, `:22`); no `empty` branch exists. |
| Restricted | **Yes, via `PageBody`** — `ForecastingReports.tsx:61-67` passes `restricted`, `restrictedReason` and `restrictedRequiredRole`, and `PageBody` short-circuits to `RestrictedState` (`PageBody.tsx:143-150`, `StateViews.tsx:213-280`). Children are `null` (`ForecastingReports.tsx:66`). |

`PageBody` is imported and used **only** inside the restricted branch; the happy path never renders
through it (`ForecastingReports.tsx:72-195`).

---

## 7. Known gaps

1. **`TODO(decision)` — `ForecastingReports.tsx:55`**: "whether Forecasting has a money-free half
   worth showing." The comment above it (`:49-56`) records that gating the whole page is broader
   than Law 6 requires.
2. **Four dead `icon` props.** `icon="dollar"`, `"calendar"`, `"alert_triangle"`, `"check"` are
   passed at `ForecastingReports.tsx:91`, `:98`, `:105`, `:112`, but `ForecastKpiCard` destructures
   only `{ label, value, accent, note }` (`:10`) and the file imports no `Icon`. No icon renders on
   any key-figure card.
3. **`ForecastKpiCard` props are typed `any`** (`ForecastingReports.tsx:10`), so none of the above
   is caught by the compiler.
4. **The card accent background never applies.** `background: var(--${accent}-bg, var(--card))`
   (`:12`) resolves `--primary-bg` / `--success-bg` / `--danger-bg` / `--progress-bg`, none of which
   is defined in `src/styles/theme.css` (the file defines `--primary`, `--success`, `--danger`,
   `--progress` at `theme.css:42-50` and `:185-191`, plus `--st-*-bg` pairs, but no `--<accent>-bg`).
   The fallback saves it: all four cards paint plain `var(--card)`.
5. **`--neutral` does not exist, and two note lines lose their colour.** `note.tone` is `'neutral'`
   for Forecast Revenue (`:93`) and Forecast Accuracy (`:114`); `:15` renders
   `color: var(--${note.tone})` with **no fallback**, and `--neutral` appears nowhere in
   `theme.css`. Those two declarations are invalid at computed-value time and the text inherits
   instead. Colour is the only thing distinguishing these notes from the success/danger ones.
6. **`ReflowRail` is used as the main content column, so the tables are squeezed at desktop.**
   `ForecastingReports.tsx:118` wraps the three tables in `ReflowRail`, which at ≥1180 returns
   `Rail` → `CollapsibleAside width={288}` (`Page.tsx:361-366`, `CollapsibleAside.tsx:155-183`) — a
   288px sticky box with its own scroll, inside the page's plain column flex
   (`ForecastingReports.tsx:73`). The companion half, `useRailGridColumns()` (`Page.tsx:382-384`),
   which exists to give the rail a `content | rail` grid to sit in, is not used. Below 1180 the same
   component returns a full-width column (`Page.tsx:368-370`), so a 5-column table is **wider on a
   tablet than on a desktop monitor**.
7. **The restricted copy names the wrong role set.** `restrictedRequiredRole="Owner, Admin,
   Coordinator or Accounts"` (`ForecastingReports.tsx:64`) omits **Manager**, who passes both gates
   (`rbac.ts:36-50` — Manager is not in `MONEY_BLIND`). A Manager reading someone else's screen is
   told a role that can see it cannot.
8. **No sub-768 table treatment.** `useTabularLayout()` (`device.ts:139-141`) exists precisely for
   this and is not imported; the 4- and 5-column tables render as tables at phone width, which
   `device.ts:132-138` describes as "a horizontal scrollbar hiding the columns that matter".
9. **CSV provenance has no operator.** `csv` is passed without `generatedBy`
   (`ForecastingReports.tsx:85`), so the export omits the "Generated by" line
   (`ReportToolbar.tsx:334`) that `ReportCsvSpec` documents at `ReportToolbar.tsx:118-122`.
10. **Maintenance asset IDs match no asset in this app.** `CAM-112`, `LEN-044`, `DRN-005`
    (`forecastingReports.ts:17-19`) are not the app's asset-code format: codes are
    `EQ` + 6 digits (`corpus.ts:157`, and the route registry example `/inventory/EQ000234` at
    `App.tsx:88`). Those rows cannot be resolved to an inventory record, and the table renders no
    link that would try.
11. **A "forecast" row that is already in the past.** `SEASONAL_DEMAND`'s "Monsoon Dip · Jul-Aug
    2026" (`forecastingReports.ts:25`) spans the app's single operating day,
    `TODAY = 2026-07-31` (`src/lib/bs.ts:153`), so an outlook row is partly elapsed.
12. **The headline figure has no period, and cannot get one.** The card note says "Projected for
    next 30 days" (`ForecastingReports.tsx:93`) while `FORECAST_METRICS`
    (`forecastingReports.ts:3-8`) carries no date field at all. The file states the consequence
    itself at `:80-84` — there is no `from`/`to` on any row for a date range to constrain, which is
    why the toolbar is export-only.
13. **Nothing on the page is actionable.** No row links anywhere, and neither the purchase
    recommendations nor the maintenance predictions offer an action (e.g. raise a purchase request,
    schedule the service) — the three tables are `<td>` text only
    (`ForecastingReports.tsx:132-139`, `:157-165`, `:182-189`).
