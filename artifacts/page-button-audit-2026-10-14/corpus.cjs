"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/lib/__mocks__/corpus.ts
var corpus_exports = {};
__export(corpus_exports, {
  UNSERVED: () => UNSERVED,
  VIEW_OF: () => VIEW_OF,
  buildStore: () => buildStore,
  clientDirectory: () => clientDirectory
});
module.exports = __toCommonJS(corpus_exports);

// src/lib/money.ts
function rupees(n) {
  if (!Number.isFinite(n)) return 0;
  return roundHalfUp(Number(n.toFixed(4)) * 100);
}
function toRupees(p) {
  return p / 100;
}
function roundHalfUp(n) {
  return n < 0 ? -Math.round(-n) : Math.round(n);
}
function grouped(n) {
  const neg = n < 0;
  const s = String(Math.abs(roundHalfUp(n)));
  if (s.length <= 3) return (neg ? "-" : "") + s;
  const tail = s.slice(-3);
  const head = s.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ",");
  return `${neg ? "-" : ""}${head},${tail}`;
}
function formatMoney(p) {
  const whole = Math.trunc(Math.abs(p) / 100);
  const paise = Math.abs(p) % 100;
  const sign = p < 0 ? "-" : "";
  return paise === 0 ? `${sign}Rs ${grouped(whole)}` : `${sign}Rs ${grouped(whole)}.${String(paise).padStart(2, "0")}`;
}
function toWholeRupee(paisa) {
  return roundHalfUp(paisa / 100) * 100;
}
function price(i) {
  const subtotal = i.equipment + (i.subRental ?? 0) + (i.services ?? 0) + (i.crew ?? 0) + (i.transport ?? 0);
  const discount = toWholeRupee(subtotal * (i.discountPercent / 100));
  const taxable = subtotal - discount;
  const vat = toWholeRupee(taxable * (i.vatPercent / 100));
  const rentalTotal = taxable + vat;
  return {
    subtotal,
    discount,
    taxable,
    vat,
    rentalTotal,
    payments: i.payments,
    outstanding: rentalTotal - i.payments
  };
}
var DISCOUNT_CAP = 100;
function discountGate(percent, _reason, _approver) {
  if (percent < 0) return { ok: false, why: "A discount cannot be negative \u2014 that is a price increase" };
  if (percent > DISCOUNT_CAP) return { ok: false, why: "A discount above 100% is a negative price, not a discount" };
  return { ok: true };
}
var REFERENCE = price({
  equipment: rupees(132750),
  discountPercent: 7,
  vatPercent: 13,
  payments: rupees(15e3)
});
var EXPECTED = { discount: 9293, taxable: 123457, vat: 16049, rentalTotal: 139506, outstanding: 124506 };
var REFERENCE_CASE_ERROR = (() => {
  const wrong = Object.entries(EXPECTED).map(([k, v]) => ({ k, v, got: toRupees(REFERENCE[k]) })).filter((x) => x.got !== x.v);
  if (wrong.length === 0) return null;
  return "Financial Engine failed Foundation \xA72.8. " + wrong.map((x) => `${x.k}: expected Rs ${x.v}, engine produced Rs ${x.got}`).join("; ") + ". No screen may show money until this is fixed \u2014 see lib/money.ts.";
})();
var REFERENCE_CASE = REFERENCE;

// src/lib/discount.ts
function validateDiscount(percent, _reason, _approverId) {
  if (percent < 0) {
    return { valid: false, requiresApproval: false, error: "Discount percent cannot be negative" };
  }
  if (percent > 100) {
    return {
      valid: false,
      requiresApproval: false,
      error: "A discount above 100% is a negative price, not a discount."
    };
  }
  return { valid: true, requiresApproval: false, error: null };
}

// src/lib/validation.ts
function validateRentalDates(pickupIso, returnIso) {
  const pickup = new Date(pickupIso);
  const returnDate = new Date(returnIso);
  if (isNaN(pickup.getTime()) || isNaN(returnDate.getTime())) {
    return { valid: false, days: 0, error: "Invalid date format provided." };
  }
  if (returnDate <= pickup) {
    return {
      valid: false,
      days: 0,
      error: "Return date/time must be strictly after pickup date/time."
    };
  }
  const diffMs = returnDate.getTime() - pickup.getTime();
  const days = Math.max(1, Math.ceil(diffMs / (1e3 * 60 * 60 * 24)));
  return { valid: true, days, error: null };
}

// src/lib/workflow.ts
var BOOKING_STATUS = {
  Quote: { order: 0, token: "neutral", client: "Quote", means: "Priced, not committed. Reserves nothing." },
  Booked: { order: 1, token: "primary", client: "Confirmed", means: "Committed. Gear reserved, calendar held, serials assigned." },
  Packed: { order: 2, token: "progress", client: "Ready for pickup", means: "Packing complete, ready to leave." },
  // §4.2 — green separates these two by fill weight: solid = out, soft = in.
  "On Rent": { order: 3, token: "out", client: "With you", means: "All items with the client." },
  Returned: { order: 4, token: "in", client: "Returned", means: "All items physically received back." },
  Closed: { order: 5, token: "dim", client: "Complete", means: "Money settled, deposit resolved, nothing open." }
};
var STATUS_ORDER = Object.keys(BOOKING_STATUS).sort(
  (a, b) => BOOKING_STATUS[a].order - BOOKING_STATUS[b].order
);
function canAdvance(from, to) {
  return BOOKING_STATUS[to].order === BOOKING_STATUS[from].order + 1;
}
var JOBS = {
  Pack: { runsAt: "Booked", sets: "Packed", sessions: false, blocksBooking: true },
  Handover: { runsAt: "Packed", sets: "On Rent", sessions: true, blocksBooking: true },
  Return: { runsAt: "On Rent", sets: "Returned", sessions: true, blocksBooking: true },
  Reset: { runsAt: "Returned", sets: null, sessions: false, blocksBooking: false }
};
function assertItemCounts(c, total) {
  const sum = c.Ready + c["Picked Up"] + c.Returned + c.Missing;
  if (sum !== total) {
    throw new Error(
      `\xA71.6 invariant violated: Ready ${c.Ready} + Picked Up ${c["Picked Up"]} + Returned ${c.Returned} + Missing ${c.Missing} = ${sum}, but the booking has ${total} items`
    );
  }
  if ((c.Damaged ?? 0) > c.Returned) {
    throw new Error(`\xA71.6: Damaged ${c.Damaged} exceeds Returned ${c.Returned} \u2014 damage is a condition on a returned item`);
  }
}
var BLOCKS_HANDOVER = JOBS.Handover.sets === null ? [] : [JOBS.Handover.sets];
function closeGates(i) {
  const rs = (paisa) => formatMoney(paisa);
  const settled = i.rentalInvoiced && i.rentalOutstandingPaisa === 0 || i.isZeroValueOverride === true && i.rentalOutstandingPaisa === 0;
  const held = i.depositHeldPaisa;
  const depositSkipped = held > 0 && (i.depositSkipReason?.trim().length ?? 0) >= 10;
  const pending = i.damageChargesPendingApproval;
  return [
    {
      label: "Rental Outstanding settled",
      passing: settled,
      blocking: settled ? null : !i.rentalInvoiced ? "nothing has been invoiced for this rental, so its outstanding balance is an empty sum rather than a settled account" : i.rentalOutstandingPaisa > 0 ? `${rs(i.rentalOutstandingPaisa)} still outstanding` : `${rs(-i.rentalOutstandingPaisa)} overpaid \u2014 the invoice does not reconcile`
    },
    {
      label: "Deposit resolved",
      passing: held === 0 || depositSkipped,
      blocking: held === 0 || depositSkipped ? null : held > 0 ? `${rs(held)} of the client's deposit is still held, so the rental cannot close \u2014 and no screen records a refund or an application yet` : `${rs(-held)} more deposit has been refunded or applied than was ever received`
    },
    { label: "No open Case", passing: i.openCases === 0, blocking: i.openCases === 0 ? null : `${i.openCases} open` },
    {
      label: "No damage charge pending approval",
      passing: pending === 0,
      /* TODO(FORMS-05): drop the second clause once approving a finding writes
         damage_findings.approval_state. floorVerb only inserts findings today. */
      blocking: pending === 0 ? null : `${pending} damage finding${pending === 1 ? "" : "s"} awaiting approval, and approving one is not built yet`
    }
  ];
}

// src/lib/bs.ts
var BS_MONTHS = [
  "Baishakh",
  "Jestha",
  "Ashadh",
  "Shrawan",
  "Bhadra",
  "Ashwin",
  "Kartik",
  "Mangsir",
  "Poush",
  "Magh",
  "Falgun",
  "Chaitra"
];
var BS_MONTH_DAYS = {
  2078: [31, 31, 31, 32, 31, 31, 30, 29, 30, 29, 30, 30],
  2079: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2080: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 30],
  2081: [31, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 31],
  2082: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2083: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2084: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31],
  2085: [30, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 31],
  2086: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2087: [31, 31, 32, 32, 31, 30, 30, 29, 30, 29, 30, 30],
  2088: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31],
  2089: [30, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 31],
  2090: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2091: [31, 31, 32, 32, 31, 30, 30, 29, 30, 29, 30, 30],
  2092: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31],
  2093: [31, 31, 31, 32, 31, 31, 29, 30, 30, 29, 29, 31],
  2094: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2095: [31, 31, 32, 32, 31, 30, 30, 29, 30, 29, 30, 30]
};
var BS_MIN_YEAR = 2078;
var BS_MAX_YEAR = 2095;
var EPOCH_AD = Date.UTC(2021, 3, 14);
var DAY = 864e5;
var NPT_OFFSET_MIN = 345;
function kathmanduCivil(ad) {
  const shifted = new Date(ad.getTime() + NPT_OFFSET_MIN * 6e4);
  return Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate());
}
function toBs(ad) {
  const utc = kathmanduCivil(ad);
  let remaining = Math.round((utc - EPOCH_AD) / DAY);
  if (remaining < 0) return null;
  for (let year = BS_MIN_YEAR; year <= BS_MAX_YEAR; year += 1) {
    const months = BS_MONTH_DAYS[year];
    if (!months) return null;
    for (let month = 1; month <= 12; month += 1) {
      const length = months[month - 1] ?? 0;
      if (remaining < length) return { year, month, day: remaining + 1 };
      remaining -= length;
    }
  }
  return null;
}
function formatBs(bs, _opts = {}) {
  const name = BS_MONTHS[bs.month - 1] ?? "";
  return `${bs.day} ${name}`;
}
function formatAd(ad) {
  if (Number.isNaN(ad.getTime())) return "\u2014";
  const civil = new Date(kathmanduCivil(ad));
  return `${civil.getUTCDate()}/${civil.getUTCMonth() + 1}/${civil.getUTCFullYear()}`;
}
var BS_TABLE_DAYS = Object.values(BS_MONTH_DAYS).reduce(
  (total, months) => total + months.reduce((sum, len) => sum + len, 0),
  0
);
var BS_SUPPORTED_RANGE = `${formatAd(new Date(EPOCH_AD))} \u2013 ${formatAd(
  new Date(EPOCH_AD + (BS_TABLE_DAYS - 1) * DAY)
)}`;
var BS_UNSUPPORTED_NOTE = `Nepali (BS) dates are available for ${BS_SUPPORTED_RANGE} \u2014 the Date Engine's month-length table covers BS ${BS_MIN_YEAR}\u2013${BS_MAX_YEAR}, and month lengths are published calendar data that is never inferred here. English dates are shown outside that span.`;

