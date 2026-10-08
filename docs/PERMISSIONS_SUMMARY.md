# Babin Rentals OS — Permissions Summary

**Status:** Fast Reference Summary  
**Authoritative Source:** [`docs/PERMISSIONS.md`](PERMISSIONS.md)  
**Warning:** This document is an overview. Canonical capability matrices, RLS policies, and approval hierarchies are defined exclusively in `docs/PERMISSIONS.md`.

---

## 1. System Roles

The system recognizes 9 system roles defined in Postgres enum `system_role`:

| Role | Operational Scope | Money Visibility (Law 6) |
|---|---|---|
| **Owner** | Full system authority; irreversible actions, settings, bank accounts | **CAN VIEW MONEY** |
| **Admin** | General business management, client approvals, reporting, finance | **CAN VIEW MONEY** |
| **Manager** | Day-to-day warehouse operations, exceptions, staff assignments | **CAN VIEW MONEY** |
| **Coordinator**| Bookings, quotations, scheduling, client communications | **CAN VIEW MONEY** |
| **Accounts** | Invoicing, payment recording, banking, daily closes | **CAN VIEW MONEY** |
| **Warehouse** | Equipment packing, check-in, custody movements, barcode scanning | ⛔ **MONEY-BLIND** |
| **Technician** | Equipment testing, maintenance, repair logging, cleaning queues | ⛔ **MONEY-BLIND** |
| **Driver** | Transportation, dispatch, on-site handover logistics | ⛔ **MONEY-BLIND** |
| **Client** | Client Portal view (restricted strictly to own booking/invoice rows) | ⛔ **MONEY-BLIND** |

---

## 2. Core Capability Domains (39 Mapped Capabilities)

All 39 declared capabilities map to exact predicates in `src/lib/rbac.ts` and mirrored Postgres RLS policies:

1. **Rentals & Custody:** `rental.create`, `rental.view`, `rental.confirm`, `rental.pack`, `rental.handover`, `rental.return`, `rental.close`, `rental.cancel`.
2. **Operations & Floor:** `operations.perform`, `inspection.perform`, `inspection.create_finding`, `inspection.resolve`, `cleaning.manage`.
3. **Inventory & Assets:** `inventory.view`, `inventory.create`, `inventory.edit`, `inventory.transfer`, `inventory.stock_check`, `bundle.manage`, `purchase.request`, `purchase.approve`.
4. **Clients & CRM:** `client.view`, `client.create`, `client.edit`, `client.block`, `client.merge`, `membership.manage`.
5. **Finance & Invoicing:** `invoice.create`, `invoice.view`, `invoice.void`, `payment.record`, `payment.refund`, `deposit.manage`, `daily_close.perform`.
6. **Administration & System:** `settings.view`, `settings.edit`, `audit.view`, `backup.manage`, `numbering.manage`.

---

## 3. Approval Ladder Hierarchy (P7)

```
Owner
  └── Admin
        └── Manager
              ├── Coordinator / Accounts
              └── Warehouse / Technician / Driver
                    └── Client
```

- Self-approval is barred across all approval-gated actions.
- Any manual override requires actor identity, timestamp, and audit reason (≥10 chars).
