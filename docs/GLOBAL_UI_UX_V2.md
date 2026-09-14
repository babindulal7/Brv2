# Global UI/UX V2 — audit and migration ledger

Authority: user-supplied Global UI/UX V2 specification, 13 September 2026.
This direction supersedes older visual guidance where they conflict. Business
rules, permissions, route contracts and data ownership remain authoritative.

## 1. Existing UI audit

The application uses React 18, TypeScript, inline styles backed by CSS variables,
and a central responsive stylesheet. Preserve this stack and the installed Tabler
icon adapter. Do not add a second styling framework or font download dependency.

Verified starting points:

| Area | Existing implementation | V2 work |
| --- | --- | --- |
| Application frame | `App.tsx:Shell`, Sidebar, Header, BottomBar | Reuse authentication, permission checks, scanner and route wrappers; standardize content padding. Later extract the frame without moving guards. |
| Page furniture | `ui/Page.tsx` PageHeader, Card, Button, KpiStrip, summary rails | Consolidate duplicated renderers; extend header slots compatibly. |
| Page states | `PageBody` and `StateViews` | Retain restricted/error/loading/empty precedence and stale-row preservation. |
| Tokens | `styles/theme.css`, `styles/responsive.css`, `lib/breakpoints.ts` | Existing cream gradients, glass cards, large fluid headings and blue actions differ from V2. Introduce an explicit V2 token layer. |
| Lists | `ui/Table`, bespoke tables in Rentals/Inventory, `TableHeaderCell` | Preserve existing row actions, sort, query pagination and selection during progressive migration. |
| Filters | `FilterDrawer`, `BooqableRentalFilterDrawer` | Rental drawer already composes the shared drawer; it is a domain adapter, not a duplicate overlay to delete. Retain current live-query semantics. |
| Details | Page rails, BookingDetail, client and equipment details | Introduce EntityDetailShell only after each tab and summary dependency is mapped. |
| Operations | Existing global popup and four embedded workspaces | Reuse them. Audit save/navigation/dirty-state behavior separately from stage transitions. |
| Forms | Input, Select, DateField, MoneyField; several local Field functions | Input currently derives IDs from labels and omits error/help associations. Fix shared semantics before migrating domain-specific fields. |
| Responsive | 768/1280 bands; phone navigation; reflowing rails | Preserve bands and accessibility scale. Verify actual browser layouts before claiming mobile acceptance. |

Source evidence is task-directed (Verify tier), not an exhaustive audit of every
screen. Graph project: `C-Users-babin-Desktop-Rental-workspasce-babin-rentals-os`,
generation `2026-09-13T07:04:50Z`. Coverage reports changed metadata on inspected
files; current source was read directly. App's recorded parse gaps at 288/321
are route comments/JSX and were checked directly. Graph results are discovery
evidence, not proof that unlisted implementations do not exist.

## 2. Reusable inventory and 3. duplication

Reuse Button, Input, Select, Badge, Modal, ConfirmDialog, Toast, DateField,
MoneyField, Table, TableHeaderCell, FilterDrawer, PageBody, StateViews,
CollapsibleAside, CommandPalette and the existing operations popup.

Confirmed duplication: Button and Card each exist both in `Page.tsx` and standalone
files, with different defaults, accepted props and markup. Button can safely use
one renderer with a compatibility adapter for Page's icon-name/default-secondary
API. Cards require preservation of section semantics, heading levels, bodyStyle,
subtitle/footer/padding support. Local Field functions occur in NewRental,
AddClient, AddBundle, EquipmentShared and settings; these need separate dependency
review before replacement. Hand-built list tables must retain their specialized
selection, row actions and financial visibility.

## 4. Proposed tokens