// src/data/numbering.ts
var MODULES = ["Rental", "Finance", "Inventory", "Operations", "Administration"];
var SEQUENCES = [
  /* ── the six ruled by WIREFRAME_RULINGS_2026-08-12 §2 ──────────────────
     Prefix, no separator-borne year, one `N` (= no padding). The counters
     are the render's figures de-padded in the same edit; leaving a padded
     counter beside a `PREFIX-N` format is exactly what SEED_ERRORS catches. */
  { code: "BK", name: "Booking", prefix: "B", module: "Rental", description: "Rental booking references", format: "B-N", counter: "4861", resetRule: "Never", scope: "Global", status: "Active" },
  /*
   * INV loses the `BR` segment. `INV-BR-YYYY-NNNNN` cannot survive a ruling
   * that fixes invoices as `INV-` + counter, so the branch code leaves the
   * *string*. `BR` itself stays reserved as a token (FORMAT_TOKENS, kindOf)
   * for any format a user authors in the Format tab, and `BR-` stays the
   * branch **code** prefix in the database — neither is touched.
   *
   * Consequence taken deliberately: scope selects the COUNTER, not the
   * string (§ Branch Rules above), so a Per Branch invoice sequence with no
   * BR token would mint `INV-1` in Kathmandu *and* in Pokhara. INV therefore
   * moves to Global scope, which is the only reading under which the ruled
   * format yields unique invoice numbers. BK carried the same latent defect
   * (Per Branch, no BR token) and moves for the same reason.
   */
  { code: "INV", name: "Invoice", prefix: "INV", module: "Finance", description: null, format: "INV-N", counter: "492", resetRule: "Never", scope: "Global", status: "Active" },
  { code: "CL", name: "Client", prefix: "C", module: "Administration", description: null, format: "C-N", counter: "2481", resetRule: "Never", scope: "Global", status: "Active" },
  { code: "EQ", name: "Equipment", prefix: "EQ", module: "Inventory", description: null, format: "EQ-CAT-NNNNNN", counter: "000824", resetRule: "Never", scope: "Global", status: "Active" },
  { code: "MT", name: "Maintenance", prefix: "MT", module: "Operations", description: null, format: "MT-YYYY-NNNNN", counter: "00054", resetRule: "Nepali Fiscal Year", scope: "Per Branch", status: "Active" },
  { code: "CASE", name: "Incident Case", prefix: "CASE", module: "Operations", description: null, format: "CASE-YYYY-NNNN", counter: "0182", resetRule: "Calendar Year", scope: "Per Branch", status: "Active" },
  { code: "PAY", name: "Payment", prefix: "PAY", module: "Finance", description: null, format: "PAY-YYYY-NNNNNN", counter: "006103", resetRule: "Calendar Year", scope: "Per Branch", status: "Active" },
  { code: "EXP", name: "Expense", prefix: "EXP", module: "Finance", description: null, format: "EXP-YYYY-NNNNN", counter: "00276", resetRule: "Calendar Year", scope: "Per Branch", status: "Active" },
  { code: "PUR", name: "Purchase", prefix: "PUR", module: "Finance", description: null, format: "PUR-YYYY-NNNNN", counter: "00153", resetRule: "Calendar Year", scope: "Per Branch", status: "Active" },
  { code: "TRF", name: "Transfer", prefix: "TRF", module: "Inventory", description: null, format: "TRF-YYYY-NNNNN", counter: "00092", resetRule: "Calendar Year", scope: "Per Branch", status: "Active" },
  /*
   * `QT` — Quote. The render draws no Quote row and the spec's eighteen
   * default sequences do not name one, but the 12 Aug ruling puts Quote in
   * its table as `Q-1`. A ruled entity that Settings ▸ Numbering cannot
   * reach is not configuration, so the row is added rather than the prefix
   * being hardcoded in `data/documents.ts`. Counter is the highest quote the
   * app actually carries (`QT-2026-0088` → `Q-88`), not an invented figure.
   */
  { code: "QT", name: "Quote", prefix: "Q", module: "Rental", description: null, format: "Q-N", counter: "88", resetRule: "Never", scope: "Global", status: "Active" },
  /*
   * The render stops at ten but claims eighteen — "Showing 1 to 10 of 18", the
   * "Active Sequences 18" KPI and the rail summary all agree on eighteen, and
   * the spec's § Default System Sequences names exactly eighteen. The eight
   * below complete that set so the counts reconcile against real rows instead
   * of a hardcoded total. (With `QT` added above the app now carries
   * nineteen; every count on the screen is derived from this array, so no
   * figure had to be re-typed.)
   *
   * Their identity (code, name, module) is specified; their format, counter,
   * reset rule and scope are not, anywhere. Those stay `null` and render as a
   * stated "Not configured" rather than as a made-up figure — except `BND`
   * and `MEM`, which the ruling names (`BND-1`, `M-1`) and which therefore
   * gain a format here. Their counters are the highest identifier those
   * modules actually carry: `data/bundles.ts` tops out at `BND-00023` → 23,
   * `data/membership.ts` at `MB-2083-014` → 14.
   *
   * Note `MEM`'s code and prefix now diverge for the first time — the code
   * stays `MEM` (it is the registry key the render prints and the analytics
   * join on) while the ruled prefix is `M`. `prefixOf()` below is the only
   * thing any module should read.
   *
   * ⚠ `M-` is a **shared opening token**. `data/addBundle.ts` keys equipment
   * models `M-FX3-BODY`, `M-FZ100`, `M-USBC`, `M-SR-CAGE` … and
   * `inventory/AddBundle.tsx` selects on `M-FX3-BODY`. Those are model keys,
   * not issued identifiers, and renaming them is a product decision this pass
   * may not take. The collision is defused in `isIssuedBy` instead, which
   * matches the whole `M-N` format and so cannot claim a model key for a
   * membership — see the note there before adding any new `M-`-prefixed
   * namespace.
   */
  /*
   * `DEP` — Deposit. Like `QT` above, a sequence the app really mints that the
   * render never drew: `0012_seed_data.sql` seeds a `deposit` row in
   * `number_sequences` with prefix `DEP-`, and `lib/seed.ts` issues against it.
   * Its prefix is transcribed from that migration, not invented; its format,
   * counter, reset rule and scope are supplied nowhere, so they stay null.
   * Deposits are not in the ruling's table, so nothing here renames it.
   */
  { code: "DEP", name: "Deposit", prefix: "DEP", module: "Finance", description: null, format: null, counter: null, resetRule: null, scope: null, status: "Active" },
  { code: "DOC", name: "Document", prefix: "DOC", module: "Administration", description: null, format: null, counter: null, resetRule: null, scope: null, status: "Active" },
  { code: "BND", name: "Bundle", prefix: "BND", module: "Rental", description: null, format: "BND-N", counter: "23", resetRule: "Never", scope: "Global", status: "Active" },
  { code: "MEM", name: "Membership", prefix: "M", module: "Rental", description: null, format: "M-N", counter: "14", resetRule: "Never", scope: "Global", status: "Active" },
  { code: "SR", name: "Sub Rental", prefix: "SR", module: "Rental", description: null, format: null, counter: null, resetRule: null, scope: null, status: "Active" },
  { code: "COUP", name: "Coupon", prefix: "COUP", module: "Finance", description: null, format: null, counter: null, resetRule: null, scope: null, status: "Active" },
  { code: "DISC", name: "Discount", prefix: "DISC", module: "Finance", description: null, format: null, counter: null, resetRule: null, scope: null, status: "Active" },
  { code: "AUD", name: "Audit", prefix: "AUD", module: "Administration", description: null, format: null, counter: null, resetRule: null, scope: null, status: "Active" },
  { code: "LOG", name: "Activity Log", prefix: "LOG", module: "Administration", description: null, format: null, counter: null, resetRule: null, scope: null, status: "Active" }
];
var UNCONFIGURED_CODES = SEQUENCES.filter((s) => s.format === null).map((s) => s.code);
var TONE_BY_KIND = {
  PREFIX: "primary",
  YEAR: "success",
  MONTH: "primary",
  DAY: "primary",
  BRANCH: "progress",
  WAREHOUSE: "progress",
  CATEGORY: "progress",
  COUNTER: "primary"
};
function kindOf(part, index) {
  if (index === 0) return "PREFIX";
  if (/^N+$/.test(part)) return "COUNTER";
  if (part === "YYYY") return "YEAR";
  if (part === "MM") return "MONTH";
  if (part === "DD") return "DAY";
  if (part === "BR") return "BRANCH";
  if (part === "WH") return "WAREHOUSE";
  return "CATEGORY";
}
function segmentsOf(format, ctx) {
  return format.split("-").map((part, i) => {
    const kind = kindOf(part, i);
    const value = kind === "PREFIX" ? part : kind === "COUNTER" ? ctx.counter : kind === "YEAR" ? ctx.year : kind === "MONTH" ? ctx.month : kind === "DAY" ? ctx.day : kind === "BRANCH" ? ctx.branchCode : kind === "WAREHOUSE" ? ctx.warehouseCode : part;
    return { kind, label: kind, value, tone: TONE_BY_KIND[kind] };
  });
}
function buildNumber(format, ctx) {
  return segmentsOf(format, ctx).map((s) => s.value).join("-");
}
function paddingOf(format) {
  const run = format.split("-").find((p) => /^N+$/.test(p));
  return run ? run.length : 0;
}
function padTo(value, width) {
  return String(value).padStart(width, "0");
}
function sequence(code) {
  return SEQUENCES.find((s) => s.code === code);
}
function prefixOf(code) {
  const row = sequence(code);
  if (!row) return "";
  return row.format ? row.format.split("-")[0] ?? row.prefix : row.prefix;
}
var PREVIEW_YEAR = "2026";
var PREVIEW_MONTH = "05";
var PREVIEW_DAY = "18";
var ACTIVE = SEQUENCES.filter((s) => s.status === "Active");
var AUTO_RESET = SEQUENCES.filter((s) => s.resetRule !== null && s.resetRule !== "Never" && s.resetRule !== "Manual");
var DUPLICATE_PREFIXES = SEQUENCES.filter(
  (s, i) => SEQUENCES.findIndex((o) => o.prefix.toUpperCase() === s.prefix.toUpperCase()) !== i
).map((s) => s.prefix);
var BK = SEQUENCES.find((s) => s.code === "BK");
var LAST_SEQUENCE_USED = BK && BK.format && BK.counter ? buildNumber(BK.format, {
  year: PREVIEW_YEAR,
  month: PREVIEW_MONTH,
  day: PREVIEW_DAY,
  branchCode: "KTM",
  warehouseCode: "MAIN",
  counter: BK.counter
}) : "\u2014";
var GENERATED_TODAY = "486";
var GENERATED_TODAY_DELTA = "18% vs yesterday";
var LAST_GENERATED_AGO = "2 mins ago";
var HEALTH_SCORE = "100%";
var ARCHIVED_COUNT = "3";
var RECORDS_THIS_MONTH = "12,856";
var KPIS = [
  { label: "Active Sequences", value: String(ACTIVE.length), icon: "queues", accent: "primary", note: "View all" },
  {
    label: "Records Generated Today",
    value: GENERATED_TODAY,
    icon: "checklist",
    accent: "success",
    delta: { direction: "up", text: GENERATED_TODAY_DELTA }
  },
  { label: "Last Sequence Used", value: LAST_SEQUENCE_USED, icon: "file", accent: "primary", note: LAST_GENERATED_AGO },
  {
    label: "Duplicate IDs",
    value: String(DUPLICATE_PREFIXES.length),
    icon: "alert_triangle",
    accent: "danger",
    note: DUPLICATE_PREFIXES.length === 0 ? "No duplicates" : DUPLICATE_PREFIXES.join(", ")
  },
  { label: "Auto Reset Rules", value: String(AUTO_RESET.length), icon: "refresh", accent: "progress", note: "View rules" },
  { label: "Sequence Health", value: HEALTH_SCORE, icon: "activity", accent: "success", note: "All good" }
];
var CATEGORIES = [
  { name: "All Sequences", module: null, icon: "queues" },
  { name: "Rental", module: "Rental", icon: "calendar" },
  { name: "Finance", module: "Finance", icon: "dollar" },
  { name: "Inventory", module: "Inventory", icon: "box" },
  { name: "Operations", module: "Operations", icon: "crew" },
  { name: "Administration", module: "Administration", icon: "settings" }
];
function countFor(module2) {
  return module2 === null ? SEQUENCES.length : SEQUENCES.filter((s) => s.module === module2).length;
}
var SUMMARY = [
  { label: "Active Sequences", value: String(ACTIVE.length) },
  { label: "Archived Sequences", value: ARCHIVED_COUNT },
  { label: "Records Generated", value: RECORDS_THIS_MONTH },
  { label: "Last Generated", value: LAST_GENERATED_AGO },
  { label: "Health Score", value: HEALTH_SCORE }
];
var ALERTS = [
  { text: "Counter Near Limit", count: "0", icon: "alert_triangle", tone: "progress" },
  { text: "Duplicate Prefix Risk", count: String(DUPLICATE_PREFIXES.length), icon: "flag", tone: "progress" },
  { text: "Failed Resets", count: "0", icon: "error", tone: "danger" },
  { text: "Disabled Sequences", count: String(SEQUENCES.length - ACTIVE.length), icon: "eye", tone: "neutral" },
  { text: "Configuration Conflicts", count: "0", icon: "check", tone: "success" }
];
var SEED_ERRORS = (() => {
  const errs = [];
  const seenCode = /* @__PURE__ */ new Set();
  const seenPrefix = /* @__PURE__ */ new Set();
  for (const s of SEQUENCES) {
    if (seenCode.has(s.code)) errs.push(`Duplicate sequence code "${s.code}".`);
    seenCode.add(s.code);
    const p = s.prefix.toUpperCase();
    if (seenPrefix.has(p)) errs.push(`\xA7 Validation Rules: duplicate prefix "${s.prefix}".`);
    seenPrefix.add(p);
    if (s.format !== null && s.counter !== null) {
      const width = paddingOf(s.format);
      if (width === 0) {
        errs.push(`"${s.code}" format "${s.format}" has no counter token.`);
      } else if (!/^\d+$/.test(s.counter)) {
        errs.push(`"${s.code}" counter "${s.counter}" is not a number.`);
      } else if (padTo(Number(s.counter), width) !== s.counter) {
        errs.push(
          `"${s.code}" format "${s.format}" pads to ${width} digit${width === 1 ? "" : "s"} but its counter "${s.counter}" reads as "${padTo(Number(s.counter), width)}".`
        );
      }
    }
    if (s.format === null !== (s.counter === null)) {
      errs.push(`"${s.code}" has a format without a counter, or the reverse.`);
    }
  }
  const byModule = CATEGORIES.filter((c) => c.module !== null).reduce((n, c) => n + countFor(c.module), 0);
  if (byModule !== SEQUENCES.length) {
    errs.push(`Category counts total ${byModule} but there are ${SEQUENCES.length} sequences.`);
  }
  for (const s of SEQUENCES) {
    if (!MODULES.includes(s.module)) errs.push(`"${s.code}" is in module "${s.module}", which has no category row.`);
  }
  return errs;
})();

