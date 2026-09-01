# WHATSAPP_LINKS_SPEC v1.0 — deep-link messaging (no API)

**Date:** 31 Aug 2026
**Status:** RULED (31 Aug): v1 families = Booking lifecycle + Money + Owner daily digest (CRM excluded) · language ENGLISH FIRST · festival calendar ruled OUT entirely (no surface in the app).
**Source:** Miraz Bakery POS whatsapp.js (wa.me deep links, 977 normalization, 14 template types) — mechanism adopted, templates rewritten for rentals.
**What this is:** a compose link, not a send. The staff member presses Send inside WhatsApp. No API, no webhook, no delivery status. It is the zero-infrastructure bridge until the Communication Center's WhatsApp Cloud API lands — the template registry below is transport-agnostic so those templates migrate unchanged.
**Venue:** Claude Code on the repo. This file goes to `docs/`.

---

## §1 Mechanism — `src/lib/whatsapp.ts`

```ts
buildWaLink(phone: string, text: string): string | null
```
- Strip non-digits. 10 digits → prefix `977`. Starts with `977` → keep. Anything else → return as-is if ≥ 8 digits, else `null`.
- `null` ⇒ the calling button renders DISABLED with the inline reason "No valid phone on this client" (errors inline, never a toast).
- Returns `https://wa.me/{number}?text={encodeURIComponent(text)}`; open with `target="_blank"`. On a phone this opens the WhatsApp app; on the desktop it opens WhatsApp Web — both sides of the hub-LAN world work.

Laws that bind every use:
- **Law 2:** every figure in a message comes from the canonical booking/payment query. Templates format; they never compute.
- **Law 6:** money-bearing templates (receipt, balance due, digest) exist only for money roles — the button is ABSENT for money-blind roles, and the data layer never hands them the figures anyway.
- **Honesty:** nothing is ever recorded as "sent" — we cannot know. An activity-log entry "message prepared" (template + booking) is allowed; "sent" is not.

## §2 Template registry — `src/lib/whatsappTemplates.ts`

All English-first with the market's courtesy frame (greeting `Namaste {firstName},` · closing `Dhanyabad,\n{businessName}`). Money in whole rupees via `formatMoney`. Dates via `formatAd` with BS beside it from `lib/bs` — e.g. `12 Sep 2026 (27 Bhadra)`.

**Booking lifecycle**

`booking_confirmed` (stage Booked)
```
Namaste {firstName},

Your booking with {businessName} is confirmed. ✅

Booking: {bookingNo}
Period: {startAdBs} → {endAdBs}
Items: {lineCount} items{topLinesList}
Total: Rs {total}
{advanceLine}{depositLine}
Pickup from {pickupTime} at our Boudha office.

Dhanyabad,
{businessName}
```

`gear_ready` (stage Packed)
```
Namaste {firstName},

Your gear for booking {bookingNo} is packed and ready for pickup. 🎬
Pickup window: {pickupWindow}, {startAdBs}.

Dhanyabad,
{businessName}
```

`pickup_tomorrow` (day before start)
```
Namaste {firstName},

A reminder that your rental {bookingNo} starts tomorrow, {startAdBs}.
Pickup from {pickupTime}.

Dhanyabad,
{businessName}
```

`return_reminder` (stage On Rent, day before/of due)
```
Namaste {firstName},

Your rental {bookingNo} is due back on {endAdBs} by {returnTime}.
Returning on time keeps your account in good standing.

Dhanyabad,
{businessName}
```

`overdue` (overdue flag)
```
Namaste {firstName},

Booking {bookingNo} was due back on {endAdBs} and is now overdue.
Please return the equipment or call us at {businessPhone} to extend.

Dhanyabad,
{businessName}
```

**Money** (money roles only)

`payment_receipt`
```
Namaste {firstName},

Payment received — thank you. 🙏

Booking: {bookingNo}
Amount: Rs {amount} ({method})
{balanceLine}   ← "Remaining balance: Rs {balance}" or "Status: fully paid ✅"

Dhanyabad,
{businessName}
```

`balance_due`
```
Namaste {firstName},

A reminder that booking {bookingNo} has an outstanding balance of Rs {balance}.
You can pay by cash or bank transfer at pickup or return.

Dhanyabad,
{businessName}
```

**Owner daily digest** (Owner/Admin only; sent to the owner's own number from Settings `ownerWhatsappNumber`)

`daily_digest` — generated on the Daily Closing screen after APPROVE (ties to LOCAL_FIRST_CORE_SPEC §6):
```
{businessName} — {businessDateAdBs}

Out today: {pickupsCount} bookings
Returned today: {returnsCount}
New bookings: {newCount}

Collected: Rs {cashTotal} cash · Rs {bankTotal} bank · Rs {cardTotal} card · Rs {otherTotal} other
Outstanding: Rs {receivablesTotal}
Deposits held: Rs {depositsHeld}

Closing variance: {varianceLine}
```

## §3 Placement

- **Booking Detail** — one "Message client" action in the detail verb rail's overflow (per RAIL_AND_QUICK_ACTIONS F5: one next-verb + overflow; WhatsApp is never the primary verb and NEVER a row verb on lists). The submenu is **stage-aware**: it offers only the templates valid for the booking's current stage/flags, with the most likely one first.
- **Record Payment success** — the success toast carries a "Send receipt" action (toasts carry successes only; an action riding a success toast conforms).
- **Daily Closing** — "Send digest" button appears after approval.
- Targets 44×44. Icon comes from the fixed IconName registry (use an existing `message`/`send` entry — no off-registry icon without properly extending the registry).
- Missing/invalid phone ⇒ disabled with inline reason (§1).

## §4 Tests (with the build, not after)

- 977 normalization: `9841XXXXXX` → `9779841XXXXXX`; already-prefixed passes; short garbage → null.
- Encoding: newlines and `&` survive `encodeURIComponent` round-trip.
- Stage-awareness: a Quote offers nothing; Booked offers confirm; Packed offers ready; On Rent offers return; overdue flag adds overdue.
- Law 6: money templates unreachable for Warehouse/Technician/Driver/Client — asserted at the registry level, not only the button.
- Money formatting: whole rupees, no paisa in any message.

## §5 Build order

1. `lib/whatsapp.ts` + `lib/whatsappTemplates.ts` + tests.
2. Booking Detail overflow action (stage-aware submenu).
3. Receipt action on the payment success toast.
4. Digest button on Daily Closing (lands with the closing screen from LOCAL_FIRST_CORE_SPEC).

## §6 Open ⭐

1. Settings keys: `ownerWhatsappNumber`, `businessPhone`, pickup/return time strings (should read the D4 `operationalDayStart` world, not new literals).
2. Later: crew/supplier (sub-rental partner) templates — deliberately out of v1.
3. Cloud API migration: same registry, transport swaps; deep link remains the fallback.
