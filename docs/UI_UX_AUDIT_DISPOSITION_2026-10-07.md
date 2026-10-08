# UI/UX audit disposition — 7 October 2026

Source: the user's 7 October browser audit and explicit 11-item navigation ruling. Changes live in `C:/Users/use/.codex-temp/babin-rentals-current`, the checkout serving localhost. The Desktop checkout is older; its separate changes were preserved.

## Implemented

| Area | Changes |
|---|---|
| Shell/Login | Locked navigation, matching Today/Operation/New Rental naming, Finance destinations for Documents/Reports, no self-opening More group, one navigation collapse control, phone Scan center slot, no floating search trigger, branded session restoration, inline sign-in errors, hidden unusable PIN entry, Vite font access corrected. |
| Live information | Crew/Documents/Pulse/Handover no longer fall back to demo records in live mode. Cases count/read failures remain unknown/error. Unmodified legacy coupon examples are ignored without deleting local records. |
| Common UI | Plain staff copy with a CI check, neutral zero states, full-year stacked BS/AD dates on audited operational displays, Kathmandu times, bottom-only pagination, 25/50/100 sizes, no pager for one-page lists. |
| Today | One synchronized day control, one visible search, clear resets both panels, real On rent / Overdue / Packing tomorrow overview with unknown reads labelled. |
| Rentals | Draft/Quote chips, registry counts, consistent persisted booking prefixes, truthful quote/past-pickup flags, Client/Status sorts, no deposit-as-total fallback, reduced empty lines, consistent avatars, phone cards without selection checkboxes. |
| Booking detail | Plain headings, closed project-type editor, no stage-derived custody counts, serial warnings only for serial-tracked items, one payment/deposit action location, invoice link opens a filtered Finance view, Payment History gets full width, neutral zero outstanding, no duplicate phone payment strip. |
| New Rental | Neutral readiness until a confirmation attempt, labelled New client, PAN stays on client, dedicated Crew/Delivery controls, start-day versus duration presets, actual serial-unit chips retained. |
| Operation/Cases | Pack/Handover/Return/Reset names, neutral zero badges, Cases badge uses its actual registry, duplicate search/pager removed, no default-day clear button, failed case reads distinguish an unavailable registry from an empty one. |
| Calendar | Completed history, provisional quote/draft bars, hidden inactive Layers panel, one month grid, plain rail/legend guidance. |
| Inventory/Asset | Four section tabs; blank unit/replacement columns omitted when no data exists; compact toolbar; phone cards only with no row checkbox; actual filtered-registry chip counts; no repeated quantity pill; asset quantity shown where Adjust Stock lives; honest unknown availability/metrics. |
| Clients | Actions fit with expanded navigation, empty density band removed, density control moves to search controls, consistent column casing, secondary view controls, open-rental count label, actual On rent KPI on detail, Block/Unblock in overflow. |
| Finance | Desktop rail stays beside content; labelled collections by Nepal civil day; full single-method donut; readable method legend; received total is not repeated in a single-method legend; collapsed unavailable P&L prose; named tabs; Void unavailable for paid/payment-bearing invoices; Documents embedded. |
| Settings/Tools | Correct company PAN default, accurate translation coverage wording, plain settings guidance, shared late-fee engine bands, removed old discount-cap copy, legacy invented bundle sandbox redirects to real Inventory Bundles. |

## Prior rulings preserved

The Membership tab and cinematography suite were explicitly retained on 12 August. Administration moved to Settings System on 15 August. Equipment Add/Edit uses RecordForm under the 6 October ruling. Finance's summary cards reflow below the content on smaller screens under the 12 August reflow ruling. These are intentional exceptions to the audit's older navigation/editing interpretation.

## Remaining boundaries

- **Project Type access:** ordinary Rentals/operational reads now retry through the existing granted projection. Live Rentals loads three records and its full Total Amount column fits beside Actions at 1440px with expanded navigation. The newer Project Type columns still need a reviewed read grant; explicit filters/sorts on them remain unavailable rather than silently changing the query. No live grants were widened.
- **Reset observation:** booking #2 currently reads Closed in the live registry and detail, so it correctly does not belong to Reset now. The audit's earlier Returned state cannot establish its present queue membership; scan/QC history is still not reconstructed from stage.
- **Rental Amount sorting:** Client and Status are implemented. Amount is assembled from invoice reads and has no sortable rental-registry column; a server read model is needed to sort the whole registry correctly. Sorting only the current page would be misleading.
- **Inventory data:** quantity stock of 10 and SKU-like brand values were left intact. Verified inventory import data is needed to correct tracking and create actual serial units; no serial identities were invented.
- **Finance data:** the existing payment-bearing Draft invoice and missing payment account require owner reconciliation. Historical payments and invoice states were not rewritten.
- **Missing sources:** packing scans, return/QC evidence, crew allocations, signature tracking and other unavailable engines remain explicitly unknown. Empty evidence was not reconstructed from stages.
- **Scope of proof:** no live financial writes or full live packing/handover/return/closing workflow was executed. Money visibility continues to be exercised through the automated role/RLS tests; no new money-blind live login was performed.

## Verification evidence

Screenshots are stored in `artifacts/ui-audit-2026-10-07/`. Final check results are recorded in the newest PROGRESS entry. Completion-script percentages describe the repository's structural metrics, not resolution of the remaining audit boundaries above.

Payment history reads the stored `payment_date` and calls `formatAdDateTime`, which explicitly uses `Asia/Kathmandu`. The displayed 04:34 AM is already a Nepal-time rendering of that stored value; changing it to 10:19 AM without checking the source record would add the timezone offset twice.