// src/lib/seed.ts
var VAT_PERCENT = 13;
var INVOICE_ISSUED_STATUS = "Sent";
var SEQUENCES2 = {
  booking: { key: "booking", code: "BK", padding: 1, year: null },
  client: { key: "client", code: "CL", padding: 1, year: null },
  invoice: { key: "invoice", code: "INV", padding: 1, year: null },
  /* Payment keeps the year-bearing `PAY-YYYY-NNNN` here, but the claim this
     comment used to make — "nothing has ruled it" — was overtaken on 4 Sep.
     R-18 (RULINGS-2026-09-04.md) rules that `number_sequences.payment` must
     stop resetting yearly: `include_year = false`, a direct breach of the
     15 Aug never-reset ruling. That is a change to the SEQUENCE, made by
     migration, and R-18 is explicit that numbers already issued are not
     rewritten. The corpus below is historical payments — already issued — so
     the shape stays put and this spec does NOT move until a migration lands.
     Do not "fix" it here: changing the emitted shape without the sequence
     change would make the seed disagree with what the database mints. */
  payment: { key: "payment", code: "PAY", padding: 4, year: 2026 },
  /* Deposit IS ruled: 0081_ruled_sequences_completion.sql rewrites every
     `DEP-YYYY-NNNN` to `DEP-<n>` and then asserts none survive. This spec
     used to emit the retired year-bearing shape, so 0056 rewrote the seeded
     rows on a fresh build and a second apply then missed its own
     `on conflict (deposit_no)` arbiter and died on the client_uuid unique
     (measured 3 Sep 2026: DEP-2026-0001 written, DEP-1 stored). Emitting the
     ruled shape makes 0056's rewrite a no-op and lets a second apply get past
     deposits (it still fails closed later — see the file header).
     numbering.ts:211 carries the DEP row with `format: null`, so this is the
     one place the shape is decided. Movement numbers derive from this and
     become `DEP-<n>-M<k>`; nothing constrains or rewrites them. */
  deposit: { key: "deposit", code: "DEP", padding: 1, year: null },
  equipment: { key: "equipment", code: "EQ", padding: 6, year: null }
};
function recordNo(spec, value) {
  const prefix = prefixOf(spec.code);
  const counter = String(value).padStart(spec.padding, "0");
  if (spec.year !== null) return `${prefix}-${spec.year}-${counter}`;
  return spec.code === "EQ" ? `${prefix}${counter}` : `${prefix}-${counter}`;
}
var REFERENCE_PRODUCTS = [
  {
    seq: 234,
    name: "Sony FX9 Cinema Camera",
    brand: "Sony",
    model: "PXW-FX9",
    categoryCode: "camera",
    zoneCode: "ZONE-CAM-A",
    dailyRateRupees: 6500,
    replacementValueRupees: 145e4,
    units: 1,
    serialTag: "CAM",
    serialFrom: 1
  },
  {
    seq: 235,
    name: "Sony FX6 Cinema Camera",
    brand: "Sony",
    model: "ILME-FX6",
    categoryCode: "camera",
    zoneCode: "ZONE-CAM-A",
    dailyRateRupees: 4500,
    replacementValueRupees: 89e4,
    units: 1,
    serialTag: "CAM",
    serialFrom: 2
  },
  {
    seq: 236,
    name: "NISI Athena 35mm",
    brand: "NISI",
    model: "Athena Prime 35mm T1.9",
    categoryCode: "lens",
    zoneCode: "ZONE-LENS-B",
    dailyRateRupees: 1e3,
    replacementValueRupees: 26e4,
    units: 4,
    serialTag: "LEN",
    serialFrom: 35
  },
  {
    seq: 237,
    name: "Aputure LS 600d Pro",
    brand: "Aputure",
    model: "LS 600d Pro",
    categoryCode: "lighting",
    zoneCode: "ZONE-GRIP-C",
    dailyRateRupees: 1200,
    replacementValueRupees: 245e3,
    units: 2,
    serialTag: "LIT",
    serialFrom: 1
  },
  {
    seq: 238,
    name: "Matthews C-Stand 40in",
    brand: "Matthews",
    model: "Hollywood C-Stand",
    categoryCode: "grip",
    zoneCode: "ZONE-GRIP-C",
    dailyRateRupees: 150,
    replacementValueRupees: 32e3,
    units: 4,
    serialTag: "GRP",
    serialFrom: 1
  },
  {
    seq: 239,
    name: "Manfrotto 504X Tripod System",
    brand: "Manfrotto",
    model: "504X / 645 FAST",
    categoryCode: "support",
    zoneCode: "ZONE-GRIP-C",
    dailyRateRupees: 375,
    replacementValueRupees: 96e3,
    units: 6,
    serialTag: "SUP",
    serialFrom: 1
  }
];
var CATALOGUE = [
  { name: "Sony FX3 Full-Frame Camera", brand: "Sony", model: "ILME-FX3", categoryCode: "camera", zoneCode: "ZONE-CAM-A", dailyRateRupees: 3500, replacementValueRupees: 56e4, units: 3, serialTag: "CAM" },
  { name: "Sony A7S III", brand: "Sony", model: "ILCE-7SM3", categoryCode: "camera", zoneCode: "ZONE-CAM-A", dailyRateRupees: 2800, replacementValueRupees: 42e4, units: 3, serialTag: "CAM" },
  { name: "Canon C70 Cinema Camera", brand: "Canon", model: "EOS C70", categoryCode: "camera", zoneCode: "ZONE-CAM-A", dailyRateRupees: 4e3, replacementValueRupees: 72e4, units: 2, serialTag: "CAM" },
  { name: "Canon R5 C", brand: "Canon", model: "EOS R5 C", categoryCode: "camera", zoneCode: "ZONE-CAM-A", dailyRateRupees: 3800, replacementValueRupees: 64e4, units: 2, serialTag: "CAM" },
  { name: "Blackmagic URSA Mini Pro 12K", brand: "Blackmagic", model: "URSA Mini Pro 12K", categoryCode: "camera", zoneCode: "ZONE-CAM-A", dailyRateRupees: 5500, replacementValueRupees: 98e4, units: 1, serialTag: "CAM" },
  { name: "Blackmagic Pocket 6K Pro", brand: "Blackmagic", model: "BMPCC 6K Pro", categoryCode: "camera", zoneCode: "ZONE-CAM-A", dailyRateRupees: 2200, replacementValueRupees: 31e4, units: 4, serialTag: "CAM" },
  { name: "RED Komodo 6K", brand: "RED", model: "Komodo 6K", categoryCode: "camera", zoneCode: "ZONE-CAM-A", dailyRateRupees: 6e3, replacementValueRupees: 118e4, units: 1, serialTag: "CAM" },
  { name: "DJI Ronin 4D-6K", brand: "DJI", model: "Ronin 4D", categoryCode: "camera", zoneCode: "ZONE-CAM-A", dailyRateRupees: 7e3, replacementValueRupees: 132e4, units: 1, serialTag: "CAM" },
  { name: "Panasonic Lumix S5 II", brand: "Panasonic", model: "DC-S5M2", categoryCode: "camera", zoneCode: "ZONE-CAM-A", dailyRateRupees: 1800, replacementValueRupees: 26e4, units: 3, serialTag: "CAM" },
  { name: "Sony FX30", brand: "Sony", model: "ILME-FX30", categoryCode: "camera", zoneCode: "ZONE-CAM-A", dailyRateRupees: 2e3, replacementValueRupees: 28e4, units: 3, serialTag: "CAM" },
  { name: "NISI Athena 25mm", brand: "NISI", model: "Athena Prime 25mm T1.9", categoryCode: "lens", zoneCode: "ZONE-LENS-B", dailyRateRupees: 1e3, replacementValueRupees: 26e4, units: 3, serialTag: "LEN" },
  { name: "NISI Athena 50mm", brand: "NISI", model: "Athena Prime 50mm T1.9", categoryCode: "lens", zoneCode: "ZONE-LENS-B", dailyRateRupees: 1e3, replacementValueRupees: 26e4, units: 3, serialTag: "LEN" },
  { name: "NISI Athena 85mm", brand: "NISI", model: "Athena Prime 85mm T1.9", categoryCode: "lens", zoneCode: "ZONE-LENS-B", dailyRateRupees: 1e3, replacementValueRupees: 26e4, units: 3, serialTag: "LEN" },
  { name: "Sigma 18-35mm Art", brand: "Sigma", model: "18-35mm F1.8 DC HSM", categoryCode: "lens", zoneCode: "ZONE-LENS-B", dailyRateRupees: 600, replacementValueRupees: 96e3, units: 4, serialTag: "LEN" },
  { name: "Sigma 24-70mm Art", brand: "Sigma", model: "24-70mm F2.8 DG DN", categoryCode: "lens", zoneCode: "ZONE-LENS-B", dailyRateRupees: 700, replacementValueRupees: 128e3, units: 4, serialTag: "LEN" },
  { name: "Canon CN-E 24mm", brand: "Canon", model: "CN-E 24mm T1.5 L F", categoryCode: "lens", zoneCode: "ZONE-LENS-B", dailyRateRupees: 1400, replacementValueRupees: 48e4, units: 2, serialTag: "LEN" },
  { name: "Canon CN-E 50mm", brand: "Canon", model: "CN-E 50mm T1.3 L F", categoryCode: "lens", zoneCode: "ZONE-LENS-B", dailyRateRupees: 1400, replacementValueRupees: 48e4, units: 2, serialTag: "LEN" },
  { name: "Sony 70-200mm GM II", brand: "Sony", model: "FE 70-200mm F2.8 GM OSS II", categoryCode: "lens", zoneCode: "ZONE-LENS-B", dailyRateRupees: 900, replacementValueRupees: 21e4, units: 3, serialTag: "LEN" },
  { name: "Laowa 12mm Zero-D", brand: "Laowa", model: "12mm f/2.8 Zero-D", categoryCode: "lens", zoneCode: "ZONE-LENS-B", dailyRateRupees: 550, replacementValueRupees: 88e3, units: 2, serialTag: "LEN" },
  { name: "DZOFilm Vespid 35mm", brand: "DZOFilm", model: "Vespid Prime 35mm T2.1", categoryCode: "lens", zoneCode: "ZONE-LENS-B", dailyRateRupees: 850, replacementValueRupees: 175e3, units: 3, serialTag: "LEN" },
  { name: "Aputure LS 300x", brand: "Aputure", model: "LS 300x Bi-Colour", categoryCode: "lighting", zoneCode: "ZONE-GRIP-C", dailyRateRupees: 900, replacementValueRupees: 145e3, units: 4, serialTag: "LIT" },
  { name: "Aputure Nova P300c", brand: "Aputure", model: "Nova P300c RGBWW", categoryCode: "lighting", zoneCode: "ZONE-GRIP-C", dailyRateRupees: 1600, replacementValueRupees: 32e4, units: 2, serialTag: "LIT" },
  { name: "Aputure MC Pro 4-Light Kit", brand: "Aputure", model: "MC Pro", categoryCode: "lighting", zoneCode: "ZONE-GRIP-C", dailyRateRupees: 400, replacementValueRupees: 62e3, units: 5, serialTag: "LIT" },
  { name: "Nanlite Forza 500B II", brand: "Nanlite", model: "Forza 500B II", categoryCode: "lighting", zoneCode: "ZONE-GRIP-C", dailyRateRupees: 1300, replacementValueRupees: 265e3, units: 2, serialTag: "LIT" },
  { name: "Nanlux Evoke 1200B", brand: "Nanlux", model: "Evoke 1200B", categoryCode: "lighting", zoneCode: "ZONE-GRIP-C", dailyRateRupees: 2400, replacementValueRupees: 59e4, units: 1, serialTag: "LIT" },
  { name: "Astera Titan Tube 8-Pack", brand: "Astera", model: "Titan Tube", categoryCode: "lighting", zoneCode: "ZONE-GRIP-C", dailyRateRupees: 2e3, replacementValueRupees: 48e4, units: 2, serialTag: "LIT" },
  { name: "Godox SL200 III", brand: "Godox", model: "SL200 III Bi", categoryCode: "lighting", zoneCode: "ZONE-GRIP-C", dailyRateRupees: 500, replacementValueRupees: 74e3, units: 5, serialTag: "LIT" },
  { name: "Aputure Amaran 200x", brand: "Aputure", model: "Amaran 200x S", categoryCode: "lighting", zoneCode: "ZONE-GRIP-C", dailyRateRupees: 450, replacementValueRupees: 58e3, units: 6, serialTag: "LIT" },
  { name: "Manfrotto Super Clamp", brand: "Manfrotto", model: "035", categoryCode: "grip", zoneCode: "ZONE-GRIP-C", dailyRateRupees: 60, replacementValueRupees: 7500, units: 12, serialTag: "GRP" },
  { name: "Avenger Wind-Up Stand", brand: "Avenger", model: "A4050", categoryCode: "grip", zoneCode: "ZONE-GRIP-C", dailyRateRupees: 350, replacementValueRupees: 68e3, units: 4, serialTag: "GRP" },
  { name: "Matthews Floppy Flag 24x36", brand: "Matthews", model: "Floppy Cutter", categoryCode: "grip", zoneCode: "ZONE-GRIP-C", dailyRateRupees: 200, replacementValueRupees: 24e3, units: 6, serialTag: "GRP" },
  { name: "Sandbag 15lb", brand: "Matthews", model: "Sandbag", categoryCode: "grip", zoneCode: "ZONE-GRIP-C", dailyRateRupees: 50, replacementValueRupees: 4200, units: 12, serialTag: "GRP" },
  { name: "Dana Dolly Kit", brand: "Dana Dolly", model: "Portable Dolly", categoryCode: "grip", zoneCode: "ZONE-GRIP-C", dailyRateRupees: 1500, replacementValueRupees: 28e4, units: 1, serialTag: "GRP" },
  { name: "Kupo Grip Head 4in", brand: "Kupo", model: "KG series", categoryCode: "grip", zoneCode: "ZONE-GRIP-C", dailyRateRupees: 70, replacementValueRupees: 8800, units: 10, serialTag: "GRP" },
  { name: "Butterfly Frame 6x6", brand: "Matthews", model: "6x6 Frame + Silk", categoryCode: "grip", zoneCode: "ZONE-GRIP-C", dailyRateRupees: 800, replacementValueRupees: 96e3, units: 2, serialTag: "GRP" },
  { name: "Sachtler Flowtech 75", brand: "Sachtler", model: "Flowtech 75 MS", categoryCode: "support", zoneCode: "ZONE-GRIP-C", dailyRateRupees: 900, replacementValueRupees: 235e3, units: 3, serialTag: "SUP" },
  { name: "DJI RS 3 Pro Gimbal", brand: "DJI", model: "RS 3 Pro", categoryCode: "support", zoneCode: "ZONE-GRIP-C", dailyRateRupees: 1200, replacementValueRupees: 128e3, units: 3, serialTag: "SUP" },
  { name: "DJI RS 4 Gimbal", brand: "DJI", model: "RS 4", categoryCode: "support", zoneCode: "ZONE-GRIP-C", dailyRateRupees: 1100, replacementValueRupees: 112e3, units: 2, serialTag: "SUP" },
  { name: "Easyrig Vario 5", brand: "Easyrig", model: "Vario 5 + Flowcine", categoryCode: "support", zoneCode: "ZONE-GRIP-C", dailyRateRupees: 1400, replacementValueRupees: 32e4, units: 1, serialTag: "SUP" },
  { name: "Tilta Shoulder Rig", brand: "Tilta", model: "Advanced Shoulder Kit", categoryCode: "support", zoneCode: "ZONE-GRIP-C", dailyRateRupees: 500, replacementValueRupees: 64e3, units: 3, serialTag: "SUP" },
  { name: "Slider 120cm Motorised", brand: "Zeapon", model: "Micro 2 Plus", categoryCode: "support", zoneCode: "ZONE-GRIP-C", dailyRateRupees: 700, replacementValueRupees: 92e3, units: 2, serialTag: "SUP" },
  { name: "Jib Arm 3m", brand: "Proaim", model: "Wave-2 Jib", categoryCode: "support", zoneCode: "ZONE-GRIP-C", dailyRateRupees: 1800, replacementValueRupees: 24e4, units: 1, serialTag: "SUP" },
  { name: "Sennheiser MKH 416", brand: "Sennheiser", model: "MKH 416-P48U3", categoryCode: "audio", zoneCode: "ZONE-CAM-A", dailyRateRupees: 700, replacementValueRupees: 135e3, units: 4, serialTag: "AUD" },
  { name: "Rode NTG5 Kit", brand: "Rode", model: "NTG5", categoryCode: "audio", zoneCode: "ZONE-CAM-A", dailyRateRupees: 550, replacementValueRupees: 78e3, units: 3, serialTag: "AUD" },
  { name: "Sound Devices MixPre-6 II", brand: "Sound Devices", model: "MixPre-6 II", categoryCode: "audio", zoneCode: "ZONE-CAM-A", dailyRateRupees: 1200, replacementValueRupees: 195e3, units: 2, serialTag: "AUD" },
  { name: "Zoom F6 Field Recorder", brand: "Zoom", model: "F6", categoryCode: "audio", zoneCode: "ZONE-CAM-A", dailyRateRupees: 800, replacementValueRupees: 108e3, units: 2, serialTag: "AUD" },
  { name: "Rode Wireless PRO Kit", brand: "Rode", model: "Wireless PRO", categoryCode: "audio", zoneCode: "ZONE-CAM-A", dailyRateRupees: 600, replacementValueRupees: 62e3, units: 5, serialTag: "AUD" },
  { name: "Sennheiser EW 112P G4", brand: "Sennheiser", model: "EW 112P G4", categoryCode: "audio", zoneCode: "ZONE-CAM-A", dailyRateRupees: 650, replacementValueRupees: 82e3, units: 4, serialTag: "AUD" },
  { name: "Boom Pole Carbon 3m", brand: "Rode", model: "Boompole Pro", categoryCode: "audio", zoneCode: "ZONE-CAM-A", dailyRateRupees: 150, replacementValueRupees: 22e3, units: 5, serialTag: "AUD" },
  { name: "Sony MDR-7506 Headphones", brand: "Sony", model: "MDR-7506", categoryCode: "audio", zoneCode: "ZONE-CAM-A", dailyRateRupees: 100, replacementValueRupees: 14e3, units: 8, serialTag: "AUD" }
];
var PRODUCTS = [
  ...REFERENCE_PRODUCTS,
  ...CATALOGUE.map((p, i) => ({ ...p, seq: 240 + i, serialFrom: 100 + i * 100 }))
];
var NPT_OFFSET_MIN2 = 345;
function kathmandu(year, monthIndex, day2, hour, minute = 0) {
  return new Date(Date.UTC(year, monthIndex, day2, hour, minute) - NPT_OFFSET_MIN2 * 6e4);
}
var REFERENCE_BOOKINGS = [
  {
    // `Sample Data.md`'s reference booking. Its figures are the single
    // assertion that catches most financial defects.
    seq: 715,
    clientSeq: 34,
    project: "Annapurna Circuit \u2014 documentary shoot",
    pickupAt: kathmandu(2026, 6, 16, 6),
    returnAt: kathmandu(2026, 6, 19, 6),
    // Packed, not On Rent: the spec's own gate checklist for this booking
    // reads "✗ Items Handed Over", with Outstanding Payment and Deposit
    // Pending both still warning. `validate_booking_gates()` (0010) would
    // reject On Rent for exactly those two reasons.
    stage: "Packed",
    lines: [
      { product: 234, qty: 1 },
      { product: 235, qty: 1 },
      { product: 236, qty: 4 },
      { product: 237, qty: 2 },
      { product: 238, qty: 4 },
      { product: 239, qty: 6 }
    ],
    crew: [
      { name: "Suman Tamang", role: "Camera Assistant", dayRateRupees: 8e3 },
      { name: "Prakash Gurung", role: "Gaffer", dayRateRupees: 8e3 },
      { name: "Nabin Rai", role: "Grip", dayRateRupees: 8e3 }
    ],
    discountPercent: 7,
    discountReason: null,
    discountApproverEmail: null,
    paymentRupees: 15e3,
    depositRequiredRupees: 5e4,
    depositReceivedRupees: 25e3,
    unitsAssigned: true
  },
  {
    // The second booking exists for one reason: `Sample Data.md` requires
    // "a discount above 10% with reason and named approver" in the corpus,
    // and 7% never reaches that branch of the Law 10 gate. It is the row
    // that proves `booking_discounts_over_ten_needs_reason_and_approver`,
    // `invoices_discount_over_ten_needs_reason_and_approver` and
    // `enforce_booking_discount_stacking()` (0044) all accept a *legal*
    // over-threshold discount, not merely that they reject an illegal one.
    seq: 716,
    clientSeq: 34,
    project: "Kathmandu Valley \u2014 brand film",
    pickupAt: kathmandu(2026, 7, 1, 8),
    returnAt: kathmandu(2026, 7, 3, 8),
    stage: "Booked",
    lines: [
      { product: 234, qty: 1 },
      { product: 237, qty: 2 }
    ],
    crew: [],
    discountPercent: 15,
    discountReason: "Repeat production house, three-booking package agreed for Shrawan",
    discountApproverEmail: "manager@babinrentals.com",
    paymentRupees: 0,
    depositRequiredRupees: 0,
    depositReceivedRupees: 0,
    unitsAssigned: false
  }
];
var REFERENCE_CLIENT = {
  seq: 34,
  name: "Sagarmatha Pictures Pvt. Ltd.",
  typeParent: "Organisation",
  orgSubtype: "Production House",
  phone: "+9779801230034",
  email: "bookings@sagarmathapictures.com.np",
  addressLine: "Jhamsikhel, Lalitpur",
  city: "Lalitpur",
  district: "Lalitpur",
  segments: ["Documentary", "Commercial"],
  paymentTerms: "Immediate",
  since: "2024-03-11"
};
function cycle(pool, index) {
  const value = pool[(index % pool.length + pool.length) % pool.length];
  if (value === void 0) fail("cycle() over an empty pool");
  return value;
}
var ORG_STEMS = [
  "Himalaya",
  "Annapurna",
  "Machhapuchhre",
  "Gandaki",
  "Bagmati",
  "Langtang",
  "Manaslu",
  "Dhaulagiri",
  "Rara",
  "Phewa",
  "Gosaikunda",
  "Chitwan",
  "Lumbini",
  "Janaki",
  "Newa",
  "Kirat",
  "Tamang",
  "Sherpa",
  "Everest",
  "Kailash"
];
var ORG_KINDS = [
  { word: "Films", subtype: "Production House", segments: ["Feature", "Documentary"] },
  { word: "Media", subtype: "Broadcaster", segments: ["Corporate"] },
  { word: "Studios", subtype: "Production House", segments: ["Commercial", "Music Video"] },
  { word: "Creatives", subtype: "Corporate / Agency", segments: ["Corporate", "Commercial"] },
  { word: "Rentals", subtype: "Rental House", segments: ["Commercial"] },
  { word: "College of Media", subtype: "College / Institution", segments: ["Documentary"] },
  { word: "Foundation", subtype: "Government / NGO", segments: ["Documentary"] },
  { word: "Weddings", subtype: "Corporate / Agency", segments: ["Wedding / Event"] }
];
var PLACES = [
  { area: "Jhamsikhel", city: "Lalitpur", district: "Lalitpur" },
  { area: "Thamel", city: "Kathmandu", district: "Kathmandu" },
  { area: "Baluwatar", city: "Kathmandu", district: "Kathmandu" },
  { area: "Lakeside", city: "Pokhara", district: "Kaski" },
  { area: "Bharatpur", city: "Chitwan", district: "Chitwan" },
  { area: "Durbar Square", city: "Bhaktapur", district: "Bhaktapur" },
  { area: "Traffic Chowk", city: "Butwal", district: "Rupandehi" },
  { area: "Dharan Road", city: "Biratnagar", district: "Morang" }
];
var INDIVIDUALS = [
  "Rupesh Karki",
  "Sunita Gurung",
  "Bikash Shrestha",
  "Anjali Thapa",
  "Prakash Rai",
  "Nisha Maharjan",
  "Deepak Lama",
  "Sarita Bhandari"
];
var PAYMENT_TERMS = ["Immediate", "7 days", "15 days", "30 days"];
function slug(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "");
}
var CLIENTS = [
  REFERENCE_CLIENT,
  ...Array.from({ length: 31 }, (_, i) => {
    const stem = cycle(ORG_STEMS, i);
    const kind = cycle(ORG_KINDS, i);
    const place = cycle(PLACES, i);
    const name = `${stem} ${kind.word}${kind.subtype === "College / Institution" ? "" : " Pvt. Ltd."}`;
    const seq = 35 + i;
    return {
      seq,
      name,
      typeParent: "Organisation",
      orgSubtype: kind.subtype,
      phone: `+97798${String(112e5 + seq * 137).slice(0, 8)}`,
      email: `bookings@${slug(stem + kind.word)}.com.np`,
      addressLine: `${place.area}, ${place.city}`,
      city: place.city,
      district: place.district,
      segments: kind.segments,
      paymentTerms: cycle(PAYMENT_TERMS, i),
      since: `202${3 + i % 3}-0${1 + i % 9}-1${i % 10}`
    };
  }),
  ...INDIVIDUALS.map((person, i) => {
    const place = cycle(PLACES, i + 3);
    const seq = 66 + i;
    return {
      seq,
      name: person,
      typeParent: "Individual",
      orgSubtype: null,
      phone: `+97798${String(412e5 + seq * 211).slice(0, 8)}`,
      email: `${slug(person)}@gmail.com`,
      addressLine: `${place.area}, ${place.city}`,
      city: place.city,
      district: place.district,
      segments: [cycle(["Wedding / Event", "Music Video", "Documentary"], i)],
      paymentTerms: "Immediate",
      since: `2025-0${1 + i % 9}-2${i % 8}`
    };
  })
];
var ANCHOR = kathmandu(2026, 6, 31, 6, 0);
var DAY_MS = 24 * 60 * 6e4;
var STAGE_PLAN = [
  { stage: "Quote", count: 18, from: 3, to: 30 },
  { stage: "Booked", count: 30, from: 1, to: 24 },
  { stage: "Packed", count: 16, from: 0, to: 2 },
  { stage: "On Rent", count: 24, from: -12, to: -1 },
  { stage: "Returned", count: 14, from: -30, to: -8 },
  { stage: "Closed", count: 16, from: -60, to: -20 }
];
var PROJECTS = [
  "Everest Base Camp Documentary",
  "Nepal Tourism Board TVC",
  "Kathmandu Street Food Series",
  "Himalayan Airlines Safety Film",
  "Ncell Brand Campaign",
  "Chitwan Wildlife Feature",
  "Wedding \u2014 Shrestha / Rai",
  "Pathao Nepal Launch Spot",
  "Sagarmatha Music Video",
  "Lumbini Heritage Short",
  "Nepal Investment Bank AGM",
  "Pokhara Paragliding Promo",
  "Dashain Family Campaign",
  "Annapurna Trek Series",
  "Kathmandu Jazz Festival",
  "Daraz 11.11 Campaign",
  "Nepal Cricket Highlights",
  "Rara Lake Travel Film",
  "F1Soft Corporate Profile",
  "Thamel After Dark"
];
var CREW_POOL = [
  { name: "Anish Tamang", role: "DoP", dayRateRupees: 8e3 },
  { name: "Sabina Rai", role: "Focus Puller", dayRateRupees: 4500 },
  { name: "Kiran Magar", role: "Gaffer", dayRateRupees: 5e3 },
  { name: "Prabin Shrestha", role: "Grip", dayRateRupees: 3500 },
  { name: "Melina Thapa", role: "Sound Recordist", dayRateRupees: 5500 },
  { name: "Roshan Karki", role: "Drone Pilot", dayRateRupees: 7e3 },
  { name: "Dipesh Gurung", role: "Camera Assistant", dayRateRupees: 3e3 },
  { name: "Sujata Basnet", role: "Rental Coordinator", dayRateRupees: 3200 }
];
function spread(i, size, step) {
  return i * step % size;
}
function demoBookings() {
  const out = [];
  let i = 0;
  for (const plan of STAGE_PLAN) {
    for (let n = 0; n < plan.count; n += 1, i += 1) {
      const span = plan.to - plan.from;
      const dayOffset = plan.from + (span === 0 ? 0 : spread(n, span + 1, 7));
      const durationDays = 2 + n % 6;
      const pickupAt = new Date(ANCHOR.getTime() + dayOffset * DAY_MS);
      const returnAt = new Date(pickupAt.getTime() + durationDays * DAY_MS);
      const lineCount = 2 + i % 4;
      const lines = [];
      for (let k = 0; k < lineCount; k += 1) {
        const product = PRODUCTS[spread(i * 5 + k, PRODUCTS.length, 13)];
        if (product === void 0) fail("demoBookings: product pool exhausted");
        if (lines.some((l) => l.product === product.seq)) continue;
        lines.push({ product: product.seq, qty: 1 + (i + k) % Math.min(3, product.units) });
      }
      const crewCount = i % 3;
      const crew = Array.from({ length: crewCount }, (_, c) => cycle(CREW_POOL, i + c));
      const bigDiscount = i % 17 === 0;
      const discountPercent = bigDiscount ? 15 : i % 5 === 0 ? 10 : i % 3 === 0 ? 5 : 0;
      const closed = plan.stage === "Closed";
      const paymentShare = closed ? 1 : cycle([0, 0.25, 0.5, 0.4], i);
      const depositRequiredRupees = i % 4 === 0 ? 0 : 5e3 * (1 + i % 4);
      const depositReceivedRupees = closed ? depositRequiredRupees : i % 3 === 0 ? 0 : depositRequiredRupees / 2;
      const depositRefundedRupees = closed ? depositReceivedRupees : 0;
      out.push({
        seq: 800 + i,
        clientSeq: cycle(CLIENTS, spread(i, CLIENTS.length, 11)).seq,
        project: cycle(PROJECTS, i),
        pickupAt,
        returnAt,
        stage: plan.stage,
        lines,
        crew,
        discountPercent,
        discountReason: bigDiscount ? "Repeat client, multi-week booking negotiated with the owner" : null,
        discountApproverEmail: bigDiscount ? "owner@babinrentals.com" : null,
        paymentRupees: 0,
        paymentShare,
        depositRequiredRupees,
        depositReceivedRupees,
        depositRefundedRupees,
        /* ⚠ Deliberately false on every generated booking.
         *
         * `booking_line_units` names a specific physical unit, and this
         * generator does not model which unit is free on which day. Assigning
         * them by index would put the same `EQ000241-U01` on two bookings whose
         * dates overlap — a lie the floor screens would render as fact, and
         * exactly the class of defect `Sample Data.md` says hand-typed demo data
         * produced. The reference booking keeps its units because its dates are
         * fixed and its units are named by the spec. */
        unitsAssigned: false
      });
    }
  }
  return out;
}
var BOOKINGS = [...REFERENCE_BOOKINGS, ...demoBookings()];
function seedUuid(key) {
  return SEED_UUID_HEX(key);
}
function SEED_UUID_HEX(key) {
  const hex = md5Hex(`babin-rentals-os/seed/${key}`);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}
