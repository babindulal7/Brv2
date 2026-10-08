# Documentation Migration Map

This document records the classification and relocation of historical audits, completed plans, and derivation notes from the repository root into structured directories under `docs/`.

---

## 1. Relocation Directory Structure

```text
docs/
├── 00_READ_FIRST.md           # [CANONICAL] Universal entry point
├── CURRENT_STATE.md           # [CANONICAL] Concise current runtime truth
├── PRODUCT_RULES.md           # [CANONICAL] Durable laws & active rulings
├── ARCHITECTURE.md            # [CANONICAL] System architecture & data flow
├── UI_UX_RULES.md             # [CANONICAL] Design tokens, responsive, tap budgets
├── WORKFLOWS.md               # [CANONICAL] Custody state machine & operational verbs
├── OPEN_DECISIONS.md          # [CANONICAL] Genuine unresolved product questions
├── PERMISSIONS_SUMMARY.md     # [SUMMARY] Fast reference to docs/PERMISSIONS.md
├── PERMISSIONS.md             # [CANONICAL] Authoritative role & capability matrix
├── AUDIT_BANNER_TEMPLATE.md   # Standard governance banner templates
├── audits/
│   ├── 2026-08/               # August 2026 audits & sweeps
│   └── 2026-09/               # September 2026 audits & remediation reports
├── archive/
│   └── completed-plans/       # Completed sprint & fix plans
├── derivations/               # Wireframe rulings & design derivation history
└── reference/                 # Screen inventories, bug histories, doc status
```

---

## 2. File Movement Inventory

### A. August 2026 Audits (`docs/audits/2026-08/`)
| Source File | Destination | Type | Reason / Verdict |
|---|---|---|---|
| `ARCHIVE_AUDIT_2026-08-15.md` | `docs/audits/2026-08/` | Audit | Historical audit; items resolved or tracked |
| `AUDIT_FINDINGS.md` | `docs/audits/2026-08/` | Audit | 9 Aug audit findings; closed |
| `BUG_SWEEP_ENGINES_v1.1.md` | `docs/audits/2026-08/` | Sweep | 11 Aug engine sweep; incorporated in PLAN §4.35 |
| `BUG_SWEEP_ENGINES_v1.2.md` | `docs/audits/2026-08/` | Sweep | 11 Aug engine sweep; incorporated in PLAN §4.35 |
| `BUG_SWEEP_REGISTER_v1.0.md` | `docs/audits/2026-08/` | Register | 10 Aug bug register; superseded |
| `CAPABILITY_MAPPING_2026-08-16.md`| `docs/audits/2026-08/` | Derivation | Historical capability mapping; codified in `PERMISSIONS.md` |
| `DATA_FLOW_AUDIT.md` | `docs/audits/2026-08/` | Audit | Early data flow audit |
| `DB_CHECK_WALKTHROUGH.md` | `docs/audits/2026-08/` | Audit | 15 Aug walkthrough; answered in PLAN §4.33 |
| `FORM_AUDIT.md` | `docs/audits/2026-08/` | Audit | Form field sweep; completed |
| `FULL_FUNCTIONAL_AUDIT.md` | `docs/audits/2026-08/` | Audit | Early functional audit; superseded |
| `SUCCESS_FABRICATION_REGISTER_2026-08-12.md` | `docs/audits/2026-08/` | Register | 12 Aug toast/success sweep |
| `UI_UX_AUDIT_2026-08-28.md` | `docs/audits/2026-08/` | Audit | 28 Aug UI audit; superseded by R-39/R-40 |
| `WIRING_AUDIT_2026-08-11.md` | `docs/audits/2026-08/` | Audit | 11 Aug wiring check; all headlines superseded |

### B. September 2026 Audits (`docs/audits/2026-09/`)
| Source File | Destination | Type | Reason / Verdict |
|---|---|---|---|
| `AUDIT_VERIFICATION_2026-09-06.md` | `docs/audits/2026-09/` | Audit | 6 Sep audit verification pass |
| `BUG_AUDIT_LIFECYCLE_2026-09-02.md` | `docs/audits/2026-09/` | Audit | 2 Sep lifecycle bug sweep |
| `FULL_SYSTEM_AUDIT_2026-09-03.md` | `docs/audits/2026-09/` | Audit | 3 Sep system audit; resolved in later entries |
| `LOCAL_FIRST_MAP_2026-09-03.md` | `docs/audits/2026-09/` | Audit | Local-first mapping; superseded by R-40 |
| `MISSING_PAGES_AUDIT_2026-09-04.md`| `docs/audits/2026-09/` | Audit | Missing pages audit; 52/52 routes completed |
| `QA_APP_HEALTH_REPORT.md` | `docs/audits/2026-09/` | Report | QA health baseline |
| `QA_FULL_AUDIT_REPORT.md` | `docs/audits/2026-09/` | Report | Full QA audit report |
| `REMEDIATION_AUDIT_2026-09-05.md` | `docs/audits/2026-09/` | Audit | 5 Sep audit; blockers closed in PLAN §4 |
| `TODO_SWEEP_2026-09-02.md` | `docs/audits/2026-09/` | Sweep | Codebase TODO scan |

### C. Completed Plans (`docs/archive/completed-plans/`)
| Source File | Destination | Type | Reason / Verdict |
|---|---|---|---|
| `FUNCTIONAL_FIX_PLAN.md` | `docs/archive/completed-plans/` | Plan | Completed functional fix plan |
| `ONDEVICE_DB_PLAN_2026-09-04.md` | `docs/archive/completed-plans/` | Plan | On-device DB plan; superseded by R-40 |
| `PHASE-0-PLAN.md` | `docs/archive/completed-plans/` | Plan | Phase 0 setup plan; executed |
| `QA_FIX_PLAN.md` | `docs/archive/completed-plans/` | Plan | QA remediation plan; executed |

### D. Derivations & Design History (`docs/derivations/`)
| Source File | Destination | Type | Reason / Verdict |
|---|---|---|---|
| `WIREFRAME_RULINGS_2026-08-12.md` | `docs/derivations/` | Rulings | Wireframe rulings; incorporated in product rules |
| `INTERACTION_INVENTORY.md` | `docs/derivations/` | Inventory | Interaction patterns inventory |

### E. Reference & Bug Registers (`docs/reference/`)
| Source File | Destination | Type | Reason / Verdict |
|---|---|---|---|
| `SCREENS.md` | `docs/reference/` | Spec Ref | Wireframe screen catalogue (not build target) |
| `FUNCTIONAL_BUGS.md` | `docs/reference/` | Bug List | Historical bug register |
| `DOC_STATUS.md` | `docs/reference/` | Meta | 16 Aug governance register |

---

## 3. Retained Root Governance Files
The following files remain at the repository root:
- `CLAUDE.md` — Contributor & session governance
- `PLAN.md` — Authoritative dependency-ordered roadmap & rulings
- `PROGRESS.md` — Authoritative chronological build ledger
- `CURRENT_STATE.md` — Root mirror of `docs/CURRENT_STATE.md`
- `RULES.md` — Durable architectural & engineering boundaries
- `README.md` — Project introduction & quick-start guide
- `BACKUP_PROTOCOL.md` — Native `pg_dump` backup protocol
- `CHANGES.md` — Major version change log
- `RULINGS-*.md` — Dated binding rulings
- `UI_UX_IMPROVEMENT_LOG.md` — UI/UX polish logs
- `UI_UX_REMAINING_WORK.md` — Active UI punchlist