| Group | V2 values |
| --- | --- |
| Light | canvas #F7F7F8; surface #FFFFFF; text #18181B; secondary #52525B; border #E4E4E7 |
| Dark | canvas #141416; surface #1C1C20; text #F4F4F5; secondary #A1A1AA; border #38383F |
| Brand | yellow #E8BA30 with dark ink; darker yellow ink for selected light-theme labels |
| Semantics | Keep independent success/info/warning/danger tokens; never rebind an information/status hue to brand yellow |
| Space | 4, 8, 12, 16, 24, 32, 48, 64px; desktop page 24px; smaller screens 16px |
| Type | existing Source Sans 3/Hind support; 24/18/16/14/12px equivalent rem scale; preserve zoom and floor/wall scaling |
| Shape | controls 8px; cards 10px; dialogs/drawers 12px; status 6px |
| Controls | retain 44px minimum targets (existing accessibility rule; V2's 40px is a recommendation) |
| Motion | 120–200ms; reduced-motion respected; no decorative card lift |
| Layers | retain existing overlay ordering until nested dialogs are audited; no wholesale z-index reassignment |

## 5. Shared architecture and 6. AppShell

Build on the current frame: session/permission guard → shared navigation/topbar →
main landmark → page shell → header/toolbar/optional summary/content. Global
operations/scanner/modal owners remain outside page bodies. Keep PageBody as the
state selector; PageShell owns layout only. Keep specialized workflow components
as children of shared shells rather than duplicating their data logic.

Compatibility exports allow gradual migration without a mass import rewrite.
Search, quick-create and notifications must use existing query/action APIs and
permission predicates; do not introduce decorative dead controls.

## 7. Page migration map

| Order | Page group | Migration focus |
| --- | --- | --- |
| 1 | Today | PageShell, shared header, operational summaries |
| 2 | Rentals list | toolbar, existing filter adapter, table/selection/context contract |
| 3 | Rental detail | shared detail slots, tabs, summary and operations entry |
| 4 | New/edit rental | section hierarchy, labeled fields, sticky save, dirty protection |
| 5 | Operations | shared action seam; preserve all completion gates |
| 6–8 | Inventory, Clients, Payments | same list/header/filter conventions; domain actions preserved |
| 9–12 | Calendar, Expenses, Documents, Crew | toolbar/form alignment and responsive states |
| 13–15 | Reports, Tools, Settings | report layout, category navigation, constrained simple forms |

## 8. Risks

Existing uncommitted edits include business changes from other work. Preserve
them and report only this phase's changes. Font/density changes can expose clipped
labels. Button default type must not silently alter forms. Status colors must not
be reassigned by changing the overloaded `--primary` token. Broad z-index changes
can place popups behind sticky content. Read-only/mock browser verification does
not demonstrate a live financial or warehouse transaction.

## 9. Expected changes

Foundation: this document, a V2 stylesheet, stylesheet entry import, shared
Button/Page/Input components, focused compatibility/accessibility tests, shell
padding and PROGRESS.md. Later phases: shared Card/Table/Select/dialog components,
navigation/header and the page groups above, each with its own regression checks.

## 10. Protected files

This redesign must not change `src/actions/**`, financial/workflow/availability
engines, `src/lib/queries/**`, Supabase clients, database types, SQL migrations,
RLS policies, booking state transitions or API contracts. Existing unrelated
changes in those paths are not part of this implementation.

## Phase ledger

- Shell follow-up (14 September): command palette now labels its search as a
  combobox, exposes selected listbox options, keeps Tab inside the dialog,
  restores opener focus, and scrolls keyboard selection into view. Existing
  action/permission sources are unchanged. Two focused interaction tests pass;
  focused lint and whitespace checks pass. The production build above predates
  this follow-up; entity search and global creation remain open.
- Shell create follow-up (14 September): a shared header Create menu and the
  command palette now expose only existing routed forms: rental, client,
  equipment and purchase request. Entries derive from the existing capability
  predicates, navigate only, and retain each destination's own route/action
  gate. Four focused shell tests and focused lint pass. The full type check has
  no errors in this phase's files, but remains blocked by concurrent errors in
  `OperationsQueues.tsx`; entity-record search remains open.

- Audit: initial task-directed audit and proposed architecture delivered before
  implementation. Full per-page visual/accessibility acceptance remains open.
- Tokens/core primitives: V2 layer implemented. Shared Button and Card renderers
  now serve their standalone and Page compatibility APIs. Input IDs are unique;
  errors and helper text are associated; read-only/disabled inputs cannot clear.
  Button loading retains icon/label geometry and accessible naming. QuickActionBar
  now uses the same Button renderer. No public component export was removed.
- Shell/layout: page padding tokens and skip-to-main link implemented. PageHeader
  accepts status/breadcrumb content and wraps its copy before action rows squeeze
  it. PageShell and Toolbar added; Rentals uses PageShell. A Today migration was
  superseded by a concurrent Dashboard rewrite and is not claimed as delivered.
- Data/detail/operations/forms/remaining page migration: pending dedicated work.
- Final acceptance: not complete until TypeScript, lint, unit/integration, build,
  responsive browser checks and critical workflow E2E evidence are recorded.

## Foundation validation — 13 September 2026

- First TypeScript check passed. Production build passed TypeScript but initially
  failed to resolve `DashboardMovementPanel` in the concurrently replaced Today.
  Its component and stylesheet subsequently appeared; production build rerun
  passed (TypeScript and Vite, 6,926 modules).
- Initial focused tests: 43 passed. Full regression: 198 suites passed, 3,264
  tests passed; one Dashboard suite could not load the then-missing component.
  This is not a clean all-suite result. Final focused regression: 59/59 passed
  across V2 compatibility, generic primitives, PageBody and Rentals rendering.
- Repository lint: 38 errors and 4 warnings in files outside this phase's edits.
  Focused lint of App/main/Button/Card/Input/Page/PageShell/V2 tests passed;
  final QuickActionPanel/Page/Card lint also passed.
- Browser: isolated mock Rentals checked at widths 1280, 768 and 390. Document
  scroll widths were 1270, 758 and 380 respectively (scrollbars excluded), so
  no page-level horizontal overflow. Mobile rendered cards with zero tables;
  its filter drawer opened and closed and restored focus to Filters. Dark
  surfaces were inspected. Browser viewport override was reset.
- Measured V2 token pairs: dark ink/yellow action 9.70:1; light selected label
  6.36:1; muted light ink on secondary surface 5.13:1; dark muted ink 5.96:1.
  These are token checks, not a whole-application contrast certification.
- No live writes or lifecycle transitions were performed. Existing unrelated
  business edits remain owned by their original work.

Next phase: extend the shell's real search/quick-create/navigation, then table
and context contracts. The existing command palette searches navigation/actions,
not entity records; notifications are explicitly unavailable in the preview.
These are open V2 requirements, not completed features.

Foundation files added: `src/styles/ui-v2.css`, `src/components/ui/PageShell.tsx`,
`src/components/ui/__tests__/uiV2.test.tsx`, this audit.
Files edited: `src/main.tsx`, `src/App.tsx`, `src/styles/responsive.css`,
`src/components/ui/{Button,Card,Input,Page,QuickActionPanel,index}.tsx/ts`,
`src/modules/rentals/RentalsList.tsx`, `PROGRESS.md`.
No components or files deleted. Page.Button and Page.Card are compatibility
adapters; their duplicated renderers were merged. Toolbar is available for the
next migrations; it is not claimed as adopted across every page.
Legacy `--on-brand` remains its original blue-action ink alias; yellow uses
`--brand-ink` to avoid lowering contrast on unmigrated controls.