var MD5_S = [
  7,
  12,
  17,
  22,
  7,
  12,
  17,
  22,
  7,
  12,
  17,
  22,
  7,
  12,
  17,
  22,
  5,
  9,
  14,
  20,
  5,
  9,
  14,
  20,
  5,
  9,
  14,
  20,
  5,
  9,
  14,
  20,
  4,
  11,
  16,
  23,
  4,
  11,
  16,
  23,
  4,
  11,
  16,
  23,
  4,
  11,
  16,
  23,
  6,
  10,
  15,
  21,
  6,
  10,
  15,
  21,
  6,
  10,
  15,
  21,
  6,
  10,
  15,
  21
];
var MD5_K = Array.from({ length: 64 }, (_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296));
function utf8Bytes(input) {
  const out = [];
  for (const ch of input) {
    let cp = ch.codePointAt(0) ?? 0;
    if (cp < 128) out.push(cp);
    else if (cp < 2048) out.push(192 | cp >> 6, 128 | cp & 63);
    else if (cp < 65536) out.push(224 | cp >> 12, 128 | cp >> 6 & 63, 128 | cp & 63);
    else {
      out.push(240 | cp >> 18, 128 | cp >> 12 & 63, 128 | cp >> 6 & 63, 128 | cp & 63);
      cp = 0;
    }
  }
  return out;
}
function md5Hex(input) {
  const bytes = utf8Bytes(input);
  const bitLength = bytes.length * 8;
  bytes.push(128);
  while (bytes.length % 64 !== 56) bytes.push(0);
  for (let i = 0; i < 4; i += 1) bytes.push(bitLength >>> 8 * i & 255);
  for (let i = 0; i < 4; i += 1) bytes.push(Math.floor(bitLength / 4294967296) >>> 8 * i & 255);
  let a0 = 1732584193;
  let b0 = 4023233417;
  let c0 = 2562383102;
  let d0 = 271733878;
  const rotl = (x, c) => x << c | x >>> 32 - c;
  for (let chunk = 0; chunk < bytes.length; chunk += 64) {
    const m = [];
    for (let j = 0; j < 16; j += 1) {
      const o = chunk + j * 4;
      m.push(
        ((bytes[o] ?? 0) | (bytes[o + 1] ?? 0) << 8 | (bytes[o + 2] ?? 0) << 16 | (bytes[o + 3] ?? 0) << 24) >>> 0
      );
    }
    let a = a0;
    let b = b0;
    let c = c0;
    let d = d0;
    for (let i = 0; i < 64; i += 1) {
      let f;
      let g;
      if (i < 16) {
        f = b & c | ~b & d;
        g = i;
      } else if (i < 32) {
        f = d & b | ~d & c;
        g = (5 * i + 1) % 16;
      } else if (i < 48) {
        f = b ^ c ^ d;
        g = (3 * i + 5) % 16;
      } else {
        f = c ^ (b | ~d);
        g = 7 * i % 16;
      }
      const tmp = d;
      d = c;
      c = b;
      const sum = a + f + (MD5_K[i] ?? 0) + (m[g] ?? 0) >>> 0;
      b = b + rotl(sum, MD5_S[i] ?? 0) >>> 0;
      a = tmp;
    }
    a0 = a0 + a >>> 0;
    b0 = b0 + b >>> 0;
    c0 = c0 + c >>> 0;
    d0 = d0 + d >>> 0;
  }
  const le = (n) => Array.from({ length: 4 }, (_, i) => (n >>> 8 * i & 255).toString(16).padStart(2, "0")).join("");
  return le(a0) + le(b0) + le(c0) + le(d0);
}
function fail(message) {
  throw new Error(`Seed generator refused to emit \u2014 ${message}`);
}
function productBySeq(seq) {
  const found = PRODUCTS.find((p) => p.seq === seq);
  if (!found) fail(`no product with equipment sequence ${seq} in PRODUCTS`);
  return found;
}
function sumPaisa(values) {
  return values.reduce((total, v) => total + v, 0);
}
function buildCorpus() {
  if (REFERENCE_CASE_ERROR !== null) fail(REFERENCE_CASE_ERROR);
  const highWater = /* @__PURE__ */ new Map();
  const raise = (key, value) => {
    highWater.set(key, Math.max(highWater.get(key) ?? 0, value));
  };
  for (const c of CLIENTS) raise(SEQUENCES2.client.key, c.seq);
  for (const product of PRODUCTS) raise(SEQUENCES2.equipment.key, product.seq);
  const clientBySeq = new Map(CLIENTS.map((c) => [c.seq, c]));
  const bookings = [];
  let invoiceSeq = 0;
  let paymentSeq = 0;
  let depositSeq = 0;
  for (const spec of BOOKINGS) {
    const bookingNo = recordNo(SEQUENCES2.booking, spec.seq);
    raise(SEQUENCES2.booking.key, spec.seq);
    const clientSpec = clientBySeq.get(spec.clientSeq);
    if (!clientSpec) fail(`${bookingNo}: no client with sequence ${spec.clientSeq} in CLIENTS`);
    const clientCode = recordNo(SEQUENCES2.client, clientSpec.seq);
    const dates = validateRentalDates(spec.pickupAt.toISOString(), spec.returnAt.toISOString());
    if (!dates.valid) fail(`${bookingNo}: ${dates.error ?? "invalid rental dates"}`);
    const days = dates.days;
    const verdict = validateDiscount(spec.discountPercent, spec.discountReason, spec.discountApproverEmail);
    const gate = discountGate(spec.discountPercent, spec.discountReason ?? "", spec.discountApproverEmail);
    if (!verdict.valid) fail(`${bookingNo}: ${verdict.error ?? "discount rejected"}`);
    if (gate.ok !== verdict.valid) {
      fail(`${bookingNo}: discount.ts and money.ts disagree at ${spec.discountPercent}% \u2014 ${gate.ok ? "money.ts accepts" : gate.why}`);
    }
    if (verdict.requiresApproval && (spec.discountReason === null || spec.discountApproverEmail === null)) {
      fail(`${bookingNo}: ${spec.discountPercent}% needs a reason and a named approver (Law 10)`);
    }
    const lines = [];
    const units = [];
    let sortOrder = 0;
    for (const line of spec.lines) {
      const product = productBySeq(line.product);
      const assetCode = recordNo(SEQUENCES2.equipment, product.seq);
      if (line.qty > product.units) {
        fail(`${bookingNo}: ${assetCode} is booked ${line.qty}\xD7 but only ${product.units} unit(s) exist`);
      }
      lines.push({
        clientUuid: seedUuid(`booking_line:${bookingNo}:${assetCode}`),
        assetCode,
        // `ProductSpec.name` already leads with the brand; the brand is its own
        // column on `products` and repeating it here read as "Sony Sony FX9".
        description: product.name,
        qty: line.qty,
        days,
        rateRupees: product.dailyRateRupees,
        lineTotal: rupees(product.dailyRateRupees) * line.qty * days,
        sortOrder: sortOrder += 10
      });
      if (spec.unitsAssigned) {
        for (let n = 0; n < line.qty; n += 1) {
          const assetTag = `${assetCode}-U${String(n + 1).padStart(2, "0")}`;
          units.push({
            clientUuid: seedUuid(`booking_line_unit:${bookingNo}:${assetTag}`),
            assetCode,
            assetTag,
            serialNo: `SN-${product.serialTag}-${String(product.serialFrom + n).padStart(4, "0")}`,
            zoneCode: product.zoneCode,
            replacementValueRupees: product.replacementValueRupees
          });
        }
      }
    }
    const crew = spec.crew.map((member) => ({
      clientUuid: seedUuid(`booking_crew_line:${bookingNo}:${member.name}`),
      name: member.name,
      role: member.role,
      dayRateRupees: member.dayRateRupees,
      days,
      lineTotal: rupees(member.dayRateRupees) * days
    }));
    const equipment = sumPaisa(lines.map((l) => l.lineTotal));
    const crewTotal = sumPaisa(crew.map((c) => c.lineTotal));
    const priced = {
      equipment,
      crew: crewTotal,
      // §2.1 — "Rs 0 on client pickup". Explicit, not omitted.
      transport: rupees(0),
      discountPercent: spec.discountPercent,
      vatPercent: VAT_PERCENT
    };
    const unpaid = price({ ...priced, payments: rupees(0) });
    const payments = spec.paymentShare === void 0 ? rupees(spec.paymentRupees) : Math.round(unpaid.rentalTotal * spec.paymentShare);
    const breakdown = price({ ...priced, payments });
    if (breakdown.outstanding < 0) fail(`${bookingNo}: payments exceed the rental total`);
    const target = BOOKING_STATUS[spec.stage];
    const path = STATUS_ORDER.filter((s) => BOOKING_STATUS[s].order <= target.order);
    const transitions = [];
    let previous = null;
    let offsetMinutes = 0;
    for (const stage of path) {
      if (previous !== null && !canAdvance(previous, stage)) {
        fail(`${bookingNo}: ${previous} \u2192 ${stage} is not a legal advance`);
      }
      transitions.push({
        clientUuid: seedUuid(`booking_stage_transition:${bookingNo}:${stage}`),
        from: previous,
        to: stage,
        // Causal order: strictly increasing, and all before pickup. The
        // "booking confirmed at 09:20 sitting below events at 05:30" defect
        // came from timestamps that did not order.
        occurredAt: new Date(spec.pickupAt.getTime() - (72 - offsetMinutes) * 60 * 6e4)
      });
      previous = stage;
      offsetMinutes += 1;
    }
    const itemCount = lines.reduce((total, l) => total + l.qty, 0);
    if (spec.unitsAssigned) {
      assertItemCounts({ Ready: units.length, "Picked Up": 0, Returned: 0, Missing: 0 }, itemCount);
    }
    const depositPending = rupees(spec.depositRequiredRupees) - rupees(spec.depositReceivedRupees);
    if (depositPending < 0) fail(`${bookingNo}: deposit received exceeds deposit required`);
    const depositHeld = rupees(spec.depositReceivedRupees) - rupees(spec.depositRefundedRupees ?? 0);
    if (depositHeld < 0) fail(`${bookingNo}: deposit refunded exceeds deposit received`);
    const gates = closeGates({
      /* Every booking in this corpus is invoiced and the invoice is issued —
         `INVOICE_ISSUED_STATUS` ('Sent'), set once the figures are final. */
      rentalInvoiced: true,
      rentalOutstandingPaisa: breakdown.outstanding,
      depositHeldPaisa: depositHeld,
      openCases: 0,
      damageChargesPendingApproval: 0
    });
    const closeable = gates.every((g) => g.passing);
    if (closeable !== (spec.stage === "Closed")) {
      fail(
        `${bookingNo}: close gates say closeable=${String(closeable)} but the corpus leaves it at ${spec.stage} \u2014 ` + gates.filter((g) => !g.passing).map((g) => `${g.label} (${g.blocking ?? ""})`).join(", ")
      );
    }
    invoiceSeq += 1;
    raise(SEQUENCES2.invoice.key, invoiceSeq);
    let paymentNo = null;
    if (breakdown.payments > 0) {
      paymentSeq += 1;
      raise(SEQUENCES2.payment.key, paymentSeq);
      paymentNo = recordNo(SEQUENCES2.payment, paymentSeq);
    }
    let depositNo = null;
    if (spec.depositRequiredRupees > 0) {
      depositSeq += 1;
      raise(SEQUENCES2.deposit.key, depositSeq);
      depositNo = recordNo(SEQUENCES2.deposit, depositSeq);
    }
    const bs = toBs(spec.pickupAt);
    bookings.push({
      spec,
      bookingNo,
      clientCode,
      invoiceNo: recordNo(SEQUENCES2.invoice, invoiceSeq),
      paymentNo,
      depositNo,
      days,
      lines,
      crew,
      units,
      transitions,
      breakdown,
      equipment,
      crewTotal,
      depositPending,
      itemCount,
      bsPickup: bs === null ? null : formatBs(bs)
    });
  }
  const reference = bookings.find((b) => b.bookingNo === "B-715");
  if (!reference) fail("B-715 is missing from the corpus \u2014 Sample Data.md names it as the reference booking");
  const mismatches = Object.keys(REFERENCE_CASE).filter((k) => reference.breakdown[k] !== REFERENCE_CASE[k]).map((k) => `${k}: corpus Rs ${toRupees(reference.breakdown[k])}, \xA72.8 Rs ${toRupees(REFERENCE_CASE[k])}`);
  if (mismatches.length > 0) fail(`B-715 does not reproduce Foundation \xA72.8 \u2014 ${mismatches.join("; ")}`);
  if (reference.itemCount !== 18) fail(`B-715 must carry 18 items (Sample Data.md), corpus has ${reference.itemCount}`);
  if (reference.days !== 3) fail(`B-715 must run 3 days (Sample Data.md), corpus has ${reference.days}`);
  const referenceBs = toBs(reference.spec.pickupAt);
  if (referenceBs?.year !== 2083 || referenceBs.month !== 3 || referenceBs.day !== 32) {
    fail("B-715 pickup must convert to 32 Ashadh 2083 (16 Jul 2026 under the corrected BS table)");
  }
  return {
    bookings,
    products: PRODUCTS,
    clients: CLIENTS,
    clientCode: recordNo(SEQUENCES2.client, REFERENCE_CLIENT.seq),
    sequenceHighWater: highWater
  };
}
function txt(value) {
  return `'${value.replace(/'/g, "''")}'`;
}
function user(email) {
  return `(select id from users where email = ${txt(email)})`;
}
var OWNER = user("owner@babinrentals.com");
var WAREHOUSE_STAFF = user("warehouse@babinrentals.com");
var BILLING = user("billing@babinrentals.com");

