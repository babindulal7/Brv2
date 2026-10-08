# Babin Rentals OS — Git Branch Inventory

**Repository:** `babindulal7/Brv2` (Local root: `C:\Users\use\Desktop\babin-rentals-os`)  
**Audit Snapshot Date:** 2026-10-08  
**Mode:** READ-ONLY AUDIT  
**Default Branch:** `main` (Local SHA `d7ca3bc`, Remote tracking `origin/main` `d7ca3bc`, Remote GitHub `61d89bd`)

---

## 1. Inventory Summary

* **Total Local Branches:** 12
* **Total Local Remote-Tracking Refs (`origin/*`):** 4 (pointing to local backup store `C:\Users\use\Desktop\backups\babin-rentals-os.git`)
* **Total Remote GitHub Branches (`babindulal7/Brv2`):** 4
* **Total Open Pull Requests on GitHub:** 1 (PR #1)
* **Total Closed Pull Requests on GitHub:** 2 (PR #2, PR #3)

---

## 2. Complete Branch Inventory Table

| # | Branch Ref | Last Commit (SHA & Subject) | Merge Base w/ `main` | Ahead / Behind `main` | Unique Commits | Subsystem Grouping | PR Status | Work Type | Risk Level | Recommendation | Confidence |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | `main` | `d7ca3bc` (Phase 6: five-state PageBody hardening across remaining screens) | `d7ca3bc` (self) | 0 / 0 | 0 | Shell, UI, Finance, Reports, Clients | N/A (Default) | Production / Default | Low | **Keep** (Current Default) | Confirmed |
| 2 | `step1-foundation` | `fdf0093` (wip(rentals): New Rental add-item panel and navigation test (Codex WIP snapshot)) | `10679d9` | 343 / 8 | 343 | Full OS: Rentals, Inventory, Migrations (0001–0162), Booqable, Reports | None | Feature / Foundation Core | **Critical** | **Merge candidate** (Primary system tree) | Confirmed |
| 3 | `merge/codex-step1-into-main` | `fdf0093` (wip(rentals): New Rental add-item panel and navigation test) | `10679d9` | 343 / 8 | 343 | Identical to `step1-foundation` (exact commit pointer) | None | Staging / Merge Helper | Medium | **Archive candidate** (Duplicate of `step1-foundation`) | Confirmed |
| 4 | `claude/md-brief-gaps` | `277d80e` (feat(finance): payment method as tap cards in Record Payment) | `10679d9` | 344 / 8 | 5 beyond `step1` | Finance, UI Components, Today, Actions | None | Feature (Fonepay, ReturnCountdown, ChoiceCards) | High | **Merge candidate** (Cherry-pick 5 commits after foundation) | Confirmed |
| 5 | `claude/extend-rental-labels` | `fdbc41c` (wip(rentals): New Rental layout rework — setup row, equipment workspace...) | `10679d9` | 341 / 8 | 0 beyond `step1` | Rentals, Inventory, UI | None | WIP / Milestone | Low | **Superseded** (Ancestor of `step1-foundation` by 2 commits) | Confirmed |
| 6 | `claude/booqable-babin-adoption-spec-de72fa` | `4bf41a2` (test: remove the bundleRecords quantity-path test added in d09ab4a) | `10679d9` | 326 / 8 | 0 beyond `step1` | Bundles, Inventory, Settings, Saved Views, Migrations | None | Feature (Booqable spec) | Low | **Superseded** (Fully merged into `step1-foundation` via `9a50931`) | Confirmed |
| 7 | `claude/work-tree-feature-copy-2eb747` | `318c9a3` (test: read portaled menus and dialogs from document.body in two detail tests) | `10679d9` | 320 / 8 | 11 beyond `step1` | UI polish, CSS, Dates, Portaled Menus, Detail Views | None | Experiment / Port | Medium | **Investigate** (Has 9 recorded test failures; selective cherry-pick) | Likely |
| 8 | `claude/zen-swartz-228eaa` | `994d2ac` (Shared settings table (0158); promo codes read from coupons only) | `10679d9` | 313 / 8 | 5 beyond `step1` | Settings, Reports, Coupons, Migrations | None | Feature / Prototype | High | **Investigate / Superseded** (Settings 0158 was re-architected in `step1-foundation`) | Confirmed |
| 9 | `feat/unified-crew-delivery-search` | `33de1a0` (feat: unified search — Crew and Delivery are now functional in AddItemPanel) | `10679d9` | 282 / 8 | 1 beyond `step1` | Rentals AddItemPanel, Crew, Delivery modes | None | Feature | Medium | **Merge candidate** (Extract `DeliveryRow` into `step1-foundation`) | Confirmed |
| 10 | `wip/main-loose-2026-10-08` | `ef5faa9` (wip: snapshot of main's uncommitted work (8 Oct 2026)) | `b647a78` | 1 / 6 | 1 | Shell, Scanner, Calendar, BookingDetail, Windsurf | None | Worktree Snapshot | Low | **Superseded** (Content committed to `main` in `79ec345`) | Confirmed |
| 11 | `claude/modest-neumann-ccc071` | `57bd2cb` (commit) | `57bd2cb` | 0 / 3 | 0 | Clients, ClientsDirectory, Tests | None | WIP / Stale checkout | Low | **Superseded** (Ancestor of `main`, 0 unique commits) | Confirmed |
| 12 | `claude/suspicious-wescoff-e2639e` | `57bd2cb` (commit) | `57bd2cb` | 0 / 3 | 0 | Clients, ClientsDirectory, Tests | None | WIP / Stale checkout | Low | **Superseded** (Identical pointer to `modest-neumann-ccc071`, ancestor of `main`) | Confirmed |

---

## 3. Remote Tracking Refs (`origin/*` — Local Backup Repository)

| Ref Name | Commit SHA | Target Branch | Tracking Status | Notes |
|---|---|---|---|---|
| `origin/main` | `d7ca3bc` | `main` | Up-to-date (0/0) | Mirrors local `main` |
| `origin/step1-foundation` | `b2eb2f2` | `step1-foundation` | Behind local by 3 commits (`fdbc41c`, `94e2ba7`, `fdf0093`) | Local worktree progressed ahead of backup remote |
| `origin/claude/work-tree-feature-copy-2eb747` | `318c9a3` | `claude/work-tree-feature-copy-2eb747` | Up-to-date (0/0) | In sync with worktree |
| `origin/claude/zen-swartz-228eaa` | `06c0dcf` | `claude/zen-swartz-228eaa` | Behind local by 2 commits (`4459fb9`, `994d2ac`) | Local worktree progressed ahead of backup remote |

---

## 4. Remote GitHub Branches & Pull Requests (`babindulal7/Brv2`)

| GitHub Ref / PR | Commit SHA | State | Author | Created Date | Description & Relation to Codebase |
|---|---|---|---|---|---|
| `main` | `61d89bde` | Active (Default) | babindulal7 | 2026-05-09 | Historical prototype snapshot from May 2026. Lacks modern Vite SPA architecture. |
| PR #1 (`codex/build-production-ready-rental-management-saas`) | `67bec6d4` | **OPEN** | babindulal7 | 2026-05-04 | Early initial SaaS scaffold attempt (17 changed files). Stale since July 2026. |
| PR #2 (`codex/build-cinematic-rental-management-website`) | `bb06b8f` | **CLOSED (Merged)** | babindulal7 | 2026-05-05 | Scaffold production architecture and core modules. Merged into GitHub `main`. |
| PR #3 (`claude/check-brv2-qQiAx`) | `f9d2ec4` | **CLOSED (Merged)** | babindulal7 | 2026-05-09 | Real-time dashboard metrics, font links, API error handling. Merged into GitHub `main`. |

---

## 5. Branch Details & Subsystem Breakdown

### 5.1 `main`
* **Head:** `d7ca3bc` (Author: babindulal7, Date: 2026-10-08 15:56:30 +0545)
* **Summary:** The designated default branch of the local active repository. Contains recent Phase 6 PageBody hardening work, client directory collapsible filters, and passes all 2117 Vitest tests (98 test suites) and TypeScript compilation.
* **Subsystems Touched:** `src/components/ui/PageBody.tsx`, `src/modules/clients/*`, `src/modules/finance/*`, `src/modules/reports/*`, `src/modules/settings/*`.
* **Important Gap:** Missing migrations `0063` through `0158`, but contains an uncoordinated `0159_grant_non_money_columns.sql` (renumbered in `step1-foundation` as `0162`).

### 5.2 `step1-foundation`
* **Head:** `fdf0093` (Author: babindulal7, Date: 2026-10-08 16:05:26 +0545)
* **Summary:** The true operational core of Babin Rentals OS. Contains 343 commits including complete domain implementations for Equipment, Rentals, Pricing, Booqable adoption, Saved Views, Audit logging triggers, and Supabase migrations 0001 through 0162.
* **Subsystems Touched:** 1606 files: `src/modules/rentals/` (318 files), `src/lib/` (302 files), `src/components/` (141 files), `supabase/migrations/` (108 files), `src/actions/` (96 files).
* **Worktree:** Currently bound to `C:/Users/use/.codex-temp/babin-rentals-current`.

### 5.3 `claude/md-brief-gaps`
* **Head:** `277d80e` (Author: babindulal7, Date: 2026-10-08 14:52:52 +0545)
* **Summary:** Contains 5 critical business feature commits on top of `step1-foundation`:
  1. `82b04a5` — live return countdown on Today and Booking Detail.
  2. `f8f5761` — offer Fonepay as a payment method in Nepal.
  3. `d94c424` — document 5 gaps from May briefs (§4.61).
  4. `7388360` — "Create & add another" button on RecordForm.
  5. `277d80e` — payment method visual tap cards (`ChoiceCards.tsx`).
* **Files Touched:** 26 files (+1226 / -90 lines), including `ChoiceCards.tsx`, `ReturnCountdown.tsx`, `RecordPaymentModal.tsx`.

### 5.4 `feat/unified-crew-delivery-search`
* **Head:** `33de1a0` (Author: babindulal7, Date: 2026-10-03 17:58:13 +0545)
* **Summary:** Contains a unified search implementation allowing Crew and Delivery modes directly inside `AddItemPanel.tsx`. Implements `DeliveryRow` with `DeliveryModeOption` and `bookings.delivery_type` integration.
* **Crucial Finding:** While `step1-foundation` incorporated `CrewRow`, it did not integrate `DeliveryRow`.

### 5.5 `claude/zen-swartz-228eaa`
* **Head:** `994d2ac` (Author: babindulal7, Date: 2026-10-07 03:30:42 +0545)
* **Summary:** Implemented initial shared settings table (migration `0158`) and coupon promo code validation.
* **Evolution:** `step1-foundation` subsequently replaced this implementation with an idempotent RPC-gated `set_setting` function, making `994d2ac`'s version obsolete.