// src/lib/format.ts
function parseBookingNoSearch(term) {
  const t = term.trim();
  const m = /^(?:#|[Bb]-)(\d+)$/.exec(t);
  return m ? m[1] : t;
}

// src/data/documents.ts
var DOCUMENTS = [
  { id: "DMG-2026-0041", name: "Damage Report", type: "Damage Report", category: "Cases", relatedTo: "CASE-2026-0041", relatedKind: "case", party: "Himalayan Films", branch: "Boudha", status: "Draft", recordState: "Case: Open", recordTone: "progress", createdAd: new Date(Date.UTC(2026, 6, 31)), createdTime: "10:15 AM" },
  // relatedTo/party corrected from B-715 to B-709 — a Return
  // Report cannot exist for a booking still at status Booked (pre-Pack, per
  // data/booking.ts). B-709 (data/rentals.ts) is the one actually
  // On Rent with a "Return Today" tag, which this record's own date/status
  // already matches; it was just attached to the wrong booking number.
  { id: "RTN-2026-0709", name: "Return Report", type: "Return Report", category: "Operations", relatedTo: "B-709", relatedKind: "booking", party: "Mountain Stories", branch: "Boudha", status: "Pending Signature", recordState: "Booking: On Rent", recordTone: "out", createdAd: new Date(Date.UTC(2026, 6, 31)), createdTime: "10:10 AM", ageing: "Today" },
  { id: "RA-2026-0716", name: "Rental Agreement", type: "Rental Agreement", category: "Rental", relatedTo: "B-716", relatedKind: "booking", party: "Creative Studio", branch: "Boudha", status: "Pending Signature", recordState: "Booking: Booked", recordTone: "primary", createdAd: new Date(Date.UTC(2026, 6, 29)), createdTime: "09:05 AM", ageing: "2d" },
  { id: "CN-2026-0012", name: "Credit Note", type: "Credit Note", category: "Finance", relatedTo: "B-710", relatedKind: "booking", party: "Vision Production", branch: "Thamel", status: "Issued", recordState: "Invoice: Adjusted", recordTone: "neutral", createdAd: new Date(Date.UTC(2026, 6, 28)), createdTime: "12:15 PM", finance: true },
  { id: "INV-161", name: "Tax Invoice", type: "Tax Invoice", category: "Finance", relatedTo: "B-716", relatedKind: "booking", party: "Creative Studio", branch: "Boudha", status: "Issued", recordState: "Invoice: Unpaid", recordTone: "progress", createdAd: new Date(Date.UTC(2026, 6, 28)), createdTime: "10:40 AM", finance: true },
  // id/recordState/recordTone realigned to Finance.tsx's INV-492 for
  // this booking — was a second, differently-numbered invoice claiming
  // "Paid" while the real one (and the booking's own Outstanding) says
  // Rs 1,24,506 is still owed. Two invoice numbers for one booking with
  // opposite payment states was the P0 finding; this makes them one record.
  { id: "INV-492", name: "Tax Invoice", type: "Tax Invoice", category: "Finance", relatedTo: "B-715", relatedKind: "booking", party: "Himalayan Films", branch: "Boudha", status: "Issued", recordState: "Invoice: Unpaid", recordTone: "progress", createdAd: new Date(Date.UTC(2026, 6, 27)), createdTime: "11:40 AM", finance: true },
  { id: "RA-2026-0715", name: "Rental Agreement", type: "Rental Agreement", category: "Rental", relatedTo: "B-715", relatedKind: "booking", party: "Himalayan Films", branch: "Boudha", status: "Signed", recordState: "Booking: On Rent", recordTone: "out", createdAd: new Date(Date.UTC(2026, 6, 27)), createdTime: "11:35 AM", signer: "Himalayan Films", versions: [{ version: "v1 (Draft)", ad: "25 Jul 2026" }, { version: "v2 (Signed)", ad: "27 Jul 2026" }] },
  { id: "DLV-2026-0715", name: "Delivery Note", type: "Delivery Note", category: "Operations", relatedTo: "B-715", relatedKind: "booking", party: "Himalayan Films", branch: "Boudha", status: "Issued", recordState: "Sent \xB7 26 Jul, 06:40 PM", recordTone: "neutral", createdAd: new Date(Date.UTC(2026, 6, 26)), createdTime: "06:25 PM" },
  { id: "PKL-2026-0715", name: "Packing List", type: "Packing List", category: "Operations", relatedTo: "B-715", relatedKind: "booking", party: "Himalayan Films", branch: "Boudha", status: "Issued", recordState: "Sent \xB7 26 Jul, 06:30 PM", recordTone: "neutral", createdAd: new Date(Date.UTC(2026, 6, 26)), createdTime: "06:20 PM" },
  { id: "RCT-2026-0321", name: "Receipt", type: "Receipt", category: "Finance", relatedTo: "PAY-2026-0745", relatedKind: "payment", party: "Himalayan Films", branch: "Boudha", status: "Issued", recordState: "Payment: Cleared", recordTone: "in", createdAd: new Date(Date.UTC(2026, 6, 26)), createdTime: "11:30 AM", finance: true },
  { id: "DLV-2026-0716", name: "Delivery Note", type: "Delivery Note", category: "Operations", relatedTo: "B-716", relatedKind: "booking", party: "Creative Studio", branch: "Boudha", status: "Pending Signature", recordState: "Booking: Booked", recordTone: "primary", createdAd: new Date(Date.UTC(2026, 6, 25)), createdTime: "05:20 PM", ageing: "6d", ageingSevere: true },
  { id: "PKL-2026-0716", name: "Packing List", type: "Packing List", category: "Operations", relatedTo: "B-716", relatedKind: "booking", party: "Creative Studio", branch: "Boudha", status: "Draft", recordState: "Booking: Booked", recordTone: "primary", createdAd: new Date(Date.UTC(2026, 6, 25)), createdTime: "05:15 PM" },
  { id: "INS-2026-0710", name: "Inspection Report", type: "Inspection Report", category: "Operations", relatedTo: "B-710", relatedKind: "booking", party: "Vision Production", branch: "Thamel", status: "Signed", recordState: "Booking: Closed", recordTone: "neutral", createdAd: new Date(Date.UTC(2026, 6, 25)), createdTime: "03:40 PM" },
  { id: "SVC-2026-0012", name: "Service Report", type: "Service Report", category: "Maintenance", relatedTo: "MT-2026-0012", relatedKind: "job", party: "Tech Solutions Nepal", branch: "Boudha", status: "Pending Approval", recordState: "Job: In Progress", recordTone: "progress", createdAd: new Date(Date.UTC(2026, 6, 24)), createdTime: "04:15 PM" },
  { id: "JOB-2026-0012", name: "Job Card", type: "Job Card", category: "Maintenance", relatedTo: "MT-2026-0012", relatedKind: "job", party: "In-House", branch: "Boudha", status: "Issued", recordState: "Job: In Progress", recordTone: "progress", createdAd: new Date(Date.UTC(2026, 6, 24)), createdTime: "09:30 AM" },
  { id: "RA-2026-0710", name: "Rental Agreement", type: "Rental Agreement", category: "Rental", relatedTo: "B-710", relatedKind: "booking", party: "Vision Production", branch: "Thamel", status: "Signed", recordState: "Booking: Closed", recordTone: "neutral", createdAd: new Date(Date.UTC(2026, 6, 24)), createdTime: "08:55 AM", signer: "Vision Production" },
  { id: "ICL-2026-0004", name: "Insurance Claim", type: "Insurance Claim", category: "Cases", relatedTo: "CASE-2026-0041", relatedKind: "case", party: "Sagarmatha Insurance", branch: "Boudha", status: "Pending Approval", recordState: "Case: Open", recordTone: "progress", createdAd: new Date(Date.UTC(2026, 6, 22)), createdTime: "02:40 PM" },
  { id: "INC-2026-0034", name: "Incident Report", type: "Incident Report", category: "Cases", relatedTo: "CASE-2026-0041", relatedKind: "case", party: "Himalayan Films", branch: "Boudha", status: "Issued", recordState: "Case: Open", recordTone: "progress", createdAd: new Date(Date.UTC(2026, 6, 22)), createdTime: "02:05 PM" },
  { id: "RA-2026-0711", name: "Rental Agreement", type: "Rental Agreement", category: "Rental", relatedTo: "B-711", relatedKind: "booking", party: "Inside Out Films", branch: "Patan", status: "Draft", recordState: "Booking: Quote", recordTone: "neutral", createdAd: new Date(Date.UTC(2026, 6, 21)), createdTime: "05:20 PM" },
  { id: "Q-88", name: "Quotation", type: "Quotation", category: "Finance", relatedTo: "B-713", relatedKind: "booking", party: "Mirage Weddings", branch: "Patan", status: "Expired", recordState: "Quote validity ended", recordTone: "danger", createdAd: new Date(Date.UTC(2026, 6, 21)), createdTime: "04:10 PM", finance: true },
  { id: "INS-2026-0221", name: "Inspection Report", type: "Inspection Report", category: "Inventory", relatedTo: "EQ-RED-0004", relatedKind: "equipment", party: "In-House", branch: "Boudha", status: "Signed", recordState: "Equipment: Available", recordTone: "in", createdAd: new Date(Date.UTC(2026, 6, 20)), createdTime: "11:10 AM" },
  { id: "DMG-2026-0198", name: "Damage Report", type: "Damage Report", category: "Inventory", relatedTo: "SN-AP6-0204", relatedKind: "equipment", party: "In-House", branch: "Boudha", status: "Issued", recordState: "Equipment: Maintenance", recordTone: "progress", createdAd: new Date(Date.UTC(2026, 6, 19)), createdTime: "03:05 PM" },
  { id: "JOB-2026-0018", name: "Job Card", type: "Job Card", category: "Maintenance", relatedTo: "MT-2026-0018", relatedKind: "job", party: "In-House", branch: "Thamel", status: "Draft", recordState: "Job: Scheduled", recordTone: "primary", createdAd: new Date(Date.UTC(2026, 6, 19)), createdTime: "09:15 AM" },
  /* §7 — a template carries its id **and** its version; documents pin the
     version they were generated from, so editing a template never rewrites a
     signed agreement. */
  { id: "RA \xB7 v4", name: "Rental Agreement", type: "Template", category: "Templates", relatedTo: "\u2014", relatedKind: "template", party: "In-House", branch: "All Branches", status: "Issued", recordState: "Active \xB7 412 documents pinned", recordTone: "in", createdAd: new Date(Date.UTC(2026, 6, 18)), createdTime: "10:00 AM" },
  { id: "INV \xB7 v2", name: "Tax Invoice", type: "Template", category: "Templates", relatedTo: "\u2014", relatedKind: "template", party: "In-House", branch: "All Branches", status: "Issued", recordState: "Active \xB7 268 documents pinned", recordTone: "in", createdAd: new Date(Date.UTC(2026, 6, 18)), createdTime: "09:45 AM", finance: true },
  /* Archived — kept, reachable, never deleted (§6). */
  { id: "INV-140", name: "Tax Invoice", type: "Tax Invoice", category: "Finance", archived: true, relatedTo: "B-709", relatedKind: "booking", party: "Lumen House", branch: "Thamel", status: "Void", recordState: "Voided \xB7 replaced by INV-141", recordTone: "danger", createdAd: new Date(Date.UTC(2026, 6, 19)), createdTime: "04:30 PM", finance: true },
  { id: "RA-2026-0702", name: "Rental Agreement", type: "Rental Agreement", category: "Rental", archived: true, relatedTo: "B-702", relatedKind: "booking", party: "Mountain Stories", branch: "Boudha", status: "Signed", recordState: "Superseded by RA-2026-0703", recordTone: "neutral", createdAd: new Date(Date.UTC(2026, 6, 18)), createdTime: "02:15 PM" }
];

// src/lib/__mocks__/corpus.ts
var import_meta = {};
var UNSERVED = [
  "expenses",
  "membership_plans",
  "operation_sessions",
  "cleaning_queue_entries",
  "client_flags",
  "payment_reversals",
  "external_refs",
  "external_invoices",
  "sync_conflicts",
  "sync_outbox"
];
var id = (key) => seedUuid(`id:${key}`);
var money = (p) => Number(toRupees(p).toFixed(2));
var iso = (d) => d.toISOString();
var day = (d) => iso(d).slice(0, 10);
var BRANCH_ID = "00000000-0000-0000-0000-000000000001";
var BRANCH_PKR_ID = "00000000-0000-0000-0000-000000000002";
var WAREHOUSE_ID = "00000000-0000-0000-0000-000000000011";
var WAREHOUSE_PKR_ID = "00000000-0000-0000-0000-000000000012";
var USERS = [
  { id: id("user:owner"), client_uuid: seedUuid("user:owner"), email: "owner@babinrentals.com", full_name: "Babin Dulal", primary_role: "Owner", is_active: true, branch_id: BRANCH_ID, created_at: iso(/* @__PURE__ */ new Date("2026-01-01T00:00:00Z")) },
  { id: id("user:warehouse"), client_uuid: seedUuid("user:warehouse"), email: "warehouse@babinrentals.com", full_name: "Ram Thapa", primary_role: "Warehouse", is_active: true, branch_id: BRANCH_ID, created_at: iso(/* @__PURE__ */ new Date("2026-01-01T00:00:00Z")) },
  { id: id("user:billing"), client_uuid: seedUuid("user:billing"), email: "billing@babinrentals.com", full_name: "Sita Sharma", primary_role: "Accounts", is_active: true, branch_id: BRANCH_ID, created_at: iso(/* @__PURE__ */ new Date("2026-01-01T00:00:00Z")) }
];
var BRANCHES = [
  { id: BRANCH_ID, client_uuid: "a0000000-0000-0000-0000-000000000001", branch_code: "BR-KTM-01", name: "Kathmandu Main HQ", city: "Kathmandu", is_active: true, created_at: iso(/* @__PURE__ */ new Date("2026-01-01T00:00:00Z")) },
  { id: BRANCH_PKR_ID, client_uuid: "a0000000-0000-0000-0000-000000000002", branch_code: "BR-PKR-01", name: "Pokhara Branch", city: "Pokhara", is_active: true, created_at: iso(/* @__PURE__ */ new Date("2026-01-01T00:00:00Z")) }
];
var WAREHOUSES = [
  { id: WAREHOUSE_ID, client_uuid: "b0000000-0000-0000-0000-000000000011", warehouse_code: "WH-KTM-MAIN", name: "Central Camera Vault", branch_id: BRANCH_ID, address: "Anamnagar, Kathmandu", status: "Active", is_primary: true, is_active: true },
  { id: WAREHOUSE_PKR_ID, client_uuid: "b0000000-0000-0000-0000-000000000012", warehouse_code: "WH-PKR-MAIN", name: "Lakeside Equipment Hub", branch_id: BRANCH_PKR_ID, address: "Lakeside, Pokhara", status: "Active", is_primary: true, is_active: true }
];
var CATEGORIES2 = [
  ["camera", "Camera", "Cinema & Mirrorless Cameras"],
  ["lens", "Lens", "Cinema Primes, Zooms, Anamorphic"],
  ["lighting", "Lighting", "Continuous LED, COB, Softboxes"],
  ["audio", "Audio", "Wireless Mics, Boom, Field Recorders"],
  ["grip", "Grip", "C-Stands, Jibs, Heavy Grip"],
  ["support", "Support", "Tripods, Gimbals, Sliders"],
  ["drone", "Drone", "Drones & Aerial Systems"],
  ["monitor", "Monitor", "Production, Director & On-Camera Monitors"],
  ["power", "Power", "V-Mount Batteries, Chargers & Power Stations"],
  ["media", "Media", "Memory Cards, SSDs & Card Readers"],
  ["computing", "Computing", "DIT Stations, Laptops & Video Switchers"],
  ["case", "Case", "Hard Cases & Flight Cases"],
  ["bag", "Bag", "Soft Bags, Backpacks & Pouches"],
  ["accessory", "Accessory", "Cables, Adapters, Matte Boxes, Follow Focus & Rigging"],
  ["consumable", "Consumable", "Gaffer Tape, Gels & Expendables"],
  ["vehicle", "Vehicle", "Production Vans, Trucks & Vehicles"],
  ["other", "Other", "Crew Services & Miscellaneous Equipment"]
].map(([code, name, description], i) => {
  const hex = String(501 + i).padStart(12, "0");
  return {
    id: `00000000-0000-0000-0000-${hex}`,
    client_uuid: `20000000-0000-0000-0000-${hex}`,
    code,
    name,
    description,
    sort_order: i + 1,
    display_order: i + 1,
    is_active: true
  };
});
var CATEGORY_ID_BY_CODE = new Map(CATEGORIES2.map((c) => [c["code"], c["id"]]));
var ZONES = ["ZONE-CAM-A", "ZONE-LENS-B", "ZONE-GRIP-C"].map((code, i) => ({
  id: id(`zone:${code}`),
  client_uuid: seedUuid(`zone:${code}`),
  code,
  name: code,
  warehouse_id: WAREHOUSE_ID,
  sort_order: i + 1,
  is_active: true
}));
var EXPENSE_CATEGORIES = [
  ["EXP-FUEL", "Fuel & Transport"],
  ["EXP-REP", "Repairs & Maintenance"],
  ["EXP-RENT", "Rent & Utilities"],
  ["EXP-SAL", "Salaries & Wages"],
  ["EXP-MISC", "Miscellaneous"]
].map(([code, name], i) => ({
  id: id(`expcat:${code}`),
  client_uuid: seedUuid(`expcat:${code}`),
  code,
  name,
  display_order: i + 1,
  is_active: true
}));
function buildStore(options) {
  const isSeeded = options?.seeded ?? import_meta.env?.["VITE_MOCK_SEEDED"] === "true";
  if (!isSeeded) {
    const emptyStore = {
      users: USERS,
      branches: BRANCHES,
      warehouses: WAREHOUSES,
      inventory_categories: CATEGORIES2,
      storage_zones: ZONES,
      expense_categories: EXPENSE_CATEGORIES,
      clients: [],
      products: [],
      product_units: [],
      bookings: [],
      booking_lines: [],
      booking_line_units: [],
      booking_crew_lines: [],
      invoices: [],
      payments: [],
      security_deposits: [],
      booking_stage_transitions: [],
      bundles: [],
      bundle_items: [],
      inventory_reservations: [],
      suppliers: [],
      purchase_requests: [],
      stock_transfers: [],
      stock_transfer_lines: [],
      document_registry: []
    };
    for (const t of UNSERVED) emptyStore[t] = [];
    emptyStore["probe"] = [];
    return emptyStore;
  }
  const corpus = buildCorpus();
  const clients = corpus.clients.map((c) => {
    const code = `C-${c.seq}`;
    return {
      id: id(`client:${code}`),
      client_uuid: seedUuid(`client:${code}`),
      client_code: code,
      name: c.name,
      type_parent: c.typeParent,
      org_subtype: c.orgSubtype,
      phone: c.phone,
      email: c.email,
      address_line: c.addressLine,
      city: c.city,
      district: c.district,
      country: "Nepal",
      segments: c.segments,
      payment_terms: c.paymentTerms,
      client_since: c.since,
      status: "Active",
      pan_vat: null,
      business_registration: null,
      website: null,
      approved_credit_limit: null,
      deactivated_at: null,
      created_at: `${c.since}T04:15:00.000Z`
    };
  });
  const clientByCode = new Map(clients.map((c) => [c["client_code"], c]));
  const products = corpus.products.map((p) => {
    const assetCode = `EQ${String(p.seq).padStart(6, "0")}`;
    return {
      id: id(`product:${assetCode}`),
      client_uuid: seedUuid(`product:${assetCode}`),
      asset_code: assetCode,
      name: p.name,
      short_name: p.name.length > 24 ? `${p.name.slice(0, 21)}\u2026` : p.name,
      brand: p.brand,
      model: p.model,
      manufacturer: p.brand,
      category_id: CATEGORY_ID_BY_CODE.get(p.categoryCode) ?? null,
      tracking_mode: "Serialised",
      status: "Active",
      total_quantity: p.units,
      reorder_level: 0,
      quantity_unit: "unit",
      daily_rate: p.dailyRateRupees,
      replacement_value: p.replacementValueRupees,
      weekly_rate: null,
      monthly_rate: null,
      hourly_rate: null,
      weekend_rate: null,
      purchase_price: null,
      purchase_date: null,
      deposit_percent: null,
      deposit_fixed: null,
      min_rental_days: 1,
      rental_enabled: true,
      is_subrental_only: false,
      is_active: true,
      description: null,
      thumbnail_url: null,
      supplier_id: null,
      notes_internal: null,
      notes_warehouse: null,
      notes_rental: null,
      created_at: iso(/* @__PURE__ */ new Date("2026-02-01T04:15:00Z"))
    };
  });
  const productUnits = [];
  for (const p of corpus.products) {
    const assetCode = `EQ${String(p.seq).padStart(6, "0")}`;
    for (let n = 0; n < p.units; n++) {
      const tag = `${assetCode}-U${String(n + 1).padStart(2, "0")}`;
      productUnits.push({
        id: id(`product_unit:${tag}`),
        client_uuid: seedUuid(`product_unit:${tag}`),
        product_id: id(`product:${assetCode}`),
        asset_tag: tag,
        serial_no: `SN-${p.serialTag}-${String(p.serialFrom + n).padStart(4, "0")}`,
        barcode: tag,
        qr_code: tag,
        // `product_units_v.status` — the live vocabulary is In Stock ·
        // Reserved · Packed · On Rent · Returning · Inspection · Cleaning ·
        // Maintenance · Missing · Retired (queries/inventory.ts:195). "Available"
        // is a DERIVED band in the UI, never a stored status.
        status: "In Stock",
        condition: "Good",
        branch_id: BRANCH_ID,
        warehouse_id: WAREHOUSE_ID,
        storage_zone_id: id(`zone:${p.zoneCode}`),
        replacement_value: p.replacementValueRupees,
        purchase_price: null,
        rack: null,
        shelf: null,
        bin: null,
        container_id: null,
        retired_at: null,
        created_at: iso(/* @__PURE__ */ new Date("2026-02-01T04:15:00Z"))
      });
    }
  }
  const bookings = [];
  const bookingLines = [];
  const bookingLineUnits = [];
  const crewLines = [];
  const invoices = [];
  const payments = [];
  const deposits = [];
  const transitions = [];
  const productBySeq2 = new Map(corpus.products.map((p) => [p.seq, p]));
  for (const b of corpus.bookings) {
    const bId = id(`booking:${b.bookingNo}`);
    const client = clientByCode.get(b.clientCode);
    const clientId = client?.["id"] ?? null;
    const stage = b.spec.stage;
    bookings.push({
      id: bId,
      client_uuid: seedUuid(`booking:${b.bookingNo}`),
      // R-10: store the bare number; preserve fixture keys/UUIDs for all joins.
      booking_no: parseBookingNoSearch(b.bookingNo),
      client_id: clientId,
      project: b.spec.project,
      stage,
      pickup_at: iso(b.spec.pickupAt),
      return_at: iso(b.spec.returnAt),
      actual_return_at: stage === "Returned" || stage === "Closed" ? iso(b.spec.returnAt) : null,
      delivery_type: "Pickup",
      pickup_location: "Kathmandu Main",
      return_location: "Kathmandu Main",
      quote_expires_at: stage === "Quote" ? iso(new Date(b.spec.pickupAt.getTime() - 3 * 864e5)) : null,
      cancelled_at: null,
      closed_at: stage === "Closed" ? iso(b.spec.returnAt) : null,
      branch_id: BRANCH_ID,
      deposit_required: money(b.depositPending),
      rental_total: money(b.breakdown.rentalTotal),
      outstanding_amount: money(b.breakdown.outstanding),
      created_at: iso(new Date(b.spec.pickupAt.getTime() - 7 * 864e5))
    });
    for (const l of b.lines) {
      bookingLines.push({
        id: id(`booking_line:${b.bookingNo}:${l.assetCode}`),
        client_uuid: l.clientUuid,
        booking_id: bId,
        product_id: id(`product:${l.assetCode}`),
        description: l.description,
        qty: l.qty,
        days: l.days,
        rate: l.rateRupees,
        line_total: money(l.lineTotal),
        sort_order: l.sortOrder,
        voided_at: null
      });
    }
    const lineByAsset = new Map(b.lines.map((l) => [l.assetCode, l]));
    for (const u of b.units) {
      const line = lineByAsset.get(u.assetCode);
      if (!line) continue;
      bookingLineUnits.push({
        id: id(`blu:${b.bookingNo}:${u.assetTag}`),
        client_uuid: u.clientUuid,
        booking_id: bId,
        booking_line_id: id(`booking_line:${b.bookingNo}:${u.assetCode}`),
        asset_id: id(`product_unit:${u.assetTag}`),
        qty: 1,
        // `item_quantity_state` (0001) — Ready · Picked Up · Returned · Missing
        // · Damaged. Derived from the booking's stage so a Returned booking does
        // not render units still waiting to be collected.
        unit_state: stage === "Closed" || stage === "Returned" ? "Returned" : stage === "On Rent" ? "Picked Up" : "Ready",
        is_required: true,
        packed: stage !== "Quote" && stage !== "Booked",
        damaged: false,
        condition: null,
        created_at: iso(b.spec.pickupAt)
      });
    }
    for (const c of b.crew) {
      crewLines.push({
        id: id(`crew_line:${b.bookingNo}:${c.name}`),
        client_uuid: c.clientUuid,
        booking_id: bId,
        crew_name: c.name,
        role: c.role,
        day_rate: c.dayRateRupees,
        days: c.days,
        line_total: money(c.lineTotal),
        voided_at: null
      });
    }
    invoices.push({
      id: id(`invoice:${b.invoiceNo}`),
      client_uuid: seedUuid(`invoice:${b.invoiceNo}`),
      invoice_no: b.invoiceNo,
      booking_id: bId,
      client_id: clientId,
      /*
       * ⛔ This wrote `'Issued'`, which is not a member of `invoice_status`
       * (Draft · Sent · Partially Paid · Paid · Overdue · Void, 0001) — it
       * belongs to `document_lifecycle_status`, a different enum for a different
       * table (X-07). Finance's unsettled set is `['Sent', 'Partially Paid']`,
       * so it matched nothing: the Finance dashboard and the Daily Closing both
       * read "Outstanding Rs 0 · every issued invoice has been settled" while
       * Booking Detail showed Rs 25,934 owed on one of those same invoices. Two
       * screens, one invoice, two answers about what a client is billed.
       *
       * The status is now DERIVED from the figures beside it, mirroring
       * `sync_payment_to_invoice()` (0010) — which is what sets it live, and
       * which the mock engine does not run. `INVOICE_ISSUED_STATUS` is `seed.ts`'s
       * own constant for "raised, nothing paid", so the mimic and the SQL
       * emitter cannot answer differently.
       */
      status: b.breakdown.payments === 0 ? INVOICE_ISSUED_STATUS : b.breakdown.outstanding === 0 ? "Paid" : "Partially Paid",
      subtotal: money(b.breakdown.subtotal),
      discount_amount: money(b.breakdown.discount),
      taxable_amount: money(b.breakdown.taxable),
      vat_amount: money(b.breakdown.vat),
      total_amount: money(b.breakdown.rentalTotal),
      paid_amount: money(b.breakdown.payments),
      outstanding_amount: money(b.breakdown.outstanding),
      issue_date: day(b.spec.pickupAt),
      due_date: day(new Date(b.spec.pickupAt.getTime() + 15 * 864e5)),
      voided_at: null,
      created_at: iso(b.spec.pickupAt)
    });
    if (b.paymentNo) {
      payments.push({
        id: id(`payment:${b.paymentNo}`),
        client_uuid: seedUuid(`payment:${b.paymentNo}`),
        payment_no: b.paymentNo,
        booking_id: bId,
        invoice_id: id(`invoice:${b.invoiceNo}`),
        client_id: clientId,
        amount: money(b.breakdown.payments),
        payment_type: "Rental",
        method: "Bank Transfer",
        status: "Received",
        payment_date: day(b.spec.pickupAt),
        reference: b.bookingNo,
        reversed_at: null,
        created_at: iso(b.spec.pickupAt)
      });
    }
    if (b.depositNo) {
      deposits.push({
        id: id(`deposit:${b.depositNo}`),
        client_uuid: seedUuid(`deposit:${b.depositNo}`),
        deposit_no: b.depositNo,
        booking_id: bId,
        client_id: clientId,
        required_amount: b.spec.depositRequiredRupees,
        received_amount: b.spec.depositReceivedRupees,
        refunded_amount: 0,
        applied_amount: 0,
        status: b.spec.depositReceivedRupees > 0 ? "Held" : "Pending",
        created_at: iso(b.spec.pickupAt)
      });
    }
    for (const t of b.transitions) {
      transitions.push({
        id: id(`transition:${b.bookingNo}:${t.to}`),
        client_uuid: t.clientUuid,
        booking_id: bId,
        from_stage: t.from,
        to_stage: t.to,
        occurred_at: iso(t.occurredAt),
        actor_id: USERS[0]?.["id"] ?? null,
        created_at: iso(t.occurredAt)
      });
    }
  }
  const bundles = [];
  const bundleItems = [];
  {
    const kits = [
      { code: "BND-001", name: "Documentary Camera Kit", daily: 18e3, active: true, take: [0, 1, 2] },
      { code: "BND-002", name: "Lighting Starter Kit", daily: 9e3, active: true, take: [3, 4] },
      { code: "BND-003", name: "Retired Podcast Kit", daily: 6e3, active: false, take: [5] }
    ];
    for (const kit of kits) {
      const members = kit.take.map((i) => products[i]).filter((row) => row !== void 0);
      if (members.length === 0) continue;
      const bundleId = id(`bundle:${kit.code}`);
      bundles.push({
        id: bundleId,
        client_uuid: seedUuid(`bundle:${kit.code}`),
        bundle_code: kit.code,
        name: kit.name,
        description: null,
        category_id: members[0]?.["category_id"] ?? null,
        daily_rate: kit.daily,
        weekly_rate: kit.daily * 5,
        is_active: kit.active,
        created_at: "2026-08-01T04:00:00.000Z",
        created_by: USERS[0]?.["id"] ?? null,
        updated_at: "2026-08-01T04:00:00.000Z",
        updated_by: null
      });
      members.forEach((product, index) => {
        bundleItems.push({
          id: id(`bundle_item:${kit.code}:${index}`),
          client_uuid: seedUuid(`bundle_item:${kit.code}:${index}`),
          bundle_id: bundleId,
          product_id: product["id"],
          quantity: index === 0 ? 1 : 2,
          days: 1,
          is_mandatory: index === 0,
          sort_order: index,
          created_at: "2026-08-01T04:00:00.000Z",
          created_by: USERS[0]?.["id"] ?? null
        });
      });
    }
  }
  const reservations = [];
  {
    const kitB = bundles.find((b) => b["bundle_code"] === "BND-002");
    const kitBItems = bundleItems.filter((i) => i["bundle_id"] === kitB?.["id"]);
    const lastItem = kitBItems.length > 0 ? kitBItems[kitBItems.length - 1] : void 0;
    const held = productUnits.filter((u) => u["product_id"] === lastItem?.["product_id"]);
    const booking = bookings[0];
    held.forEach((unit, index) => {
      reservations.push({
        id: id(`reservation:nov:${index}`),
        client_uuid: seedUuid(`reservation:nov:${index}`),
        booking_id: booking?.["id"] ?? null,
        asset_id: unit["id"],
        /* Postgres's own text form for a tstzrange — a space rather than `T`
           and `+00` rather than `Z`, which is what `parseTstzRange` normalises. */
        period: '["2026-11-10 04:00:00+00","2026-11-17 04:00:00+00")',
        released_at: null,
        created_at: "2026-08-01T04:00:00.000Z"
      });
    });
  }
  const suppliers = [
    { id: id("supplier:SUP-001"), client_uuid: seedUuid("supplier:SUP-001"), supplier_code: "SUP-001", name: "Everest Broadcast Supply", created_at: "2026-01-10T04:00:00.000Z" },
    { id: id("supplier:SUP-002"), client_uuid: seedUuid("supplier:SUP-002"), supplier_code: "SUP-002", name: "Kathmandu Camera House", created_at: "2026-01-10T04:00:00.000Z" }
  ];
  const purchaseRequests = [];
  {
    const specs = [
      { no: "PR-2026-0001", take: 0, qty: 2, unit: 185e3, status: "Submitted", reason: "Demand exceeded", urgency: "High", supplier: 0, rejected: null },
      { no: "PR-2026-0002", take: 1, qty: 1, unit: 92e3, status: "Approved", reason: "Sub-rent event", urgency: "Normal", supplier: 1, rejected: null },
      { no: "PR-2026-0003", take: 2, qty: 4, unit: 15500, status: "Draft", reason: "Manual", urgency: "Low", supplier: null, rejected: null },
      { no: "PR-2026-0004", take: 3, qty: 1, unit: 24e4, status: "Rejected", reason: "Demand exceeded", urgency: "Normal", supplier: 0, rejected: "too expensive" }
    ];
    specs.forEach((spec, index) => {
      const product = products[spec.take];
      if (product === void 0) return;
      const supplier = spec.supplier === null ? null : suppliers[spec.supplier];
      purchaseRequests.push({
        id: id(`purchase_request:${spec.no}`),
        client_uuid: seedUuid(`purchase_request:${spec.no}`),
        pr_no: spec.no,
        product_id: product["id"],
        supplier_id: supplier?.["id"] ?? null,
        quantity: spec.qty,
        estimated_unit_cost: spec.unit,
        total_estimated_cost: spec.unit * spec.qty,
        reason_type: spec.reason,
        urgency: spec.urgency,
        status: spec.status,
        requested_by: USERS[0]?.["id"] ?? null,
        approved_by: spec.status === "Approved" || spec.status === "Rejected" ? USERS[0]?.["id"] ?? null : null,
        rejection_reason: spec.rejected,
        created_at: `2026-08-${String(10 + index).padStart(2, "0")}T04:00:00.000Z`,
        created_by: USERS[0]?.["id"] ?? null,
        updated_at: `2026-08-${String(10 + index).padStart(2, "0")}T04:00:00.000Z`,
        updated_by: null
      });
    });
  }
  const stockTransfers = [];
  const stockTransferLines = [];
  {
    const specs = [
      { no: "TR-2026-0001", kind: "Zone Transfers", status: "In Transit", from: 0, to: 1, take: [0, 1], dispatched: true, received: false },
      { no: "TR-2026-0002", kind: "Zone Transfers", status: "Received", from: 1, to: 2, take: [2], dispatched: true, received: true },
      { no: "TR-2026-0003", kind: "Temporary Holding", status: "Completed", from: 2, to: 0, take: [3, 4], dispatched: true, received: true }
    ];
    specs.forEach((spec, index) => {
      const transferId = id(`stock_transfer:${spec.no}`);
      const day2 = `2026-08-${String(20 + index).padStart(2, "0")}`;
      stockTransfers.push({
        id: transferId,
        client_uuid: seedUuid(`stock_transfer:${spec.no}`),
        transfer_no: spec.no,
        transfer_type: spec.kind,
        status: spec.status,
        source_branch_id: BRANCH_ID,
        source_warehouse_id: WAREHOUSE_ID,
        source_zone_id: ZONES[spec.from]?.["id"] ?? null,
        destination_branch_id: BRANCH_ID,
        destination_warehouse_id: WAREHOUSE_ID,
        destination_zone_id: ZONES[spec.to]?.["id"] ?? null,
        requested_by: USERS[0]?.["id"] ?? null,
        approved_by: USERS[0]?.["id"] ?? null,
        dispatched_by: spec.dispatched ? USERS[0]?.["id"] ?? null : null,
        received_by: spec.received ? USERS[0]?.["id"] ?? null : null,
        requested_at: `${day2}T04:00:00.000Z`,
        approved_at: `${day2}T05:00:00.000Z`,
        dispatched_at: spec.dispatched ? `${day2}T06:00:00.000Z` : null,
        received_at: spec.received ? `${day2}T09:00:00.000Z` : null,
        completed_at: spec.status === "Completed" ? `${day2}T10:00:00.000Z` : null,
        cancelled_at: null,
        cancelled_by: null,
        cancellation_reason: null,
        notes: null,
        created_at: `${day2}T04:00:00.000Z`
      });
      spec.take.forEach((unitIndex, line) => {
        const unit = productUnits[unitIndex];
        if (unit === void 0) return;
        stockTransferLines.push({
          id: id(`stock_transfer_line:${spec.no}:${line}`),
          client_uuid: seedUuid(`stock_transfer_line:${spec.no}:${line}`),
          transfer_id: transferId,
          product_id: unit["product_id"],
          product_unit_id: unit["id"],
          requested_quantity: 1,
          transferred_quantity: spec.dispatched ? 1 : 0,
          received_quantity: spec.received ? 1 : 0,
          /* Only a receipt records a condition — an in-flight line has none. */
          condition_on_receipt: spec.received ? "Good" : null,
          notes: null,
          created_at: `${day2}T04:00:00.000Z`
        });
      });
    });
  }
  const documentRegistry = DOCUMENTS.map((d, index) => ({
    id: id(`doc:${d.id || index}`),
    client_uuid: seedUuid(`doc:${d.id || index}`),
    document_no: d.id,
    document_type: d.type,
    booking_id: d.relatedKind === "booking" ? d.relatedTo : null,
    client_id: null,
    lifecycle_status: d.archived ? "Void" : d.status,
    file_url: `/documents/${d.id}.pdf`,
    file_size_bytes: 102400,
    generated_by: USERS[0]?.["id"] ?? null,
    signed_at: d.status === "Signed" ? iso(d.createdAd) : null,
    signed_by_name: d.status === "Signed" ? d.signer ?? d.party : null,
    created_at: iso(d.createdAd)
  }));
  const store = {
    users: USERS,
    branches: BRANCHES,
    warehouses: WAREHOUSES,
    inventory_categories: CATEGORIES2,
    storage_zones: ZONES,
    expense_categories: EXPENSE_CATEGORIES,
    clients,
    products,
    product_units: productUnits,
    bookings,
    booking_lines: bookingLines,
    booking_line_units: bookingLineUnits,
    booking_crew_lines: crewLines,
    invoices,
    payments,
    security_deposits: deposits,
    booking_stage_transitions: transitions,
    bundles,
    bundle_items: bundleItems,
    inventory_reservations: reservations,
    suppliers,
    purchase_requests: purchaseRequests,
    stock_transfers: stockTransfers,
    stock_transfer_lines: stockTransferLines,
    document_registry: documentRegistry
  };
  for (const t of UNSERVED) store[t] = [];
  store["probe"] = [];
  return store;
}
var VIEW_OF = {
  clients_v: "clients",
  products_v: "products",
  product_units_v: "product_units",
  booking_lines_v: "booking_lines",
  membership_plans_v: "membership_plans",
  /*
   * Added for the Create Invoice preview, which reads the `_v` views because
   * live REVOKEs the money columns on the base tables from every signed-in
   * session (0062 — verified on the project 7 Sep 2026). Without these two
   * entries the mimic answered "no rows for table booking_crew_lines_v" and the
   * preview showed a bill with no crew on it, while the invoice would carry
   * them — the exact preview/write divergence the preview exists to prevent.
   *
   * `booking_transport` has no corpus rows at all, so its view resolves to an
   * empty base table; that is the same answer live would give for a booking with
   * no transport, and it is honest here because mock always signs in as Owner,
   * for whom `booking_transport_v` genuinely returns everything.
   */
  booking_crew_lines_v: "booking_crew_lines",
  booking_transport_v: "booking_transport"
};
function clientDirectory(store) {
  const invoices = store["invoices"] ?? [];
  const payments = store["payments"] ?? [];
  const deposits = store["security_deposits"] ?? [];
  const bookings = store["bookings"] ?? [];
  const sum = (rows, key, clientId) => rows.reduce((n, r) => r["client_id"] === clientId ? n + Number(r[key] ?? 0) : n, 0);
  return (store["clients"] ?? []).map((c) => {
    const cid = c["id"];
    const mine = bookings.filter((b) => b["client_id"] === cid);
    const active = mine.filter((b) => b["stage"] !== "Closed" && b["cancelled_at"] == null);
    const pickups = mine.map((b) => b["pickup_at"]).filter((v) => typeof v === "string").sort();
    return {
      ...c,
      outstanding_amount: Number(sum(invoices, "outstanding_amount", cid).toFixed(2)),
      deposit_held_amount: Number(
        deposits.filter((d) => d["client_id"] === cid).reduce(
          (n, d) => n + Math.max(
            Number(d["received_amount"] ?? 0) - Number(d["refunded_amount"] ?? 0) - Number(d["applied_amount"] ?? 0),
            0
          ),
          0
        ).toFixed(2)
      ),
      total_paid_amount: Number(
        payments.filter((p) => p["client_id"] === cid && p["status"] === "Received").reduce((n, p) => n + Number(p["amount"] ?? 0), 0).toFixed(2)
      ),
      active_bookings_count: active.length,
      total_bookings_count: mine.length,
      last_pickup_at: pickups.length ? pickups[pickups.length - 1] : null,
      // No corpus rows exist for contacts, memberships or KYC documents, so
      // these are null/0 in mock mode exactly as they would be in a live DB
      // whose child tables are empty — not a mock artefact.
      contact_name: null,
      contact_designation: null,
      contact_phone: null,
      membership_level: null,
      kyc_docs_count: 0,
      kyc_verified_count: 0,
      is_blocked: false
    };
  });
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  UNSERVED,
  VIEW_OF,
  buildStore,
  clientDirectory
});
